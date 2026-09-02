"""Micro-sprint 3D — camada de orquestração do Relatório de Diárias —
Portal da Transparência. Conecta os componentes já homologados das
Micro-sprints 1-3C (leitores, motor de reconciliação, motor de decisão,
persistência de decisões) sem reimplementar nenhuma regra de negócio —
este módulo só ORQUESTRA, nunca decide (RN01-RN07 continuam
responsabilidade exclusiva de `motor_decisao.classificar`).

**Decisão arquitetural de estado (item 9 da Micro-sprint 3D)**: nenhum
resultado derivado da reconciliação é persistido entre chamadas. Toda
operação — inclusive `registrar_decisao_revisao` — reconstrói o estado
completo a partir das fontes brutas (Base OB + Controle DIMCAC) e das
decisões já persistidas, sempre. Isso significa que uma decisão nunca é
validada contra o que o frontend *acha* que é a evidência atual — ela é
sempre calculada contra o que as fontes *realmente* dizem no momento do
registro (item 4 da especificação: "nunca confiar apenas em dados
enviados pelo frontend"). O custo é reler as duas planilhas a cada
chamada; o ganho é determinismo e segurança contra decisão tomada sobre
evidência obsoleta — preferido explicitamente a um cache frágil
(§9 da especificação da Micro-sprint 3D)."""

import logging
import os
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, datetime

from app.consulta.configuracao_template_relatorio_transparencia import (
    ConfiguracaoTemplateCorrompida,
    TemplateOficialIndisponivel,
    resolver_caminho_template,
)
from app.consulta.persistencia_decisoes import (
    PersistenciaDecisoesCorrompida,
    VersaoEsquemaIncompativel,
    carregar_decisoes,
    salvar_decisao,
)
from app.consulta.repositorio_controle_dimcac import (
    ControleDimcacEstruturalmenteInvalido,
    abrir_controle_dimcac,
    controle_dimcac_por_dh,
)
from app.consulta.repositorio_ordens_bancarias import (
    OrdensBancariasEstruturalmenteInvalida,
    abrir_base_ordens_bancarias,
    ordens_bancarias_por_dh,
)
from app.consulta.repositorio_planilha_passagens import (
    EstruturaPlanilhaPassagensInvalida,
    PlanilhaPassagensNaoEncontrada,
    abrir_planilha_passagens,
    linhas_passagens_por_ob,
)
from app.domain.relatorio_transparencia.competencia import intervalo_acumulado
from app.domain.relatorio_transparencia.cruzamento_passagens import anexar_passagens_ao_resultado
from app.domain.relatorio_transparencia.decisao import (
    AcaoDecisao,
    CategoriaNaoPublicada,
    ContextoRevisaoParaExibicao,
    DecisaoHumana,
    EstadoRevisao,
    ResultadoRevisado,
    RevisaoComEstado,
    aplicar_decisoes,
    contexto_para_exibicao,
    identidade_grupo as calcular_identidade_grupo,
    identidades_ocorrencias,
    registrar_decisao,
)
from app.domain.relatorio_transparencia.motor_decisao import OcorrenciaFinanceira, classificar
from app.domain.relatorio_transparencia.motor_reconciliacao import reconciliar
from app.planilha.escritor_relatorio_nao_publicadas import (
    gerar_xlsx_diarias_nao_publicadas,
)
from app.planilha.escritor_relatorio_transparencia import (
    DestinoJaExiste,
    GeracaoConcorrenteEmAndamento,
    RelatorioBloqueadoPorPendencias,
    RelatorioGeradoResultado,
    TemplateEstruturalmenteInvalido,
    _MESES_EXTENSO,  # noqa: PLC2701 — mesmo reuso já praticado (ex. `_cpf_normalizado`, `_adquirir_trava_destino`): nunca uma segunda lista de nomes de mês
    gerar_xlsx_relatorio_transparencia,
)

__all__ = [
    "BaseOBNaoEncontrada",
    "EstruturaBaseOBInvalida",
    "ControleDimcacNaoEncontrado",
    "EstruturaControleInvalida",
    "PlanilhaPassagensNaoEncontrada",
    "EstruturaPlanilhaPassagensInvalida",
    "RevisaoNaoEncontrada",
    "DecisaoInvalida",
    "PersistenciaDecisoesCorrompida",
    "VersaoEsquemaIncompativel",
    "RelatorioBloqueadoPorPendencias",
    "DestinoJaExiste",
    "GeracaoConcorrenteEmAndamento",
    "TemplateEstruturalmenteInvalido",
    "TemplateOficialIndisponivel",
    "ConfiguracaoTemplateCorrompida",
    "OcorrenciaResumo",
    "RevisaoResumo",
    "ResumoRelatorio",
    "RelatorioCompletoGeradoResultado",
    "preparar_relatorio",
    "listar_revisoes",
    "registrar_decisao_revisao",
    "gerar_relatorio_xlsx",
]

_logger = logging.getLogger(__name__)


class BaseOBNaoEncontrada(Exception):
    """Caminho de Base de Ordens Bancárias informado não existe no
    filesystem — distinto de estrutura inválida (arquivo existe, mas não
    tem as colunas/aba esperadas)."""


class EstruturaBaseOBInvalida(Exception):
    """Base de Ordens Bancárias existe, mas `abrir_base_ordens_bancarias`
    rejeitou (extensão errada, corrompida, colunas obrigatórias
    ausentes)."""


class ControleDimcacNaoEncontrado(Exception):
    """Caminho do Controle DIMCAC informado não existe no filesystem."""


class EstruturaControleInvalida(Exception):
    """Controle DIMCAC existe, mas `abrir_controle_dimcac` rejeitou
    (extensão errada, corrompido, aba obrigatória ausente)."""


class RevisaoNaoEncontrada(Exception):
    """`identidade_grupo` informado não corresponde a nenhuma revisão do
    estado atual (recalculado na hora, nunca de um cache antigo)."""


class DecisaoInvalida(Exception):
    """OB selecionada não pertence ao grupo da revisão, ou combinação de
    campos contraditória (ex.: ADIAR com OBs selecionadas)."""


@dataclass(frozen=True)
class OcorrenciaResumo:
    """Visão principal de uma ocorrência (`docs/relatorio-transparencia/
    README.md` § 6) — só os campos que a futura tela de revisão precisa;
    nunca expõe `RegistroControle`, fingerprint ou qualquer estrutura
    interna do motor."""

    ob: str
    dh: str
    beneficiario: str | None
    sei: str | None
    data_ob: datetime | None
    periodo_inicial: date | None
    periodo_final: date | None
    trecho: str | None
    valor: float | None
    motivo: str | None
    restituicao: float | None
    identidade: str
    """Identidade por ocorrência (HOMO-RT-02) — igual a `ob` quando a OB
    não se repete fisicamente no grupo (todo RN07); `"{ob}#{N}"` quando se
    repete (RN04, I11). É essa identidade, nunca `ob` isolada, que a UI
    deve usar como React key e como chave de seleção dos checkboxes —
    `ob` sozinha não distingue duas ocorrências físicas da mesma OB."""


@dataclass(frozen=True)
class RevisaoResumo:
    identidade_grupo: str
    regra: str
    estado: str
    explicacao: str
    campos_iguais: list[str]
    campos_diferentes: list[str]
    ocorrencias: list[OcorrenciaResumo]
    autor: str | None = None
    decidido_em: datetime | None = None
    observacao: str | None = None
    obs_publicaveis: list[str] | None = None
    """Histórico da última decisão registrada para este grupo (HOMO-RT-02
    / histórico de decisões) — `None` quando o grupo nunca teve decisão
    (PENDENTE). `obs_publicaveis` é exposto exatamente como persistido
    (pode estar no formato antigo, por OB, para decisões anteriores a esta
    correção — nunca reinterpretado aqui, só exibido)."""


@dataclass(frozen=True)
class ResumoRelatorio:
    total_candidatos_normais: int
    total_revisoes: int
    total_pendentes: int
    total_decididas: int
    total_adiadas: int
    total_desatualizadas: int
    total_ocorrencias_nao_publicaveis: int
    pode_gerar_relatorio: bool
    revisoes: list[RevisaoResumo] = field(default_factory=list)
    total_requer_nova_decisao: int = 0


@dataclass(frozen=True)
class RelatorioCompletoGeradoResultado:
    """Sprint 5 (plano "Valor da Passagem + Não Publicadas") — resultado da
    geração CONJUNTA dos dois artefatos, a partir do MESMO `ResultadoRevisado`
    (nunca reprocessado entre um arquivo e outro). Nunca substitui
    `RelatorioGeradoResultado` (contrato do escritor oficial, já homologado,
    intocado) — só agrega o resultado dele com o do escritor operacional
    (Sprint 4).

    `nao_publicadas_gerado=False` cobre DOIS cenários bem distintos, cada um
    com seu próprio significado:
    - `total_nao_publicadas == 0`: não havia nada a gerar (G04 já garantiu
      isso — nenhuma diária ficou de fora). Comportamento intencional
      (item 1 do pedido): NUNCA cria um XLSX operacional vazio.
      `erro_nao_publicadas` permanece `None` neste caso — não é uma falha.
    - `total_nao_publicadas > 0` mas a escrita do arquivo operacional
      falhou DEPOIS do oficial já ter sido promovido com sucesso: estado
      PARCIAL, nunca escondido — `erro_nao_publicadas` traz a causa. O
      oficial já está seguro no destino (nunca desfeito); só o operacional
      precisa ser gerado de novo (mesma proteção de no-clobber do escritor
      operacional protege uma nova tentativa)."""

    oficial: RelatorioGeradoResultado
    caminho_arquivo_nao_publicadas: str | None
    total_nao_publicadas: int
    total_categoria_a: int
    total_categoria_b: int
    nao_publicadas_gerado: bool
    erro_nao_publicadas: str | None = None


def _derivar_caminho_nao_publicadas(caminho_destino_oficial: str, *, ano_exercicio: int, mes_referencia: int) -> str:
    """Mesma pasta do XLSX oficial (item 1: "a partir do MESMO
    ResultadoRevisado", mesma operação, sem pedir um segundo diálogo ao
    usuário — nenhuma seleção nova de destino). Nome fixo por competência,
    mesma convenção já usada no nome sugerido do oficial (mês por extenso +
    ano) — `_MESES_EXTENSO` é a MESMA lista já usada para o título dentro do
    XLSX oficial, nunca uma segunda lista de nomes de mês."""
    diretorio = os.path.dirname(os.path.abspath(caminho_destino_oficial)) or "."
    mes_nome = _MESES_EXTENSO[mes_referencia - 1].capitalize()
    return os.path.join(diretorio, f"Diarias_Nao_Publicadas_{mes_nome}_{ano_exercicio}.xlsx")


def _abrir_base_ob(caminho: str):
    if not os.path.isfile(caminho):
        raise BaseOBNaoEncontrada(f"Base de Ordens Bancárias não encontrada: {caminho}")
    try:
        return abrir_base_ordens_bancarias(caminho)
    except OrdensBancariasEstruturalmenteInvalida as erro:
        raise EstruturaBaseOBInvalida(str(erro)) from erro


def _abrir_controle(caminho: str):
    if not os.path.isfile(caminho):
        raise ControleDimcacNaoEncontrado(f"Controle DIMCAC não encontrado: {caminho}")
    try:
        return abrir_controle_dimcac(caminho)
    except ControleDimcacEstruturalmenteInvalido as erro:
        raise EstruturaControleInvalida(str(erro)) from erro


def _montar_resultado_revisado(
    *,
    caminho_base_ordens_bancarias: str,
    caminho_controle_dimcac: str,
    ano_exercicio: int,
    mes_referencia: int,
    caminho_decisoes: str,
    caminho_planilha_passagens: str | None = None,
) -> ResultadoRevisado:
    """Núcleo único de reconstrução — reaproveitado por `preparar_relatorio`,
    `listar_revisoes`, `registrar_decisao_revisao` e `gerar_relatorio_xlsx`.
    Nunca lê nem escreve nada além do que os componentes já homologados
    leem/escrevem (nenhum novo formato de arquivo, nenhuma nova leitura de
    estado).

    Sprint 3 (HOMO-RT-06) — `caminho_planilha_passagens` é OPCIONAL e
    retrocompatível: `None` (padrão) preserva EXATAMENTE o comportamento
    anterior a esta Sprint, nenhuma leitura nova, `OcorrenciaFinanceira.
    passagem` permanece `None` (estado E) para toda ocorrência — nenhum
    chamador existente precisa mudar. Quando informado, a Planilha de
    Passagens é lida e cruzada por OB (Sprint 1/2) e anexada ao resultado
    JÁ CLASSIFICADO por `classificar()` (RN01-RN07), ANTES de
    `aplicar_decisoes` — para que o fingerprint calculado ali já reflita o
    Valor da Passagem (HOMO-RT-06)."""
    planilha_ob = _abrir_base_ob(caminho_base_ordens_bancarias)
    resultado_ob = ordens_bancarias_por_dh(planilha_ob)

    planilha_controle = _abrir_controle(caminho_controle_dimcac)
    resultado_controle = controle_dimcac_por_dh(planilha_controle)

    resultado_reconciliado = reconciliar(resultado_controle.por_dh, resultado_ob.por_dh)

    intervalo = intervalo_acumulado(ano_exercicio, mes_referencia)
    resultado_classificado = classificar(resultado_reconciliado, intervalo)

    if caminho_planilha_passagens is not None:
        tabela_passagens = abrir_planilha_passagens(caminho_planilha_passagens)
        resultado_passagens = linhas_passagens_por_ob(tabela_passagens)
        resultado_classificado = anexar_passagens_ao_resultado(resultado_classificado, resultado_passagens.por_ob)

    decisoes = carregar_decisoes(caminho_decisoes)
    return aplicar_decisoes(resultado_classificado, decisoes)


def _ocorrencia_resumo(oc: OcorrenciaFinanceira, identidade: str) -> OcorrenciaResumo:
    ordem = oc.ordem_bancaria
    return OcorrenciaResumo(
        ob=ordem.ob,
        dh=oc.dh,
        beneficiario=ordem.nome,
        sei=ordem.sei,
        data_ob=ordem.data_pagamento,
        periodo_inicial=ordem.periodo_inicial,
        periodo_final=ordem.periodo_final,
        trecho=ordem.trecho,
        valor=ordem.valor,
        motivo=ordem.motivo,
        restituicao=ordem.restituicao,
        identidade=identidade,
    )


def _revisao_resumo(
    contexto: ContextoRevisaoParaExibicao,
    estado: EstadoRevisao,
    decisao: DecisaoHumana | None = None,
) -> RevisaoResumo:
    identidades = identidades_ocorrencias(contexto.ocorrencias)
    return RevisaoResumo(
        identidade_grupo=contexto.identidade_grupo,
        regra=contexto.regra,
        estado=estado.value,
        explicacao=contexto.explicacao,
        campos_iguais=contexto.campos_iguais,
        campos_diferentes=contexto.campos_diferentes,
        ocorrencias=[
            _ocorrencia_resumo(oc, identidade) for oc, identidade in zip(contexto.ocorrencias, identidades)
        ],
        autor=decisao.autor if decisao else None,
        decidido_em=decisao.decidido_em if decisao else None,
        observacao=decisao.observacao if decisao else None,
        obs_publicaveis=sorted(decisao.obs_publicaveis) if decisao else None,
    )


def _resumo(revisado: ResultadoRevisado) -> ResumoRelatorio:
    por_estado = Counter(r.estado for r in revisado.revisoes)
    revisoes = [_revisao_resumo(contexto_para_exibicao(r.revisao), r.estado, r.decisao) for r in revisado.revisoes]
    return ResumoRelatorio(
        total_candidatos_normais=len(revisado.candidatos_publicaveis),
        total_revisoes=len(revisado.revisoes),
        total_pendentes=por_estado[EstadoRevisao.PENDENTE],
        total_decididas=por_estado[EstadoRevisao.DECIDIDA],
        total_adiadas=por_estado[EstadoRevisao.ADIADA],
        total_desatualizadas=por_estado[EstadoRevisao.DESATUALIZADA],
        total_ocorrencias_nao_publicaveis=len(revisado.ocorrencias_nao_publicaveis),
        pode_gerar_relatorio=revisado.pode_gerar_relatorio,
        revisoes=revisoes,
        total_requer_nova_decisao=por_estado[EstadoRevisao.REQUER_NOVA_DECISAO],
    )


def preparar_relatorio(
    *,
    caminho_base_ordens_bancarias: str,
    caminho_controle_dimcac: str,
    ano_exercicio: int,
    mes_referencia: int,
    caminho_decisoes: str,
    caminho_planilha_passagens: str | None = None,
) -> ResumoRelatorio:
    """FONTES + RNs + DECISÕES HUMANAS VÁLIDAS → estado atual. Sempre
    reconstrói do zero — nunca lê um resultado derivado salvo de uma
    chamada anterior (só as decisões humanas, que são o único estado que
    de fato precisa sobreviver entre chamadas)."""
    revisado = _montar_resultado_revisado(
        caminho_base_ordens_bancarias=caminho_base_ordens_bancarias,
        caminho_controle_dimcac=caminho_controle_dimcac,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        caminho_decisoes=caminho_decisoes,
        caminho_planilha_passagens=caminho_planilha_passagens,
    )
    resumo = _resumo(revisado)
    _logger.info(
        "Relatório preparado: %s candidatos, %s revisões (%s pendentes, %s decididas, "
        "%s adiadas, %s desatualizadas), pode_gerar_relatorio=%s",
        resumo.total_candidatos_normais,
        resumo.total_revisoes,
        resumo.total_pendentes,
        resumo.total_decididas,
        resumo.total_adiadas,
        resumo.total_desatualizadas,
        resumo.pode_gerar_relatorio,
    )
    return resumo


def listar_revisoes(
    *,
    caminho_base_ordens_bancarias: str,
    caminho_controle_dimcac: str,
    ano_exercicio: int,
    mes_referencia: int,
    caminho_decisoes: str,
    caminho_planilha_passagens: str | None = None,
) -> list[RevisaoResumo]:
    revisado = _montar_resultado_revisado(
        caminho_base_ordens_bancarias=caminho_base_ordens_bancarias,
        caminho_controle_dimcac=caminho_controle_dimcac,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        caminho_decisoes=caminho_decisoes,
        caminho_planilha_passagens=caminho_planilha_passagens,
    )
    return [_revisao_resumo(contexto_para_exibicao(r.revisao), r.estado, r.decisao) for r in revisado.revisoes]


def registrar_decisao_revisao(
    *,
    caminho_base_ordens_bancarias: str,
    caminho_controle_dimcac: str,
    ano_exercicio: int,
    mes_referencia: int,
    caminho_decisoes: str,
    identidade_grupo: str,
    acao: AcaoDecisao,
    obs_selecionadas: Iterable[str] = (),
    autor: str,
    observacao: str | None = None,
    caminho_planilha_passagens: str | None = None,
) -> ResumoRelatorio:
    """Registra uma decisão humana e devolve o estado já atualizado.
    Reconstrói o estado ANTES de decidir (nunca confia em nenhuma
    evidência que o chamador possa ter enviado) — o fingerprint gravado é
    sempre calculado sobre a leitura fresca das fontes feita aqui dentro,
    nunca sobre o que o frontend acreditava ser a evidência no momento em
    que o usuário abriu a tela."""
    obs_selecionadas_set = frozenset(obs_selecionadas)
    if acao is AcaoDecisao.ADIAR and obs_selecionadas_set:
        raise DecisaoInvalida("ADIAR não aceita OBs selecionadas.")
    # Micro-sprint 3E.2 — garantia REAL (nunca depende só do schema
    # Pydantic da API): PUBLICAR com zero OBs selecionadas exclui TODAS as
    # ocorrências do grupo da publicação — decisão administrativa válida
    # (G04), mas excepcional o bastante para exigir justificativa não-vazia.
    # Vale mesmo chamando este service diretamente (teste, script, futura
    # integração sem HTTP) — é o único ponto de entrada real desta
    # operação, nenhum outro caminho registra uma decisão. Não altera
    # RN01-RN07/motor de decisão/reconciliação/fingerprint: só valida a
    # decisão humana antes de construí-la.
    if acao is AcaoDecisao.PUBLICAR and not obs_selecionadas_set:
        if observacao is None or not observacao.strip():
            raise DecisaoInvalida(
                "Publicar sem nenhuma OB selecionada exclui todas as ocorrências deste grupo — "
                "informe uma justificativa (observacao) para confirmar esta decisão."
            )

    revisado = _montar_resultado_revisado(
        caminho_base_ordens_bancarias=caminho_base_ordens_bancarias,
        caminho_controle_dimcac=caminho_controle_dimcac,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        caminho_decisoes=caminho_decisoes,
        caminho_planilha_passagens=caminho_planilha_passagens,
    )

    revisao_alvo: RevisaoComEstado | None = None
    for revisao_com_estado in revisado.revisoes:
        obs_do_grupo = [oc.ordem_bancaria.ob for oc in revisao_com_estado.revisao.ocorrencias]
        if calcular_identidade_grupo(revisao_com_estado.revisao.regra, obs_do_grupo) == identidade_grupo:
            revisao_alvo = revisao_com_estado
            break

    if revisao_alvo is None:
        raise RevisaoNaoEncontrada(f"Nenhuma revisão pendente encontrada para o grupo {identidade_grupo!r}.")

    # HOMO-RT-02: identidade por ocorrência, não mais por OB isolada — um
    # grupo RN04 com repetição física (I11) tem duas ocorrências com a
    # MESMA OB, e o frontend agora seleciona por ocorrência (`"{ob}#{N}"`),
    # nunca por OB pura, para poder publicar só uma delas. Grupos sem
    # repetição física (todo RN07) têm identidade == ob — validação
    # equivalente à anterior, zero mudança de comportamento.
    identidades_do_grupo = set(identidades_ocorrencias(revisao_alvo.revisao.ocorrencias))
    identidades_fora_do_grupo = obs_selecionadas_set - identidades_do_grupo
    if identidades_fora_do_grupo:
        raise DecisaoInvalida(f"OB(s) fora do grupo desta revisão: {sorted(identidades_fora_do_grupo)}")

    decisao = registrar_decisao(
        revisao_alvo.revisao,
        acao=acao,
        autor=autor,
        obs_publicaveis=obs_selecionadas_set,
        observacao=observacao,
    )
    salvar_decisao(caminho_decisoes, decisao)
    # Autor deliberadamente FORA do log (Micro-sprint 3D.1, minimização de
    # dados): identificação de quem decidiu pertence ao registro da
    # decisão persistida (`DecisaoHumana.autor`, já gravado por
    # `salvar_decisao` acima), não a um log técnico — evita duplicar dado
    # de identificação de servidor em um canal sem o mesmo controle de
    # acesso/retenção do JSON de decisões.
    _logger.info(
        "Decisão registrada para o grupo %s (regra %s): acao=%s, %s OB(s) publicável(is)",
        identidade_grupo,
        revisao_alvo.revisao.regra,
        acao.value,
        len(obs_selecionadas_set),
    )

    revisado_atualizado = _montar_resultado_revisado(
        caminho_base_ordens_bancarias=caminho_base_ordens_bancarias,
        caminho_controle_dimcac=caminho_controle_dimcac,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        caminho_decisoes=caminho_decisoes,
        caminho_planilha_passagens=caminho_planilha_passagens,
    )
    return _resumo(revisado_atualizado)


def gerar_relatorio_xlsx(
    *,
    caminho_base_ordens_bancarias: str,
    caminho_controle_dimcac: str,
    ano_exercicio: int,
    mes_referencia: int,
    caminho_decisoes: str,
    caminho_configuracao_template: str,
    caminho_destino: str,
    hoje: date | None = None,
    caminho_planilha_passagens: str | None = None,
) -> RelatorioCompletoGeradoResultado:
    """Micro-sprint 3F/3H, estendido na Sprint 5 — único ponto de entrada
    real para gerar os DOIS artefatos desta competência. Nunca recebe do
    chamador uma lista de OBs a publicar ou qualquer outro dado de
    conteúdo: o frontend (ou qualquer outro chamador) só pode pedir "gerar
    o relatório desta competência" — todo o conteúdo vem, sempre, da
    reconstrução por `_montar_resultado_revisado` (mesmo núcleo único de
    `preparar_relatorio`/`registrar_decisao_revisao`, fontes brutas +
    RN01-RN07 + decisões já persistidas). `pode_gerar_relatorio` (G05) é
    verificado dentro de `gerar_xlsx_relatorio_transparencia` mesmo que
    este service seja contornado — a garantia real não depende desta
    camada.

    Micro-sprint 3H — `caminho_configuracao_template` é só o ponteiro para
    a configuração do Template Oficial (mesmo padrão de `caminho_decisoes`);
    o caminho real do template é resolvido aqui, nunca recebido diretamente
    do chamador (o template é infraestrutura fixa do módulo, configurada
    uma vez, não um parâmetro de cada geração).

    Sprint 5 — os dois artefatos nascem do MESMO `revisado` (uma única
    reconstrução, um único `aplicar_decisoes`): o XLSX oficial consome
    `revisado.candidatos_publicaveis` (via `gerar_xlsx_relatorio_
    transparencia`, INTOCADO); o operacional consome `revisado.
    ocorrencias_nao_publicaveis` (via `gerar_xlsx_diarias_nao_publicadas`,
    Sprint 4, também INTOCADO) — nunca uma segunda leitura de fontes, nunca
    uma segunda aplicação de decisões, nunca reclassificação. Estruturalmente
    impossível uma ocorrência aparecer nos dois arquivos: as duas listas
    vêm da mesma partição de `ResultadoRevisado`, calculada uma única vez.

    Geração conjunta, NUNCA uma segunda implementação de segurança: os dois
    escritores mantêm, cada um, seu PRÓPRIO lock/tmp/no-clobber já
    homologados (destinos diferentes nunca colidem entre si — mesma
    garantia já testada para gerações simultâneas em destinos distintos).
    O oficial é gerado PRIMEIRO e sempre é o produto principal — se ele
    falhar, nada mais acontece (comportamento já homologado, propagado sem
    mudança). Se o oficial tiver sucesso mas o operacional falhar depois,
    o oficial NUNCA é desfeito (não há como desfazer uma promoção atômica
    já efetivada sem abrir uma nova janela TOCTOU, e o oficial já é
    confiável) — o resultado volta com `nao_publicadas_gerado=False` e
    `erro_nao_publicadas` preenchido, nunca um sucesso silencioso do tipo
    "os dois foram gerados" quando só um foi."""
    caminho_template = resolver_caminho_template(caminho_configuracao_template)
    revisado = _montar_resultado_revisado(
        caminho_base_ordens_bancarias=caminho_base_ordens_bancarias,
        caminho_controle_dimcac=caminho_controle_dimcac,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        caminho_decisoes=caminho_decisoes,
        caminho_planilha_passagens=caminho_planilha_passagens,
    )
    resultado_oficial = gerar_xlsx_relatorio_transparencia(
        revisado,
        caminho_template=caminho_template,
        caminho_destino=caminho_destino,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        hoje=hoje,
    )
    _logger.info(
        "Relatório XLSX oficial gerado: %s (%s ocorrências, valor total diárias %.2f)",
        resultado_oficial.caminho_arquivo,
        resultado_oficial.total_ocorrencias,
        resultado_oficial.total_valor_diarias,
    )

    nao_publicaveis = revisado.ocorrencias_nao_publicaveis
    total_a = sum(
        1 for item in nao_publicaveis if item.categoria is CategoriaNaoPublicada.NAO_PUBLICADA_POR_DECISAO_HUMANA
    )
    total_b = len(nao_publicaveis) - total_a

    # Item 1 do pedido: nunca cria um XLSX operacional vazio — G04 já
    # garante que "zero não publicadas" é um estado real e válido (não uma
    # falha), então esse caso nem tenta escrever o segundo arquivo.
    if not nao_publicaveis:
        return RelatorioCompletoGeradoResultado(
            oficial=resultado_oficial,
            caminho_arquivo_nao_publicadas=None,
            total_nao_publicadas=0,
            total_categoria_a=0,
            total_categoria_b=0,
            nao_publicadas_gerado=False,
        )

    caminho_nao_publicadas = _derivar_caminho_nao_publicadas(
        caminho_destino, ano_exercicio=ano_exercicio, mes_referencia=mes_referencia
    )
    try:
        resultado_operacional = gerar_xlsx_diarias_nao_publicadas(
            nao_publicaveis, caminho_destino=caminho_nao_publicadas
        )
    except Exception as erro:  # noqa: BLE001 — deliberado: o oficial JÁ foi
        # promovido com sucesso acima (arquivo real, seguro, no destino do
        # usuário) — uma falha aqui NUNCA pode derrubar essa informação nem
        # fingir sucesso; precisa virar estado PARCIAL explícito no
        # resultado, não uma exceção que esconderia do chamador que o
        # oficial deu certo. Qualquer causa (no-clobber, geração
        # concorrente, disco cheio, permissão) recebe o MESMO tratamento:
        # reportar, nunca inventar um resultado melhor do que o real.
        _logger.error(
            "Relatório oficial gerado com sucesso, mas falhou a geração do XLSX operacional (%s): %s",
            caminho_nao_publicadas,
            erro,
        )
        return RelatorioCompletoGeradoResultado(
            oficial=resultado_oficial,
            caminho_arquivo_nao_publicadas=None,
            total_nao_publicadas=len(nao_publicaveis),
            total_categoria_a=total_a,
            total_categoria_b=total_b,
            nao_publicadas_gerado=False,
            erro_nao_publicadas=str(erro),
        )

    _logger.info(
        "Relatório XLSX operacional gerado: %s (%s ocorrências: %s categoria A, %s categoria B)",
        resultado_operacional.caminho_arquivo,
        resultado_operacional.total_ocorrencias,
        resultado_operacional.total_categoria_a,
        resultado_operacional.total_categoria_b,
    )
    return RelatorioCompletoGeradoResultado(
        oficial=resultado_oficial,
        caminho_arquivo_nao_publicadas=resultado_operacional.caminho_arquivo,
        total_nao_publicadas=len(nao_publicaveis),
        total_categoria_a=total_a,
        total_categoria_b=total_b,
        nao_publicadas_gerado=True,
    )
