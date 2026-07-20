import os

import pytest
from openpyxl import Workbook

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "pdfs_exemplo")
FIXTURES_DIR_DIARIA_MEMBRO = os.path.join(
    os.path.dirname(__file__), "fixtures", "pdfs_diaria_membro"
)
FIXTURES_DIR_LOCAL_DESTINO = os.path.join(
    os.path.dirname(__file__), "fixtures", "pdfs_local_destino"
)
FIXTURES_DIR_PADROES_DOCUMENTAIS = os.path.join(
    os.path.dirname(__file__), "fixtures", "pdfs_padroes_documentais"
)


@pytest.fixture
def pdfs_exemplo() -> list[str]:
    return [
        os.path.join(FIXTURES_DIR, arquivo)
        for arquivo in sorted(os.listdir(FIXTURES_DIR))
        if arquivo.lower().endswith(".pdf")
    ]


@pytest.fixture
def pdfs_diaria_membro() -> list[str]:
    """3 processos fictícios de Diária de Membro (Sprint 10 — dados
    sintéticos, ver `gerar_fixtures_sinteticas.py`), reproduzindo o padrão
    documental estudado na implementação original da Sprint 04 — mantidos
    num diretório próprio, separado de `pdfs_exemplo`, para não alterar a
    contagem/composição usada pelos testes já existentes do fluxo Padrão."""
    return [
        os.path.join(FIXTURES_DIR_DIARIA_MEMBRO, arquivo)
        for arquivo in sorted(os.listdir(FIXTURES_DIR_DIARIA_MEMBRO))
        if arquivo.lower().endswith(".pdf")
    ]


@pytest.fixture
def caminho_pdf():
    def _caminho(nome: str) -> str:
        return os.path.join(FIXTURES_DIR, nome)

    return _caminho


@pytest.fixture
def caminho_pdf_processo_sta_cruz_capibaribe() -> str:
    """Processo fictício (Sprint 10 — dados sintéticos) reproduzindo o
    padrão do caso original da Sprint 04.1 (refinamento de LOCAL):
    'CIDADE(S) DESTINO:' vem como 'Sta Cuz do Capibaribe' (abreviação + erro
    de digitação combinados), e deve resolver para PERNAMBUCO. Mantido num
    diretório próprio, separado de `pdfs_exemplo`, para não alterar a
    contagem/composição usada pelos testes já existentes."""
    return os.path.join(
        FIXTURES_DIR_LOCAL_DESTINO, "SEI_19.20.0001.0000910_2025_10.pdf"
    )


# Sprint 04.2 — processos fictícios (Sprint 10 — dados sintéticos)
# reproduzindo os 4 padrões documentais identificados na homologação
# original. Num diretório próprio, separado de `pdfs_exemplo`, para não
# alterar a contagem/composição usada pelos testes já existentes.
@pytest.fixture
def caminho_pdf_multiplos_requerimentos_membro() -> str:
    """Processo fictício (Caso 1): dois "CMFC - Requerimento de Diária -
    Membro" anexados — o primeiro com a data de ida registrada com o ano
    errado (2025), corrigido por um segundo requerimento (2026) depois que a
    DIMCAC apontou o erro num despacho. Só o último deve valer."""
    return os.path.join(
        FIXTURES_DIR_PADROES_DOCUMENTAIS, "SEI_19.20.0001.0000103_2026_03.pdf"
    )


@pytest.fixture
def caminho_pdf_data_retorno_confirmacao_servicos() -> str:
    """Processo fictício (Caso 2): a "Solicitação de Diária" original tem
    "DATA DE RETORNO: 22/05/2026" corretamente, mas o valor cai bem numa
    quebra de página (rodapé do SEI entre o rótulo e o valor) — sem a
    tolerância a essa quebra, a extração pulava para a "Confirmação dos
    Serviços" (documento diferente, preenchido depois), que tem um erro de
    digitação registrando o retorno em 22/06/2026."""
    return os.path.join(
        FIXTURES_DIR_PADROES_DOCUMENTAIS, "SEI_19.20.0001.0000104_2026_04.pdf"
    )


@pytest.fixture
def caminho_pdf_duas_validacoes_diaria() -> str:
    """Processo fictício (Caso 3): duas "CMFC - Validação de Diária -
    Servidores" anexadas — a segunda traz literalmente "DESCONSIDERAR
    VALIDAÇÃO ANTERIOR" nas Observações e um Documento Hábil diferente do da
    primeira. Só o DH da última deve valer."""
    return os.path.join(
        FIXTURES_DIR_PADROES_DOCUMENTAIS, "SEI_19.20.0001.0000105_2026_05.pdf"
    )


@pytest.fixture
def caminho_pdf_le_de_outro_processo_anexada_por_engano() -> str:
    """Processo fictício (Sprint — Refatoração DH): uma única "CMFC -
    Validação de Diária - Servidores" válida, mas DUAS Notas de Liquidação
    anexadas — a primeira pertence, ficticiamente, a OUTRO processo (credor
    diferente), anexada por engano; a segunda é a correta. Como a fonte
    oficial do Documento Hábil é sempre o Despacho de Validação — nunca a
    Nota de Liquidação —, a extração correta ignora as duas Notas de
    Liquidação por completo e usa o DH citado nas Observações da própria
    Validação."""
    return os.path.join(
        FIXTURES_DIR_PADROES_DOCUMENTAIS, "SEI_19.20.0001.0000106_2023_06.pdf"
    )


@pytest.fixture
def caminho_pdf_destino_pj_palmares() -> str:
    """Processo fictício (Caso 4): "CIDADE(S) DESTINO: PJ PALMARES" — "PJ" é
    o prefixo institucional (Procuradoria/Promotoria de Justiça), não faz
    parte do nome do município."""
    return os.path.join(
        FIXTURES_DIR_PADROES_DOCUMENTAIS, "SEI_19.20.0001.0000107_2026_07.pdf"
    )


@pytest.fixture
def caminho_pdf_cpf_com_espaco_interno() -> str:
    """Processo fictício (Sprint de Correção Crítica — CPF): o texto
    extraído do PDF traz 'CPF:\\n333.333 333-01' -- um espaço comum no lugar
    do ponto entre o 2º e o 3º grupo do CPF. O CPF correto é
    333.333.333-01."""
    return os.path.join(
        FIXTURES_DIR_PADROES_DOCUMENTAIS, "SEI_19.20.0001.0000108_2026_08.pdf"
    )


@pytest.fixture
def caminho_pdf_destino_pj_bom_jardim() -> str:
    """Processo fictício (Caso 4): "CIDADE(S) DESTINO: PJ Bom Jardim" com
    "CIDADE ORIGEM: São José do Egito" — "Bom Jardim" sozinho é ambíguo
    (existe em PE/MA/RJ), resolvido pelo contexto da cidade de origem depois
    que o prefixo "PJ" é removido."""
    return os.path.join(
        FIXTURES_DIR_PADROES_DOCUMENTAIS, "SEI_19.20.0001.0000109_2026_09.pdf"
    )


_CABECALHO_PLANILHA = [
    "DH",
    "SEI",
    "DOC ORIGEM",
    "CPF",
    "PREVIDÊNCIA",
    "NOME",
    "CARGO",
    "PERÍODO INICIAL",
    "PERÍODO FINAL",
    "TRECHO",
    "TRANSPORTE",
    "MOTIVO",
]


@pytest.fixture
def caminho_planilha_teste(tmp_path):
    """Planilha sintética (sem dados reais) reproduzindo a estrutura real:
    mesma aba/cabeçalho, uma linha totalmente preenchida, e uma linha com a
    coluna A (DH) vazia mas B em diante preenchida — o mesmo padrão de gap
    encontrado na planilha real, que invalida usar a coluna A como indicador
    de linha livre."""

    def _criar(nome_arquivo: str = "planilha_teste.xlsx") -> str:
        workbook = Workbook()
        planilha = workbook.active
        planilha.title = "Controle de Diárias"
        planilha.append(_CABECALHO_PLANILHA)

        # Linha 2: registro totalmente preenchido (formulas simuladas como texto).
        planilha.append(
            [
                "2025DH000001",
                "19.20.0000.0000001/2025-00",
                "PJTESTE",
                11111111111,
                "=VLOOKUP($D2,Dados!$A:$E,4,FALSE)",
                "=VLOOKUP($D2,Dados!$A:$E,3,FALSE)",
                "=VLOOKUP($D2,Dados!$A:$E,5,FALSE)",
                "08/01/2025",
                "10/01/2025",
                "CIDADE A-CIDADE B",
                "CARRO",
                "Motivo de teste",
            ]
        )

        # Linha 3: coluna A vazia, mas B em diante preenchida (gap real).
        planilha.append(
            [
                None,
                "19.20.0000.0000002/2025-11",
                "PJTESTE2",
                22222222222,
                "=VLOOKUP($D3,Dados!$A:$E,4,FALSE)",
                "=VLOOKUP($D3,Dados!$A:$E,3,FALSE)",
                "=VLOOKUP($D3,Dados!$A:$E,5,FALSE)",
                "09/01/2025",
                "11/01/2025",
                "CIDADE C-CIDADE D",
                "AVIÃO",
                "Outro motivo de teste",
            ]
        )

        workbook.create_sheet("Dados")
        workbook.create_sheet("Tabela Valores")

        caminho = tmp_path / nome_arquivo
        workbook.save(caminho)
        return str(caminho)

    return _criar
