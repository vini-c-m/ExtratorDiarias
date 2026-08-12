"""Micro-sprint A ("Valor Automático da Diária na Central de Conferência") —
regra pura (sem I/O) do valor financeiro de uma diária de SERVIDOR, RN-05,
homologada por auditoria contra a Planilha Oficial real do DIMCAC
(2026-08-12): 99,60% de reprodução exata (1.480/1.486 diárias reais
comparáveis; as 6 divergências foram classificadas como cache de fórmula
desatualizado na própria Planilha, nunca como falha desta regra).

Fórmula (RN-05, `docs/central-conferencia/README.md`):
    R = valor_integral_da_faixa × quantidade_diaria_integral
    S = valor_parcial_da_faixa  × quantidade_diaria_parcial
    P = R + S

`Decimal` (não `float`) em toda a conta — a Planilha Oficial real grava os
valores unitários já com exatamente 2 casas decimais (ex. 308.19); somando/
multiplicando em ponto flutuante binário arriscaria ruído de precisão que a
própria Planilha, apesar de nunca aplicar `ROUND()` em nenhuma das fórmulas
auditadas (confirmado célula a célula), nunca produz para esses valores.
`Decimal` reproduz o resultado exato que a aritmética decimal do Excel
produz para estes números, sem inventar uma regra de arredondamento nova.

`quantidade_diaria_integral`/`quantidade_diaria_parcial` (N/O) NUNCA são
calculados aqui — RN-03 (N = período final − período inicial) e RN-04/RN-16
(O, regra institucional) já são responsabilidade de quem chama
(`app/services/conferencia_service.py`), mesmo padrão já usado por
`app/domain/rules/historico_efisco.montar_historico` (que também recebe o
período pronto, não este módulo recalculando)."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Mapping


@dataclass(frozen=True)
class TarifaUF:
    """Uma linha da aba `Tabela Valores` da Planilha Oficial — os dois
    valores unitários (integral/parcial) de uma UF ou região, já como
    `Decimal`. Nunca contém um valor negativo ou ausente: quem monta este
    objeto (`app/consulta/repositorio_tabela_valores.py`) garante isso antes
    de chegar aqui."""

    integral: Decimal
    parcial: Decimal


@dataclass(frozen=True)
class ValorDiariaServidor:
    """Resultado do cálculo — as três parcelas (RN-05), nunca só o total,
    para o chamador poder auditar/exibir a composição se precisar."""

    valor_integral: Decimal
    valor_parcial: Decimal
    valor_total: Decimal


class UfForaDaTabelaValores(Exception):
    """A UF/região informada não existe na `Tabela Valores` real — nunca
    calculado com fallback, nunca uma faixa "parecida" é adivinhada (P0 da
    Micro-sprint A: retornar indisponibilidade explícita, nunca inventar)."""

    def __init__(self, uf: str):
        self.uf = uf
        super().__init__(f"A UF/região '{uf}' não foi encontrada na Tabela Valores oficial.")


def calcular_valor_diaria_servidor(
    *,
    uf_destino: str,
    quantidade_diaria_integral: int,
    quantidade_diaria_parcial: int,
    tabela: Mapping[str, TarifaUF],
) -> ValorDiariaServidor:
    """RN-05 — só SERVIDOR usa esta regra (RN institucional: Membro nunca
    calcula por tabela, ver `app/services/conferencia_service.py`). `tabela`
    já vem pronta (chaves em maiúsculas, sem espaços nas pontas) de
    `app/consulta/repositorio_tabela_valores.carregar_tabela_valores` — esta
    função nunca lê a Planilha, nunca normaliza a chave da tabela em si, só
    a chave de busca (`uf_destino`), para tolerar variação de caixa/espaço
    vinda de quem chama sem exigir disciplina do chamador."""
    chave = uf_destino.strip().upper()
    tarifa = tabela.get(chave)
    if tarifa is None:
        raise UfForaDaTabelaValores(uf_destino)

    valor_integral = tarifa.integral * quantidade_diaria_integral
    valor_parcial = tarifa.parcial * quantidade_diaria_parcial
    valor_total = valor_integral + valor_parcial

    return ValorDiariaServidor(
        valor_integral=valor_integral,
        valor_parcial=valor_parcial,
        valor_total=valor_total,
    )
