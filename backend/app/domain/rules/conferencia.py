from datetime import date, timedelta

from app.domain.entities.modo_processamento import ModoProcessamento
from app.domain.entities.registro_diaria_existente import RegistroDiariaExistente
from app.domain.entities.resultado_conferencia import ItemChecklist, ResultadoConferencia, Veredito
from app.domain.entities.servidor import Servidor

_DIAS_ANTECEDENCIA_JANELA = 15  # RN-06: PASSAR DIA = período inicial − 15 dias
_PROVIDENCIA_APTO = "Nenhuma — pronto para seguir"
_PROVIDENCIA_CADASTRO = "Confirme o CPF digitado ou verifique o cadastro do servidor"
_PROVIDENCIA_DUPLICIDADE = "Verifique se não é um caso de complemento de diária antes de prosseguir"
# RN-14 (modo Complemento) — a duplicidade já é o cenário esperado (o
# complemento SEMPRE aparece como duplicidade de uma diária existente), por
# isso a providência muda de tom: não é mais "verifique se não é um
# complemento", é "confirme qual candidato é a diária original".
_PROVIDENCIA_DUPLICIDADE_COMPLEMENTO = (
    "Duplicidade esperada no modo Complemento — confira os candidatos de "
    "Continuidade Processual e confirme manualmente qual é a diária original "
    "antes de gerar o Histórico de Complemento"
)


def _datas_coincidem(periodo_inicial: date, periodo_final: date, registro: RegistroDiariaExistente) -> bool:
    """RN-02 (correção de 2026-08-05): a chave de duplicidade deixa de exigir
    correspondência simultânea de período inicial E final — basta que
    QUALQUER uma das duas datas informadas já conste (como inicial OU final)
    em uma diária existente do mesmo CPF. Caso real que motivou a correção:
    diária existente 30/07/2026 a 30/07/2026; consulta 30/07/2026 a
    01/08/2026 não era sinalizada (a correspondência exigia as duas datas
    simultaneamente), mesmo a data inicial já constando para o mesmo
    servidor. Deliberadamente não é uma checagem de sobreposição de
    intervalo — só as duas datas literais informadas pelo usuário, contra as
    duas datas literais de cada registro existente."""
    datas_existentes = {registro.periodo_inicial, registro.periodo_final}
    return periodo_inicial in datas_existentes or periodo_final in datas_existentes


def conferir(
    *,
    cpf: str,
    periodo_inicial: date,
    periodo_final: date,
    servidor: Servidor | None,
    registros_do_cpf: list[RegistroDiariaExistente],
    hoje: date,
    modo: ModoProcessamento = ModoProcessamento.PADRAO,
) -> ResultadoConferencia:
    """Regra pura (sem I/O) da Etapa 1 — quem já resolveu a leitura da Base
    Local (consulta cadastral RN-01, registros do mesmo CPF para checar
    duplicidade RN-02) é o serviço chamador (`app/services/conferencia_service.py`),
    mesmo padrão de `app/domain/rules/validacao_diaria.py`. `hoje` é
    explícito (nunca `date.today()` implícito) para a função continuar
    100% testável e determinística.

    `registros_do_cpf` já vem filtrado pelo CPF pedido — só falta comparar
    as datas do período contra a chave de duplicidade (RN-02, corrigida em
    2026-08-05: mesmo CPF e QUALQUER uma das duas datas informadas já
    constando numa diária existente — ver `_datas_coincidem`).

    `modo` (RN-14, decisão institucional revisada) — em
    `ModoProcessamento.COMPLEMENTO`, a duplicidade deixa de contar para o
    veredito `apto` (um complemento SEMPRE aparece como duplicidade de uma
    diária já lançada — isso é esperado, não um erro), mas continua
    populando `checklist`/`duplicidade` normalmente: a Central nunca
    decide sozinha se é um complemento legítimo (RN-08 inalterado), só
    deixa de bloquear o fluxo por causa disso."""
    cadastro_localizado = servidor is not None

    duplicata = next(
        (
            registro
            for registro in registros_do_cpf
            if _datas_coincidem(periodo_inicial, periodo_final, registro)
        ),
        None,
    )

    data_liberacao = periodo_inicial - timedelta(days=_DIAS_ANTECEDENCIA_JANELA)
    liberado = hoje >= data_liberacao  # RN-10 — limite inclusivo

    checklist = [
        ItemChecklist(item="cadastro_localizado", ok=cadastro_localizado),
        ItemChecklist(
            item="nome", ok=cadastro_localizado, valor=servidor.nome if servidor else None
        ),
        ItemChecklist(
            item="cargo", ok=cadastro_localizado, valor=servidor.cargo if servidor else None
        ),
        ItemChecklist(item="duplicidade", ok=duplicata is None),
        ItemChecklist(item="janela_processamento", ok=liberado),
    ]

    pendencias: list[str] = []
    if not cadastro_localizado:
        pendencias.append(_PROVIDENCIA_CADASTRO)
    if duplicata is not None:
        pendencias.append(
            _PROVIDENCIA_DUPLICIDADE_COMPLEMENTO
            if modo is ModoProcessamento.COMPLEMENTO
            else _PROVIDENCIA_DUPLICIDADE
        )
    if not liberado:
        pendencias.append(f"Aguardar até {data_liberacao.strftime('%d/%m/%Y')} para dar continuidade")
    providencia = f"{'. '.join(pendencias)}." if pendencias else _PROVIDENCIA_APTO

    duplicidade_bloqueia = duplicata is not None and modo is ModoProcessamento.PADRAO
    apto = cadastro_localizado and not duplicidade_bloqueia and liberado
    veredito = Veredito.APTO_PARA_PROCESSAMENTO if apto else Veredito.REVISAR

    return ResultadoConferencia(
        veredito=veredito,
        providencia=providencia,
        checklist=checklist,
        servidor=servidor,
        duplicidade=duplicata,
        janela_liberada=liberado,
        data_liberacao=data_liberacao,
    )
