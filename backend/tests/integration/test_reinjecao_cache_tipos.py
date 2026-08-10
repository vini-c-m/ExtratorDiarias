"""P0 FINAL (2026-08-10) — causa raiz real do "Base Local não sincroniza"
mais após a preparação estrutural: `_reinjetar_cache_formulas` sempre
presumiu que todo cache de fórmula é numérico (verdade só para a coluna P,
o caso original do Etapa 1). Fórmulas que retornam TEXTO (`E`=PREVIDÊNCIA,
`F`=NOME, `G`=CARGO, todas `VLOOKUP`) geravam `<c ...><v>FUNAFIN</v></c>`
SEM `t="str"` — XML tecnicamente inválido (tipo padrão de célula é
numérico) que `openpyxl`/Excel tentam interpretar como número e quebram:
`ValueError: invalid literal for int() with base 10: 'FUNAFIN'`, capturado
ao vivo em `base_local.sincronizar` contra a planilha de testes configurada
(nunca produção) — a primeira vez que `preencher()` completou o ciclo
salvar+reinjetar contra uma planilha real, já que tentativas anteriores
falhavam antes de chegar aqui (KeyError do relatório, corrigido antes
desta). Nenhum teste existente injetava cache textual — só números (ex.
`462.28`) — por isso passou despercebido.

Estes testes cobrem exatamente o que faltou: FUNAFIN, NOME, CARGO, valores
financeiros numéricos (sem regressão), caracteres especiais (`&`/`<`/`>`,
nunca escapados antes) e o `data_only=True` que expôs o bug originalmente."""

import re
import zipfile
from datetime import date, datetime
from xml.sax.saxutils import escape

from openpyxl import Workbook, load_workbook
from openpyxl.utils.datetime import to_excel

from app.domain.entities.diaria import Diaria
from app.domain.entities.processo import Processo, StatusProcesso
from app.planilha import escritor_dados
from app.planilha.escritor_planilha import preencher

_CABECALHO = [
    "DH", "SEI", "DOC ORIGEM", "CPF", "PREVIDÊNCIA", "NOME", "CARGO",
    "PERÍODO INICIAL", "PERÍODO FINAL", "TRECHO", "TRANSPORTE", "MOTIVO",
    "VALOR DA PASSAGEM", "QUANT. DIÁRIA INTEGRAL", "QUANT. DIÁRIA PARCIAL",
    "VALOR TOTAL DAS DIÁRIAS", "LOCAL", "VALOR DAS DIÁRIAS INTEGRAIS",
    "VALOR DAS DIÁRIAS PARCIAIS", "DMTC", "DMOF", "PASSAR DIA",
    "RESTITUIÇÃO", "COMPROVANTES", "CONFIRMAÇÃO DE DIÁRIAS", "CONCATENAÇÃO",
    "AVISO ", "AVISO AUXILIAR",
]  # A..AB, mesma ordem real confirmada na Planilha Oficial


def _injetar_cache_com_tipo(
    caminho_xlsx: str,
    referencia_celula: str,
    valor_cache: object,
    *,
    nome_arquivo_interno: str = "xl/worksheets/sheet1.xml",
) -> None:
    """Mesma técnica de `injetar_cache_formula` (conftest), mas ciente do
    tipo — simula exatamente o que o EXCEL REAL grava para uma fórmula
    calculada: `t="str"` para texto (nunca escrito pelo `injetar_cache_
    formula` genérico, que só existe para o caso numérico), nada extra
    para número. Precisa existir porque o PRÓPRIO `_capturar_cache_
    formulas` faz um `load_workbook(..., data_only=True)` — se a célula-
    semente já nascesse malformada (o bug sendo testado), o teste
    quebraria na preparação, antes mesmo de exercitar o código real."""
    with zipfile.ZipFile(caminho_xlsx, "r") as zf:
        entradas = {info.filename: zf.read(info.filename) for info in zf.infolist()}

    conteudo_original = entradas[nome_arquivo_interno].decode("utf-8")
    padrao = re.compile(rf'<c r="{referencia_celula}"([^>]*)><f[^>]*>[^<]*</f><v\s*/>')
    match = padrao.search(conteudo_original)
    assert match is not None, f"célula {referencia_celula} com fórmula (cache vazio) não encontrada"

    atributos = match.group(1)
    if isinstance(valor_cache, str):
        atributos_novos = f'{atributos} t="str"'
        conteudo_v = escape(valor_cache)
    else:
        atributos_novos = atributos
        conteudo_v = str(valor_cache)

    trecho_original = match.group(0)
    trecho_novo = trecho_original.replace(
        f'<c r="{referencia_celula}"{atributos}>', f'<c r="{referencia_celula}"{atributos_novos}>'
    ).replace("<v/>", f"<v>{conteudo_v}</v>").replace("<v />", f"<v>{conteudo_v}</v>")
    conteudo_novo = conteudo_original.replace(trecho_original, trecho_novo, 1)
    assert conteudo_novo != conteudo_original

    entradas[nome_arquivo_interno] = conteudo_novo.encode("utf-8")
    with zipfile.ZipFile(caminho_xlsx, "w", zipfile.ZIP_DEFLATED) as zf:
        for nome, dado in entradas.items():
            zf.writestr(nome, dado)


def _montar_planilha_com_formulas_texto(tmp_path, nome_arquivo="planilha.xlsx") -> str:
    """Linha histórica (linha 2) com E/F/G/P como fórmula real (VLOOKUP e
    R+S), igual à estrutura real confirmada na Planilha Oficial — igual ao
    padrão já usado em `test_escritor_planilha_complemento.py`."""
    workbook = Workbook()
    planilha = workbook.active
    planilha.title = "Controle de Diárias"
    planilha.append(_CABECALHO)
    planilha.append(
        [
            "2026DH000100", "19.20.0000.0000001/2026-11", "PJTESTE", 11111111111,
            "=VLOOKUP($D2,Dados!$A:$E,4,FALSE)", "=VLOOKUP($D2,Dados!$A:$E,3,FALSE)",
            "=VLOOKUP($D2,Dados!$A:$E,5,FALSE)", date(2026, 3, 17), date(2026, 3, 19),
            "OURICURI-RECIFE", "CARRO", "Motivo original",
            None, "=I2-H2", 1, "=R2+S2", "PERNAMBUCO",
            "=(VLOOKUP(Q2,'Tabela Valores'!A:C,2,FALSE()))*N2",
            "=(VLOOKUP(Q2,'Tabela Valores'!A:C,3,FALSE()))*O2",
            None, None, "=H2-15", None, None, None,
            "=CONCATENATE(D2,H2,I2)", "=VLOOKUP(Z2,Z$1:AB1,3,0)", "JÁ EXISTE DIÁRIA",
        ]
    )
    # V2 ("PASSAR DIA" = H2-15, uma DATA menos um número) — mesmo padrão
    # exato da coluna V real da Planilha Oficial (achado do P0 de
    # 2026-08-10 abaixo): só ganha formatação de data explícita porque uma
    # célula de FÓRMULA nunca herda formato de data automaticamente do
    # `openpyxl` (ao contrário de H2/I2, datas literais, que ganham sozinhas).
    planilha["V2"].number_format = "dd/mm/yyyy"
    workbook.create_sheet("Dados")
    tabela_valores = workbook.create_sheet("Tabela Valores")
    tabela_valores.append(["PERNAMBUCO", 308.19, 154.09])
    caminho = tmp_path / nome_arquivo
    workbook.save(caminho)
    return str(caminho)


def _diaria_nova(sei: str = "19.20.0009.0000009/2026-09") -> Diaria:
    return Diaria(
        sei=sei, doc_origem="PJNOVO", cpf="99999999999",
        periodo_inicial=date(2026, 4, 1), periodo_final=date(2026, 4, 3),
        cidade_origem="RECIFE", cidade_destino="CARUARU", motivo="Diligência nova",
    )


def _processo(diaria: Diaria) -> Processo:
    return Processo(arquivo_origem="novo.pdf", status=StatusProcesso.SUCESSO, diaria=diaria)


def test_cache_textual_funafin_preservado_com_tipo_str(tmp_path):
    """Reprodução exata do bug real: E2 (PREVIDÊNCIA) é VLOOKUP calculado
    pelo Excel como "FUNAFIN" — precisa sobreviver a um `preencher()` sem
    virar XML malformado."""
    caminho = _montar_planilha_com_formulas_texto(tmp_path)
    _injetar_cache_com_tipo(caminho, "E2", "FUNAFIN")

    resultado = preencher(caminho, [_processo(_diaria_nova())])
    assert resultado.total_gravado == 1

    # Antes da correção, esta linha por si só já levantava o ValueError
    # real capturado em produção — nenhuma asserção adicional necessária
    # para provar que o bug foi corrigido, mas confirmamos o valor também.
    workbook = load_workbook(caminho, data_only=True)
    try:
        assert workbook["Controle de Diárias"]["E2"].value == "FUNAFIN"
    finally:
        workbook.close()


def test_cache_textual_nome_preservado(tmp_path):
    caminho = _montar_planilha_com_formulas_texto(tmp_path)
    _injetar_cache_com_tipo(caminho, "F2", "Servidor de Teste da Silva")

    preencher(caminho, [_processo(_diaria_nova())])

    workbook = load_workbook(caminho, data_only=True)
    try:
        assert workbook["Controle de Diárias"]["F2"].value == "Servidor de Teste da Silva"
    finally:
        workbook.close()


def test_cache_textual_cargo_preservado(tmp_path):
    caminho = _montar_planilha_com_formulas_texto(tmp_path)
    _injetar_cache_com_tipo(caminho, "G2", "Técnico Judiciário")

    preencher(caminho, [_processo(_diaria_nova())])

    workbook = load_workbook(caminho, data_only=True)
    try:
        assert workbook["Controle de Diárias"]["G2"].value == "Técnico Judiciário"
    finally:
        workbook.close()


def test_cache_numerico_financeiro_sem_regressao(tmp_path):
    """Nenhuma regressão no caso original do Etapa 1 (P = valor financeiro
    numérico) — o despacho por tipo continua gravando número puro, sem
    `t="str"` nem escaping."""
    caminho = _montar_planilha_com_formulas_texto(tmp_path)
    _injetar_cache_com_tipo(caminho, "P2", 462.28)

    preencher(caminho, [_processo(_diaria_nova())])

    workbook = load_workbook(caminho, data_only=True)
    try:
        assert workbook["Controle de Diárias"]["P2"].value == 462.28
    finally:
        workbook.close()

    with zipfile.ZipFile(caminho, "r") as zf:
        xml = zf.read("xl/worksheets/sheet1.xml").decode("utf-8")
    assert '<c r="P2"' in xml
    # Célula numérica nunca recebe t="str" — só o caminho de texto adiciona.
    inicio = xml.index('<c r="P2"')
    trecho = xml[inicio : inicio + 200]
    assert 't="str"' not in trecho


def test_cache_textual_com_caracteres_especiais_e_escapado_e_recuperado(tmp_path):
    """Nunca testado antes: um valor de cache textual contendo `&`, `<`,
    `>` precisa ser escapado ao gravar E corretamente restaurado ao ler de
    volta — sem escaping, o XML fica inválido mesmo com `t="str"` certo."""
    caminho = _montar_planilha_com_formulas_texto(tmp_path)
    valor_com_especiais = "SILVA & SANTOS <FILIAL> A > B"
    _injetar_cache_com_tipo(caminho, "F2", valor_com_especiais)

    preencher(caminho, [_processo(_diaria_nova())])

    # O ponto central do teste: reabrir com data_only=True não pode
    # levantar exceção de XML malformado (o sintoma real do bug).
    workbook = load_workbook(caminho, data_only=True)
    try:
        assert workbook["Controle de Diárias"]["F2"].value == valor_com_especiais
    finally:
        workbook.close()


def test_multiplas_colunas_texto_e_numero_simultaneas_sem_quebrar_data_only(tmp_path):
    """Cenário mais próximo do real: E/F/G (texto) e P (número) todos com
    cache, na mesma linha, no mesmo `preencher()` — nenhuma delas pode
    quebrar a leitura das demais."""
    caminho = _montar_planilha_com_formulas_texto(tmp_path)
    _injetar_cache_com_tipo(caminho, "E2", "FUNAFIN")
    _injetar_cache_com_tipo(caminho, "F2", "Fulano de Tal")
    _injetar_cache_com_tipo(caminho, "G2", "Analista Judiciário")
    _injetar_cache_com_tipo(caminho, "P2", 652.96)

    resultado = preencher(caminho, [_processo(_diaria_nova())])
    assert resultado.total_gravado == 1

    workbook = load_workbook(caminho, data_only=True)
    try:
        planilha = workbook["Controle de Diárias"]
        assert planilha["E2"].value == "FUNAFIN"
        assert planilha["F2"].value == "Fulano de Tal"
        assert planilha["G2"].value == "Analista Judiciário"
        assert planilha["P2"].value == 652.96
    finally:
        workbook.close()


def test_serializar_valor_cache_booleano_usa_tipo_b_nunca_texto_cru():
    """Gap da bateria de pré-release: cache booleano nunca foi testado.
    Excel representa TRUE/FALSE como `t="b"` + `<v>1</v>`/`<v>0</v>` — nunca
    a string crua "True"/"False" (que quebraria `data_only=True` do mesmo
    jeito que o bug do FUNAFIN). `bool` precisa ser verificado ANTES de
    `(int, float)` (é subclasse de int em Python)."""
    from app.planilha.escritor_planilha import _serializar_valor_cache

    atributos, conteudo_v = _serializar_valor_cache(True, ' s="34"')
    assert 't="b"' in atributos
    assert conteudo_v == "1"

    atributos, conteudo_v = _serializar_valor_cache(False, ' s="34"')
    assert 't="b"' in atributos
    assert conteudo_v == "0"

    # Numérico continua numérico — bool nunca "vaza" para o caminho int/float.
    atributos, conteudo_v = _serializar_valor_cache(462.28, ' s="34"')
    assert 't="b"' not in atributos and 't="str"' not in atributos
    assert conteudo_v == "462.28"


# P0 (2026-08-10) — "A validação do cadastro falhou antes de substituir a
# Planilha Oficial." relatado em teste manual real. Investigado ao vivo
# contra uma CÓPIA isolada da Planilha Oficial real (nunca o original,
# nunca alterado): `_capturar_cache_formulas` capturou 1.889 células da
# coluna V ("PASSAR DIA", fórmula `=H-15`) como `datetime.datetime` — e
# `_serializar_valor_cache` caía no MESMO branch de texto do bug FUNAFIN
# (esta suíte, acima), porque nunca tinha um caso para `datetime`/`date`/
# `time`. A célula reinjetada virava `t="str"` com `str(datetime(...))`
# ("2026-01-01 00:00:00") — ao reabrir o `.tmp` para validar
# (`escritor_dados._validar_tmp`), a célula voltava como STRING, divergia
# do `datetime` original capturado, e a validação atômica (corretamente)
# recusava substituir o original — só que o cadastro em si, já gravado
# corretamente na linha nova, era descartado junto. `os.replace()` nunca
# chegava a ser chamado; o arquivo original permanecia sempre intacto (o
# mecanismo de integridade funcionou como projetado — só o resultado de
# negócio ficava errado). Corrigido: `_serializar_valor_cache` agora
# despacha `datetime.date`/`datetime.time`/`datetime.timedelta` para o
# serial numérico do Excel (`openpyxl.utils.datetime.to_excel`), nunca
# texto — os testes abaixo cobrem exatamente essa lacuna, tanto no nível
# de tipo (`preencher()`, mesma função já testada para texto/número/bool
# acima) quanto no fluxo real que expôs o bug (`escritor_dados.
# cadastrar_servidor`, o Cadastro de Servidor/Membro da Central de
# Conferência).
def test_cache_data_de_formula_preservado_como_data_nunca_texto(tmp_path):
    """V2 = "PASSAR DIA" (H2-15): H2 é 17/03/2026, então o Excel real
    calcularia e cachearia 02/03/2026 — simulado aqui injetando o serial
    Excel correspondente (mesma técnica de `_injetar_cache_com_tipo`, só
    que agora com um valor numérico que representa uma DATA, não um
    número financeiro solto)."""
    caminho = _montar_planilha_com_formulas_texto(tmp_path)
    valor_esperado = date(2026, 3, 2)
    _injetar_cache_com_tipo(caminho, "V2", to_excel(valor_esperado))

    resultado = preencher(caminho, [_processo(_diaria_nova())])
    assert resultado.total_gravado == 1

    workbook = load_workbook(caminho, data_only=True)
    try:
        valor_lido = workbook["Controle de Diárias"]["V2"].value
    finally:
        workbook.close()

    # O sintoma exato do bug: a data virava uma STRING ("2026-03-02
    # 00:00:00"). Nunca mais depois da correção.
    assert not isinstance(valor_lido, str), f"regrediu: data virou texto ({valor_lido!r})"
    valor_como_data = valor_lido.date() if isinstance(valor_lido, datetime) else valor_lido
    assert valor_como_data == valor_esperado

    # Mesma checagem estrutural de `test_cache_numerico_financeiro_sem_regressao`:
    # célula de data nunca ganha `t="str"` nem `t="b"` — é numérica (o tipo
    # padrão de célula do Excel), só a formatação de exibição diz que é data.
    with zipfile.ZipFile(caminho, "r") as zf:
        xml = zf.read("xl/worksheets/sheet1.xml").decode("utf-8")
    inicio = xml.index('<c r="V2"')
    trecho = xml[inicio : inicio + 200]
    assert 't="str"' not in trecho
    assert 't="b"' not in trecho


def test_cadastro_servidor_membro_nunca_falha_por_formula_de_data_em_outra_aba(tmp_path):
    """Reprodução direta e completa do bug relatado: cadastrar um novo
    servidor/membro numa planilha cuja aba `Controle de Diárias` tem uma
    fórmula de data com cache (mesmo padrão da coluna V real) não pode
    devolver `NAO_SALVO`/"A validação do cadastro falhou..." — a fórmula
    de data está numa aba TOTALMENTE diferente da que o cadastro escreve
    (`Dados`), mas `_capturar_cache_formulas`/`_validar_tmp` varrem o
    workbook inteiro, então uma célula de data em QUALQUER aba já bastava
    para derrubar a validação antes da correção."""
    caminho = _montar_planilha_com_formulas_texto(tmp_path, nome_arquivo="planilha_cadastro.xlsx")
    _injetar_cache_com_tipo(caminho, "V2", to_excel(date(2026, 3, 2)))

    resultado = escritor_dados.cadastrar_servidor(
        caminho,
        cpf="333.444.555-66",
        nome="Novo Servidor Data",
        matricula="7777",
        cargo="Cargo Teste",
    )

    assert resultado.estado is escritor_dados.EstadoCadastro.SALVO
    assert resultado.mensagem is None

    workbook = load_workbook(caminho)
    try:
        aba_dados = workbook["Dados"]
        assert aba_dados[f"A{resultado.linha}"].value == 33344455566
        assert aba_dados[f"C{resultado.linha}"].value == "Novo Servidor Data"
    finally:
        workbook.close()
