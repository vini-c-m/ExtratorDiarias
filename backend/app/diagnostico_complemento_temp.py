"""DIAGNÓSTICO TEMPORÁRIO — P0 FINAL (2026-08-09).

Instrumentação de runtime para capturar prova real de onde
`/planilha/preencher` (Complemento) está falhando — sem log persistido,
a auditoria anterior não conseguiu confirmar a causa além de hipótese.

Escreve UMA LINHA JSON por etapa, em arquivo (nunca só stdout), com
`flush()` + `os.fsync()` imediatos — sobrevive mesmo se o processo
morrer logo em seguida, que é exatamente o cenário sob investigação.

Não registra dado sensível (nunca CPF/nome/SEI/valores de diária) — só
contagens, durações, tipos de erro e stack trace do PRÓPRIO código.

REMOVER este arquivo e todos os `import app.diagnostico_complemento_temp`
assim que a causa raiz for confirmada e corrigida — não é infraestrutura
permanente do projeto.
"""

import json
import os
import threading
import time
import traceback
from contextlib import contextmanager
from pathlib import Path


def _diretorio_log() -> Path:
    """Mesma resolução de `app.consulta.base_local._diretorio_dados_usuario`,
    duplicada aqui de propósito (não importada) para este módulo nunca
    criar uma dependência nova em `app.consulta.*` — fica 100% isolado,
    fácil de apagar depois."""
    caminho_env = os.environ.get("EXTRATOR_DIARIAS_USER_DATA")
    if caminho_env:
        return Path(caminho_env)
    appdata = os.environ.get("APPDATA")
    base = Path(appdata) if appdata else Path.home()
    return base / "ExtratorDiarias"


CAMINHO_LOG = _diretorio_log() / "diagnostico_complemento.log"


def _escrever(linha: dict) -> None:
    CAMINHO_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(CAMINHO_LOG, "a", encoding="utf-8") as arquivo:
        arquivo.write(json.dumps(linha, ensure_ascii=False, default=str) + "\n")
        arquivo.flush()
        os.fsync(arquivo.fileno())


def registrar(evento: str, *, sucesso: bool | None = None, duracao_ms: float | None = None,
              erro: BaseException | None = None, **detalhes) -> None:
    agora = time.time()
    linha = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(agora)) + f".{int(agora * 1000) % 1000:03d}",
        "pid": os.getpid(),
        "thread": threading.current_thread().name,
        "evento": evento,
        "sucesso": sucesso,
        "duracao_ms": round(duracao_ms, 1) if duracao_ms is not None else None,
        **detalhes,
    }
    if erro is not None:
        linha["erro_tipo"] = type(erro).__name__
        linha["erro_msg"] = str(erro)
        linha["stack_trace"] = traceback.format_exc()
    try:
        _escrever(linha)
    except Exception:
        # O diagnóstico nunca pode ser, ele mesmo, a causa de uma nova
        # falha no fluxo real — qualquer problema ao escrever o log é
        # engolido aqui, de propósito.
        pass


@contextmanager
def etapa(nome: str, **detalhes):
    """Registra `<nome>:inicio` ao entrar, `<nome>:fim` (com duração) ao
    sair normalmente, ou `<nome>:erro` (com duração + stack trace
    completo) se a etapa levantar qualquer exceção — e sempre relança."""
    registrar(f"{nome}:inicio", **detalhes)
    inicio = time.perf_counter()
    try:
        yield
    except BaseException as erro:
        registrar(f"{nome}:erro", sucesso=False, duracao_ms=(time.perf_counter() - inicio) * 1000,
                   erro=erro, **detalhes)
        raise
    else:
        registrar(f"{nome}:fim", sucesso=True, duracao_ms=(time.perf_counter() - inicio) * 1000, **detalhes)
