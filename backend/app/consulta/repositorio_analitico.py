"""Camada de leitura da Central Analítica sobre a Base Local em SQLite
(Sprint 17.3, imutável — `app/consulta/base_local_sqlite.py`,
`app/infra/db/esquema.py`). Único módulo que fala SQL com
`base_local.sqlite`; nenhum outro módulo desta feature deveria abrir
`sqlite3.connect` diretamente.

Sprint 17.4.3 implementou só o necessário para `GET /diarias`
(`listar_diarias`) e o carimbo mínimo de sincronização embutido na
resposta (`ultima_sincronizacao`). Sprint 17.4.4 adicionou `buscar_por_sei`,
para `GET /diarias/{sei}`. Sprint 17.4.5 adicionou `opcoes_filtro`, para
`GET /opcoes-filtro`. Sprint 17.4.6 adiciona `estado_sincronizacao_registrado`
e `avisos_paginados`, para os endpoints de sincronização — `ultima_sincronizacao`
foi refatorada internamente (helper privado compartilhado) para não
duplicar a leitura da linha mais recente de `sincronizacoes`, mas sua
assinatura, tipo de retorno e comportamento público permanecem
idênticos aos já homologados nas Sprints 17.4.3/17.4.4.

Toda conexão é somente-leitura (`mode=ro` na URI) e de vida curta — abre,
consulta, fecha, nunca reaproveitada entre chamadas."""

import re
import sqlite3
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from app.domain.entities.aviso_linha_ignorada import AvisoLinhaIgnorada
from app.domain.entities.registro_analitico import RegistroAnalitico
from app.domain.entities.servidor import Servidor
from app.planilha.escritor_planilha import _cpf_normalizado  # noqa: PLC2701 — mesmo reuso já praticado em repositorio_servidores.py/repositorio_diarias.py

__all__ = [
    "COLUNAS_ORDENACAO",
    "FiltrosDiaria",
    "InfoSincronizacaoCompleta",
    "InfoSincronizacaoResumida",
    "OpcoesFiltro",
    "PaginaDeAvisos",
    "PaginaDeRegistros",
    "ParametrosOrdenacao",
    "ParametrosPaginacao",
    "agregar_distribuicao",
    "agregar_indicadores",
    "avisos_paginados",
    "buscar_por_sei",
    "estado_sincronizacao_registrado",
    "listar_diarias",
    "listar_para_diagnostico",
    "opcoes_filtro",
    "ultima_sincronizacao",
]

_COLUNAS_DIARIA = """sei, doc_origem, cpf, periodo_inicial, periodo_final,
                   cidade_origem, cidade_destino, motivo, transporte,
                   valor_total_diarias, linha_planilha,
                   servidor_nome, servidor_cargo, servidor_previdencia,
                   servidor_matricula, servidor_situacao, dh"""

# Mesmo formato de caractere já usado para reconhecer um número de processo
# SEI em `app/extraction/parsers/sei_parser_v1.py:95` (`r"SEI\s*([\d./-]+)"`)
# — reaproveitado aqui para a pesquisa global (`q`) decidir se o termo tem
# "cara" de SEI, nunca uma definição nova.
_PADRAO_SOMENTE_CARACTERES_DE_SEI = re.compile(r"^[\d./-]+$")

COLUNAS_ORDENACAO: dict[str, str] = {
    "sei": "sei",
    "periodo": "periodo_inicial",
    "servidor": "servidor_nome",
    "destino": "cidade_destino",
    "valor": "valor_total_diarias",
}


@dataclass(frozen=True)
class FiltrosDiaria:
    q: str | None = None
    sei: str | None = None
    cpf: str | None = None
    servidor_nome: str | None = None
    servidor_matricula: str | None = None
    municipio: str | None = None
    motivo: str | None = None
    situacao: str | None = None
    periodo_inicial: date | None = None
    periodo_final: date | None = None
    # Sprint 19.5.2 — isolados de `municipio` (que casa origem OU destino
    # indistintamente, decisão já homologada da v1): `origem`/`destino`
    # restringem a uma ponta específica da viagem; `trecho` casa contra a
    # concatenação "origem - destino" (mesmo formato já gravado pelo
    # sistema na coluna `TRECHO` da Planilha Oficial, RN documentada em
    # `docs/central-conferencia/README.md`). Nomes alinhados aos
    # parâmetros de API já definidos em `docs/central-analitica/
    # v2-plano-tecnico.md § 12.1` — expostos na API só na Sprint 19.5.3.
    origem: str | None = None
    destino: str | None = None
    trecho: str | None = None
    valor_minimo: float | None = None
    valor_maximo: float | None = None


@dataclass(frozen=True)
class ParametrosPaginacao:
    pagina: int
    tamanho_pagina: int


@dataclass(frozen=True)
class ParametrosOrdenacao:
    campo: str  # já uma chave de COLUNAS_ORDENACAO — validado na camada de schema (Literal)
    ordem: str  # "asc" | "desc"


@dataclass(frozen=True)
class PaginaDeRegistros:
    itens: list[RegistroAnalitico]
    total_itens: int


@dataclass(frozen=True)
class OpcoesFiltro:
    motivos: list[str]
    situacoes: list[str]
    municipios: list[str]


@dataclass(frozen=True)
class InfoSincronizacaoResumida:
    """Versão mínima do carimbo de sincronização embutido em `GET
    /diarias`/`GET /diarias/{sei}` (decisão do usuário em 2026-07-30,
    Sprint 17.4.3): só timestamp + contagem de avisos, lidos direto do
    SQLite — sem comparação ao vivo contra a Planilha Oficial. Contrato
    público intocado pela Sprint 17.4.6 — `EstadoSincronizacaoResposta`
    (`GET /sincronizacao`) é um schema à parte, nunca substitui este."""

    sincronizado_em: str
    total_avisos: int


@dataclass(frozen=True)
class InfoSincronizacaoCompleta:
    """Leitura completa da linha mais recente de `sincronizacoes`
    (Sprint 17.4.6) — serve tanto `GET /sincronizacao` (usa
    `sincronizado_em`/`origem`/`total_avisos`) quanto o resultado de
    `POST /sincronizacao` (usa `sincronizado_em`/as 3 contagens/
    `total_avisos`), cada consumidor no service projetando só os campos
    que precisa da mesma leitura — nunca duas consultas para os mesmos
    dados."""

    sincronizado_em: str
    origem: str
    linhas_diarias: int
    linhas_servidores_lidos: int
    linhas_ignoradas: int
    total_avisos: int


@dataclass(frozen=True)
class PaginaDeAvisos:
    """Avisos da sincronização mais recente identificada pelo
    Repository (`GET /sincronizacao/avisos`, Sprint 17.4.6) —
    `AvisoLinhaIgnorada` reaproveitada por já ter o mesmo shape
    (`aba`/`linha`/`motivo`) do contrato "Aviso de Sincronização"."""

    itens: list[AvisoLinhaIgnorada]
    total_itens: int


def _conectar_somente_leitura(caminho_sqlite: Path) -> sqlite3.Connection:
    """URI `mode=ro` — reforça em código, não só em disciplina de revisão,
    que a Central Analítica nunca escreve na Base Local (`docs/central-
    analitica/api-arquitetura.md § 0`). `.resolve().as_uri()` (não uma
    f-string ingênua) é necessário para um caminho Windows (`C:\\...`)
    virar uma URI `file:///C:/...` válida."""
    conexao = sqlite3.connect(f"{caminho_sqlite.resolve().as_uri()}?mode=ro", uri=True)
    conexao.row_factory = sqlite3.Row
    return conexao


def _escapar_like(termo: str) -> str:
    """`LIKE` interpreta `%`/`_` como curingas mesmo vindos do usuário —
    sem escapar, um `_` no termo de busca casa com "qualquer caractere"
    (bug de resultado, não de segurança). Usado com `ESCAPE '\\'`."""
    return termo.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _condicao_pesquisa_global(termo: str) -> tuple[str, list]:
    """`q` decide o tipo pelo formato (UX 17.2, Anexo A): CPF exato se
    normaliza para 11 dígitos; SEI exato se só tem caracteres de SEI
    (dígitos/ponto/barra/hífen) e contém uma barra; senão, nome de
    servidor por correspondência parcial."""
    termo = termo.strip()
    cpf_normalizado = _cpf_normalizado(termo)
    if len(cpf_normalizado) == 11:
        return "cpf = ?", [cpf_normalizado]
    if "/" in termo and _PADRAO_SOMENTE_CARACTERES_DE_SEI.match(termo):
        return "sei = ?", [termo]
    return "servidor_nome LIKE ? ESCAPE '\\'", [f"%{_escapar_like(termo)}%"]


def _montar_where(filtros: FiltrosDiaria) -> tuple[str, list]:
    """Único ponto de montagem de SQL dinâmico deste módulo. Todo valor do
    usuário entra como parâmetro (`?`); nomes de coluna nunca vêm do
    usuário aqui (só `_ordenar_por`, tratado à parte via
    `COLUNAS_ORDENACAO`). Filtros combinam com E lógico (decisão já
    aprovada, `docs/central-analitica/README.md § 2.2`)."""
    condicoes: list[str] = []
    parametros: list = []

    if filtros.sei:
        condicoes.append("sei = ?")
        parametros.append(filtros.sei.strip())

    if filtros.cpf:
        condicoes.append("cpf = ?")
        parametros.append(_cpf_normalizado(filtros.cpf))

    if filtros.servidor_nome:
        condicoes.append("servidor_nome LIKE ? ESCAPE '\\'")
        parametros.append(f"%{_escapar_like(filtros.servidor_nome)}%")

    if filtros.servidor_matricula:
        condicoes.append("servidor_matricula = ?")
        parametros.append(filtros.servidor_matricula.strip())

    if filtros.municipio:
        termo = f"%{_escapar_like(filtros.municipio)}%"
        condicoes.append("(cidade_origem LIKE ? ESCAPE '\\' OR cidade_destino LIKE ? ESCAPE '\\')")
        parametros.extend([termo, termo])

    if filtros.origem:
        condicoes.append("cidade_origem LIKE ? ESCAPE '\\'")
        parametros.append(f"%{_escapar_like(filtros.origem)}%")

    if filtros.destino:
        condicoes.append("cidade_destino LIKE ? ESCAPE '\\'")
        parametros.append(f"%{_escapar_like(filtros.destino)}%")

    if filtros.trecho:
        # Concatenação em SQL, não em Python — casa contra o mesmo formato
        # "{origem} - {destino}" que a coluna TRECHO da planilha já grava.
        # `||` com qualquer lado NULL resulta em NULL (nunca casa o LIKE),
        # o que é o comportamento correto: sem as duas cidades, não há
        # trecho completo a comparar.
        condicoes.append("(cidade_origem || ' - ' || cidade_destino) LIKE ? ESCAPE '\\'")
        parametros.append(f"%{_escapar_like(filtros.trecho)}%")

    if filtros.motivo:
        condicoes.append("motivo = ?")
        parametros.append(filtros.motivo)

    if filtros.situacao:
        condicoes.append("servidor_situacao = ?")
        parametros.append(filtros.situacao)

    # Semântica de interseção (decisão aprovada 2026-07-30): uma diária
    # entra no resultado se seu intervalo tem qualquer sobreposição com o
    # intervalo filtrado — cada limite é independente e opcional.
    if filtros.periodo_inicial is not None:
        condicoes.append("periodo_final >= ?")
        parametros.append(filtros.periodo_inicial.isoformat())

    if filtros.periodo_final is not None:
        condicoes.append("periodo_inicial <= ?")
        parametros.append(filtros.periodo_final.isoformat())

    # Faixa de valor (Sprint 19.5.2) — inclusiva nos dois limites, cada um
    # independente e opcional (mesmo critério de período, acima). Uma
    # diária sem `valor_total_diarias` (NULL) nunca casa com nenhum dos
    # dois limites — comportamento nativo do SQL (`NULL >= x` nunca é
    # verdadeiro), não uma regra escrita aqui; validação cruzada
    # (`valor_maximo >= valor_minimo`) fica para a camada de schema da
    # Sprint 19.5.3, mesmo padrão já usado para período.
    if filtros.valor_minimo is not None:
        condicoes.append("valor_total_diarias >= ?")
        parametros.append(filtros.valor_minimo)

    if filtros.valor_maximo is not None:
        condicoes.append("valor_total_diarias <= ?")
        parametros.append(filtros.valor_maximo)

    if filtros.q:
        condicao_q, parametros_q = _condicao_pesquisa_global(filtros.q)
        condicoes.append(condicao_q)
        parametros.extend(parametros_q)

    if not condicoes:
        return "1 = 1", []
    return " AND ".join(condicoes), parametros


def _linha_para_registro(linha: sqlite3.Row) -> RegistroAnalitico:
    servidor = None
    if linha["servidor_nome"] is not None:
        servidor = Servidor(
            cpf=linha["cpf"],
            nome=linha["servidor_nome"],
            cargo=linha["servidor_cargo"],
            previdencia=linha["servidor_previdencia"],
            matricula=linha["servidor_matricula"],
            situacao=linha["servidor_situacao"],
        )
    return RegistroAnalitico(
        sei=linha["sei"],
        doc_origem=linha["doc_origem"],
        cpf=linha["cpf"],
        periodo_inicial=date.fromisoformat(linha["periodo_inicial"]),
        periodo_final=date.fromisoformat(linha["periodo_final"]),
        cidade_origem=linha["cidade_origem"],
        cidade_destino=linha["cidade_destino"],
        motivo=linha["motivo"],
        transporte=linha["transporte"],
        valor_total_diarias=linha["valor_total_diarias"],
        linha_planilha=linha["linha_planilha"],
        servidor=servidor,
        dh=linha["dh"],
    )


def listar_diarias(
    caminho_sqlite: Path,
    filtros: FiltrosDiaria,
    paginacao: ParametrosPaginacao,
    ordenacao: ParametrosOrdenacao,
) -> PaginaDeRegistros:
    where_sql, parametros = _montar_where(filtros)
    coluna_ordenacao = COLUNAS_ORDENACAO[ordenacao.campo]
    direcao = "ASC" if ordenacao.ordem == "asc" else "DESC"
    offset = (paginacao.pagina - 1) * paginacao.tamanho_pagina

    conexao = _conectar_somente_leitura(caminho_sqlite)
    try:
        total_itens = conexao.execute(
            f"SELECT COUNT(*) FROM diarias WHERE {where_sql}", parametros
        ).fetchone()[0]

        linhas = conexao.execute(
            f"""
            SELECT {_COLUNAS_DIARIA}
            FROM diarias
            WHERE {where_sql}
            ORDER BY {coluna_ordenacao} {direcao}
            LIMIT ? OFFSET ?
            """,
            [*parametros, paginacao.tamanho_pagina, offset],
        ).fetchall()
    finally:
        conexao.close()

    return PaginaDeRegistros(
        itens=[_linha_para_registro(linha) for linha in linhas],
        total_itens=total_itens,
    )


def agregar_indicadores(caminho_sqlite: Path, filtros: FiltrosDiaria) -> list[RegistroAnalitico]:
    """`docs/central-analitica/v2-plano-tecnico.md` § 18, 19.6.1 — mesmo
    `_montar_where` já usado por `listar_diarias`, mas sem paginação nem
    ordenação: devolve o recorte inteiro (1 única consulta SQL) para as
    funções puras de `app/domain/analitica/indicadores.py` calcularem os
    KPIs em memória. Volume real já medido (~3 mil diárias, Sprint 13.1) —
    nesta escala, ler o recorte inteiro uma vez é mais simples e barato do
    que uma consulta `SELECT COUNT/SUM/AVG` própria por KPI, e mantém o
    cálculo 100% testável sem depender do SQLite (só de `RegistroAnalitico`
    sintético)."""
    where_sql, parametros = _montar_where(filtros)
    conexao = _conectar_somente_leitura(caminho_sqlite)
    try:
        linhas = conexao.execute(
            f"SELECT {_COLUNAS_DIARIA} FROM diarias WHERE {where_sql}", parametros
        ).fetchall()
    finally:
        conexao.close()

    return [_linha_para_registro(linha) for linha in linhas]


def agregar_distribuicao(caminho_sqlite: Path, filtros: FiltrosDiaria) -> list[RegistroAnalitico]:
    """Sprint 19.6.3 — mesma consulta de `agregar_indicadores` (recorte
    inteiro, sem paginação nem agregação em SQL): a distribuição por
    dimensão, assim como os indicadores, precisa do recorte completo em
    memória para `app/domain/analitica/distribuicoes.py` agregar em Python
    (nunca uma segunda função de SQL fazendo o mesmo `SELECT`, regra
    obrigatória de reaproveitamento, `v2-plano-tecnico.md § 3`). Mantida
    como nome próprio só para o `import` de quem consome
    (`analitica_service.calcular_distribuicoes`) ficar semanticamente
    claro — a consulta em si é 100% delegada a `agregar_indicadores`, sem
    duplicar uma linha de SQL."""
    return agregar_indicadores(caminho_sqlite, filtros)


def listar_para_diagnostico(caminho_sqlite: Path, filtros: FiltrosDiaria) -> list[RegistroAnalitico]:
    """Sprint 19.8.2 — mesmo critério de `agregar_distribuicao`: o
    Diagnóstico (`app/domain/analitica/diagnostico.py`, 19.8.1) também
    precisa do recorte completo em memória (duplicidade candidata, RN-02,
    compara registros entre si) — nome próprio só para clareza de quem
    consome (`analitica_service.executar_diagnostico`), zero SQL
    duplicado."""
    return agregar_indicadores(caminho_sqlite, filtros)


def buscar_por_sei(caminho_sqlite: Path, sei: str) -> RegistroAnalitico | None:
    """Detalhamento (`GET /diarias/{sei}`, Sprint 17.4.4) — `sei` trafega
    exatamente como recebido, nunca `.strip()`/normalizado (RN-12,
    `docs/central-analitica/api-arquitetura.md`), diferente do filtro
    homônimo de `_montar_where` (pesquisa, onde o espaço em branco
    acidental já era tolerado). `None` quando não encontrado — o service
    decide o mapeamento para 404, nunca uma exceção aqui."""
    conexao = _conectar_somente_leitura(caminho_sqlite)
    try:
        linha = conexao.execute(
            f"SELECT {_COLUNAS_DIARIA} FROM diarias WHERE sei = ?", [sei]
        ).fetchone()
    finally:
        conexao.close()

    return _linha_para_registro(linha) if linha is not None else None


def opcoes_filtro(caminho_sqlite: Path) -> OpcoesFiltro:
    """`GET /opcoes-filtro` (Sprint 17.4.5) — valores distintos hoje
    presentes na Base Local para os 3 campos de seleção (Fase 4,
    `docs/central-analitica/api-arquitetura.md`). Sem parâmetro nenhum —
    nada vindo do usuário entra nesta consulta, então não há SQL dinâmico
    a montar aqui (diferente de `_montar_where`). `NULL` nunca vira opção
    de filtro (`motivo`/`cidade_origem`/`cidade_destino`/`servidor_situacao`
    são colunas opcionais no esquema, Sprint 17.3). `município` é a união
    de origem e destino distintos — o `UNION` (não `UNION ALL`) já
    deduplica sozinho."""
    conexao = _conectar_somente_leitura(caminho_sqlite)
    try:
        motivos = [
            linha[0]
            for linha in conexao.execute(
                "SELECT DISTINCT motivo FROM diarias WHERE motivo IS NOT NULL ORDER BY motivo"
            ).fetchall()
        ]
        situacoes = [
            linha[0]
            for linha in conexao.execute(
                "SELECT DISTINCT servidor_situacao FROM diarias "
                "WHERE servidor_situacao IS NOT NULL ORDER BY servidor_situacao"
            ).fetchall()
        ]
        municipios = [
            linha[0]
            for linha in conexao.execute(
                "SELECT cidade_origem AS municipio FROM diarias WHERE cidade_origem IS NOT NULL "
                "UNION "
                "SELECT cidade_destino AS municipio FROM diarias WHERE cidade_destino IS NOT NULL "
                "ORDER BY municipio"
            ).fetchall()
        ]
    finally:
        conexao.close()

    return OpcoesFiltro(motivos=motivos, situacoes=situacoes, municipios=municipios)


def _linha_sincronizacao_mais_recente(conexao: sqlite3.Connection) -> sqlite3.Row:
    """Único ponto de leitura da linha mais recente de `sincronizacoes`
    (Sprint 17.4.6) — `ORDER BY id DESC LIMIT 1` identifica "a mais
    recente" de forma genérica (nunca assume que só existe uma linha,
    mesmo que a reconstrução total, decisão 4, produza hoje sempre
    exatamente uma). Lê todas as colunas que algum chamador desta Sprint
    precisa; cada chamador projeta só os campos que usa — nunca duas
    consultas para os mesmos dados. Levanta `sqlite3.DatabaseError` se
    não houver nenhuma linha (mesmo defensivo já usado por
    `ultima_sincronizacao` antes desta refatoração)."""
    linha = conexao.execute(
        """
        SELECT id, sincronizado_em, origem, linhas_diarias,
               linhas_servidores_lidos, linhas_ignoradas
        FROM sincronizacoes
        ORDER BY id DESC
        LIMIT 1
        """
    ).fetchone()
    if linha is None:
        raise sqlite3.DatabaseError("Base Local em SQLite sem registro de sincronização")
    return linha


def _contar_avisos(conexao: sqlite3.Connection, sincronizacao_id: int) -> int:
    """Extraído do corpo de `ultima_sincronizacao` (Sprint 17.4.3) —
    mesmo `SELECT COUNT(*)`, reaproveitado por todos os chamadores que
    precisam da contagem de avisos da sincronização mais recente."""
    return conexao.execute(
        "SELECT COUNT(*) FROM avisos_sincronizacao WHERE sincronizacao_id = ?",
        [sincronizacao_id],
    ).fetchone()[0]


def ultima_sincronizacao(caminho_sqlite: Path) -> InfoSincronizacaoResumida:
    """Refatorada na Sprint 17.4.6 para reaproveitar
    `_linha_sincronizacao_mais_recente`/`_contar_avisos` em vez de uma
    consulta própria — assinatura, tipo de retorno e comportamento
    observável permanecem exatamente os já homologados nas Sprints
    17.4.3/17.4.4 (mesmos testes de regressão comprovam isso)."""
    conexao = _conectar_somente_leitura(caminho_sqlite)
    try:
        linha = _linha_sincronizacao_mais_recente(conexao)
        total_avisos = _contar_avisos(conexao, linha["id"])
    finally:
        conexao.close()

    return InfoSincronizacaoResumida(
        sincronizado_em=linha["sincronizado_em"], total_avisos=total_avisos
    )


def estado_sincronizacao_registrado(caminho_sqlite: Path) -> InfoSincronizacaoCompleta:
    """`GET /sincronizacao` e `POST /sincronizacao` (Sprint 17.4.6) —
    leitura completa da linha mais recente de `sincronizacoes`, cada
    endpoint no service usando só os campos que precisa."""
    conexao = _conectar_somente_leitura(caminho_sqlite)
    try:
        linha = _linha_sincronizacao_mais_recente(conexao)
        total_avisos = _contar_avisos(conexao, linha["id"])
    finally:
        conexao.close()

    return InfoSincronizacaoCompleta(
        sincronizado_em=linha["sincronizado_em"],
        origem=linha["origem"],
        linhas_diarias=linha["linhas_diarias"],
        linhas_servidores_lidos=linha["linhas_servidores_lidos"],
        linhas_ignoradas=linha["linhas_ignoradas"],
        total_avisos=total_avisos,
    )


def avisos_paginados(caminho_sqlite: Path, paginacao: ParametrosPaginacao) -> PaginaDeAvisos:
    """`GET /sincronizacao/avisos` (Sprint 17.4.6) — avisos da
    sincronização mais recente identificada por
    `_linha_sincronizacao_mais_recente`, paginados (mesmo padrão de
    `listar_diarias`: `COUNT(*)` + `LIMIT`/`OFFSET`). Contagem via
    `_contar_avisos` (Sprint 17.4.7.1 — reaproveita a mesma função já
    usada por `ultima_sincronizacao`/`estado_sincronizacao_registrado`,
    em vez de duplicar o `SELECT COUNT(*)`). Levanta
    `sqlite3.DatabaseError` quando não há nenhuma sincronização
    registrada — o service mapeia isso para `503` aqui (decisão
    confirmada da 17.4.6), diferente de `estado_sincronizacao_registrado`
    combinado com `base_local_sqlite.ultimo_sinal_frescor`, onde o caso
    análogo vira o estado de negócio `"nunca_sincronizado"` (`200`)."""
    conexao = _conectar_somente_leitura(caminho_sqlite)
    try:
        linha = _linha_sincronizacao_mais_recente(conexao)
        sincronizacao_id = linha["id"]

        total_itens = _contar_avisos(conexao, sincronizacao_id)

        offset = (paginacao.pagina - 1) * paginacao.tamanho_pagina
        linhas = conexao.execute(
            """
            SELECT aba, linha, motivo
            FROM avisos_sincronizacao
            WHERE sincronizacao_id = ?
            ORDER BY id
            LIMIT ? OFFSET ?
            """,
            [sincronizacao_id, paginacao.tamanho_pagina, offset],
        ).fetchall()
    finally:
        conexao.close()

    itens = [
        AvisoLinhaIgnorada(aba=linha_aviso["aba"], linha=linha_aviso["linha"], motivo=linha_aviso["motivo"])
        for linha_aviso in linhas
    ]
    return PaginaDeAvisos(itens=itens, total_itens=total_itens)
