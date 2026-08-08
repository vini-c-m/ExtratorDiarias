from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class RegistroDiariaExistente:
    """Uma diária já registrada na Base Local de Consulta que colide com a
    chave de duplicidade da RN-02 (mesmo CPF; correção de 2026-08-05: basta
    que QUALQUER uma das duas datas informadas já conste, como inicial ou
    final, nesta diária — não exige mais correspondência simultânea das
    duas) — usado para o item "duplicidade" do checklist de conferência.
    `linha` é a linha da aba `Controle de Diárias` onde o registro foi
    encontrado, exposta desde a primeira versão do contrato de API (§ 4.4 do
    doc arquitetural) para o servidor não precisar localizar o registro
    manualmente."""

    linha: int
    sei: str
    cpf: str
    periodo_inicial: date
    periodo_final: date
    trecho: str
