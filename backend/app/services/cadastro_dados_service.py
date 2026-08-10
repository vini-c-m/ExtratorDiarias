import logging
from dataclasses import dataclass
from enum import Enum

from app.consulta import base_local
from app.consulta.repositorio_servidores import NOME_ABA as NOME_ABA_SERVIDORES
from app.consulta.repositorio_servidores import OpcoesCadastroServidor, opcoes_cadastro, servidores_por_cpf
from app.domain.entities.servidor import Servidor
from app.infra.config import configuracao_app
from app.planilha import escritor_dados
from app.services.conferencia_service import (  # noqa: PLC2701 — reuso deliberado
    BaseLocalIndisponivel,
    _abrir_base_local,
)

_logger = logging.getLogger(__name__)

_MENSAGEM_SYNC_PENDENTE = (
    "Cadastro salvo na Planilha Oficial, mas a Central ainda não conseguiu "
    "atualizar a base local. Tente sincronizar novamente."
)


class EstadoCadastroServico(str, Enum):
    DUPLICADO = "duplicado"
    NAO_SALVO = "nao_salvo"
    SALVO_SYNC_PENDENTE = "salvo_sync_pendente"
    CONCLUIDO = "concluido"


@dataclass(frozen=True)
class ResultadoCadastroServico:
    estado: EstadoCadastroServico
    mensagem: str | None = None
    servidor: Servidor | None = None


def cadastrar_servidor_membro(
    cpf: str,
    nome: str,
    matricula: str,
    cargo: str,
    *,
    previdencia: str | None = None,
    orgao_origem: str | None = None,
    regime_previdencia: str | None = None,
    situacao: str | None = None,
) -> ResultadoCadastroServico:
    """Orquestra o cadastro de servidor/membro pela Central de Conferência
    (RN-11 preservada — este módulo, não `conferencia_service.py`, é o
    único ponto de escrita desta feature): grava na Planilha Oficial
    (`escritor_dados.cadastrar_servidor`, atômico e isolado da aba Dados),
    sincroniza a Base Local (mesmo hook já homologado de
    `planilha_service.preencher_planilha`) e só depois reconsulta pela MESMA
    fonte que a Central de Conferência já usa hoje (`_abrir_base_local` +
    `servidores_por_cpf`, RN-01), para o resultado final nunca depender de
    uma suposição sobre a sincronização — só do CPF realmente resolver.

    Nunca colapsa "salvo, mas a sincronização não confirmou o CPF ainda"
    num resultado de falha: quem chama distingue os 4 estados
    (`duplicado`/`nao_salvo`/`salvo_sync_pendente`/`concluido`).

    "Tentar sincronizar novamente" (§H) reenvia esta MESMA função com os
    MESMOS dados — nunca um endpoint separado: na 2ª tentativa,
    `escritor_dados.cadastrar_servidor` encontra a linha que a 1ª já
    gravou e devolve `DUPLICADO` em vez de `SALVO`, mas o passo de
    sincronizar+reconsultar abaixo roda do mesmo jeito nos dois casos — é
    isso que faz o retry realmente tentar sincronizar de novo, em vez de
    só reler uma Base Local ainda desatualizada. Nunca reescreve a linha
    duas vezes (a checagem de duplicidade em `escritor_dados` impede)."""
    try:
        caminho_planilha = configuracao_app.resolver_caminho_para_preenchimento()
    except configuracao_app.PlanilhaOficialIndisponivel as erro:
        return ResultadoCadastroServico(estado=EstadoCadastroServico.NAO_SALVO, mensagem=str(erro))

    try:
        resultado_escrita = escritor_dados.cadastrar_servidor(
            caminho_planilha,
            cpf=cpf,
            nome=nome,
            matricula=matricula,
            cargo=cargo,
            previdencia=previdencia,
            orgao_origem=orgao_origem,
            regime_previdencia=regime_previdencia,
            situacao=situacao,
        )
    except PermissionError:
        return ResultadoCadastroServico(
            estado=EstadoCadastroServico.NAO_SALVO,
            mensagem="Não foi possível gravar a planilha — feche o arquivo no Excel e tente novamente.",
        )
    except (KeyError, FileNotFoundError):
        return ResultadoCadastroServico(
            estado=EstadoCadastroServico.NAO_SALVO,
            mensagem="Não foi possível localizar a aba 'Dados' na Planilha Oficial.",
        )

    if resultado_escrita.estado is escritor_dados.EstadoCadastro.NAO_SALVO:
        return ResultadoCadastroServico(
            estado=EstadoCadastroServico.NAO_SALVO, mensagem=resultado_escrita.mensagem
        )

    def _registrar_falha_sqlite(erro: Exception) -> None:
        _logger.warning(
            "Falha ao reconstruir a Base Local em SQLite após cadastro de servidor/membro: %s",
            erro,
        )

    try:
        base_local.sincronizar(caminho_planilha, ao_falhar_sqlite=_registrar_falha_sqlite)
    except Exception:
        _logger.exception("Falha ao sincronizar a Base Local após cadastro de servidor/membro")

    assert resultado_escrita.cpf_normalizado is not None
    servidor = _consultar_servidor_atual(resultado_escrita.cpf_normalizado)

    if resultado_escrita.estado is escritor_dados.EstadoCadastro.DUPLICADO:
        return ResultadoCadastroServico(
            estado=EstadoCadastroServico.DUPLICADO, mensagem=resultado_escrita.mensagem, servidor=servidor
        )

    if servidor is None:
        return ResultadoCadastroServico(
            estado=EstadoCadastroServico.SALVO_SYNC_PENDENTE, mensagem=_MENSAGEM_SYNC_PENDENTE
        )

    return ResultadoCadastroServico(estado=EstadoCadastroServico.CONCLUIDO, servidor=servidor)


def obter_opcoes_cadastro() -> OpcoesCadastroServidor:
    """Valores reais já levantados na aba `Dados` (RN-01), para popular os
    campos do modal de Cadastro de Servidor/Membro — mesma fonte
    (`_abrir_base_local`) já usada por `_consultar_servidor_atual`, nunca
    uma lista hardcoded. Propaga `BaseLocalIndisponivel` para a rota
    mapear como HTTP 503, mesmo padrão de `obter_opcoes_filtro`
    (`analitica_service.py`)."""
    workbook = _abrir_base_local()
    try:
        return opcoes_cadastro(workbook[NOME_ABA_SERVIDORES])
    finally:
        workbook.close()


def _consultar_servidor_atual(cpf_normalizado: str) -> Servidor | None:
    """Mesma fonte que a Central de Conferência já consulta hoje (Etapa 1/2
    de `conferencia_service.py`) — nunca uma leitura paralela nova."""
    try:
        workbook = _abrir_base_local()
    except BaseLocalIndisponivel:
        return None
    try:
        servidores = servidores_por_cpf(workbook[NOME_ABA_SERVIDORES])
    finally:
        workbook.close()
    return servidores.get(cpf_normalizado)
