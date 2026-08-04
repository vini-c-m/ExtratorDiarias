"""Sprint 19.8.1 (`docs/central-analitica/v2-plano-tecnico.md` § 18) —
funções puras (sem I/O) que classificam um recorte de `RegistroAnalitico`
contra o catálogo de diagnósticos (`v2-arquitetura-funcional.md` § 8.2).
Mesmo papel de `indicadores.py`/`distribuicoes.py`/`relatorios.py`: quem
resolve a consulta ao SQLite é `repositorio_analitico` (chega na 19.8.2) —
este módulo nunca abre conexão nenhuma, 100% testável com dado sintético.

**Princípio obrigatório (§ 8.1): campo vazio esperado não pode ser tratado
como erro.** Toda classificação abaixo cita a regra/fórmula real que a
sustenta; onde a regra não está confirmada (§ 9), o motivo é explicitamente
sobre a pendência, nunca uma suposição.

**Fronteira arquitetural (decisão 9, já homologada,
`docs/central-analitica/README.md § 0.1`): a Central Analítica nunca
importa `app/domain/rules/conferencia.py`.** RN-02 (duplicidade) e
RN-06/RN-10 (PASSAR DIA) — já implementadas ali para a Central de
Conferência (dado `.xlsx`) — são reimplementadas aqui, de forma
independente, com a mesma fórmula já documentada, operando sobre
`RegistroAnalitico` (dado SQLite). Isto não é a duplicação de lógica que
este plano proíbe entre módulos da mesma camada — é a separação
arquitetural já decidida e vinculante entre os dois módulos.

**Maior risco deste módulo (plano técnico, "Riscos" da 19.8.1): DH
(coluna `A`) e PASSAR DIA (coluna `V`) são duas colunas e duas regras
totalmente diferentes** — `DH` é escrita direta do sistema após a
extração do PDF (nunca fórmula); `PASSAR DIA` é fórmula de data (RN-06).
`_caso_dh_vazio`/`_caso_passar_dia` nunca compartilham `titulo`/`motivo`/
`campo` — verificado por teste dedicado
(`test_diagnostico.py::test_dh_e_passar_dia_nunca_compartilham_texto`).

**Casos do catálogo completo (§ 8.2) implementados aqui — 9 dos 10:**
todos exceto "Dados incoerentes" (valor fora da faixa esperada por
estado de destino), que não tem NENHUMA condição de disparo definida
ainda (§ 9, pergunta 8) — diferente de DH (onde a condição de disparo,
`dh is None`, já é conhecida; só a sub-classificação por idade do
processo está pendente), aqui não há nem por onde começar sem inventar
uma faixa aceitável. Omissão aditiva, nunca suposição — mesmo critério já
homologado em `indicadores.py`/`distribuicoes.py`/`relatorios.py` para
lacunas equivalentes."""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from app.domain.entities.registro_analitico import RegistroAnalitico

Classificacao = Literal["esperado", "atencao", "inconsistencia"]

# RN-06 (`Vn = Hn - 15`) + RN-10 (limite inclusivo) — mesma fórmula já
# documentada/confirmada em `docs/central-conferencia/README.md`,
# reimplementada aqui por decisão arquitetural (ver docstring do módulo).
_DIAS_ANTECEDENCIA_PASSAR_DIA = 15


@dataclass(frozen=True)
class CasoDiagnostico:
    """Camada de domínio — carrega `classificacao`, diferente do schema
    público `CasoDiagnostico` (`v2-plano-tecnico.md` § 12.4, sem esse
    campo: só `RegistroDiagnosticado`, o agregado por SEI, expõe
    classificação). Cada função de caso precisa saber sua própria
    severidade para `classificar`/`diagnosticar_recorte` conseguirem
    calcular o agregado sem uma segunda tabela de consulta — a tradução
    para o schema público (19.8.2/19.8.3) decide se repassa este campo."""

    campo: str | None
    titulo: str
    motivo: str
    acao_recomendada: str
    classificacao: Classificacao


def _caso_periodo_invalido(registro: RegistroAnalitico) -> CasoDiagnostico | None:
    """Já validado tecnicamente na gravação via API (`_periodo_valido`,
    `schemas/analitica.py`) — se aparecer no banco mesmo assim (dado
    histórico sincronizado direto da Planilha Oficial, sem passar por
    aquele validador), é uma inconsistência real, nunca esperada."""
    if registro.periodo_final >= registro.periodo_inicial:
        return None
    return CasoDiagnostico(
        campo="periodo_final",
        titulo="Período inválido",
        motivo=(
            "O período final é anterior ao período inicial. A validação de entrada já impede "
            "isso em registros novos — em dado histórico sincronizado, é uma inconsistência "
            "real da Planilha Oficial, nunca esperada."
        ),
        acao_recomendada="Verifique as datas do processo no SEI e corrija a Planilha Oficial.",
        classificacao="inconsistencia",
    )


def _caso_servidor_sem_cadastro(registro: RegistroAnalitico) -> CasoDiagnostico | None:
    """RN-01 — `#N/A` no Excel para CPF sem correspondência em `Dados` é
    comportamento nativo de "não encontrado", não um erro de extração."""
    if registro.servidor is not None:
        return None
    return CasoDiagnostico(
        campo="cpf",
        titulo="Servidor sem cadastro",
        motivo=(
            "O CPF desta diária não foi encontrado na aba Dados da Planilha Oficial (RN-01) — "
            "as fórmulas de nome/cargo/previdência ficam #N/A no Excel, comportamento nativo "
            "para 'não encontrado', não um erro de extração."
        ),
        acao_recomendada="Nenhuma ação imediata — cadastre o servidor em Dados se ele for legítimo.",
        classificacao="esperado",
    )


def _caso_valor_ausente(registro: RegistroAnalitico) -> CasoDiagnostico | None:
    """RN-05 (`P = R + S`) depende do estado de destino já resolvido
    contra a Tabela de Valores — sem regra documentada de "vazio
    esperado" aqui, então é sempre atenção, nunca esperado."""
    if registro.valor_total_diarias is not None:
        return None
    return CasoDiagnostico(
        campo="valor_total_diarias",
        titulo="Valor das diárias ausente",
        motivo=(
            "O cálculo do valor total (RN-05) depende do estado de destino já ter sido "
            "resolvido contra a Tabela de Valores; nulo pode significar que os campos de "
            "origem da fórmula ainda não foram preenchidos, ou que o estado não bate com "
            "nenhuma faixa da tabela."
        ),
        acao_recomendada="Confira o despacho do processo e a Tabela de Valores para este estado.",
        classificacao="atencao",
    )


def _caso_matricula_ausente(registro: RegistroAnalitico) -> CasoDiagnostico | None:
    """Só dispara quando o CPF TEM cadastro (senão já é
    `_caso_servidor_sem_cadastro`, esperado) — matrícula vazia com
    cadastro existente é dado incompleto na própria aba `Dados`, fora do
    controle desta Central."""
    if registro.servidor is None or registro.servidor.matricula is not None:
        return None
    return CasoDiagnostico(
        campo="matricula",
        titulo="Matrícula ausente",
        motivo=(
            "O CPF tem cadastro em Dados, mas o campo de matrícula está vazio — dado "
            "cadastral incompleto, fora do controle desta Central."
        ),
        acao_recomendada="Complete a matrícula na aba Dados da Planilha Oficial.",
        classificacao="atencao",
    )


def _caso_situacao_ausente(registro: RegistroAnalitico) -> CasoDiagnostico | None:
    """Mesmo critério de `_caso_matricula_ausente` — situação (`Dados!H`)
    vazia com cadastro existente é dado incompleto, não uma condição de
    "não encontrado" (essa já é `_caso_servidor_sem_cadastro`)."""
    if registro.servidor is None or registro.servidor.situacao is not None:
        return None
    return CasoDiagnostico(
        campo="situacao",
        titulo="Situação do servidor ausente",
        motivo="O CPF tem cadastro em Dados, mas o campo de situação (Dados!H) está vazio.",
        acao_recomendada="Complete a situação na aba Dados da Planilha Oficial.",
        classificacao="atencao",
    )


def _caso_trecho(registro: RegistroAnalitico) -> CasoDiagnostico | None:
    """Dois casos distintos do catálogo (§ 8.2), uma função só: os dois
    lados ausentes ("Origem/destino ausentes") ou só um lado ("Trecho
    incompleto") — nunca a mesma explicação para os dois, já que um
    trecho parcial sugere um problema de extração mais específico que os
    dois vazios juntos."""
    origem_ausente = registro.cidade_origem is None
    destino_ausente = registro.cidade_destino is None
    if not origem_ausente and not destino_ausente:
        return None
    if origem_ausente and destino_ausente:
        return CasoDiagnostico(
            campo=None,
            titulo="Origem e destino ausentes",
            motivo=(
                "Cidade de origem e cidade de destino estão vazias — campos preenchidos na "
                "extração do PDF, sem regra de 'vazio esperado' documentada para nenhum dos "
                "dois."
            ),
            acao_recomendada="Verifique o processo SEI e preencha manualmente origem e destino.",
            classificacao="atencao",
        )
    campo_vazio = "origem" if origem_ausente else "destino"
    return CasoDiagnostico(
        campo=campo_vazio,
        titulo="Trecho incompleto",
        motivo=(
            f"Só {campo_vazio} está vazia — trecho parcial sugere um erro de extração "
            "específico, mais raro que os dois vazios juntos."
        ),
        acao_recomendada=f"Verifique o processo SEI e preencha manualmente a {campo_vazio}.",
        classificacao="atencao",
    )


def _caso_dh_vazio(registro: RegistroAnalitico) -> CasoDiagnostico | None:
    """DH é esperado vazio quando o processo ainda não chegou à fase de
    liquidação — mas sem um limiar de "processo antigo demais" confirmado
    pelo DIMCAC (`v2-arquitetura-funcional.md` § 9, pergunta 3/6; § 14,
    pergunta 4), não há como diferenciar "recente" de "antigo"
    automaticamente. TODO(§ 9, pergunta 3/6): recalcular por idade do
    processo quando o limiar for definido — até lá, sempre 'atenção',
    nunca 'esperado' (afirmaria uma certeza que não se tem) nem
    'inconsistência' (acusaria um erro que pode não existir)."""
    if registro.dh is not None:
        return None
    return CasoDiagnostico(
        campo="dh",
        titulo="Documento Hábil (DH) ainda não emitido",
        motivo=(
            "O Documento Hábil está vazio. Isso é esperado quando o processo ainda não chegou "
            "à fase de liquidação — mas o limiar que define um processo antigo demais para "
            "estar sem esse registro ainda não foi confirmado pelo DIMCAC (pendente)."
        ),
        acao_recomendada=(
            "Nenhuma ação imediata; se o processo já é antigo, confira manualmente o "
            "andamento no SEI."
        ),
        classificacao="atencao",
    )


def _caso_passar_dia(registro: RegistroAnalitico, hoje: date) -> CasoDiagnostico | None:
    """RN-06 (`Vn = Hn - 15`) + RN-10 (limite inclusivo — liberado quando
    `hoje >= data de liberação`), reimplementadas aqui (decisão 9, ver
    docstring do módulo). Só vira um "caso" a reportar enquanto o processo
    ainda está na janela de espera — uma vez liberado, não há mais nada
    de anormal a mostrar."""
    data_liberacao = registro.periodo_inicial - timedelta(days=_DIAS_ANTECEDENCIA_PASSAR_DIA)
    if hoje >= data_liberacao:
        return None
    return CasoDiagnostico(
        campo=None,
        titulo="Aguardando liberação",
        motivo=(
            f"Condição de tempo prevista em regra, não um dado ausente: esta diária só pode "
            f"ser encaminhada a partir de {data_liberacao.isoformat()} (período inicial da "
            "viagem menos 15 dias corridos)."
        ),
        acao_recomendada="Nenhuma ação imediata — aguarde a data de liberação.",
        classificacao="esperado",
    )


def _casos_duplicidade(registros: list[RegistroAnalitico]) -> dict[str, CasoDiagnostico]:
    """RN-02: chave de duplicidade é CPF + Período Inicial + Período
    Final, nunca o SEI. RN-07 já documenta precedente real de duplicidade
    legítima ("complemento de diária") — este sistema nunca decide
    sozinho que é erro, sempre 'atenção'. Devolve um `CasoDiagnostico` por
    SEI candidato (todos os membros de um grupo com 2+ registros, não só
    o "segundo")."""
    agrupado: dict[tuple[str, date, date], list[RegistroAnalitico]] = {}
    for registro in registros:
        chave = (registro.cpf, registro.periodo_inicial, registro.periodo_final)
        agrupado.setdefault(chave, []).append(registro)

    casos: dict[str, CasoDiagnostico] = {}
    for grupo in agrupado.values():
        if len(grupo) < 2:
            continue
        for registro in grupo:
            outros_seis = ", ".join(sorted(outro.sei for outro in grupo if outro.sei != registro.sei))
            casos[registro.sei] = CasoDiagnostico(
                campo=None,
                titulo="Possível duplicidade",
                motivo=(
                    f"Mesmo CPF e mesmo período (inicial e final) de outro(s) registro(s) do "
                    f"recorte: {outros_seis} (RN-02). Duplicidade legítima já tem precedente "
                    "conhecido (ex.: complemento de diária, RN-07) — este sistema nunca decide "
                    "sozinho que é erro."
                ),
                acao_recomendada="Confira manualmente se é duplicidade real ou um complemento de diária legítimo.",
                classificacao="atencao",
            )
    return casos


# Casos que dependem só do próprio registro (nunca do recorte inteiro) —
# `_caso_passar_dia` fica de fora desta lista por ter assinatura própria
# (`hoje`), e `_casos_duplicidade` por operar sobre o recorte inteiro de
# uma vez, nunca registro a registro.
_FUNCOES_POR_REGISTRO = (
    _caso_periodo_invalido,
    _caso_servidor_sem_cadastro,
    _caso_valor_ausente,
    _caso_matricula_ausente,
    _caso_situacao_ausente,
    _caso_trecho,
    _caso_dh_vazio,
)

_ORDEM_SEVERIDADE: dict[Classificacao, int] = {"esperado": 0, "atencao": 1, "inconsistencia": 2}


def classificar(casos: list[CasoDiagnostico]) -> Classificacao:
    """Agregado por registro (`RegistroDiagnosticado.classificacao`, § 12.4)
    — a pior classificação entre os casos aplicáveis vence
    (inconsistência > atenção > esperado); nenhum caso aplicável é, em si,
    um resultado "esperado" (nada de anormal a reportar)."""
    if not casos:
        return "esperado"
    return max((caso.classificacao for caso in casos), key=lambda classificacao: _ORDEM_SEVERIDADE[classificacao])


def diagnosticar_registro(registro: RegistroAnalitico, hoje: date) -> list[CasoDiagnostico]:
    """Todos os casos que dependem só deste registro — nunca inclui
    duplicidade (`_casos_duplicidade`), que precisa comparar contra os
    demais registros do recorte; `diagnosticar_recorte` combina os dois.
    Lista vazia (nunca `None`) quando nenhum caso se aplica — mesmo
    critério já usado em toda a Central Analítica (recorte vazio nunca
    vira erro nem omissão silenciosa)."""
    casos = [funcao(registro) for funcao in _FUNCOES_POR_REGISTRO]
    casos.append(_caso_passar_dia(registro, hoje))
    return [caso for caso in casos if caso is not None]


def diagnosticar_recorte(registros: list[RegistroAnalitico], hoje: date) -> dict[str, list[CasoDiagnostico]]:
    """`GET /api/v1/analitica/diagnostico` (19.8.2, § 8.3): roda só sobre
    os registros do recorte já filtrado, nunca a base inteira por padrão.
    Chave é o SEI (decisão 8, `docs/central-analitica/README.md § 0.1`),
    nunca `linha_planilha`."""
    duplicidades = _casos_duplicidade(registros)
    resultado: dict[str, list[CasoDiagnostico]] = {}
    for registro in registros:
        casos = diagnosticar_registro(registro, hoje)
        caso_duplicidade = duplicidades.get(registro.sei)
        if caso_duplicidade is not None:
            casos.append(caso_duplicidade)
        resultado[registro.sei] = casos
    return resultado
