import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app import diagnostico_complemento_temp as diag  # DIAGNÓSTICO TEMPORÁRIO — remover após causa raiz confirmada/corrigida
from app.api import (
    analitica,
    cadastro_dados,
    conferencia,
    configuracao,
    finalizacao,
    planilha,
    processamento,
    regularizacao_dh,
    saude,
)

app = FastAPI(title="Automatizador de Diárias SEI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# DIAGNÓSTICO TEMPORÁRIO (P0 final, 2026-08-09) — cobre a serialização da
# resposta (Pydantic) e a transmissão final, que rodam DEPOIS do `return` do
# endpoint em si — a última etapa antes do socket, para provar se a
# resposta HTTP chegou a ser efetivamente enviada ou se a conexão morreu
# antes disso. Regressão de sincronização (2026-08-09, pós preparação
# estrutural): ampliado de só `/planilha/preencher` para também
# `/sincronizacao` (GET e POST) e as leituras da Central Analítica — o
# botão "Sincronizar agora" e a leitura de estado nunca passavam por
# `/planilha/preencher`, então a tentativa anterior do usuário não deixou
# nenhuma evidência no log.
_CAMINHOS_DIAGNOSTICADOS = (
    "/api/v1/planilha/preencher",
    "/api/v1/sincronizacao",
    "/api/v1/sincronizacao/avisos",
    "/api/v1/analitica/diarias",
    "/api/v1/analitica/indicadores",
)


@app.middleware("http")
async def _diagnostico_planilha_preencher(request: Request, call_next):
    if request.url.path not in _CAMINHOS_DIAGNOSTICADOS:
        return await call_next(request)

    diag.registrar("http_requisicao_recebida", metodo=request.method, path=request.url.path)
    inicio = time.perf_counter()
    try:
        resposta = await call_next(request)
    except BaseException as erro:
        diag.registrar(
            "http_excecao_nao_tratada", sucesso=False, path=request.url.path,
            duracao_ms=(time.perf_counter() - inicio) * 1000, erro=erro,
        )
        raise
    diag.registrar(
        "http_resposta_transmitida", sucesso=True, path=request.url.path,
        duracao_ms=(time.perf_counter() - inicio) * 1000, status_code=resposta.status_code,
    )
    return resposta

app.include_router(saude.router)
app.include_router(processamento.router)
app.include_router(planilha.router)
app.include_router(conferencia.router)
app.include_router(cadastro_dados.router)
app.include_router(configuracao.router)
app.include_router(analitica.router)
app.include_router(finalizacao.router)
app.include_router(regularizacao_dh.router)
