from datetime import date, timedelta

from app.domain.entities.registro_diaria_existente import RegistroDiariaExistente
from app.domain.entities.resultado_conferencia import ItemChecklist, ResultadoConferencia, Veredito
from app.domain.entities.servidor import Servidor

_DIAS_ANTECEDENCIA_JANELA = 15  # RN-06: PASSAR DIA = período inicial − 15 dias
_PROVIDENCIA_APTO = "Nenhuma — pronto para seguir"
_PROVIDENCIA_CADASTRO = "Confirme o CPF digitado ou verifique o cadastro do servidor"
_PROVIDENCIA_DUPLICIDADE = "Verifique se não é um caso de complemento de diária antes de prosseguir"


def conferir(
    *,
    cpf: str,
    periodo_inicial: date,
    periodo_final: date,
    servidor: Servidor | None,
    registros_do_cpf: list[RegistroDiariaExistente],
    hoje: date,
) -> ResultadoConferencia:
    """Regra pura (sem I/O) da Etapa 1 — quem já resolveu a leitura da Base
    Local (consulta cadastral RN-01, registros do mesmo CPF para checar
    duplicidade RN-02) é o serviço chamador (`app/services/conferencia_service.py`),
    mesmo padrão de `app/domain/rules/validacao_diaria.py`. `hoje` é
    explícito (nunca `date.today()` implícito) para a função continuar
    100% testável e determinística.

    `registros_do_cpf` já vem filtrado pelo CPF pedido — só falta comparar
    as duas datas do período contra a chave exata de duplicidade (RN-02:
    CPF + período inicial + período final, sem nenhuma variação baseada em
    uma única data)."""
    cadastro_localizado = servidor is not None

    duplicata = next(
        (
            registro
            for registro in registros_do_cpf
            if registro.periodo_inicial == periodo_inicial and registro.periodo_final == periodo_final
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
        pendencias.append(_PROVIDENCIA_DUPLICIDADE)
    if not liberado:
        pendencias.append(f"Aguardar até {data_liberacao.strftime('%d/%m/%Y')} para dar continuidade")
    providencia = f"{'. '.join(pendencias)}." if pendencias else _PROVIDENCIA_APTO

    apto = cadastro_localizado and duplicata is None and liberado
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
