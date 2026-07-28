from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import conferencia, planilha, processamento, saude

app = FastAPI(title="Extrator de Diárias SEI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(saude.router)
app.include_router(processamento.router)
app.include_router(planilha.router)
app.include_router(conferencia.router)
