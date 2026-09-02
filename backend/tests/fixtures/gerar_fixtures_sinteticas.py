"""Sprint 10 — gerador das fixtures sintéticas de PDF usadas pela suíte de
testes do backend.

Política permanente do projeto (Sprint 10): o repositório é público, então
nenhuma fixture pode conter documento real, processo administrativo real ou
dado pessoal real (nome, CPF, matrícula, conta bancária, endereço, telefone,
assinatura, QR Code). Todos os 19 PDFs em `tests/fixtures/` foram gerados por
este script a partir de dados inteiramente fictícios — nomes, CPFs, números
de processo SEI e Documentos Hábeis aqui usados NÃO correspondem a nenhuma
pessoa, órgão ou processo real, mesmo que o formato lembre um SEI real.

Cada fixture foi desenhada para reproduzir, com dados fictícios, exatamente o
padrão estrutural que o caso real original exercitava no parser/enriquecimento
(ex.: CPF com espaço interno no lugar do ponto, campo partido por quebra de
página, dois Requerimentos/Validações no mesmo processo, prefixo
institucional "PJ" antes do município). Nomes de cidade/UF são mantidos reais
(dado geográfico público, não pessoal nem institucional) porque a
desambiguação de município é a própria regra de negócio sob teste.

Não é executado pela suíte de testes (não é um `conftest.py`) — é uma
ferramenta de desenvolvimento para regenerar os PDFs quando necessário.
Depende de `reportlab` (não é dependência de runtime do backend, só desta
ferramenta): `pip install reportlab`.

Uso: `python gerar_fixtures_sinteticas.py` (a partir desta pasta).
"""

import os

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

_AQUI = os.path.dirname(os.path.abspath(__file__))

_ALTURA_LINHA = 14
_MARGEM_ESQUERDA = 50
_MARGEM_TOPO = 50


def _escrever_pdf(caminho: str, paginas: list[list[str]]) -> None:
    c = canvas.Canvas(caminho, pagesize=A4)
    _largura, altura = A4
    for pagina in paginas:
        y = altura - _MARGEM_TOPO
        for linha in pagina:
            c.drawString(_MARGEM_ESQUERDA, y, linha)
            y -= _ALTURA_LINHA
        c.showPage()
    c.save()


def _rodape(titulo_com_id: str, sei: str, pagina: int) -> str:
    return f"{titulo_com_id}         SEI {sei} / pg. {pagina}"


def _bloco_solicitacao_servidor(
    *,
    id_documento: str,
    sei: str,
    cidade_origem: str,
    cidade_destino: str,
    data_inicial: str,
    data_retorno: str | None,
    cpf: str,
    nome: str = "Fulano de Tal",
    unidade: str = "UNIDADE TESTE",
    lotacao: str | None = None,
    motivo: str = "De acordo com a requisição.",
    pagina: int = 1,
    membro: bool = False,
) -> list[str]:
    """Uma página com um único documento CMFC completo (Solicitação de
    Diária - Servidor, ou Requerimento de Diária - Membro), campos fictícios,
    fechado com o rodapé padrão do SEI."""
    tipo = "Requerimento de Diária - Membro" if membro else "Solicitação de Diária - Servidor"
    titulo = f"CMFC - {tipo} - {id_documento}"
    titulo_com_id = f"CMFC - {tipo} {id_documento}"

    linhas = [titulo, ""]
    if lotacao:
        linhas += ["LOTAÇÃO:", f"  {lotacao}"]
    else:
        linhas += ["UNIDADE SOLICITANTE:", f"  {unidade}"]
    linhas += [
        "NOME DO SERVIDOR:" if not membro else "NOME DO MEMBRO:",
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
    ]
    if data_retorno is not None:
        linhas += ["DATA DE RETORNO:", f"  {data_retorno}"]
    else:
        linhas += ["DATA DE RETORNO:"]
    linhas.append(_rodape(titulo_com_id, sei, pagina))
    return linhas


def _bloco_validacao(
    *, id_documento: str, sei: str, observacoes: str, pagina: int = 1
) -> list[str]:
    titulo = f"CMFC - Validação de Diária - Servidores - {id_documento}"
    titulo_com_id = f"CMFC - Validação de Diária - Servidores {id_documento}"
    return [
        titulo,
        "OBSERVAÇÕES:",
        f"  {observacoes}",
        _rodape(titulo_com_id, sei, pagina),
    ]


def _escrever_pdf_com_rodape_sobreposto(caminho: str, paginas: list) -> None:
    """Como `_escrever_pdf`, mas cada página pode ser um dict com `linhas`
    (lista normal, uma por linha, como sempre) e, opcionalmente,
    `rodape_sobreposto` (lista de 2+ textos desenhados TODOS na mesma
    posição — a posição onde a próxima linha cairia). Reproduz fisicamente o
    defeito de exportação do processo real 19.20.100000001.0016125/2026-70:
    dois rodapés gravados um sobre o outro na mesma coordenada da página,
    produzindo a sobreposição de bounding box que `pdf_reader.py` detecta e
    remove. Uma página sem `rodape_sobreposto` (ou uma página passada como
    lista simples) se comporta exatamente como em `_escrever_pdf`."""
    c = canvas.Canvas(caminho, pagesize=A4)
    _largura, altura = A4
    for pagina in paginas:
        if isinstance(pagina, dict):
            linhas = pagina["linhas"]
            rodape_sobreposto = pagina.get("rodape_sobreposto")
        else:
            linhas = pagina
            rodape_sobreposto = None
        y = altura - _MARGEM_TOPO
        for linha in linhas:
            c.drawString(_MARGEM_ESQUERDA, y, linha)
            y -= _ALTURA_LINHA
        if rodape_sobreposto:
            for texto in rodape_sobreposto:
                c.drawString(_MARGEM_ESQUERDA, y, texto)
        c.showPage()
    c.save()


def _bloco_nota_liquidacao(documento_habil: str) -> list[str]:
    return [
        "NOTA DE LIQUIDAÇÃO",
        "VALOR LIQUIDADO: TIPO DA LIQUIDAÇÃO: DOCUMENTO HÁBIL:",
        f"1,00 Parcial {documento_habil}",
    ]


def _bloco_despacho_gabpgj(*, numero: str, ano: str, frase_valor: str) -> list[str]:
    return [
        f"DESPACHO PGJ Nº {numero}/{ano} - GABPGJ",
        "DE: GABINETE DO PROCURADOR-GERAL DE JUSTIÇA",
        f"1. Autorizo o afastamento. 2. {frase_valor}",
    ]


def _gerar_pdfs_diaria_membro() -> None:
    pasta = os.path.join(_AQUI, "pdfs_diaria_membro")

    casos = [
        dict(
            arquivo="SEI_19.20.0001.0000114_2026_14.pdf",
            sei="19.20.0001.0000114/2026-14",
            cpf="22222222201",
            frase_valor="Defiro o pagamento no valor de R$ 652,96 ao servidor, a título de diária.",
            numero="1000114",
            ano="2026",
        ),
        dict(
            arquivo="SEI_19.20.0001.0000115_2026_15.pdf",
            sei="19.20.0001.0000115/2026-15",
            cpf="22222222202",
            frase_valor=(
                "Defiro o pagamento de 02 (duas) diárias integrais, no valor "
                "total de R$ 1.069,14 ao servidor."
            ),
            numero="1000115",
            ano="2026",
        ),
        dict(
            arquivo="SEI_19.20.0001.0000916_2025_16.pdf",
            sei="19.20.0001.0000916/2025-16",
            cpf="22222222203",
            frase_valor=(
                "Defiro o pagamento de 02 (duas) diárias integrais, no valor "
                "total de R$ 1.069,14 ao servidor."
            ),
            numero="1000116",
            ano="2025",
        ),
    ]

    for caso in casos:
        pagina1 = _bloco_solicitacao_servidor(
            id_documento="9000001",
            sei=caso["sei"],
            cidade_origem="Recife",
            cidade_destino="Garanhuns",
            data_inicial="05/03/2026",
            data_retorno="06/03/2026",
            cpf=caso["cpf"],
            membro=True,
            pagina=1,
        )
        pagina2 = _bloco_despacho_gabpgj(
            numero=caso["numero"], ano=caso["ano"], frase_valor=caso["frase_valor"]
        )
        _escrever_pdf(os.path.join(pasta, caso["arquivo"]), [pagina1, pagina2])


def _gerar_pdf_local_destino() -> None:
    pasta = os.path.join(_AQUI, "pdfs_local_destino")
    pagina = _bloco_solicitacao_servidor(
        id_documento="9000010",
        sei="19.20.0001.0000910/2025-10",
        cidade_origem="Recife",
        cidade_destino="Sta Cuz do Capibaribe",
        data_inicial="10/02/2025",
        data_retorno="11/02/2025",
        cpf="33333333310",
    )
    _escrever_pdf(
        os.path.join(pasta, "SEI_19.20.0001.0000910_2025_10.pdf"), [pagina]
    )


def _gerar_pdfs_padroes_documentais() -> None:
    pasta = os.path.join(_AQUI, "pdfs_padroes_documentais")

    # Caso 1 — dois Requerimentos de Diária - Membro, o primeiro com o ano
    # errado (2025), corrigido pelo segundo (2026). Só o último deve valer.
    sei_caso1 = "19.20.0001.0000103/2026-03"
    pagina1_caso1 = _bloco_solicitacao_servidor(
        id_documento="2000301",
        sei=sei_caso1,
        cidade_origem="Recife",
        cidade_destino="Garanhuns",
        data_inicial="11/05/2025",
        data_retorno=None,
        cpf="55555555501",
        membro=True,
        pagina=1,
    )
    pagina2_caso1 = _bloco_solicitacao_servidor(
        id_documento="2000302",
        sei=sei_caso1,
        cidade_origem="Recife",
        cidade_destino="Garanhuns",
        data_inicial="11/05/2026",
        data_retorno="12/05/2026",
        cpf="55555555501",
        membro=True,
        pagina=2,
    )
    _escrever_pdf(
        os.path.join(pasta, "SEI_19.20.0001.0000103_2026_03.pdf"),
        [pagina1_caso1, pagina2_caso1],
    )

    # Caso 2 — "DATA DE RETORNO:" cai bem numa quebra de página; o valor
    # certo está na página seguinte, e uma "Confirmação dos Serviços"
    # (documento diferente) anexada depois tem um erro de digitação no
    # mesmo campo — não pode ser usada.
    sei_caso2 = "19.20.0001.0000104/2026-04"
    titulo_solicitacao = "CMFC - Solicitação de Diária - Servidor 2000401"
    pagina1_caso2 = [
        "CMFC - Solicitação de Diária - Servidor - 2000401",
        "",
        "UNIDADE SOLICITANTE:",
        "  UNIDADE TESTE",
        "CPF:",
        "  66666666604",
        "CIDADE ORIGEM:",
        "  Recife",
        "CIDADE(S) DESTINO:",
        "  Garanhuns",
        "DATA INICIAL:",
        "  22/05/2026",
        "DATA DE RETORNO:",
        _rodape(titulo_solicitacao, sei_caso2, 1),
    ]
    titulo_confirmacao = "CMFC - Confirmação dos Serviços - Diária -Servidor 2000402"
    pagina2_caso2 = [
        "  22/05/2026",
        _rodape(titulo_solicitacao, sei_caso2, 2),
        "",
        "CMFC - Confirmação dos Serviços - Diária -Servidor - 2000402",
        "DATA DE RETORNO:",
        "  22/06/2026",
        _rodape(titulo_confirmacao, sei_caso2, 2),
    ]
    _escrever_pdf(
        os.path.join(pasta, "SEI_19.20.0001.0000104_2026_04.pdf"),
        [pagina1_caso2, pagina2_caso2],
    )

    # Caso 3 — duas Validações de Diária no mesmo processo; a segunda traz
    # "DESCONSIDERAR VALIDAÇÃO ANTERIOR" e um DH diferente. Só o DH da
    # última deve valer.
    sei_caso3 = "19.20.0001.0000105/2026-05"
    pagina1_caso3 = _bloco_solicitacao_servidor(
        id_documento="3000501",
        sei=sei_caso3,
        cidade_origem="Recife",
        cidade_destino="Garanhuns",
        data_inicial="01/06/2026",
        data_retorno="02/06/2026",
        cpf="77777777705",
        pagina=1,
    )
    pagina2_caso3 = _bloco_validacao(
        id_documento="3000502", sei=sei_caso3, observacoes="2026DH000201", pagina=2
    )
    pagina3_caso3 = _bloco_validacao(
        id_documento="3000503",
        sei=sei_caso3,
        observacoes="2026DH000202. DESCONSIDERAR VALIDAÇÃO ANTERIOR",
        pagina=3,
    )
    _escrever_pdf(
        os.path.join(pasta, "SEI_19.20.0001.0000105_2026_05.pdf"),
        [pagina1_caso3, pagina2_caso3, pagina3_caso3],
    )

    # Caso 4a — "CIDADE(S) DESTINO: PJ PALMARES" (prefixo institucional,
    # maiúsculo, sem "de").
    sei_caso4a = "19.20.0001.0000107/2026-07"
    pagina_caso4a = _bloco_solicitacao_servidor(
        id_documento="4000701",
        sei=sei_caso4a,
        cidade_origem="Recife",
        cidade_destino="PJ PALMARES",
        data_inicial="03/07/2026",
        data_retorno="03/07/2026",
        cpf="88888888807",
    )
    _escrever_pdf(
        os.path.join(pasta, "SEI_19.20.0001.0000107_2026_07.pdf"), [pagina_caso4a]
    )

    # Caso 4b — "CIDADE(S) DESTINO: PJ Bom Jardim" com "CIDADE ORIGEM: São
    # José do Egito" — "Bom Jardim" é ambíguo, resolvido pelo contexto.
    sei_caso4b = "19.20.0001.0000109/2026-09"
    pagina_caso4b = _bloco_solicitacao_servidor(
        id_documento="4000901",
        sei=sei_caso4b,
        cidade_origem="São José do Egito",
        cidade_destino="PJ Bom Jardim",
        data_inicial="09/08/2026",
        data_retorno="09/08/2026",
        cpf="88888888809",
    )
    _escrever_pdf(
        os.path.join(pasta, "SEI_19.20.0001.0000109_2026_09.pdf"), [pagina_caso4b]
    )

    # Caso 5 — Documento Hábil vem das Observações da própria Validação;
    # duas Notas de Liquidação anexadas depois (uma delas fictamente de
    # "outro processo") são sempre ignoradas.
    sei_caso5 = "19.20.0001.0000106/2023-06"
    pagina1_caso5 = _bloco_solicitacao_servidor(
        id_documento="5000601",
        sei=sei_caso5,
        cidade_origem="Recife",
        cidade_destino="Garanhuns",
        data_inicial="06/09/2023",
        data_retorno="06/09/2023",
        cpf="99999999906",
        pagina=1,
    )
    pagina2_caso5 = _bloco_validacao(
        id_documento="5000602", sei=sei_caso5, observacoes="2023DH000301", pagina=2
    )
    pagina3_caso5 = [
        *_bloco_nota_liquidacao("2023DH000302"),
        "Processo relacionado (fictício, credor diferente): 19.20.0002.0000001/2023-01",
    ]
    pagina4_caso5 = _bloco_nota_liquidacao("2023DH000302")
    _escrever_pdf(
        os.path.join(pasta, "SEI_19.20.0001.0000106_2023_06.pdf"),
        [pagina1_caso5, pagina2_caso5, pagina3_caso5, pagina4_caso5],
    )

    # CPF com espaço interno no lugar do ponto entre o 2º e o 3º grupo —
    # rótulo e valor em linhas separadas, como no restante do formulário.
    sei_cpf_espaco = "19.20.0001.0000108/2026-08"
    pagina_cpf_espaco = [
        "CMFC - Solicitação de Diária - Servidor - 8000101",
        "",
        "UNIDADE SOLICITANTE:",
        "  UNIDADE TESTE",
        "CPF:",
        "  333.333 333-01",
        "CIDADE ORIGEM:",
        "  Recife",
        "CIDADE(S) DESTINO:",
        "  Garanhuns",
        "DATA INICIAL:",
        "  01/04/2026",
        "DATA DE RETORNO:",
        "  01/04/2026",
        _rodape(
            "CMFC - Solicitação de Diária - Servidor 8000101", sei_cpf_espaco, 1
        ),
    ]
    _escrever_pdf(
        os.path.join(pasta, "SEI_19.20.0001.0000108_2026_08.pdf"),
        [pagina_cpf_espaco],
    )


def _gerar_pdf_rodape_sobreposto() -> None:
    """Caso 6 — Sprint de Correção Crítica: reprodução sintética (dados
    fictícios) do padrão do processo real 19.20.100000001.0016125/2026-70. A
    mesma Solicitação de Diária é reanexada ao processo — a segunda (páginas
    3-4) é a vigente, por regra de negócio ("o último documento sempre
    vence", nunca alterada por esta correção) — e, nas páginas dela, o
    rodapé do documento anterior é gravado por engano na MESMA posição do
    rodapé correto (duas chamadas de `drawString` na mesma coordenada),
    produzindo a sobreposição física de bounding box que `pdf_reader.py`
    detecta e remove. Inclui também, na página 2 (um anexo fictício tipo
    Diário Oficial), uma citação em prosa a outro número SEI sem o sufixo
    "/ pg. N" — exercita a proteção contra SEI incidental também nesta
    fixture, igual ao processo real."""
    pasta = os.path.join(_AQUI, "pdfs_padroes_documentais")
    sei_processo = "19.20.0001.0000117/2026-17"

    pagina1 = _bloco_solicitacao_servidor(
        id_documento="6000101",
        sei=sei_processo,
        cidade_origem="Recife",
        cidade_destino="Garanhuns",
        data_inicial="18/09/2026",
        data_retorno="18/09/2026",
        cpf="11122233396",
        nome="Beltrano de Tal",
        pagina=1,
    )

    pagina2 = [
        "AVISO PGJ Nº 99/2026 (fictício)",
        "CONSIDERANDO a disponibilidade orçamentária, devidamente atestada",
        "nos autos do SEI 19.20.9999.9999999/2026-99, RESOLVE...",
        _rodape("EXTERNO normativas fictício - 6000150", sei_processo, 2),
    ]

    titulo_vigente = "CMFC - Solicitação de Diária - Servidor 6000102"
    rodape_vigente_pg3 = _rodape(titulo_vigente, sei_processo, 3)
    rodape_alheio_pg3 = _rodape(
        "EXTERNO comprovante diária fictício - 6000160", sei_processo, 8
    )
    pagina3 = {
        "linhas": [
            "CMFC - Solicitação de Diária - Servidor - 6000102",
            "",
            "UNIDADE SOLICITANTE:",
            "  UNIDADE TESTE",
            "NOME DO SERVIDOR:",
            "  Beltrano de Tal",
            "CPF:",
            "  11122233396",
            "CIDADE ORIGEM:",
            "  Recife",
            "CIDADE(S) DESTINO:",
            "  Garanhuns",
            "DATA INICIAL:",
            "  19/09/2026",
            "DATA DE RETORNO:",
        ],
        "rodape_sobreposto": [rodape_alheio_pg3, rodape_vigente_pg3],
    }

    rodape_vigente_pg4 = _rodape(titulo_vigente, sei_processo, 4)
    rodape_alheio_pg4 = _rodape(
        "EXTERNO comprovante diária fictício - 6000160", sei_processo, 9
    )
    pagina4 = {
        "linhas": [
            "  19/09/2026",
            "____________________________________________________________________________",
            "OBSERVAÇÕES:",
            "  -",
        ],
        "rodape_sobreposto": [rodape_alheio_pg4, rodape_vigente_pg4],
    }

    pagina5 = _bloco_validacao(
        id_documento="6000103", sei=sei_processo, observacoes="2026DH000601", pagina=5
    )

    _escrever_pdf_com_rodape_sobreposto(
        os.path.join(pasta, "SEI_19.20.0001.0000117_2026_17.pdf"),
        [pagina1, pagina2, pagina3, pagina4, pagina5],
    )


def _gerar_pdfs_exemplo() -> None:
    pasta = os.path.join(_AQUI, "pdfs_exemplo")

    # Três cópias do mesmo processo fictício (o conjunto real de referência
    # também tinha exportações duplicadas do mesmo processo) — erro de
    # digitação real preservado ("Augustinho" por "Agostinho") para
    # continuar exercitando a correspondência aproximada.
    sei_typo = "19.20.0001.0000113/2025-13"
    pagina_typo = _bloco_solicitacao_servidor(
        id_documento="1000001",
        sei=sei_typo,
        cidade_origem="Recife",
        cidade_destino="Cabo de Santo Augustinho / Palmares.",
        data_inicial="15/09/2025",
        data_retorno="15/09/2025",
        cpf="44444444401",
    )
    for nome_arquivo in [
        "SEI_19.20.0001.0000113_2025_13.pdf",
        "SEI_19.20.0001.0000113_2025_13 (1).pdf",
        "SEI_19.20.0001.0000113_2025_13 (2).pdf",
    ]:
        _escrever_pdf(os.path.join(pasta, nome_arquivo), [pagina_typo])

    # Campos-chave com valores exatos verificados por teste dedicado.
    sei_chave = "19.20.0001.0000101/2025-01"
    pagina_chave = _bloco_solicitacao_servidor(
        id_documento="1000101",
        sei=sei_chave,
        cidade_origem="Recife",
        cidade_destino="Garanhuns",
        data_inicial="12/09/2025",
        data_retorno="12/09/2025",
        cpf="11111111101",
        unidade="UNIDADE TESTE",
    )
    _escrever_pdf(
        os.path.join(pasta, "SEI_19.20.0001.0000101_2025_01.pdf"), [pagina_chave]
    )

    # "Bonito" — nome de município ambíguo (existe em vários estados),
    # desambiguado pelo contexto da cidade de origem (Recife -> PE).
    sei_bonito = "19.20.0001.0000112/2025-12"
    pagina_bonito = _bloco_solicitacao_servidor(
        id_documento="1000112",
        sei=sei_bonito,
        cidade_origem="Recife",
        cidade_destino="Bonito",
        data_inicial="20/09/2025",
        data_retorno="20/09/2025",
        cpf="44444444402",
    )
    _escrever_pdf(
        os.path.join(pasta, "SEI_19.20.0001.0000112_2025_12.pdf"), [pagina_bonito]
    )

    # "Sanharó - PE" — uma única cidade com UF explícita separada por
    # hífen; inclui Validação de Diária para o DH ser verificado.
    sei_sanhara = "19.20.0001.0000111/2026-11"
    pagina1_sanhara = _bloco_solicitacao_servidor(
        id_documento="1000111",
        sei=sei_sanhara,
        cidade_origem="Recife - PE",
        cidade_destino="Sanharó - PE",
        data_inicial="03/11/2026",
        data_retorno="03/11/2026",
        cpf="44444444403",
        pagina=1,
    )
    pagina2_sanhara = _bloco_validacao(
        id_documento="1000112", sei=sei_sanhara, observacoes="2026DH000111", pagina=2
    )
    _escrever_pdf(
        os.path.join(pasta, "SEI_19.20.0001.0000111_2026_11.pdf"),
        [pagina1_sanhara, pagina2_sanhara],
    )

    # Duas cópias do mesmo processo fictício, sem LOTAÇÃO — cai no
    # fallback UNIDADE SOLICITANTE; inclui Validação de Diária para o DH.
    sei_garanhuns = "19.20.0001.0000102/2025-02"
    pagina1_garanhuns = _bloco_solicitacao_servidor(
        id_documento="1000201",
        sei=sei_garanhuns,
        cidade_origem="Caruaru",
        cidade_destino="Garanhuns",
        data_inicial="10/10/2025",
        data_retorno="10/10/2025",
        cpf="44444444404",
        unidade="Coordenação de Sede da PJ Modelo",
        pagina=1,
    )
    pagina2_garanhuns = _bloco_validacao(
        id_documento="1000202", sei=sei_garanhuns, observacoes="2025DH000102", pagina=2
    )
    for nome_arquivo in [
        "SEI_19.20.0001.0000102_2025_02.pdf",
        "SEI_19.20.0001.0000102_2025_02-1-2.pdf",
    ]:
        _escrever_pdf(
            os.path.join(pasta, nome_arquivo), [pagina1_garanhuns, pagina2_garanhuns]
        )


def main() -> None:
    _gerar_pdfs_diaria_membro()
    _gerar_pdf_local_destino()
    _gerar_pdfs_padroes_documentais()
    _gerar_pdf_rodape_sobreposto()
    _gerar_pdfs_exemplo()
    print("Fixtures sintéticas geradas com sucesso.")


if __name__ == "__main__":
    main()
