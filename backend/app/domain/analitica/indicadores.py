"""Sprint 19.6.1 (`docs/central-analitica/v2-plano-tecnico.md` § 18) —
funções puras (sem I/O) que calculam os indicadores (KPIs) do Dashboard a
partir de um recorte já filtrado de `RegistroAnalitico`
(`v2-arquitetura-funcional.md` § 6.1). Quem resolve a consulta ao SQLite é
`app/consulta/repositorio_analitico.agregar_indicadores` — este módulo
nunca abre conexão nenhuma, 100% testável com dado sintético.

Só os 4 KPIs sem nenhuma decisão pendente são calculados aqui: total de
diárias, total de servidores, valor total, valor médio. Os demais do
catálogo completo (§ 6.1 — total de municípios, registros completos/
incompletos, aguardando liberação) dependem de perguntas ainda em aberto
com o DIMCAC (`v2-arquitetura-funcional.md` § 14, perguntas 2/4/5) e ficam
de fora desta Sprint — risco já registrado no plano técnico: nunca
implementar KPI pendente com suposição, preferível omitir do que adivinhar."""

from dataclasses import dataclass

from app.domain.entities.registro_analitico import RegistroAnalitico


@dataclass(frozen=True)
class Indicadores:
    total_diarias: int
    total_servidores: int
    valor_total: float | None
    valor_medio: float | None


def calcular_indicadores(registros: list[RegistroAnalitico]) -> Indicadores:
    """Recorte vazio devolve `total_diarias`/`total_servidores` zerados e
    `valor_total`/`valor_medio` como `None` — nunca `0.0` inventado, já que
    não há nenhum valor a somar ou tirar média (mesmo critério de "sem
    sentido numérico devolve `None`, nunca zero" já usado em
    `DistribuicaoResposta.valor`, § 12.3 do plano técnico). Diárias sem
    `valor_total_diarias` (`None`) são ignoradas do somatório/média, nunca
    tratadas como zero — mesma regra já aplicada pelo SQL `SUM`/`AVG`
    (que ignora `NULL` nativamente) que este cálculo substitui."""
    total_diarias = len(registros)
    total_servidores = len({registro.cpf for registro in registros})

    valores = [
        registro.valor_total_diarias
        for registro in registros
        if registro.valor_total_diarias is not None
    ]
    valor_total = sum(valores) if valores else None
    valor_medio = (valor_total / len(valores)) if valores else None

    return Indicadores(
        total_diarias=total_diarias,
        total_servidores=total_servidores,
        valor_total=valor_total,
        valor_medio=valor_medio,
    )
