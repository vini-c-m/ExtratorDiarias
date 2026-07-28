"""Sprint 10 — gera os artefatos de demonstração usados só para capturar as
screenshots e o GIF do README (`frontend/scripts/capturar-screenshots.mjs` e
`frontend/scripts/gerar-gif.mjs`).

Mesma política de dados sintéticos do resto do projeto (ver
`backend/tests/fixtures/gerar_fixtures_sinteticas.py`): todo nome, CPF,
número de processo SEI e Documento Hábil aqui é inventado, sem
correspondência com nenhuma pessoa, órgão ou processo real.

Gera:
- `pdfs/*.pdf` — 3 processos fictícios de diária (formato SEI), variados o
  bastante para o resultado do processamento parecer real numa screenshot.
- `planilha_demo.xlsx` — cópia da planilha oficial com a aba `Controle de
  Diárias` (só cabeçalho, mesma estrutura usada em
  `backend/tests/conftest.py::caminho_planilha_teste`) e a aba `Dados` já
  com o cadastro sintético dos 3 servidores dos PDFs acima (Sprint 14.1) —
  sem isso, a Central de Conferência sempre responderia "servidor não
  cadastrado" para qualquer CPF de demonstração, o que não serve para
  screenshot/GIF do fluxo feliz.

Depende de `reportlab` e `openpyxl` (ambos já usados em outras partes do
projeto). Uso: `python gerar_demo.py` a partir desta pasta.
"""

import os

from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

_AQUI = os.path.dirname(os.path.abspath(__file__))
_PASTA_PDFS = os.path.join(_AQUI, "pdfs")

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


def _escrever_pdf(caminho: str, linhas: list[str]) -> None:
    c = canvas.Canvas(caminho, pagesize=A4)
    _largura, altura = A4
    y = altura - 50
    for linha in linhas:
        c.drawString(50, y, linha)
        y -= 14
    c.showPage()
    c.save()


def _documento(
    *,
    id_documento: str,
    sei: str,
    nome: str,
    cpf: str,
    unidade: str,
    cidade_origem: str,
    cidade_destino: str,
    data_inicial: str,
    data_retorno: str,
    motivo: str,
    com_validacao: bool,
    documento_habil: str | None = None,
) -> list[str]:
    titulo = f"CMFC - Solicitação de Diária - Servidor - {id_documento}"
    titulo_com_id = f"CMFC - Solicitação de Diária - Servidor {id_documento}"
    linhas = [
        titulo,
        "",
        "UNIDADE SOLICITANTE:",
        f"  {unidade}",
        "NOME DO SERVIDOR:",
        f"  {nome}",
        "CPF:",
        f"  {cpf}",
        "FINALIDADE DA VIAGEM:",
        f"  {motivo}",
        "CIDADE ORIGEM:",
        f"  {cidade_origem}",
        "CIDADE(S) DESTINO:",
        f"  {cidade_destino}",
        "DATA INICIAL:",
        f"  {data_inicial}",
        "DATA DE RETORNO:",
        f"  {data_retorno}",
        f"{titulo_com_id}         SEI {sei} / pg. 1",
    ]
    if com_validacao and documento_habil:
        linhas += [
            "",
            f"CMFC - Validação de Diária - Servidores - {id_documento}1",
            "OBSERVAÇÕES:",
            f"  {documento_habil}",
            f"CMFC - Validação de Diária - Servidores {id_documento}1         SEI {sei} / pg. 2",
        ]
    return linhas


# Sprint 14.1 — módulo, não mais local a `gerar_pdfs()`: `gerar_planilha()`
# também precisa do CPF/nome de cada caso para cadastrar o servidor na aba
# `Dados` (ver `_CADASTRO_PLANILHA` abaixo), então os 3 casos passam a ser
# uma única fonte de verdade reaproveitada pelas duas funções.
_CASOS = [
    dict(
        arquivo="SEI_19.20.0009.0000201_2026_01.pdf",
        id_documento="7000201",
        sei="19.20.0009.0000201/2026-01",
        nome="Fulano de Tal",
        cpf="111.111.111-11",
        unidade="Coordenadoria de Sede Modelo",
        cidade_origem="Recife",
        cidade_destino="Garanhuns",
        data_inicial="03/02/2026",
        data_retorno="04/02/2026",
        motivo="De acordo com a requisição.",
        com_validacao=True,
        documento_habil="2026DH000201",
        matricula="700201-3",
        cargo="Analista Administrativo",
        previdencia="FUNAFIN",
    ),
    dict(
        arquivo="SEI_19.20.0009.0000202_2026_02.pdf",
        id_documento="7000202",
        sei="19.20.0009.0000202/2026-02",
        nome="Ciclana Souza",
        cpf="222.222.222-22",
        unidade="Coordenadoria de Sede Modelo",
        cidade_origem="Recife",
        cidade_destino="Caruaru",
        data_inicial="10/02/2026",
        data_retorno="10/02/2026",
        motivo="De acordo com a requisição.",
        com_validacao=True,
        documento_habil="2026DH000202",
        matricula="700202-1",
        cargo="Técnico Administrativo",
        previdencia="INSS",
    ),
    dict(
        arquivo="SEI_19.20.0009.0000203_2026_03.pdf",
        id_documento="7000203",
        sei="19.20.0009.0000203/2026-03",
        nome="Beltrano Pereira",
        cpf="333.333.333-33",
        unidade="Coordenadoria de Sede Modelo",
        cidade_origem="Recife",
        cidade_destino="Petrolina",
        data_inicial="15/02/2026",
        data_retorno="17/02/2026",
        motivo="De acordo com a requisição.",
        com_validacao=False,
        matricula="700203-8",
        cargo="Assessor Técnico",
        previdencia="FUNAFIN",
    ),
]

# Mesmos cabeçalhos da aba `Dados` da planilha oficial (§ 2.2 de
# `docs/central-conferencia/README.md`) — coluna A rotulada "SEI" na
# planilha real, mas contém CPF (inconsistência da própria planilha
# oficial, documentada, não deste script). Só A/C/D/E são lidas por
# `app/consulta/repositorio_servidores.py`; B/F/G/H entram por fidelidade
# ao formato real, sem uso pela Central de Conferência.
_CABECALHO_DADOS = [
    "SEI",
    "MATRÍCULA",
    "NOME",
    "PREVIDÊNCIA",
    "CARGO",
    "ÓRGÃO DE ORIGEM",
    "REGIME DE PREVIDÊNCIA",
    "SITUAÇÃO DO SERVIDOR",
]


def gerar_pdfs() -> None:
    os.makedirs(_PASTA_PDFS, exist_ok=True)

    for caso in _CASOS:
        campos_documento = {
            chave: valor
            for chave, valor in caso.items()
            if chave not in ("arquivo", "matricula", "cargo", "previdencia")
        }
        linhas = _documento(**campos_documento)
        _escrever_pdf(os.path.join(_PASTA_PDFS, caso["arquivo"]), linhas)

    print(f"{len(_CASOS)} PDFs de demonstração gerados em {_PASTA_PDFS}")


def gerar_planilha() -> None:
    workbook = Workbook()
    planilha = workbook.active
    planilha.title = "Controle de Diárias"
    planilha.append(_CABECALHO_PLANILHA)

    dados = workbook.create_sheet("Dados")
    dados.append(_CABECALHO_DADOS)
    for caso in _CASOS:
        dados.append(
            [
                caso["cpf"],
                caso["matricula"],
                caso["nome"],
                caso["previdencia"],
                caso["cargo"],
                caso["unidade"],
                "RPPS",
                "Em exercício",
            ]
        )

    workbook.create_sheet("Tabela Valores")

    caminho = os.path.join(_AQUI, "planilha_demo.xlsx")
    workbook.save(caminho)
    print(f"Planilha de demonstração gerada em {caminho}")


def main() -> None:
    gerar_pdfs()
    gerar_planilha()


if __name__ == "__main__":
    main()
