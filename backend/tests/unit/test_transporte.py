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


def test_identifica_carro_por_requisicao_de_veiculo():
    """Correção de 2026-08-05 — caso real SEI 19.20.0001.0014476/2026-35:
    anexo gerado pelo chatbot com o título "Requisição de Veículo -
    Viagem"."""
    texto = (
        "Requisição de Veículo - Viagem\n"
        "Criado via Chatbot WhatsApp em 29/07/2026 às 17:43\n"
        "Finalidade: Inspeção"
    )
    valor, aviso = identificar_transporte(texto)
    assert valor == "CARRO"
    assert aviso is None


def test_identifica_carro_por_mencao_a_motorista_conduzindo_o_veiculo():
    """Mesmo caso real — observação do solicitante: 'Indico o motorista
    Edson Hugo para conduzir o veículo nesta solicitação caso haja
    disponibilidade.' A evidência aceita é a frase fixa "conduzir o
    veículo" (o nome do motorista no meio impediria casar uma frase única
    "motorista ... conduzir")."""
    texto = "Indico o motorista Fulano de Tal para conduzir o veículo nesta solicitação."
    valor, aviso = identificar_transporte(texto)
    assert valor == "CARRO"
    assert aviso is None


def test_requisicao_de_veiculo_com_variacao_de_caixa_e_sem_acento():
    texto = "requisicao de veiculo - viagem solicitada para o dia 30/07/2026."
    valor, aviso = identificar_transporte(texto)
    assert valor == "CARRO"
    assert aviso is None


def test_conduzir_o_veiculo_maiusculo_e_com_acento():
    texto = "O SERVIDOR DEVERÁ CONDUZIR O VEÍCULO OFICIAL DURANTE TODO O TRAJETO."
    valor, aviso = identificar_transporte(texto)
    assert valor == "CARRO"
    assert aviso is None


def test_palavra_viagem_sozinha_nao_e_evidencia_de_veiculo():
    """A regra não pode classificar como veículo só porque existe a palavra
    genérica 'viagem' — sem menção a veículo/requisição/condução, o
    transporte continua não identificado."""
    texto = "Solicito autorização para a viagem a Garanhuns a fim de participar de audiência."
    valor, aviso = identificar_transporte(texto)
    assert valor is None
    assert "necessita revisão manual" in aviso


def test_motorista_como_cargo_do_servidor_nao_e_evidencia_de_veiculo():
    """Armadilha real do próprio processo SEI 19.20.0001.0014476/2026-35:
    o CARGO do servidor é 'Motorista Fixo' — isso sozinho, sem 'conduzir o
    veículo' ou outra evidência direta, nunca pode virar falso positivo de
    CARRO (o cargo da pessoa não diz qual meio foi usado nesta viagem)."""
    texto = "CARGO e ou FUNÇÃO GRATIFICADA:\nMotorista Fixo\nMATRÍCULA:\n1891510"
    valor, aviso = identificar_transporte(texto)
    assert valor is None
    assert "necessita revisão manual" in aviso
