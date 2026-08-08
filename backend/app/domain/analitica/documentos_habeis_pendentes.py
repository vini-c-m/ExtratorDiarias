"""Correção de foco — "Documentos Hábeis Pendentes" (antiga "Análise Rápida
(Diagnóstico)", pedido explícito do usuário, 2026-08-05): módulo puro (sem
I/O, mesmo papel de `diagnostico.py`) que trata exclusivamente de registros
com `dh` vazio, nunca do catálogo geral de anomalias.

**Reuso obrigatório da fórmula RN-06/RN-10**: a data de liberação usa
`diagnostico.data_liberacao_dh` — o mesmo cálculo já homologado por
`_caso_dh_vazio`/`_caso_passar_dia`, nunca uma segunda constante `15`
reaparecendo aqui. O limite continua inclusivo (RN-10): `hoje >=
data_liberacao` já conta como "liberado" — se o DH continuar vazio a partir
daí (inclusive no próprio dia), a causa deixa de ser "aguardando" e vira
"revisão manual necessária", mesmo critério de severidade já usado em
`diagnostico._caso_dh_vazio`. Por isso a contagem regressiva amigável nunca
mostra "hoje" para um registro `aguardando_liberacao` real (o próprio dia da
liberação já pertence à outra classificação) — a função de texto ainda trata
esse valor corretamente por completude/robustez (`_texto_contagem`), não
porque o caso ocorra em produção.

Só duas classificações existem aqui (nunca uma terceira "causa não
identificada" à parte): "aguardando_liberacao" e "revisao_manual_necessaria"
— a mesma dicotomia binária de `diagnostico._caso_dh_vazio`, com texto de
mensagem fixo por classificação (nunca uma suposição de causa)."""

from dataclasses import dataclass
from datetime import date
from typing import Literal

from app.domain.analitica.diagnostico import data_liberacao_dh
from app.domain.entities.registro_analitico import RegistroAnalitico

SituacaoDocumentoHabil = Literal["aguardando_liberacao", "revisao_manual_necessaria"]

_MENSAGEM_AGUARDANDO_LIBERACAO = "Documento Hábil ainda não disponível. Aguardar a data de liberação."
_MENSAGEM_REVISAO_MANUAL = (
    "Documento Hábil pendente. A data de liberação já foi atingida. Recomenda-se análise manual."
)


@dataclass(frozen=True)
class DocumentoHabilPendente:
    """Um registro com `dh` vazio, já classificado. `dias_restantes`/
    `texto_contagem` só existem quando `situacao == "aguardando_liberacao"`;
    `dias_atraso` só quando `situacao == "revisao_manual_necessaria"` — nunca
    os dois preenchidos ao mesmo tempo (classificação é sempre uma das duas,
    nunca ambas)."""

    sei: str
    servidor_nome: str | None
    cpf: str
    periodo_inicial: date
    periodo_final: date
    cidade_destino: str | None
    data_liberacao_prevista: date
    situacao: SituacaoDocumentoHabil
    dias_restantes: int | None
    dias_atraso: int | None
    texto_contagem: str | None
    mensagem: str


def _texto_contagem(dias_restantes: int, data_liberacao: date) -> str:
    """Texto amigável da contagem regressiva — `dias_restantes <= 0` é
    tratado por completude (a função precisa devolver algo correto para
    qualquer diferença de data), embora RN-10 (limite inclusivo) nunca
    produza esse valor para um registro classificado `aguardando_liberacao`
    de fato: no próprio dia da liberação o registro já é
    `revisao_manual_necessaria`, não mais uma espera."""
    if dias_restantes <= 0:
        return "Liberação prevista para hoje."
    if dias_restantes == 1:
        return "Liberação prevista para amanhã."
    return f"Liberação prevista para {data_liberacao.strftime('%d/%m/%Y')} — faltam {dias_restantes} dias."


def _classificar(registro: RegistroAnalitico, hoje: date) -> DocumentoHabilPendente | None:
    if registro.dh is not None:
        return None

    data_liberacao = data_liberacao_dh(registro.periodo_inicial)
    servidor_nome = registro.servidor.nome if registro.servidor is not None else None

    if hoje < data_liberacao:
        dias_restantes = (data_liberacao - hoje).days
        return DocumentoHabilPendente(
            sei=registro.sei,
            servidor_nome=servidor_nome,
            cpf=registro.cpf,
            periodo_inicial=registro.periodo_inicial,
            periodo_final=registro.periodo_final,
            cidade_destino=registro.cidade_destino,
            data_liberacao_prevista=data_liberacao,
            situacao="aguardando_liberacao",
            dias_restantes=dias_restantes,
            dias_atraso=None,
            texto_contagem=_texto_contagem(dias_restantes, data_liberacao),
            mensagem=_MENSAGEM_AGUARDANDO_LIBERACAO,
        )

    dias_atraso = (hoje - data_liberacao).days
    return DocumentoHabilPendente(
        sei=registro.sei,
        servidor_nome=servidor_nome,
        cpf=registro.cpf,
        periodo_inicial=registro.periodo_inicial,
        periodo_final=registro.periodo_final,
        cidade_destino=registro.cidade_destino,
        data_liberacao_prevista=data_liberacao,
        situacao="revisao_manual_necessaria",
        dias_restantes=None,
        dias_atraso=dias_atraso,
        texto_contagem=None,
        mensagem=_MENSAGEM_REVISAO_MANUAL,
    )


def _chave_ordenacao(pendente: DocumentoHabilPendente) -> tuple[int, int, str]:
    """Ordenação padrão (pedido do usuário, § 6): 1) revisão manual mais
    antiga primeiro (maior atraso); 2) liberação prevista para hoje; 3)
    menores quantidades de dias restantes; 4) demais registros — tudo dentro
    de um único `sorted`, `sei` como desempate estável final."""
    if pendente.situacao == "revisao_manual_necessaria":
        assert pendente.dias_atraso is not None
        return (0, -pendente.dias_atraso, pendente.sei)
    assert pendente.dias_restantes is not None
    if pendente.dias_restantes <= 0:
        return (1, 0, pendente.sei)
    return (2, pendente.dias_restantes, pendente.sei)


def listar_documentos_habeis_pendentes(
    registros: list[RegistroAnalitico], hoje: date
) -> list[DocumentoHabilPendente]:
    """`GET /api/v1/analitica/documentos-habeis-pendentes`: roda só sobre os
    registros do recorte já filtrado (mesmo critério de
    `diagnostico.diagnosticar_recorte`), devolve só os que têm `dh` vazio,
    já ordenados pela prioridade de trabalho (§ 6)."""
    pendentes = [_classificar(registro, hoje) for registro in registros]
    encontrados = [pendente for pendente in pendentes if pendente is not None]
    return sorted(encontrados, key=_chave_ordenacao)
