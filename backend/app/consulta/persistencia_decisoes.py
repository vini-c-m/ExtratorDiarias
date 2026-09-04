"""Micro-sprint 3C — persistência local das decisões humanas sobre casos
REVISAO_NECESSARIA (`app/domain/relatorio_transparencia/decisao.py`).

Um único arquivo JSON, nunca um por competência — decisão é reaproveitável
entre gerações futuras do relatório acumulativo (G06,
`docs/relatorio-transparencia/README.md`): modelar "um arquivo por mês"
obrigaria persistir a mesma decisão em N lugares e resincronizá-los, o que
contradiz diretamente G06. Escrita atômica (`.tmp` + `os.replace`), mesma
técnica já homologada em `app/infra/config/configuracao_app.py` e
`app/consulta/base_local.py` — reaproveitada aqui, nunca duplicando lógica
daqueles módulos (que continuam intocados).

Deliberadamente separado de `base_local.sqlite`/Central de Conferência —
este módulo não lê nem escreve nada além do seu próprio arquivo JSON."""

import json
import os
import time
from datetime import date, datetime
from pathlib import Path

import filelock

from app.domain.relatorio_transparencia.decisao import AcaoDecisao, DecisaoHumana

__all__ = [
    "VERSAO_ESQUEMA_ATUAL",
    "PersistenciaDecisoesCorrompida",
    "PersistenciaDecisoesEmUso",
    "VersaoEsquemaIncompativel",
    "carregar_decisoes",
    "salvar_decisao",
]

VERSAO_ESQUEMA_ATUAL = 1

# QA Codex (achado real, BUG-01) — `salvar_decisao` fazia um ciclo
# read-modify-write (carregar tudo → mesclar uma decisão → escrever tudo)
# sem nenhuma trava, usando um nome de `.tmp` FIXO (derivado só do
# `caminho`, nunca único por chamada). Duas chamadas concorrentes (duas
# requisições HTTP simultâneas a `POST /revisoes/{id}/decisao` — o endpoint
# é síncrono, o FastAPI/Starlette despacha em threads reais do mesmo
# processo) liam o mesmo estado antes de qualquer uma escrever, e as duas
# escritas colidiam no mesmo `.tmp` — resultado: decisão perdida
# silenciosamente, ou `PermissionError` no Windows. `os.replace` sozinho só
# protege a promoção final, não o ciclo inteiro.
#
# QA Codex (revalidação, cross-process) — um `threading.Lock` (correção
# anterior desta função) só protege threads do MESMO processo. Com
# `WEB_CONCURRENCY`/`--workers` > 1, o Uvicorn sobe processos Python
# distintos, cada um com sua própria instância de `threading.Lock` — os
# locks não se enxergam, e a mesma corrida (decisão perdida/erro) volta a
# acontecer. Trocado por `filelock.FileLock`: trava real do sistema
# operacional (`LockFileEx` no Windows via `ctypes`/`msvcrt` da stdlib —
# nenhuma dependência de `pywin32` —, `flock` no POSIX), que protege
# threads E processos com o MESMO mecanismo. Bloqueante, com timeout de
# 10s (ver `PersistenciaDecisoesEmUso` abaixo) — a seção crítica é só
# serializar um JSON pequeno, sempre rápida; o timeout existe só como rede
# de segurança contra um processo externo genuinamente travado (antivírus
# varrendo o arquivo, disco lento etc.), não porque a operação em si seja
# lenta.
#
# Por que não deixa lock órfão após um crash: a trava do `filelock` é uma
# trava CONSULTIVA do SO sobre um handle de arquivo aberto — quando o
# processo que a detém termina por qualquer motivo (saída normal, exceção,
# `kill -9`/`TerminateProcess`), o kernel fecha todos os handles abertos
# por ele, liberando a trava junto. O arquivo `.lock` físico pode continuar
# existindo em disco (é só o alvo da trava, não o sinal dela — confirmado
# na própria documentação da lib: "Windows attempts to delete the lock
# file after release, but deletion is not guaranteed... does not affect
# lock correctness") — um processo novo tentando adquirir a trava consulta
# o SO, nunca a mera existência do arquivo. Diferente, por desenho, do
# lockfile `O_CREAT|O_EXCL` de
# `escritor_relatorio_transparencia._adquirir_trava_destino` (mantido como
# está, fora de escopo — problema de operação longa/fail-fast diferente, e
# risco de lock órfão já conhecido e deliberadamente não corrigido).
def _trava_decisoes(caminho: Path) -> filelock.FileLock:
    return filelock.FileLock(f"{caminho}.lock", timeout=10)


# Achado real durante a homologação desta correção (volume alto de
# requisições HTTP concorrentes, servidor Uvicorn multi-worker de verdade)
# — mesmo com a trava cross-process cobrindo o ciclo inteiro, `os.replace`
# ainda podia falhar com `PermissionError: [WinError 5] Acesso negado`: no
# Windows, `open()`/`Path.read_text()` abrem um arquivo SEM
# `FILE_SHARE_DELETE` por padrão — um LEITOR concorrente (`carregar_
# decisoes`, chamado sem trava por `GET /revisoes` ou pela própria
# reconstrução de estado que roda ANTES de `salvar_decisao` adquirir a
# trava) pode ter o arquivo de destino aberto no instante exato em que
# `os.replace` tenta promovê-lo, e o Windows recusa. Não é a mesma classe
# de bug do QA (escritor×escritor, já eliminada pela trava) — é
# leitor×escritor, e o próprio código já tem o remédio testado para
# exatamente isso: `base_local_sqlite._substituir_com_retry` (poucas
# tentativas, backoff curto — a colisão é sempre um LEITOR de passagem,
# nunca um lock preso, então uma nova tentativa quase imediata já resolve).
# Reaproveita o mesmo desenho aqui, mesmos valores.
_TENTATIVAS_REPLACE = 3
_INTERVALO_BASE_RETRY_REPLACE_S = 0.05


def _substituir_com_retry(caminho_tmp: Path, caminho_destino: Path) -> None:
    ultimo_erro: PermissionError | None = None
    for tentativa in range(_TENTATIVAS_REPLACE):
        try:
            os.replace(caminho_tmp, caminho_destino)
            return
        except PermissionError as erro:
            ultimo_erro = erro
            if tentativa < _TENTATIVAS_REPLACE - 1:
                time.sleep(_INTERVALO_BASE_RETRY_REPLACE_S * (tentativa + 1))
    assert ultimo_erro is not None
    raise ultimo_erro


# Mesmo achado, lado LEITOR: `carregar_decisoes` (chamada sem trava — por
# `GET /revisoes`/`/preparar`, ou pela reconstrução de estado que roda
# ANTES de `salvar_decisao` adquirir a trava) também pode colidir com um
# `os.replace` em andamento e receber `PermissionError` — comprovado em
# execução real sob carga concorrente alta. Mesmo retry curto, mesma
# lógica: a colisão é sempre um ESCRITOR de passagem, nunca uma permissão
# genuinamente negada, então tentar de novo quase imediatamente resolve.
def _ler_texto_com_retry(caminho: Path) -> str:
    ultimo_erro: PermissionError | None = None
    for tentativa in range(_TENTATIVAS_REPLACE):
        try:
            return caminho.read_text(encoding="utf-8")
        except PermissionError as erro:
            ultimo_erro = erro
            if tentativa < _TENTATIVAS_REPLACE - 1:
                time.sleep(_INTERVALO_BASE_RETRY_REPLACE_S * (tentativa + 1))
    assert ultimo_erro is not None
    raise ultimo_erro


class PersistenciaDecisoesEmUso(Exception):
    """O arquivo de decisões está sendo usado por outro processo/thread há
    mais de 10s (timeout do `FileLock`) — nunca deveria acontecer em uso
    normal (a seção protegida é só serializar um JSON pequeno); mensagem já
    adequada para exibição direta ao usuário ("tente novamente"), nunca a
    exceção técnica (`filelock.Timeout`) crua."""


class PersistenciaDecisoesCorrompida(Exception):
    """JSON malformado, estrutura interna que não corresponde ao esquema
    esperado, bytes que não decodificam como UTF-8, ou o arquivo
    simplesmente não pôde ser lido (permissão negada, bloqueado por outro
    processo, outro erro de I/O) — nunca silenciada, nunca "corrigida"
    automaticamente (mesma filosofia de
    `OrdensBancariasEstruturalmenteInvalida`/
    `ControleDimcacEstruturalmenteInvalido`: falha explícita, mensagem já
    adequada para o usuário). Mesmo critério de
    `configuracao_template_relatorio_transparencia.ConfiguracaoTemplateCorrompida`
    para o arquivo irmão de configuração do template (confronto QA Codex /
    QA-RT-03) — nunca deixa `UnicodeDecodeError`/`PermissionError`/
    `OSError` escaparem como um 500 genérico."""


class VersaoEsquemaIncompativel(PersistenciaDecisoesCorrompida):
    """Caso específico de arquivo corrompido: `versao_esquema` presente,
    mas diferente da versão que este código sabe ler. Subclasse de
    `PersistenciaDecisoesCorrompida` — quem só quer tratar "arquivo
    ilegível" genericamente pode capturar a classe-base; quem precisa
    distinguir migração de esquema de corrupção de dado captura esta."""


def _decisao_para_dict(decisao: DecisaoHumana) -> dict:
    return {
        "identidade_grupo": decisao.identidade_grupo,
        "regra": decisao.regra,
        "obs_envolvidas": sorted(decisao.obs_envolvidas),
        "fingerprint_evidencias": decisao.fingerprint_evidencias,
        "acao": decisao.acao.value,
        "obs_publicaveis": sorted(decisao.obs_publicaveis),
        "autor": decisao.autor,
        "decidido_em": decisao.decidido_em.isoformat(),
        "observacao": decisao.observacao,
        # Sprint D.1 — campos novos, SEMPRE gravados a partir de agora (nunca
        # `None` para uma decisão nova real, ver `registrar_decisao_revisao`).
        # Decisões antigas relidas e regravadas (`salvar_decisao` reescreve o
        # arquivo inteiro a cada chamada) preservam exatamente o que já
        # tinham em memória — nunca inventamos um valor para uma decisão
        # histórica só porque o arquivo foi reescrito por causa de OUTRA
        # decisão.
        "ano_exercicio": decisao.ano_exercicio,
        "mes_referencia": decisao.mes_referencia,
        "cobertura_efisco_ate": decisao.cobertura_efisco_ate.isoformat() if decisao.cobertura_efisco_ate else None,
    }


def _decisao_de_dict(dados: dict) -> DecisaoHumana:
    cobertura_efisco_ate = dados.get("cobertura_efisco_ate")
    return DecisaoHumana(
        identidade_grupo=dados["identidade_grupo"],
        regra=dados["regra"],
        obs_envolvidas=frozenset(dados["obs_envolvidas"]),
        fingerprint_evidencias=dados["fingerprint_evidencias"],
        acao=AcaoDecisao(dados["acao"]),
        obs_publicaveis=frozenset(dados["obs_publicaveis"]),
        autor=dados["autor"],
        decidido_em=datetime.fromisoformat(dados["decidido_em"]),
        observacao=dados.get("observacao"),
        # Sprint D.1 — `.get(...)` deliberado (nunca `dados[...]`): arquivos
        # gravados por versões anteriores a esta correção nunca têm essas
        # chaves — `None` é o valor correto e esperado para eles (nunca uma
        # falha de leitura), preservando decisões históricas exatamente como
        # foram persistidas (nenhuma reescrita/inferência retroativa).
        ano_exercicio=dados.get("ano_exercicio"),
        mes_referencia=dados.get("mes_referencia"),
        cobertura_efisco_ate=date.fromisoformat(cobertura_efisco_ate) if cobertura_efisco_ate else None,
    )


def carregar_decisoes(caminho: str | Path) -> dict[str, DecisaoHumana]:
    """Arquivo inexistente é um estado normal (nenhuma decisão registrada
    ainda) — devolve `{}`, nunca levanta exceção. Qualquer outra falha de
    leitura (JSON malformado, campo obrigatório ausente, versão de
    esquema diferente, bytes que não decodificam como UTF-8, ou o arquivo
    existir mas não poder ser lido) é sempre explícita, nunca silenciada
    (confronto QA Codex — achado real: `UnicodeDecodeError`/
    `PermissionError`/`OSError` genérico escapavam daqui até `/preparar`,
    `/revisoes`, o registro de decisão e `/gerar` como um 500 técnico)."""
    caminho = Path(caminho)
    if not caminho.is_file():
        return {}

    try:
        texto = _ler_texto_com_retry(caminho)
    except UnicodeDecodeError as erro:
        raise PersistenciaDecisoesCorrompida(
            "Arquivo de decisões corrompido (codificação de texto inválida)."
        ) from erro
    except PermissionError as erro:
        raise PersistenciaDecisoesCorrompida(
            "Arquivo de decisões não pôde ser lido (permissão negada)."
        ) from erro
    except OSError as erro:
        raise PersistenciaDecisoesCorrompida(
            "Arquivo de decisões não pôde ser lido (falha de leitura)."
        ) from erro

    try:
        bruto = json.loads(texto)
    except json.JSONDecodeError as erro:
        raise PersistenciaDecisoesCorrompida(
            f"Arquivo de decisões corrompido (JSON inválido): {caminho} ({erro})"
        ) from erro

    if not isinstance(bruto, dict) or "versao_esquema" not in bruto:
        raise PersistenciaDecisoesCorrompida(
            f"Arquivo de decisões corrompido (estrutura inesperada): {caminho}"
        )

    versao = bruto["versao_esquema"]
    if versao != VERSAO_ESQUEMA_ATUAL:
        raise VersaoEsquemaIncompativel(
            f"Versão de esquema incompatível em {caminho}: {versao!r} "
            f"(esperado {VERSAO_ESQUEMA_ATUAL!r})"
        )

    try:
        return {
            identidade: _decisao_de_dict(dados) for identidade, dados in bruto["decisoes"].items()
        }
    except (KeyError, TypeError, ValueError) as erro:
        raise PersistenciaDecisoesCorrompida(
            f"Arquivo de decisões corrompido (campo ausente ou inválido): {caminho} ({erro})"
        ) from erro


def salvar_decisao(caminho: str | Path, decisao: DecisaoHumana) -> None:
    """Adiciona ou substitui a decisão de `decisao.identidade_grupo`,
    preservando todas as demais já persistidas — nunca sobrescreve o
    arquivo inteiro com uma única decisão. Escrita atômica: grava em
    `<caminho>.tmp` e só then troca com `os.replace` (mesma técnica já
    homologada em `configuracao_app.persistir_pastas_operacionais`) — uma
    falha no meio da escrita nunca deixa o arquivo real corrompido.

    QA Codex (BUG-01, correção cross-process) — todo o ciclo leitura+
    mesclagem+escrita+promoção corre sob `_trava_decisoes(caminho)`
    (`filelock.FileLock`, trava real do SO — protege threads E processos):
    duas chamadas concorrentes para o mesmo `caminho` (identidades de
    grupo diferentes), mesmo vindas de processos Uvicorn distintos (ex.
    `WEB_CONCURRENCY>1`), agora são serializadas e as duas sobrevivem, em
    vez de uma sobrescrever silenciosamente a outra. O nome do `.tmp`
    continua fixo (`<caminho>.tmp`) de propósito — com o ciclo inteiro
    protegido pela trava, só uma chamada por vez (de qualquer processo)
    pode estar escrevendo nele, então a exclusividade deixa de depender do
    nome ser único."""
    caminho = Path(caminho)
    try:
        with _trava_decisoes(caminho):
            decisoes = carregar_decisoes(caminho)
            decisoes[decisao.identidade_grupo] = decisao

            caminho.parent.mkdir(parents=True, exist_ok=True)
            conteudo = {
                "versao_esquema": VERSAO_ESQUEMA_ATUAL,
                "decisoes": {identidade: _decisao_para_dict(d) for identidade, d in decisoes.items()},
            }
            temporario = caminho.with_suffix(caminho.suffix + ".tmp")
            temporario.write_text(json.dumps(conteudo, ensure_ascii=False, indent=2), encoding="utf-8")
            _substituir_com_retry(temporario, caminho)
    except filelock.Timeout as erro:
        raise PersistenciaDecisoesEmUso(
            "O arquivo de decisões está sendo usado por outro processo. Tente novamente em instantes."
        ) from erro
