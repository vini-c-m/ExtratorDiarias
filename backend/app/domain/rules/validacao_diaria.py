from datetime import date, datetime

from app.domain.entities.campos_extraidos import CamposExtraidos
from app.domain.entities.diaria import Diaria
from app.domain.entities.erro_extracao import ErroExtracao
from app.domain.entities.processo import Processo, StatusProcesso

_FORMATO_DATA = "%d/%m/%Y"
_TAMANHO_CPF = 11


def _parsear_data(valor: str | None) -> date | None:
    if not valor:
        return None
    try:
        return datetime.strptime(valor, _FORMATO_DATA).date()
    except ValueError:
        return None


def _cpf_valido(cpf: str) -> bool:
    """Um CPF tem sempre exatamente 11 dígitos — nunca mais, nunca menos.
    Esta é a única barreira do sistema contra um CPF capturado pela metade:
    se o parser casar só um fragmento do valor (por exemplo porque o campo
    caiu numa quebra de linha/página no meio do PDF, entre um grupo de
    dígitos e outro), o resultado não é vazio — passaria batido pelo teste
    `not campos.cpf` — só o tamanho exato pega esse caso, qualquer que seja a
    causa da corrupção. Sem este teste, um fragmento como "895582" segue
    validado como CPF "de verdade" e, ao ser gravado na planilha (formato
    numérico já homologado, com máscara de 11 dígitos), vira um número de 11
    dígitos plausível — só que errado."""
    return cpf.isdigit() and len(cpf) == _TAMANHO_CPF


def validar(arquivo: str, campos: CamposExtraidos) -> Processo:
    """Campos-chave obrigatórios: SEI, CPF e as duas datas do período (como
    datas reais). O resto pode ficar em branco para complemento manual depois
    — mesma lógica de negócio que já motivou o ADR-001."""
    motivos: list[str] = []

    if not campos.sei:
        motivos.append("SEI não encontrado")
    if not campos.cpf:
        motivos.append("CPF não encontrado")
    elif not _cpf_valido(campos.cpf):
        motivos.append(
            f"CPF extraído é inválido — esperado {_TAMANHO_CPF} dígitos, "
            f"encontrado {len(campos.cpf)} ({campos.cpf!r})"
        )

    periodo_inicial = _parsear_data(campos.periodo_inicial)
    if not campos.periodo_inicial:
        motivos.append("Período inicial não encontrado")
    elif periodo_inicial is None:
        motivos.append(f"Período inicial não é uma data válida: {campos.periodo_inicial!r}")

    periodo_final = _parsear_data(campos.periodo_final)
    if not campos.periodo_final:
        motivos.append("Período final não encontrado")
    elif periodo_final is None:
        motivos.append(f"Período final não é uma data válida: {campos.periodo_final!r}")

    if motivos:
        return Processo(
            arquivo_origem=arquivo,
            status=StatusProcesso.ERRO,
            erro=ErroExtracao(arquivo=arquivo, motivos=motivos),
        )

    assert periodo_inicial is not None and periodo_final is not None

    diaria = Diaria(
        sei=campos.sei or "",
        doc_origem=campos.doc_origem or "",
        cpf=campos.cpf or "",
        periodo_inicial=periodo_inicial,
        periodo_final=periodo_final,
        cidade_origem=campos.cidade_origem or "",
        cidade_destino=campos.cidade_destino or "",
        motivo=campos.motivo or "",
    )
    return Processo(arquivo_origem=arquivo, status=StatusProcesso.SUCESSO, diaria=diaria)
