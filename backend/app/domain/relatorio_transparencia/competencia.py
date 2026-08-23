"""Modelo temporal do Relatório de Diárias — Portal da Transparência
(regra confirmada institucionalmente em 22/08/2026, R11): o relatório é
ACUMULATIVO dentro do exercício — `mes_referencia` é o limite superior do
período publicado, nunca um filtro exclusivo daquele mês.

Micro-sprint 2 só define e testa o cálculo do intervalo — nenhum filtro é
aplicado ainda sobre `motor_reconciliacao.reconciliar` (isso depende de
R09, ainda não implementada). O ponto desta função existir já agora é
não deixar nenhuma estrutura do motor assumir "uma competência = um único
mês": qualquer filtro futuro vai receber `(data_inicio, data_fim)` deste
cálculo, nunca só um número de mês isolado."""

from calendar import monthrange
from dataclasses import dataclass
from datetime import date

__all__ = ["IntervaloAcumulado", "intervalo_acumulado"]


@dataclass(frozen=True)
class IntervaloAcumulado:
    """`data_inicio` é sempre 1º de janeiro do exercício — nunca o início do
    mês de referência. `data_fim` é o último dia do mês de referência."""

    ano_exercicio: int
    mes_referencia: int
    data_inicio: date
    data_fim: date

    def contem(self, quando: date) -> bool:
        """Elegibilidade temporal por comparação de intervalo fechado
        (`data_inicio` e `data_fim` inclusive) — a data em si (ex.: data de
        pagamento da OB, R09) é responsabilidade de quem chama."""
        return self.data_inicio <= quando <= self.data_fim


def intervalo_acumulado(ano_exercicio: int, mes_referencia: int) -> IntervaloAcumulado:
    """Ex.: `intervalo_acumulado(2026, 8)` → 01/01/2026 até 31/08/2026
    (agosto/2026 — inclui o acumulado de janeiro a julho, não é um recorte
    exclusivo de agosto). `mes_referencia` fora de 1-12 levanta `ValueError`
    (mesmo comportamento nativo de `datetime.date`/`calendar.monthrange`,
    nunca um mês inventado)."""
    if not 1 <= mes_referencia <= 12:
        raise ValueError(f"mes_referencia inválido: {mes_referencia!r} (esperado 1-12)")
    data_inicio = date(ano_exercicio, 1, 1)
    ultimo_dia_do_mes = monthrange(ano_exercicio, mes_referencia)[1]
    data_fim = date(ano_exercicio, mes_referencia, ultimo_dia_do_mes)
    return IntervaloAcumulado(
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        data_inicio=data_inicio,
        data_fim=data_fim,
    )
