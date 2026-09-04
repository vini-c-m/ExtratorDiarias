"""Plano de Migração E-Fisco, Sprint D — gates de qualidade da Base E-Fisco.
Domínio puro (sem I/O) — consome estruturas já lidas por `repositorio_
efisco`/`repositorio_controle_dimcac` e já filtradas/classificadas por
`filtro_diaria_efisco`. Nunca decide o que RN01-RN07 decidem (não é uma
regra de negócio de reconciliação) — só avalia a QUALIDADE/SUFICIÊNCIA da
fonte antes de preparar/gerar o relatório, e devolve um diagnóstico
estruturado (bloqueios/avisos/diagnósticos), nunca uma exceção — quem chama
decide o que fazer com um bloqueio (a decisão de "impedir a operação" é do
service, não deste módulo).

Princípio de autoridade (Plano de Migração E-Fisco, já estabelecido nas
Sprints A-C): ausência de correspondência no Controle DIMCAC NUNCA exclui
uma diária financeiramente válida — os gates aqui refletem exatamente isso,
nunca produzindo um BLOQUEIO por causa de ausência de DIMCAC, só AVISO/
DIAGNÓSTICO.

Cobertura temporal (item 4 do pedido, achado auditado): a data que
representa "até quando esta fonte tem PAGAMENTOS confirmados" é `Data
Pagto./Devol.` (`LinhaEfisco.data_pagamento_devolucao`) restrita a
`Situação == "Paga"` — nunca `Data da OB` (`data_ob`) isolada, que existe
para TODA linha (inclusive Devolvida/Cancelada/Gerada/despesas não-diária) e
por isso não é um proxy confiável de "até quando o pagamento está
comprovado". Usar `Data da OB` sozinha bloquearia ou liberaria uma
competência por coincidência de data de um registro que nunca foi
efetivamente pago — exatamente o erro que este módulo evita."""

from dataclasses import dataclass, field
from datetime import date, datetime

from app.domain.entities.linha_efisco import LinhaEfisco
from app.domain.entities.registro_controle import RegistroControle
from app.domain.relatorio_transparencia.competencia import IntervaloAcumulado
from app.domain.relatorio_transparencia.filtro_diaria_efisco import (
    NATUREZA_DIARIA_PADRAO,
    NATUREZA_EXERCICIOS_ANTERIORES,
    SITUACAO_ELEGIVEL,
    _documento_e_cpf,  # noqa: PLC2701 — mesmo reuso já praticado no projeto (nunca uma segunda implementação da checagem CPF/CNPJ)
    _tem_evidencia_positiva_de_diaria,  # noqa: PLC2701
    diaria_elegivel,
)

__all__ = [
    "DiagnosticoQualidadeEfisco",
    "CoberturaInsuficienteEfisco",
    "avaliar_qualidade_efisco",
]

# Diferença tolerada, sem gerar AVISO, entre a cobertura real do E-Fisco
# (max Data Pagto./Devol. onde Paga) e a cobertura do Controle DIMCAC (max
# período final registrado) — folga deliberada: as duas fontes nunca são
# atualizadas no mesmo instante (achado real, Sprints B/C: ~2 semanas de
# defasagem típica entre elas é normal, não indica problema).
_TOLERANCIA_DIFERENCA_TEMPORAL_DIAS = 14


class CoberturaInsuficienteEfisco(Exception):
    """BLOQUEIO — a competência solicitada (`intervalo.data_fim`) é
    comprovadamente posterior à cobertura real da Base E-Fisco (nenhum
    pagamento confirmado, Situação=Paga, com Data Pagto./Devol. até essa
    data). Distinta de `BaseEfiscoNaoEncontrada`/`EstruturaBaseEfiscoInvalida`
    (aquelas são sobre o ARQUIVO; esta é sobre a COMPETÊNCIA pedida vs. o
    que o arquivo realmente cobre) — mensagem já adequada para exibição
    direta ao usuário.

    Sprint D.1 (P2) — `cobertura_paga_ate` carrega a mesma data que já
    integra `str(self)`, mas como atributo estruturado: permite à API
    (`_levantar_erro_de_fontes`) devolver um corpo HTTP 422 estruturado
    (não só texto) para o frontend oferecer "gerar com cobertura parcial"
    sem precisar re-parsear a mensagem."""

    def __init__(self, mensagem: str, *, cobertura_paga_ate: date | None = None) -> None:
        super().__init__(mensagem)
        self.cobertura_paga_ate = cobertura_paga_ate


@dataclass(frozen=True)
class DiagnosticoQualidadeEfisco:
    """`bloqueios` não-vazio significa que a operação não deveria
    prosseguir (quem chama decide levantar `CoberturaInsuficienteEfisco` ou
    equivalente) — os demais são sempre informativos, nunca impedem nada
    por si sós.

    Sprint D.1 (P2, cobertura parcial) — `cobertura_paga_ate` é sempre
    preenchido quando existe pelo menos um pagamento confirmado na fonte
    (mesmo valor usado para montar `bloqueios` quando insuficiente),
    `None` só quando não há NENHUM pagamento confirmado. Quem chama usa
    isto para permitir prosseguir explicitamente sob cobertura parcial em
    vez de só bloquear — este módulo continua nunca decidindo isso
    sozinho (mesmo princípio já documentado acima: "a decisão de impedir a
    operação é do service, não deste módulo")."""

    bloqueios: list[str] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)
    diagnosticos: list[str] = field(default_factory=list)
    cobertura_paga_ate: date | None = None


def _cobertura_paga_efisco(linhas_brutas: list[LinhaEfisco]) -> datetime | None:
    """Data mais recente com pagamento CONFIRMADO na fonte inteira — não
    restrita a diária (qualquer natureza), porque o objetivo é medir até
    quando a fonte financeira está "em dia" com pagamentos, não só com
    diárias (uma competência sem diária paga na última semana não é,
    sozinha, evidência de fonte desatualizada)."""
    datas = [
        linha.data_pagamento_devolucao
        for linha in linhas_brutas
        if linha.situacao == SITUACAO_ELEGIVEL and linha.data_pagamento_devolucao is not None
    ]
    return max(datas) if datas else None


def _cobertura_dimcac(controle_por_dh: dict[str, list[RegistroControle]]) -> date | None:
    datas = [
        registro.periodo_final
        for registros in controle_por_dh.values()
        for registro in registros
        if registro.periodo_final is not None
    ]
    return max(datas) if datas else None


def avaliar_qualidade_efisco(
    *,
    linhas_brutas: list[LinhaEfisco],
    linhas_elegiveis: list[LinhaEfisco],
    controle_por_dh: dict[str, list[RegistroControle]],
    intervalo: IntervaloAcumulado,
) -> DiagnosticoQualidadeEfisco:
    """Avalia a Base E-Fisco (já lida, já filtrada) contra a competência
    solicitada e contra o Controle DIMCAC (já lido). Nunca reabre nenhum
    arquivo — só analisa o que já foi carregado."""
    bloqueios: list[str] = []
    avisos: list[str] = []
    diagnosticos: list[str] = []

    # --- BLOQUEIO: cobertura temporal comprovadamente insuficiente -------
    cobertura_paga = _cobertura_paga_efisco(linhas_brutas)
    if cobertura_paga is None or cobertura_paga.date() < intervalo.data_fim:
        cobertura_texto = cobertura_paga.date().isoformat() if cobertura_paga else "nenhum pagamento confirmado"
        bloqueios.append(
            "A Base E-Fisco não tem cobertura comprovada até o fim da competência solicitada "
            f"({intervalo.data_fim.isoformat()}) — último pagamento confirmado (Situação=Paga) "
            f"encontrado na fonte: {cobertura_texto}."
        )

    # --- AVISO: diferença temporal E-Fisco x Controle DIMCAC -------------
    cobertura_controle = _cobertura_dimcac(controle_por_dh)
    if cobertura_paga is not None and cobertura_controle is not None:
        diferenca_dias = abs((cobertura_paga.date() - cobertura_controle).days)
        if diferenca_dias > _TOLERANCIA_DIFERENCA_TEMPORAL_DIAS:
            avisos.append(
                f"Diferença temporal entre E-Fisco (cobertura até {cobertura_paga.date().isoformat()}) "
                f"e Controle DIMCAC (cobertura até {cobertura_controle.isoformat()}) de {diferenca_dias} "
                "dias — verifique se as duas fontes estão de competências próximas antes de publicar."
            )

    # --- DIAGNÓSTICO/AVISO: cobertura DIMCAC das diárias elegíveis -------
    total_elegiveis = len(linhas_elegiveis)
    sem_dimcac = [linha for linha in linhas_elegiveis if not linha.dh or linha.dh not in controle_por_dh]
    if total_elegiveis and sem_dimcac:
        percentual = len(sem_dimcac) / total_elegiveis
        mensagem = (
            f"{len(sem_dimcac)} de {total_elegiveis} diárias elegíveis "
            f"({percentual:.0%}) não têm correspondência no Controle DIMCAC ainda — "
            "SEI/cargo/período/trecho ficam ausentes para elas, mas continuam sendo "
            "publicadas normalmente (ausência de DIMCAC nunca exclui uma diária)."
        )
        # Acima de 10% sem correspondência passa de diagnóstico de rotina
        # para aviso — mesmo limiar não é bloqueio (nunca impede nada),
        # só muda a severidade da mensagem para quem revisa.
        (avisos if percentual > 0.10 else diagnosticos).append(mensagem)

    # --- DIAGNÓSTICO: diárias sem SEI por ausência de DIMCAC -------------
    sem_sei = [linha for linha in linhas_elegiveis if not linha.dh or linha.dh not in controle_por_dh]
    if sem_sei:
        diagnosticos.append(
            f"{len(sem_sei)} diária(s) elegível(is) sem SEI disponível (Controle DIMCAC não tem "
            "registro para o DH correspondente ainda)."
        )

    # --- DIAGNÓSTICO: contagem de CNPJ descartados ------------------------
    # Linhas que bateriam natureza+situação (seriam diária, financeiramente
    # falando) mas foram excluídas só pelo documento não ser CPF — mesma
    # regra de `diaria_elegivel`, nunca uma segunda implementação.
    def _bateria_natureza_e_situacao(linha: LinhaEfisco) -> bool:
        if linha.situacao != SITUACAO_ELEGIVEL:
            return False
        natureza = (linha.natureza or "").strip()
        if natureza == NATUREZA_DIARIA_PADRAO:
            return True
        if natureza == NATUREZA_EXERCICIOS_ANTERIORES:
            return _tem_evidencia_positiva_de_diaria(linha.observacao)
        return False

    total_cnpj_descartados = sum(
        1
        for linha in linhas_brutas
        if _bateria_natureza_e_situacao(linha) and not _documento_e_cpf(linha.documento_credor)
    )
    if total_cnpj_descartados:
        diagnosticos.append(
            f"{total_cnpj_descartados} linha(s) descartada(s) por documento do credor não ser CPF "
            "(pagamento a pessoa jurídica — nunca diária de membro/servidor)."
        )

    # --- DIAGNÓSTICO: distribuição por natureza ---------------------------
    total_33901400 = sum(1 for linha in linhas_elegiveis if (linha.natureza or "").strip() == NATUREZA_DIARIA_PADRAO)
    total_33909200 = sum(
        1 for linha in linhas_elegiveis if (linha.natureza or "").strip() == NATUREZA_EXERCICIOS_ANTERIORES
    )
    diagnosticos.append(
        f"Distribuição por natureza entre as diárias elegíveis: {total_33901400} de natureza "
        f"{NATUREZA_DIARIA_PADRAO}, {total_33909200} de natureza {NATUREZA_EXERCICIOS_ANTERIORES}."
    )

    return DiagnosticoQualidadeEfisco(
        bloqueios=bloqueios,
        avisos=avisos,
        diagnosticos=diagnosticos,
        cobertura_paga_ate=cobertura_paga.date() if cobertura_paga else None,
    )
