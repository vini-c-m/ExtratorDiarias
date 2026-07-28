from dataclasses import dataclass


@dataclass(frozen=True)
class Servidor:
    """Resultado da consulta cadastral por CPF (RN-01) — só existe quando o
    CPF foi encontrado na aba `Dados` da Base Local de Consulta.

    Sem `matricula`/`situacao`: RN-01 também traz esses dois campos da
    planilha, mas o checklist de conferência aprovado na Sprint 12 não os
    exibe — incluí-los aqui seria dado morto fora do escopo desta Sprint."""

    cpf: str
    nome: str
    cargo: str
    previdencia: str
