from datetime import date

from app.domain.entities.campos_extraidos import CamposExtraidos
from app.domain.entities.processo import StatusProcesso
from app.domain.rules.validacao_diaria import validar


def _campos(**sobrescreve) -> CamposExtraidos:
    base = dict(
        sei="19.20.0001.0000101/2025-01",
        doc_origem="UNIDADE TESTE",
        cpf="11111111101",
        periodo_inicial="12/09/2025",
        periodo_final="12/09/2025",
        cidade_origem="Recife",
        cidade_destino="Nazaré da Mata",
        motivo="De acordo com a requisição.",
    )
    base.update(sobrescreve)
    return CamposExtraidos(**base)


def test_diaria_valida_quando_campos_chave_presentes():
    processo = validar("arquivo.pdf", _campos())

    assert processo.status is StatusProcesso.SUCESSO
    assert processo.diaria is not None
    assert processo.diaria.periodo_inicial == date(2025, 9, 12)
    assert processo.erro is None


def test_diaria_valida_mesmo_com_doc_origem_ausente():
    # DOC ORIGEM, cidades e motivo são opcionais -- podem ser completados
    # manualmente depois (mesma lógica de negócio do ADR-001).
    processo = validar("arquivo.pdf", _campos(doc_origem=None, motivo=None))

    assert processo.status is StatusProcesso.SUCESSO
    assert processo.diaria.doc_origem == ""
    assert processo.diaria.motivo == ""


def test_erro_quando_sei_ausente():
    processo = validar("arquivo.pdf", _campos(sei=None))

    assert processo.status is StatusProcesso.ERRO
    assert "SEI não encontrado" in processo.erro.motivos


def test_erro_quando_cpf_ausente():
    processo = validar("arquivo.pdf", _campos(cpf=None))

    assert processo.status is StatusProcesso.ERRO
    assert "CPF não encontrado" in processo.erro.motivos


def test_erro_quando_data_nao_e_valida():
    processo = validar("arquivo.pdf", _campos(periodo_inicial="31/02/2025"))

    assert processo.status is StatusProcesso.ERRO
    assert any("não é uma data válida" in m for m in processo.erro.motivos)


def test_erro_acumula_varios_motivos_de_uma_vez():
    processo = validar("arquivo.pdf", _campos(sei=None, cpf=None))

    assert len(processo.erro.motivos) == 2


# --- Sprint de Correção Crítica — CPF truncado nunca vira Diaria válida ----
#
# Bug real: processo 19.20.0001.0000108/2026-08, CPF "333.333.333-01"
# (33333333301) foi gravado na planilha como "00000333333". Causa raiz
# comprovada em `sei_parser_v1.py`: quando o valor do campo CPF é
# interrompido por uma quebra de linha/página no meio (entre um grupo de
# dígitos e outro), a regex `([\d.-]+)` casa só o fragmento antes da quebra
# ("333.333." -> "333333", 6 dígitos) -- sem lançar erro nenhum. Até esta
# correção, `validar` só checava `not campos.cpf`, então um fragmento não
# vazio passava como se fosse um CPF de verdade. Gravado depois pelo formato
# numérico já homologado (`_escrever_celula(..., cpf=True)`, máscara de 11
# dígitos), 333333 vira "00000333333" -- o valor exato do bug reportado.
#
# `_cpf_valido` fecha essa lacuna na única barreira que decide se um CPF é
# aceito: precisa ter exatamente 11 dígitos, ponto. Isso barra QUALQUER causa
# de corrupção (quebra de página, OCR, captura parcial por regex, etc.), não
# só este caso específico.


def test_erro_quando_cpf_extraido_tem_menos_de_11_digitos():
    """Reprodução do fragmento real do bug: '333333' (6 dígitos) é o que a
    regex de CPF captura quando o valor é interrompido por uma quebra de
    linha logo depois do segundo grupo de 'CPF: 333.333.333-01' -- ver
    `test_cpf_partido_por_quebra_de_linha_no_meio_do_valor_nao_e_aceito` em
    `test_sei_parser_v1.py` para a reprodução completa a partir do texto."""
    processo = validar("arquivo.pdf", _campos(cpf="333333"))

    assert processo.status is StatusProcesso.ERRO
    assert any("CPF extraído é inválido" in m for m in processo.erro.motivos)
    assert not any("CPF não encontrado" in m for m in processo.erro.motivos)


def test_erro_quando_cpf_extraido_tem_mais_de_11_digitos():
    """Simétrico ao caso de truncamento: se a regex capturar um trecho MAIOR
    que o CPF (por exemplo grudando no número do processo seguinte, sem
    espaço/quebra entre os dois), o resultado também não pode passar como
    CPF válido."""
    processo = validar("arquivo.pdf", _campos(cpf="333333333011920"))

    assert processo.status is StatusProcesso.ERRO
    assert any("CPF extraído é inválido" in m for m in processo.erro.motivos)


def test_cpf_com_exatos_11_digitos_iniciado_por_zero_e_aceito():
    """CPF real que começa por zero (a máscara e o zero à esquerda são
    legítimos e não podem ser confundidos com preenchimento artificial)."""
    processo = validar("arquivo.pdf", _campos(cpf="01234567890"))

    assert processo.status is StatusProcesso.SUCESSO
    assert processo.diaria.cpf == "01234567890"


def test_cpf_correto_do_processo_real_do_bug_e_aceito():
    """O CPF correto do processo 19.20.0001.0000108/2026-08 -- depois de
    `_somente_numeros` remover pontos e hífen de '333.333.333-01' -- tem que
    continuar sendo aceito exatamente como está, sem alteração de formato."""
    processo = validar("arquivo.pdf", _campos(cpf="33333333301"))

    assert processo.status is StatusProcesso.SUCESSO
    assert processo.diaria.cpf == "33333333301"
