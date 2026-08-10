"""P0 FINAL (2026-08-09) — causa raiz real, confirmada por instrumentação de
runtime, do Complemento de Diárias "Não foi possível conectar ao
aplicativo": `_ROTULO_CATEGORIA` não tinha entrada para `CategoriaResultado.
LINHA_SEM_FORMULAS_NECESSARIAS`, então `_gerar_log` levantava `KeyError`
sempre que um item caía nessa categoria — virando exceção não tratada, sem
nenhuma relação com performance/SQLite/backend, contrariando a hipótese
anterior. Este arquivo garante que isso nunca mais aconteça, para NENHUMA
categoria existente hoje ou futura (teste B), e reproduz o cenário exato do
bug (teste A)."""

from datetime import datetime

from app.planilha.escritor_planilha import CategoriaResultado, ItemResultado, ResultadoPreenchimento
from app.planilha.pasta_resultados import _ROTULO_CATEGORIA, _gerar_log


def _resultado_com_categoria(categoria: CategoriaResultado) -> ResultadoPreenchimento:
    item = ItemResultado(
        arquivo_origem="arquivo.pdf",
        sei="19.20.0000.0000001/2026-01",
        categoria=categoria,
        linha=3,
    )
    return ResultadoPreenchimento(
        total_gravado=1 if categoria is CategoriaResultado.INSERIDO else 0,
        duplicadas_ignoradas=0 if categoria is CategoriaResultado.INSERIDO else 1,
        linha_inicial=3 if categoria is CategoriaResultado.INSERIDO else 0,
        linha_final=3 if categoria is CategoriaResultado.INSERIDO else 0,
        itens=[item],
    )


# --- B) Toda CategoriaResultado possui rótulo válido ------------------------


def test_b_toda_categoria_resultado_tem_rotulo_valido():
    for categoria in CategoriaResultado:
        assert categoria in _ROTULO_CATEGORIA
        assert _ROTULO_CATEGORIA[categoria]  # nunca vazio


# --- A) LINHA_SEM_FORMULAS_NECESSARIAS não quebra o relatório ---------------


def test_a_linha_sem_formulas_necessarias_gera_log_sem_keyerror(tmp_path):
    resultado = _resultado_com_categoria(CategoriaResultado.LINHA_SEM_FORMULAS_NECESSARIAS)
    caminho_log = tmp_path / "log.txt"

    _gerar_log(str(caminho_log), resultado, erros=[], avisos=[], agora=datetime.now())

    conteudo = caminho_log.read_text(encoding="utf-8")
    assert "LINHA_SEM_FORMULAS_NECESSARIAS" in conteudo
    assert "linha 3 disponível sem as fórmulas necessárias" in conteudo


def test_a_todas_as_categorias_geram_log_sem_keyerror(tmp_path):
    """Reforça o teste B do ponto de vista do efeito real (o relatório),
    não só do dicionário — qualquer categoria futura sem rótulo quebraria
    aqui também, com uma mensagem mais direta que um KeyError cru."""
    for categoria in CategoriaResultado:
        resultado = _resultado_com_categoria(categoria)
        caminho_log = tmp_path / f"log_{categoria.value}.txt"

        _gerar_log(str(caminho_log), resultado, erros=[], avisos=[], agora=datetime.now())

        assert caminho_log.exists()


# --- Manutenção automática só aparece quando de fato ocorreu ---------------


def test_manutencao_automatica_aparece_no_log_quando_ha_linhas_reparadas(tmp_path):
    resultado = ResultadoPreenchimento(
        total_gravado=1,
        duplicadas_ignoradas=0,
        linha_inicial=3,
        linha_final=3,
        itens=[
            ItemResultado(
                arquivo_origem="a.pdf", sei="SEI-1", categoria=CategoriaResultado.INSERIDO, linha=3
            )
        ],
        linhas_estrutura_reparadas=[3, 4, 5],
    )
    caminho_log = tmp_path / "log.txt"

    _gerar_log(str(caminho_log), resultado, erros=[], avisos=[], agora=datetime.now())

    conteudo = caminho_log.read_text(encoding="utf-8")
    assert "MANUTENCAO_AUTOMATICA" in conteudo
    assert "3 linha(s)" in conteudo


def test_manutencao_automatica_nao_aparece_quando_nada_foi_reparado(tmp_path):
    resultado = ResultadoPreenchimento(
        total_gravado=1,
        duplicadas_ignoradas=0,
        linha_inicial=3,
        linha_final=3,
        itens=[
            ItemResultado(
                arquivo_origem="a.pdf", sei="SEI-1", categoria=CategoriaResultado.INSERIDO, linha=3
            )
        ],
    )
    caminho_log = tmp_path / "log.txt"

    _gerar_log(str(caminho_log), resultado, erros=[], avisos=[], agora=datetime.now())

    conteudo = caminho_log.read_text(encoding="utf-8")
    assert "MANUTENCAO_AUTOMATICA" not in conteudo
