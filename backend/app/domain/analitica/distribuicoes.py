"""Sprint 19.6.3 (`docs/central-analitica/v2-plano-tecnico.md` § 18) —
funções puras (sem I/O) que agregam um recorte já filtrado de
`RegistroAnalitico` por uma dimensão (`v2-arquitetura-funcional.md` § 6.2).
Mesmo papel de `app/domain/analitica/indicadores.py` para os KPIs: quem
resolve a consulta ao SQLite é `app/consulta/repositorio_analitico.
agregar_distribuicao` — este módulo nunca abre conexão nenhuma, 100%
testável com dado sintético.

Só as 6 dimensões cujo comportamento já está integralmente definido nos
documentos homologados (19.1/19.2/19.3) são calculadas aqui: `periodo`,
`servidor`, `municipio`, `motivo`, `situacao`, `origem_destino`.

A 7ª dimensão do catálogo completo (§ 6.2 — "Completos × incompletos") fica
deliberadamente de fora desta Sprint: ela usa a mesma base do KPI
"Registros completos"/"Registros incompletos" (§ 6.1), que depende da
definição fechada de "registro incompleto" (§ 9 pergunta 7 / § 14 pergunta
5) — pergunta ainda em aberto com o DIMCAC. Mesmo critério já homologado na
Sprint 19.6.1 para os KPIs pendentes: nunca implementar com suposição,
preferível omitir do que adivinhar. Omissão 100% aditiva — nada impede
adicionar `"completude"` a `DimensaoDistribuicao` (aqui e em
`schemas/analitica.py`) quando a definição existir, sem quebrar nenhum
contrato já entregue.

Decisão formal desta Sprint (achado da análise técnica prévia à
implementação, confirmada pelo usuário): a dimensão `municipio` agrupa
exclusivamente por `cidade_destino` ("Top N cidade_destino", § 6.2 — texto
literal, sem marcação 🟡 em nenhuma das 3 Sprints de UX) — nunca união
origem/destino (essa união só é a semântica do *filtro* "Município", § 3.1,
e do KPI pendente "Total de municípios", § 6.1/§ 14 pergunta 2, que
permanece fora do escopo desta Sprint). A dimensão `origem_destino` agrupa
por pares reais `cidade_origem → cidade_destino` — nunca uma contagem de
município único, então não depende dessa mesma pergunta pendente.

Sprint 21.1 (2026-08-05, Modo Executivo — `docs/central-analitica/
modo-executivo-plano-tecnico.md § 8.2`) acrescenta 3 dimensões, todas
sobre campos já existentes de `RegistroAnalitico`, nenhuma delas exige
dado novo: `categoria_funcional` (gráfico "Membros × Servidores", sempre
visível, independente do fluxo de comparação — decisão de fechamento 11
de `modo-executivo-arquitetura-funcional.md § 0`), `doc_origem` (gráfico
"Unidade solicitante (documento de origem)" — decisão 9: é literalmente
este campo, sem reinterpretação institucional) e `transporte` (gráfico
"Meio de transporte")."""

from collections import Counter
from dataclasses import dataclass
from typing import Literal

from app.domain.entities.registro_analitico import RegistroAnalitico

DimensaoDistribuicao = Literal[
    "periodo",
    "servidor",
    "municipio",
    "motivo",
    "situacao",
    "origem_destino",
    "categoria_funcional",
    "doc_origem",
    "transporte",
]

# Rótulos de bucket para dado ausente — nunca uma string vazia, nunca um
# valor inventado, sempre uma descrição honesta do que está faltando
# (mesmo espírito de `ResumoRecorte`/`indicadores.py`: nulo nunca vira um
# valor como qualquer outro, mas também nunca é omitido em silêncio do
# recorte — o registro continua contando para o total da dimensão, só sem
# um rótulo real a exibir). Nunca o CPF cru (mascaramento é obrigatório em
# qualquer resposta desta Central, `ui-arquitetura.md § 0.7`) nem um nome
# inventado.
_ROTULO_SERVIDOR_SEM_CADASTRO = "Servidor sem cadastro"
_ROTULO_MUNICIPIO_SEM_DESTINO = "Sem destino informado"
_ROTULO_SITUACAO_NAO_INFORMADA = "Situação não informada"
_ROTULO_ORIGEM_AUSENTE = "Sem origem informada"
_ROTULO_DESTINO_AUSENTE = "Sem destino informado"
_ROTULO_TRANSPORTE_NAO_IDENTIFICADO = "Transporte não identificado"
_ROTULO_DOC_ORIGEM_AUSENTE = "Unidade solicitante não informada"


@dataclass(frozen=True)
class PontoDistribuicao:
    rotulo: str
    contagem: int
    valor: float | None


@dataclass(frozen=True)
class Distribuicao:
    dimensao: DimensaoDistribuicao
    pontos: list[PontoDistribuicao]


def _chave_periodo(registro: RegistroAnalitico) -> str:
    """`YYYY-MM` (ISO, sempre 4+2 dígitos) — nunca um nome de mês
    localizado aqui: a apresentação ("jan/2026") é responsabilidade do
    frontend (mesma divisão já usada em `lib/datas.ts` para outras datas),
    quando o Dashboard existir (19.6.4, fora do escopo desta Sprint). ISO
    também ordena corretamente como string, sem precisar converter de
    volta para data para ordenar cronologicamente."""
    return f"{registro.periodo_inicial.year:04d}-{registro.periodo_inicial.month:02d}"


def _chave_servidor(registro: RegistroAnalitico) -> str:
    """Agrupa por nome (§ 6.2 — "Top N servidores (nome)"), não por CPF:
    o CPF nunca é exposto cru nesta Central (regra vinculante). Dois
    servidores reais com o mesmo nome cadastrado seriam mesclados num só
    ponto — limitação aceita, decorrente da própria definição já aprovada
    ("por nome"), não uma suposição desta Sprint."""
    if registro.servidor is None:
        return _ROTULO_SERVIDOR_SEM_CADASTRO
    return registro.servidor.nome


def _chave_municipio(registro: RegistroAnalitico) -> str:
    if registro.cidade_destino is None:
        return _ROTULO_MUNICIPIO_SEM_DESTINO
    return registro.cidade_destino


def _chave_motivo(registro: RegistroAnalitico) -> str:
    # `motivo` nunca é `None` no esquema (`RegistroAnalitico.motivo: str`)
    # — sem bucket de "não informado" a criar aqui.
    return registro.motivo


def _chave_situacao(registro: RegistroAnalitico) -> str:
    if registro.servidor is None or registro.servidor.situacao is None:
        return _ROTULO_SITUACAO_NAO_INFORMADA
    return registro.servidor.situacao


def _chave_origem_destino(registro: RegistroAnalitico) -> str:
    origem = registro.cidade_origem if registro.cidade_origem is not None else _ROTULO_ORIGEM_AUSENTE
    destino = registro.cidade_destino if registro.cidade_destino is not None else _ROTULO_DESTINO_AUSENTE
    return f"{origem} → {destino}"


def _chave_categoria_funcional(registro: RegistroAnalitico) -> str:
    """`categoria_funcional` já vem pronta (MEMBRO/SERVIDOR/NAO_IDENTIFICADO,
    `app/domain/analitica/categoria_funcional.py`) — nunca `None` (default
    `"NAO_IDENTIFICADO"` na própria entidade), então, diferente das demais
    dimensões, não precisa de bucket de "ausente" próprio: o valor
    `NAO_IDENTIFICADO` já é esse bucket."""
    return registro.categoria_funcional


def _chave_doc_origem(registro: RegistroAnalitico) -> str:
    if not registro.doc_origem:
        return _ROTULO_DOC_ORIGEM_AUSENTE
    return registro.doc_origem


def _chave_transporte(registro: RegistroAnalitico) -> str:
    if not registro.transporte:
        return _ROTULO_TRANSPORTE_NAO_IDENTIFICADO
    return registro.transporte


_EXTRATORES_DE_CHAVE = {
    "periodo": _chave_periodo,
    "servidor": _chave_servidor,
    "municipio": _chave_municipio,
    "motivo": _chave_motivo,
    "situacao": _chave_situacao,
    "origem_destino": _chave_origem_destino,
    "categoria_funcional": _chave_categoria_funcional,
    "doc_origem": _chave_doc_origem,
    "transporte": _chave_transporte,
}

# `situacao` é a única dimensão "sem sentido financeiro" do catálogo
# (§ 6.2 — só "servidor_situacao × contagem", nunca "ou valor total" como
# as demais linhas da tabela) — `valor` é sempre `None` em todos os seus
# pontos, nunca `0.0` inventado (mesmo critério já usado em
# `indicadores.py` para recorte vazio).
_DIMENSOES_SEM_VALOR_FINANCEIRO: frozenset[DimensaoDistribuicao] = frozenset({"situacao"})


def calcular_distribuicao(
    registros: list[RegistroAnalitico], dimensao: DimensaoDistribuicao
) -> Distribuicao:
    """Recorte vazio devolve `pontos=[]` — nunca um ponto "zero" inventado
    para uma dimensão sem nenhum dado. Ordenação: `periodo` sai em ordem
    cronológica ascendente (é uma série temporal, `v2-wireframes.md § 5.3`
    já mostra os meses em ordem); as demais dimensões saem em ordem
    decrescente de contagem (maior primeiro, mesmo critério de qualquer
    "ranking"/"top N" já ilustrado nos wireframes — o corte para "top N"
    em si é decisão de apresentação do Dashboard, 19.6.4, fora desta
    Sprint: aqui devolve-se a distribuição completa, já ordenada)."""
    extrair_chave = _EXTRATORES_DE_CHAVE[dimensao]
    com_valor_financeiro = dimensao not in _DIMENSOES_SEM_VALOR_FINANCEIRO

    contagens: Counter[str] = Counter()
    somas: dict[str, float] = {}
    tem_valor: dict[str, bool] = {}

    for registro in registros:
        rotulo = extrair_chave(registro)
        contagens[rotulo] += 1
        if com_valor_financeiro and registro.valor_total_diarias is not None:
            somas[rotulo] = somas.get(rotulo, 0.0) + registro.valor_total_diarias
            tem_valor[rotulo] = True

    pontos = [
        PontoDistribuicao(
            rotulo=rotulo,
            contagem=contagem,
            valor=somas.get(rotulo) if tem_valor.get(rotulo, False) else None,
        )
        for rotulo, contagem in contagens.items()
    ]

    if dimensao == "periodo":
        pontos.sort(key=lambda ponto: ponto.rotulo)
    else:
        pontos.sort(key=lambda ponto: (-ponto.contagem, ponto.rotulo))

    return Distribuicao(dimensao=dimensao, pontos=pontos)
