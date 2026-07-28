from openpyxl import load_workbook

from app.consulta.repositorio_servidores import NOME_ABA, servidores_por_cpf


def test_servidores_por_cpf_le_dados_cpf_int_e_texto_mascarado(caminho_planilha_conferencia_teste):
    caminho = caminho_planilha_conferencia_teste()
    workbook = load_workbook(caminho)
    servidores = servidores_por_cpf(workbook[NOME_ABA])

    assert "12345678901" in servidores
    servidor_int = servidores["12345678901"]
    assert servidor_int.nome == "Maria Aparecida Souza"
    assert servidor_int.cargo == "Analista Judiciário"
    assert servidor_int.previdencia == "FUNAFIN"

    assert "59111111100" in servidores
    servidor_texto = servidores["59111111100"]
    assert servidor_texto.nome == "João da Silva"


def test_servidores_por_cpf_cpf_inexistente_nao_aparece(caminho_planilha_conferencia_teste):
    caminho = caminho_planilha_conferencia_teste()
    workbook = load_workbook(caminho)
    servidores = servidores_por_cpf(workbook[NOME_ABA])

    assert "00000000000" not in servidores
