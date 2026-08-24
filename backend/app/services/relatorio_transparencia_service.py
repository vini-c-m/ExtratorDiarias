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
from app.domain.relatorio_transparencia.competencia import intervalo_acumulado
from app.domain.relatorio_transparencia.decisao import (
    AcaoDecisao,
    ContextoRevisaoParaExibicao,
    EstadoRevisao,
    ResultadoRevisado,
    RevisaoComEstado,
    aplicar_decisoes,
    contexto_para_exibicao,
    identidade_grupo as calcular_identidade_grupo,
    registrar_decisao,
)
from app.domain.relatorio_transparencia.motor_decisao import OcorrenciaFinanceira, classificar
from app.domain.relatorio_transparencia.motor_reconciliacao import reconciliar

__all__ = [
    "BaseOBNaoEncontrada",
    "EstruturaBaseOBInvalida",
    "ControleDimcacNaoEncontrado",
    "EstruturaControleInvalida",
    "RevisaoNaoEncontrada",
    "DecisaoInvalida",
    "PersistenciaDecisoesCorrompida",
    "VersaoEsquemaIncompativel",
    "OcorrenciaResumo",
    "RevisaoResumo",
    "ResumoRelatorio",
    "preparar_relatorio",
    "listar_revisoes",
    "registrar_decisao_revisao",
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


@dataclass(frozen=True)
class RevisaoResumo:
    identidade_grupo: str
    regra: str
    estado: str
    explicacao: str
    campos_iguais: list[str]
    campos_diferentes: list[str]
    ocorrencias: list[OcorrenciaResumo]


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
) -> ResultadoRevisado:
    """Núcleo único de reconstrução — reaproveitado por `preparar_relatorio`,
    `listar_revisoes` e `registrar_decisao_revisao`. Nunca lê nem escreve
    nada além do que os componentes das Micro-sprints 1-3C já leem/escrevem
    (nenhum novo formato de arquivo, nenhuma nova leitura de estado)."""
    planilha_ob = _abrir_base_ob(caminho_base_ordens_bancarias)
    resultado_ob = ordens_bancarias_por_dh(planilha_ob)

    planilha_controle = _abrir_controle(caminho_controle_dimcac)
    resultado_controle = controle_dimcac_por_dh(planilha_controle)

    resultado_reconciliado = reconciliar(resultado_controle.por_dh, resultado_ob.por_dh)

    intervalo = intervalo_acumulado(ano_exercicio, mes_referencia)
    resultado_classificado = classificar(resultado_reconciliado, intervalo)

    decisoes = carregar_decisoes(caminho_decisoes)
    return aplicar_decisoes(resultado_classificado, decisoes)


def _ocorrencia_resumo(oc: OcorrenciaFinanceira) -> OcorrenciaResumo:
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
    )


def _revisao_resumo(contexto: ContextoRevisaoParaExibicao, estado: EstadoRevisao) -> RevisaoResumo:
    return RevisaoResumo(
        identidade_grupo=contexto.identidade_grupo,
        regra=contexto.regra,
        estado=estado.value,
        explicacao=contexto.explicacao,
        campos_iguais=contexto.campos_iguais,
        campos_diferentes=contexto.campos_diferentes,
        ocorrencias=[_ocorrencia_resumo(oc) for oc in contexto.ocorrencias],
    )


def _resumo(revisado: ResultadoRevisado) -> ResumoRelatorio:
    por_estado = Counter(r.estado for r in revisado.revisoes)
    revisoes = [_revisao_resumo(contexto_para_exibicao(r.revisao), r.estado) for r in revisado.revisoes]
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
    )


def preparar_relatorio(
    *,
    caminho_base_ordens_bancarias: str,
    caminho_controle_dimcac: str,
    ano_exercicio: int,
    mes_referencia: int,
    caminho_decisoes: str,
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
) -> list[RevisaoResumo]:
    revisado = _montar_resultado_revisado(
        caminho_base_ordens_bancarias=caminho_base_ordens_bancarias,
        caminho_controle_dimcac=caminho_controle_dimcac,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        caminho_decisoes=caminho_decisoes,
    )
    return [_revisao_resumo(contexto_para_exibicao(r.revisao), r.estado) for r in revisado.revisoes]


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

    revisado = _montar_resultado_revisado(
        caminho_base_ordens_bancarias=caminho_base_ordens_bancarias,
        caminho_controle_dimcac=caminho_controle_dimcac,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        caminho_decisoes=caminho_decisoes,
    )

    revisao_alvo: RevisaoComEstado | None = None
    for revisao_com_estado in revisado.revisoes:
        obs_do_grupo = [oc.ordem_bancaria.ob for oc in revisao_com_estado.revisao.ocorrencias]
        if calcular_identidade_grupo(revisao_com_estado.revisao.regra, obs_do_grupo) == identidade_grupo:
            revisao_alvo = revisao_com_estado
            break

    if revisao_alvo is None:
        raise RevisaoNaoEncontrada(f"Nenhuma revisão pendente encontrada para o grupo {identidade_grupo!r}.")

    obs_do_grupo = {oc.ordem_bancaria.ob for oc in revisao_alvo.revisao.ocorrencias}
    obs_fora_do_grupo = obs_selecionadas_set - obs_do_grupo
    if obs_fora_do_grupo:
        raise DecisaoInvalida(f"OB(s) fora do grupo desta revisão: {sorted(obs_fora_do_grupo)}")

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
    )
    return _resumo(revisado_atualizado)
