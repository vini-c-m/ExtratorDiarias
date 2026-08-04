from dataclasses import dataclass


@dataclass(frozen=True)
class Servidor:
    """Resultado da consulta cadastral por CPF (RN-01) — só existe quando o
    CPF foi encontrado na aba `Dados` da Base Local de Consulta.

    `matricula`/`situacao`: RN-01 também traz esses dois campos da planilha.
    O checklist de conferência aprovado na Sprint 12 não os exibe — decisão
    de UI da Central de Conferência, não ausência do dado. A partir da
    Sprint 17.3 eles ficam disponíveis aqui para a Central Analítica (busca
    por matrícula, filtro por situação — `docs/central-analitica/README.md
    § 2`), via `app/consulta/`, que a decisão 9 da arquitetura trata como
    interface legitimamente compartilhada entre os dois módulos. Opcionais
    (`None` por padrão) para não quebrar nenhum call site já existente da
    Central de Conferência."""

    cpf: str
    nome: str
    cargo: str
    previdencia: str
    matricula: str | None = None
    situacao: str | None = None
