from app.extraction.enriquecimento.transporte import identificar_transporte


def test_identifica_aviao_por_passagem_aerea():
    texto = "Segue anexo o comprovante de PASSAGEM AÉREA referente ao trecho Recife-São Paulo."
    valor, aviso = identificar_transporte(texto)
    assert valor == "AVIÃO"
    assert aviso is None


def test_identifica_carro_por_veiculo_oficial():
    texto = "Viagem realizada em VEÍCULO OFICIAL da Coordenadoria."
    valor, aviso = identificar_transporte(texto)
    assert valor == "CARRO"
    assert aviso is None


def test_departamento_ministerial_de_transporte_nao_e_evidencia_de_meio():
    """Armadilha real encontrada nos PDFs de exemplo: o setor que assina as
    diárias se chama 'Departamento Ministerial de Transporte' e aparece em
    quase todo processo — não pode virar falso positivo de 'CARRO'."""
    texto = (
        "Documento assinado eletronicamente por MARILIA FABIANA ALVES DE LIMA, "
        "Gerente do Departamento Ministerial de Transporte, em 15/09/2025, às 18:49."
    )
    valor, aviso = identificar_transporte(texto)
    assert valor is None
    assert aviso == "Transporte não identificado no processo — necessita revisão manual."


def test_sem_nenhuma_evidencia_fica_vazio_com_aviso():
    texto = "FINALIDADE DA VIAGEM: De acordo com a requisição."
    valor, aviso = identificar_transporte(texto)
    assert valor is None
    assert "necessita revisão manual" in aviso


def test_evidencia_conflitante_fica_vazia_com_aviso():
    texto = "PASSAGEM AÉREA emitida, mas depois usado VEÍCULO OFICIAL para o trecho final."
    valor, aviso = identificar_transporte(texto)
    assert valor is None
    assert "conflitantes" in aviso


def test_evidencia_de_transporte_fora_dos_valores_aceitos():
    texto = "Anexo o comprovante da PASSAGEM RODOVIÁRIA utilizada na viagem."
    valor, aviso = identificar_transporte(texto)
    assert valor is None
    assert "fora de CARRO/AVIÃO" in aviso
