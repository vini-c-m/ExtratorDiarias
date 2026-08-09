"""Base Local de Consulta — a cópia somente-leitura da planilha oficial que a
Central Inteligente de Conferência consulta (RN-11: nunca escreve na
planilha oficial, nunca decide, só lê e informa).

Nota arquitetural: esta é hoje um mecanismo de CONSULTA, implementado como
arquivo `.xlsx` sincronizado — não uma cópia permanente com valor próprio.
O resto do sistema (`app/domain/rules/conferencia.py`,
`app/services/conferencia_service.py`) só conhece a interface deste pacote
(`servidores_por_cpf`, `diarias_por_cpf`, `caminho_base_local`), nunca o
formato do arquivo em si — isso preservou a migração feita na Sprint 17.3:
`sincronizar()` agora também reconstrói uma segunda materialização em
SQLite (`app/consulta/base_local_sqlite.py`), usada pela Central Analítica,
sem nenhum impacto acima desta camada.
"""

import logging
import os
import shutil
import threading
from collections.abc import Callable
from pathlib import Path

from openpyxl import load_workbook

NOME_PASTA_DADOS_FALLBACK = "ExtratorDiarias"
NOME_ARQUIVO_BASE_LOCAL = "base_local_consulta.xlsx"
VAR_AMBIENTE_USER_DATA = "EXTRATOR_DIARIAS_USER_DATA"
# Achado real 2026-08-06 (build empacotado desatualizado) — mesmo padrão de
# `VAR_AMBIENTE_USER_DATA`: `electron/main.ts` passa `app.getVersion()` por
# esta variável, gravada em `sincronizacoes.versao_app`
# (`base_local_sqlite.reconstruir`) para `estado_sincronizacao` conseguir
# detectar uma reinstalação/atualização do app mesmo quando a Planilha
# Oficial e o schema de tabelas não mudaram nem um pouco (ver esquema.py,
# VERSAO_ESQUEMA=4). Ausente (string vazia) quando o backend roda
# standalone, sem Electron — nunca inventada.
VAR_AMBIENTE_VERSAO_APP = "EXTRATOR_DIARIAS_APP_VERSION"

_logger = logging.getLogger(__name__)

# ETAPA 2 (Auditoria P0, 2026-08-09) — lock ÚNICO e CENTRALIZADO para a
# etapa SQLite de `sincronizar()`, adquirido dentro da própria função: os
# 3 chamadores (`planilha_service.preencher_planilha` — processamento e
# complemento —, `api/configuracao.definir_configuracao`,
# `analitica_service.executar_sincronizacao_manual`) passam a ficar
# protegidos automaticamente, sem precisar lembrar de adquirir nada — a
# lacuna confirmada pela auditoria (só o caminho manual usava um lock
# próprio) era justamente essa: proteção que dependia de cada chamador
# lembrar de usá-la. `RLock` (não `Lock`) de propósito — permite que
# `executar_sincronizacao_manual` (que já faz sua própria checagem não-
# bloqueante ANTES de chamar `sincronizar()`, para devolver "sincronização
# já em andamento" nesse caso) e a aquisição interna daqui coexistam na
# MESMA thread sem deadlock, já que os dois acquires acontecem em
# sequência síncrona na mesma call stack.
LOCK_SINCRONIZACAO = threading.RLock()

# Tempo máximo de espera pelo lock para os chamadores automáticos
# (processamento/complemento/configuração, que não fazem sua própria
# checagem prévia como o caminho manual) — `reconstruir()` é rápido em
# volume real (~3 mil linhas, medido em outros pontos do projeto), então
# alguns segundos são folga suficiente sem arriscar prender uma requisição
# HTTP indefinidamente se algo ficar preso. Se o tempo esgotar, a
# sincronização desta chamada é pulada (nunca promove nada) — Last Known
# Good preservado; a próxima sincronização bem-sucedida recupera.
TIMEOUT_LOCK_SINCRONIZACAO_S = 10.0


def _diretorio_dados_usuario() -> Path:
    """`electron/main.ts` passa `app.getPath("userData")` via variável de
    ambiente ao subir o backend — é a mesma pasta de dados que o resto do
    app Electron já usa, garantindo um único lugar por instalação. Sem
    Electron (backend rodando standalone, ex. em desenvolvimento), cai para
    `%APPDATA%/ExtratorDiarias` — o mesmo "AppData" já decidido oficialmente
    (§ 0 item 6 do doc arquitetural), só sem depender do Electron para
    calculá-lo."""
    caminho_env = os.environ.get(VAR_AMBIENTE_USER_DATA)
    if caminho_env:
        return Path(caminho_env)
    appdata = os.environ.get("APPDATA")
    base = Path(appdata) if appdata else Path.home()
    return base / NOME_PASTA_DADOS_FALLBACK


def caminho_base_local(*, diretorio_base: Path | str | None = None) -> Path:
    diretorio = Path(diretorio_base) if diretorio_base is not None else _diretorio_dados_usuario()
    return diretorio / "central-conferencia" / NOME_ARQUIVO_BASE_LOCAL


def base_local_disponivel(*, diretorio_base: Path | str | None = None) -> bool:
    return caminho_base_local(diretorio_base=diretorio_base).is_file()


def sincronizar(
    caminho_planilha_preenchida: str,
    *,
    diretorio_base: Path | str | None = None,
    origem: str = "pos_preenchimento",
    ao_falhar_sqlite: Callable[[Exception], None] | None = None,
) -> Path:
    """Sobrescreve a Base Local com a planilha oficial recém-preenchida —
    chamada como um hook aditivo ao final do fluxo de preenchimento já
    homologado (`app/services/planilha_service.py`), nunca no caminho
    crítico da gravação em si.

    Escreve para um arquivo temporário no mesmo diretório e finaliza com
    `os.replace` (troca atômica no mesmo volume) em vez de sobrescrever o
    destino diretamente — evita que uma leitura concorrente da Central (a
    própria API roda em threadpool, duas requisições podem ser simultâneas
    de fato) encontre um `.xlsx` parcialmente escrito.

    Sprint 17.3 — depois da cópia `.xlsx` acima (intocada), também
    reconstrói a segunda materialização da Base Local em SQLite
    (`app/consulta/base_local_sqlite.py`), usada pela Central Analítica.
    Essa etapa tem seu próprio `try/except`, independente do resto desta
    função: uma falha aí nunca desfaz nem impede a cópia `.xlsx`, que já é
    homologada (risco 4, `docs/central-analitica/README.md § 10`) — e o
    retorno desta função continua íntegro mesmo que só a etapa SQLite
    falhe (contrato intacto — `test_base_local.py::
    test_sincronizar_planilha_sem_abas_esperadas_nao_quebra_copia_xlsx`).

    ETAPA 2 (Auditoria P0, 2026-08-09) — a etapa SQLite agora roda sob
    `LOCK_SINCRONIZACAO` (`RLock` de módulo, acima), fechando a lacuna
    confirmada por reprodução executável: antes, só o caminho manual
    (`executar_sincronizacao_manual`) usava um lock, então duas
    reconstruções automáticas (ou uma automática + uma manual) podiam
    correr ao mesmo tempo sobre o mesmo `.sqlite.tmp`/destino, sem nenhuma
    coordenação — reproduzido gerando `PermissionError`/`WinError 32` real.
    Chamadores automáticos (processamento/complemento/configuração)
    esperam até `TIMEOUT_LOCK_SINCRONIZACAO_S`; se não conseguirem o lock
    nesse tempo, a sincronização desta chamada é pulada (nunca promove
    nada — Last Known Good preservado) em vez de travar a requisição.

    `ao_falhar_sqlite` (ETAPA 2) — callback opcional, chamado (nunca
    levantado) quando a etapa SQLite falha por qualquer motivo (exceção
    durante a reconstrução OU timeout do lock) — é como um chamador que
    precisa saber (`planilha_service.preencher_planilha`, para nunca
    reportar uma gravação de planilha bem-sucedida como "processamento
    falhou", mas ainda assim sinalizar explicitamente que a Central
    Analítica não foi atualizada) recebe esse sinal sem que o contrato de
    retorno desta função (sempre `Path`, nunca levanta por causa só da
    etapa SQLite) precise mudar — nenhum chamador existente que ignora
    este parâmetro é afetado.

    `origem` (Sprint 17.4.6.1) — parâmetro opcional, mantém
    `"pos_preenchimento"` como padrão para preservar 100% o chamador mais
    antigo (`planilha_service.py`, que nunca passa este argumento).
    `executar_sincronizacao_manual` (`app/services/analitica_service.py`,
    Sprint 17.4.6) passa `origem="manual"`; `definir_configuracao`
    (`app/api/configuracao.py`, Sprint 18.7) passa
    `origem="configuracao_inicial"` — chamada logo após salvar/alterar a
    Planilha Oficial, para a Central Analítica ficar disponível
    imediatamente, sem depender de um novo PDF processado nem de um
    clique manual. Em qualquer caso o valor grava direto na tabela
    `sincronizacoes` via `base_local_sqlite.reconstruir`, nunca é simulado
    ou sobrescrito na camada de API."""
    destino = caminho_base_local(diretorio_base=diretorio_base)
    destino.parent.mkdir(parents=True, exist_ok=True)

    if not LOCK_SINCRONIZACAO.acquire(timeout=TIMEOUT_LOCK_SINCRONIZACAO_S):
        erro_lock = TimeoutError(
            "Não foi possível obter o lock de sincronização da Base Local em "
            f"{TIMEOUT_LOCK_SINCRONIZACAO_S}s — outra sincronização em "
            "andamento; esta chamada foi pulada, a última Base Local íntegra "
            "continua sendo servida."
        )
        _logger.warning(str(erro_lock))
        if ao_falhar_sqlite is not None:
            ao_falhar_sqlite(erro_lock)
        return destino

    try:
        # ETAPA 2 — a cópia `.xlsx` (abaixo) também usa `.tmp` de nome
        # fixo + `os.replace`, exatamente a mesma classe de risco da etapa
        # SQLite (auditoria § 7, item 2) — reproduzido nesta correção: duas
        # chamadas de `sincronizar()` concorrentes colidiam aqui (WinError
        # 32) mesmo depois do lock cobrir só a etapa SQLite. As duas
        # materializações são *uma* Base Local (ver docstring do módulo
        # `base_local_sqlite.py`), então o mesmo lock protege as duas. Uma
        # falha AQUI (ex.: arquivo de origem some no meio da cópia)
        # continua propagando normalmente para o chamador — comportamento
        # já homologado, documentado em `executar_sincronizacao_manual`,
        # não mudou; só a etapa SQLite abaixo (`try` interno) é que nunca
        # propaga.
        temporario = destino.with_suffix(destino.suffix + ".tmp")
        shutil.copyfile(caminho_planilha_preenchida, temporario)
        os.replace(temporario, destino)

        try:
            # Import local para evitar import circular: `base_local_sqlite`
            # importa `app.consulta.base_local` para reaproveitar
            # `caminho_base_local()` (evita duplicar a resolução de
            # diretório uma terceira vez).
            from app.consulta import base_local_sqlite, repositorio_diarias, repositorio_servidores

            sinal_frescor = base_local_sqlite.capturar_sinal_frescor(caminho_planilha_preenchida)

            # `data_only=True`: a coluna P (`VALOR TOTAL DAS DIÁRIAS`) de
            # `Controle de Diárias` é fórmula (`=R+S`) na maioria das
            # linhas históricas digitadas em Excel — sobretudo as de
            # SERVIDOR (achado real, planilha oficial 2026: 1.419 de
            # 1.446 diárias de SERVIDOR usam fórmula, contra 9 de 376 de
            # MEMBRO). Sem `data_only=True`, openpyxl devolve o texto da
            # fórmula (`"=R123+S123"`), que
            # `repositorio_diarias._valor_como_numero` não consegue
            # interpretar como número e descarta como `None` — mesmo
            # quando o Excel já calculou e guardou em cache o valor real
            # da fórmula. `read_only` continua `False` (padrão): este
            # workbook nunca é salvo de volta (só lido e fechado), então
            # não há o risco inverso de `data_only=True` apagar fórmulas
            # ao gravar.
            workbook = load_workbook(caminho_planilha_preenchida, data_only=True)
            try:
                resultado_diarias = repositorio_diarias.diarias_completas(
                    workbook[repositorio_diarias.NOME_ABA]
                )
                servidores = repositorio_servidores.servidores_por_cpf(
                    workbook[repositorio_servidores.NOME_ABA]
                )
            finally:
                workbook.close()

            base_local_sqlite.reconstruir(
                resultado_diarias,
                servidores,
                sinal_frescor,
                origem=origem,
                caminho_destino=base_local_sqlite.caminho_base_local_sqlite(diretorio_base=diretorio_base),
                versao_app=os.environ.get(VAR_AMBIENTE_VERSAO_APP, ""),
            )
        except Exception as erro:
            _logger.exception("Falha ao reconstruir a Base Local em SQLite")
            if ao_falhar_sqlite is not None:
                ao_falhar_sqlite(erro)
    finally:
        LOCK_SINCRONIZACAO.release()

    return destino
