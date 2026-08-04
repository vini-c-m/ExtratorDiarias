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
from pathlib import Path

from openpyxl import load_workbook

NOME_PASTA_DADOS_FALLBACK = "ExtratorDiarias"
NOME_ARQUIVO_BASE_LOCAL = "base_local_consulta.xlsx"
VAR_AMBIENTE_USER_DATA = "EXTRATOR_DIARIAS_USER_DATA"

_logger = logging.getLogger(__name__)


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
    falhe.

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

    temporario = destino.with_suffix(destino.suffix + ".tmp")
    shutil.copyfile(caminho_planilha_preenchida, temporario)
    os.replace(temporario, destino)

    try:
        # Import local para evitar import circular: `base_local_sqlite`
        # importa `app.consulta.base_local` para reaproveitar
        # `caminho_base_local()` (evita duplicar a resolução de diretório
        # uma terceira vez).
        from app.consulta import base_local_sqlite, repositorio_diarias, repositorio_servidores

        sinal_frescor = base_local_sqlite.capturar_sinal_frescor(caminho_planilha_preenchida)

        workbook = load_workbook(caminho_planilha_preenchida)
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
        )
    except Exception:
        _logger.exception("Falha ao reconstruir a Base Local em SQLite")

    return destino
