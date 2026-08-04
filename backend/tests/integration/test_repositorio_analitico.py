import sqlite3
from datetime import date

import pytest

from app.consulta import base_local_sqlite
from app.consulta.repositorio_analitico import (
    FiltrosDiaria,
    ParametrosOrdenacao,
    ParametrosPaginacao,
    agregar_indicadores,
    avisos_paginados,
    buscar_por_sei,
    estado_sincronizacao_registrado,
    listar_diarias,
    opcoes_filtro,
    ultima_sincronizacao,
)
from app.consulta.repositorio_diarias import ResultadoDiariasCompletas
from app.domain.entities.aviso_linha_ignorada import AvisoLinhaIgnorada
from app.domain.entities.registro_diaria_indexada import RegistroDiariaIndexada
from app.domain.entities.servidor import Servidor
from app.infra.db.esquema import criar_esquema

_ORDENACAO_PADRAO = ParametrosOrdenacao(campo="periodo", ordem="desc")
_PAGINACAO_PADRAO = ParametrosPaginacao(pagina=1, tamanho_pagina=25)
_FILTROS_VAZIOS = FiltrosDiaria()


def _registro(sei, cpf, periodo_inicial, periodo_final, cidade_origem, cidade_destino, motivo, *,
              transporte=None, valor=None, linha=2, doc_origem="PJTESTE", dh=None):
    return RegistroDiariaIndexada(
        linha=linha,
        sei=sei,
        doc_origem=doc_origem,
        cpf=cpf,
        periodo_inicial=periodo_inicial,
        periodo_final=periodo_final,
        cidade_origem=cidade_origem,
        cidade_destino=cidade_destino,
        motivo=motivo,
        transporte=transporte,
        valor_total_diarias=valor,
        dh=dh,
    )


def _construir_base(tmp_path, registros, servidores, *, nome_arquivo="base_local.sqlite", avisos=None):
    resultado = ResultadoDiariasCompletas(
        diarias={registro.sei: registro for registro in registros},
        avisos=avisos or [],
        linhas_ignoradas=0,
    )
    sinal = base_local_sqlite.SinalFrescor(
        tamanho_bytes=1, mtime=1.0, linhas_controle_diarias=len(registros) + 1
    )
    destino = tmp_path / nome_arquivo
    base_local_sqlite.reconstruir(resultado, servidores, sinal, origem="teste", caminho_destino=destino)
    return destino


# Massa de dados reaproveitada pela maioria dos testes — 5 diárias, 4 com
# servidor cadastrado (a 4ª sem, simulando CPF ausente em `Dados`, situação
# real já documentada), a 5ª com um nome contendo "_" literal (prova de
# escaping de LIKE).
_REGISTROS = [
    _registro(
        "19.20.0001.0000001/2026-01", "11111111111",
        date(2026, 1, 8), date(2026, 1, 10), "RECIFE", "GARANHUNS", "Reunião",
        transporte="CARRO", valor=200.0, linha=2,
    ),
    _registro(
        "19.20.0001.0000002/2026-02", "22222222222",
        date(2026, 2, 1), date(2026, 2, 3), "RECIFE", "ARARIPINA", "Fiscalização",
        transporte="AVIAO", valor=350.5, linha=3,
    ),
    _registro(
        "19.20.0001.0000003/2026-03", "33333333333",
        date(2026, 3, 5), date(2026, 3, 6), "CARUARU", "RECIFE", "Reunião",
        linha=4,
    ),
    _registro(
        "19.20.0001.0000004/2026-04", "44444444444",
        date(2026, 4, 10), date(2026, 4, 12), "OLINDA", "RECIFE", "Auditoria",
        transporte="CARRO", valor=180.25, linha=5,
    ),
    _registro(
        "19.20.0001.0000005/2026-05", "55555555555",
        date(2026, 5, 1), date(2026, 5, 2), "RECIFE", "RECIFE", "Curso",
        transporte="CARRO", valor=100.0, linha=6,
    ),
]

_SERVIDORES = {
    "11111111111": Servidor(cpf="11111111111", nome="Maria Souza", cargo="Analista", previdencia="RPPS", matricula="1001", situacao="Em exercício"),
    "22222222222": Servidor(cpf="22222222222", nome="João Silva", cargo="Técnico", previdencia="RGPS", matricula="1002", situacao="Em exercício"),
    "33333333333": Servidor(cpf="33333333333", nome="Ana Costa", cargo="Analista", previdencia="RPPS", matricula="1003", situacao="Licença"),
    # 44444444444 propositalmente ausente — diária sem cadastro em Dados.
    "55555555555": Servidor(cpf="55555555555", nome="Jo_o Under", cargo="Estagiário", previdencia="Nenhuma", matricula="1005", situacao="Em exercício"),
}


@pytest.fixture
def caminho_base(tmp_path):
    return _construir_base(tmp_path, _REGISTROS, _SERVIDORES)


def test_listar_diarias_sem_filtros_retorna_todas(caminho_base):
    pagina = listar_diarias(caminho_base, _FILTROS_VAZIOS, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 5
    assert len(pagina.itens) == 5


def test_listar_diarias_filtro_sei_exato(caminho_base):
    filtros = FiltrosDiaria(sei="19.20.0001.0000002/2026-02")
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].cpf == "22222222222"


def test_listar_diarias_filtro_cpf_exato(caminho_base):
    filtros = FiltrosDiaria(cpf="333.333.333-33")  # com máscara — deve normalizar
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].sei == "19.20.0001.0000003/2026-03"


def test_listar_diarias_filtro_servidor_nome_parcial(caminho_base):
    filtros = FiltrosDiaria(servidor_nome="silva")
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].servidor.nome == "João Silva"


def test_listar_diarias_filtro_servidor_matricula_exata(caminho_base):
    filtros = FiltrosDiaria(servidor_matricula="1003")
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].cpf == "33333333333"


def test_listar_diarias_filtro_municipio_casa_origem_ou_destino(caminho_base):
    filtros = FiltrosDiaria(municipio="araripina")  # minúsculo — case-insensitive
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].cidade_destino == "ARARIPINA"


def test_listar_diarias_filtro_motivo_exato(caminho_base):
    filtros = FiltrosDiaria(motivo="Reunião")
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 2


def test_listar_diarias_filtro_situacao_exata(caminho_base):
    filtros = FiltrosDiaria(situacao="Licença")
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].cpf == "33333333333"


def test_listar_diarias_filtro_periodo_intersecao_exclui_nao_sobreposto(caminho_base):
    filtros = FiltrosDiaria(periodo_inicial=date(2026, 2, 15), periodo_final=date(2026, 3, 10))
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].sei == "19.20.0001.0000003/2026-03"


def test_listar_diarias_filtro_periodo_intersecao_inclui_diaria_que_comeca_antes(caminho_base):
    """Prova a semântica de interseção (decisão aprovada 2026-07-30): a
    diária 1 começa em 08/01, o filtro só começa em 09/01 — não há
    contenção total, mas há sobreposição (09 e 10/01), então deve entrar."""
    filtros = FiltrosDiaria(periodo_inicial=date(2026, 1, 9), periodo_final=date(2026, 1, 20))
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].sei == "19.20.0001.0000001/2026-01"


def test_listar_diarias_combinacao_de_filtros(caminho_base):
    filtros = FiltrosDiaria(motivo="Reunião", municipio="recife")
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 2  # diárias 1 (origem RECIFE) e 3 (destino RECIFE), ambas motivo Reunião


def test_listar_diarias_combinacao_sem_resultado(caminho_base):
    filtros = FiltrosDiaria(motivo="Reunião", municipio="olinda")
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 0
    assert pagina.itens == []


def test_listar_diarias_filtro_origem_isola_apenas_cidade_origem(caminho_base):
    """Diária 4 (OLINDA -> RECIFE) é a única com origem OLINDA; nenhuma
    outra diária tem OLINDA como destino, então isolar `origem` de
    `municipio` (que casaria origem OU destino) é o que este teste prova."""
    filtros = FiltrosDiaria(origem="olinda")
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].sei == "19.20.0001.0000004/2026-04"


def test_listar_diarias_filtro_destino_isola_apenas_cidade_destino(caminho_base):
    """Diária 1 (RECIFE -> GARANHUNS) é a única com destino GARANHUNS."""
    filtros = FiltrosDiaria(destino="garanhuns")
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].sei == "19.20.0001.0000001/2026-01"


def test_listar_diarias_filtro_origem_e_destino_combinados(caminho_base):
    """Só a diária 5 tem RECIFE como origem E destino ao mesmo tempo —
    prova a interseção (E lógico) entre os dois filtros isolados."""
    filtros = FiltrosDiaria(origem="recife", destino="recife")
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].sei == "19.20.0001.0000005/2026-05"


def test_listar_diarias_filtro_trecho_casa_concatenacao_origem_destino(caminho_base):
    """Diária 3 é CARUARU -> RECIFE; buscar pelo trecho completo prova que
    a concatenação SQL "origem - destino" está sendo usada, não uma
    comparação isolada de cada cidade."""
    filtros = FiltrosDiaria(trecho="caruaru - recife")
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].sei == "19.20.0001.0000003/2026-03"


def test_listar_diarias_filtro_trecho_nao_casa_par_invertido(caminho_base):
    """RECIFE aparece tanto como origem (diária 1/2/5) quanto como destino
    (diária 3/4), mas "garanhuns - recife" (invertido) não deve casar com
    a diária 1, que é "recife - garanhuns"."""
    filtros = FiltrosDiaria(trecho="garanhuns - recife")
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 0


def test_listar_diarias_filtro_trecho_com_cidade_ausente_nunca_casa(tmp_path):
    """Trecho incompleto (só origem ou só destino preenchido) não deve
    quebrar a consulta nem casar por acidente — concatenação SQL com um
    lado NULL resulta em NULL, nunca em correspondência de LIKE."""
    registro = _registro(
        "19.20.0001.0000008/2026-08", "88888888888",
        date(2026, 8, 1), date(2026, 8, 2), "RECIFE", None, "Reunião",
        linha=9,
    )
    caminho = _construir_base(tmp_path, [registro], {})

    pagina = listar_diarias(caminho, FiltrosDiaria(trecho="recife"), _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 0

    # confirma que a linha existe e é encontrável por outro filtro —
    # não é um problema de massa de dados, é especificamente do trecho.
    pagina_origem = listar_diarias(caminho, FiltrosDiaria(origem="recife"), _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina_origem.total_itens == 1


def test_listar_diarias_filtro_valor_minimo(caminho_base):
    """valor >= 200: diárias 1 (200.0) e 2 (350.5); diária 3 (sem valor,
    NULL) nunca casa com uma faixa de valor, mesmo comportamento nativo
    do SQL."""
    filtros = FiltrosDiaria(valor_minimo=200.0)
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    seis = {item.sei for item in pagina.itens}
    assert seis == {"19.20.0001.0000001/2026-01", "19.20.0001.0000002/2026-02"}


def test_listar_diarias_filtro_valor_maximo(caminho_base):
    """valor <= 200: diárias 1 (200.0), 4 (180.25) e 5 (100.0)."""
    filtros = FiltrosDiaria(valor_maximo=200.0)
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    seis = {item.sei for item in pagina.itens}
    assert seis == {
        "19.20.0001.0000001/2026-01",
        "19.20.0001.0000004/2026-04",
        "19.20.0001.0000005/2026-05",
    }


def test_listar_diarias_filtro_faixa_de_valor_combinada(caminho_base):
    """150 <= valor <= 250: diárias 1 (200.0) e 4 (180.25) — prova os dois
    limites aplicados juntos (interseção)."""
    filtros = FiltrosDiaria(valor_minimo=150.0, valor_maximo=250.0)
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    seis = {item.sei for item in pagina.itens}
    assert seis == {"19.20.0001.0000001/2026-01", "19.20.0001.0000004/2026-04"}


def test_pesquisa_global_q_reconhece_cpf(caminho_base):
    pagina = listar_diarias(caminho_base, FiltrosDiaria(q="222.222.222-22"), _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].sei == "19.20.0001.0000002/2026-02"


def test_pesquisa_global_q_reconhece_sei(caminho_base):
    pagina = listar_diarias(
        caminho_base, FiltrosDiaria(q="19.20.0001.0000003/2026-03"), _PAGINACAO_PADRAO, _ORDENACAO_PADRAO
    )
    assert pagina.total_itens == 1
    assert pagina.itens[0].cpf == "33333333333"


def test_pesquisa_global_q_cai_para_nome_parcial(caminho_base):
    pagina = listar_diarias(caminho_base, FiltrosDiaria(q="costa"), _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].servidor.nome == "Ana Costa"


def test_escaping_de_like_nao_trata_underscore_como_curinga(caminho_base):
    """Sem escaping, '_' em 'Jo_o' casaria com qualquer caractere no lugar
    (ex. 'Joao'/'João'). Com escaping correto, só bate com o nome que
    contém o underscore literal."""
    pagina = listar_diarias(caminho_base, FiltrosDiaria(servidor_nome="Jo_o"), _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].servidor.nome == "Jo_o Under"


def test_sql_injection_e_tratado_como_valor_literal(caminho_base):
    filtros = FiltrosDiaria(motivo="x'; DROP TABLE diarias; --")
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 0

    # confirma que a tabela sobreviveu — se a injeção tivesse funcionado,
    # esta segunda consulta levantaria erro ("no such table") ou veria 0.
    pagina_depois = listar_diarias(caminho_base, _FILTROS_VAZIOS, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina_depois.total_itens == 5


def test_ordenacao_por_sei_ascendente(caminho_base):
    ordenacao = ParametrosOrdenacao(campo="sei", ordem="asc")
    pagina = listar_diarias(caminho_base, _FILTROS_VAZIOS, _PAGINACAO_PADRAO, ordenacao)
    seis = [item.sei for item in pagina.itens]
    assert seis == sorted(seis)


def test_ordenacao_por_sei_descendente(caminho_base):
    ordenacao = ParametrosOrdenacao(campo="sei", ordem="desc")
    pagina = listar_diarias(caminho_base, _FILTROS_VAZIOS, _PAGINACAO_PADRAO, ordenacao)
    seis = [item.sei for item in pagina.itens]
    assert seis == sorted(seis, reverse=True)


def test_paginacao_segunda_pagina(caminho_base):
    ordenacao = ParametrosOrdenacao(campo="sei", ordem="asc")
    paginacao = ParametrosPaginacao(pagina=2, tamanho_pagina=2)
    pagina = listar_diarias(caminho_base, _FILTROS_VAZIOS, paginacao, ordenacao)
    assert pagina.total_itens == 5
    assert len(pagina.itens) == 2
    assert pagina.itens[0].sei == "19.20.0001.0000003/2026-03"
    assert pagina.itens[1].sei == "19.20.0001.0000004/2026-04"


def test_paginacao_pagina_alem_do_total_devolve_vazio(caminho_base):
    paginacao = ParametrosPaginacao(pagina=10, tamanho_pagina=25)
    pagina = listar_diarias(caminho_base, _FILTROS_VAZIOS, paginacao, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 5
    assert pagina.itens == []


def test_diaria_com_cpf_sem_cadastro_tem_servidor_none(caminho_base):
    filtros = FiltrosDiaria(sei="19.20.0001.0000004/2026-04")
    pagina = listar_diarias(caminho_base, filtros, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.itens[0].servidor is None


def test_ultima_sincronizacao_le_metadados(caminho_base):
    info = ultima_sincronizacao(caminho_base)
    assert info.sincronizado_em
    assert info.total_avisos == 0


def test_buscar_por_sei_existente_retorna_registro_completo(caminho_base):
    registro = buscar_por_sei(caminho_base, "19.20.0001.0000001/2026-01")
    assert registro is not None
    assert registro.sei == "19.20.0001.0000001/2026-01"
    assert registro.doc_origem == "PJTESTE"
    assert registro.cpf == "11111111111"
    assert registro.cidade_origem == "RECIFE"
    assert registro.cidade_destino == "GARANHUNS"
    assert registro.motivo == "Reunião"
    assert registro.transporte == "CARRO"
    assert registro.valor_total_diarias == 200.0
    assert registro.linha_planilha == 2
    assert registro.servidor is not None
    assert registro.servidor.nome == "Maria Souza"
    assert registro.servidor.cargo == "Analista"
    assert registro.servidor.previdencia == "RPPS"
    assert registro.servidor.matricula == "1001"
    assert registro.servidor.situacao == "Em exercício"
    assert registro.dh is None


def test_buscar_por_sei_inexistente_retorna_none(caminho_base):
    assert buscar_por_sei(caminho_base, "19.20.0001.9999999/2026-99") is None


def test_dh_preenchido_e_lido_de_volta_por_listar_diarias_e_buscar_por_sei(tmp_path):
    """Sprint 19.8.1 — peça final da 19.5.1: a coluna `dh` já existia no
    esquema e já era gravada por `base_local_sqlite.reconstruir()` desde
    aquela Sprint; só faltava `repositorio_analitico.py` selecioná-la e
    mapeá-la em `RegistroAnalitico` (bloqueio explícito registrado em
    `v2-plano-tecnico.md` § 18, entrada 19.8.1 — "parcialmente 🟡
    bloqueado")."""
    registro = _registro(
        "19.20.0001.0000007/2026-07", "77777777777",
        date(2026, 7, 1), date(2026, 7, 3), "RECIFE", "OLINDA", "Reunião",
        linha=8, dh="12345",
    )
    caminho = _construir_base(tmp_path, [registro], {})

    encontrado = buscar_por_sei(caminho, "19.20.0001.0000007/2026-07")
    assert encontrado is not None
    assert encontrado.dh == "12345"

    pagina = listar_diarias(caminho, FiltrosDiaria(sei="19.20.0001.0000007/2026-07"), _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.itens[0].dh == "12345"


def test_buscar_por_sei_sem_cadastro_tem_servidor_none(caminho_base):
    registro = buscar_por_sei(caminho_base, "19.20.0001.0000004/2026-04")
    assert registro is not None
    assert registro.servidor is None


def test_buscar_por_sei_servidor_com_matricula_e_situacao_nulas(tmp_path):
    """Sprint 17.4.4.1 — decisão arquitetural defensiva
    (`docs/central-analitica/api-plano-tecnico.md § 8`): `matricula`/
    `situacao` são colunas independentes e opcionais no esquema SQLite
    (Sprint 17.3, imutável), sem garantia de preenchimento conjunto com
    `nome`. O servidor não pode ser descartado só porque esses dois
    campos estão ausentes."""
    registro = _registro(
        "19.20.0001.0000006/2026-06", "66666666666",
        date(2026, 6, 1), date(2026, 6, 2), "RECIFE", "PETROLINA", "Reunião",
        linha=7,
    )
    servidor_incompleto = Servidor(
        cpf="66666666666", nome="Carlos Lima", cargo="Analista", previdencia="RPPS",
        matricula=None, situacao=None,
    )
    caminho = _construir_base(tmp_path, [registro], {"66666666666": servidor_incompleto})

    encontrado = buscar_por_sei(caminho, "19.20.0001.0000006/2026-06")
    assert encontrado is not None
    assert encontrado.servidor is not None
    assert encontrado.servidor.nome == "Carlos Lima"
    assert encontrado.servidor.matricula is None
    assert encontrado.servidor.situacao is None


def test_buscar_por_sei_servidor_com_matricula_e_situacao_vazias(tmp_path):
    """Mesma decisão do teste acima, cenário de string vazia (não `None`)
    — o formato hoje produzido por `repositorio_servidores.py` quando a
    célula da planilha está em branco."""
    registro = _registro(
        "19.20.0001.0000007/2026-07", "77777777777",
        date(2026, 7, 1), date(2026, 7, 2), "RECIFE", "SERRA TALHADA", "Fiscalização",
        linha=8,
    )
    servidor_incompleto = Servidor(
        cpf="77777777777", nome="Beatriz Nunes", cargo="Técnico", previdencia="RGPS",
        matricula="", situacao="",
    )
    caminho = _construir_base(tmp_path, [registro], {"77777777777": servidor_incompleto})

    encontrado = buscar_por_sei(caminho, "19.20.0001.0000007/2026-07")
    assert encontrado is not None
    assert encontrado.servidor is not None
    assert encontrado.servidor.nome == "Beatriz Nunes"
    assert encontrado.servidor.matricula == ""
    assert encontrado.servidor.situacao == ""


def test_buscar_por_sei_nunca_normaliza_o_termo(caminho_base):
    """RN-12 — diferente do filtro `sei` de `_montar_where` (que usa
    `.strip()`), `buscar_por_sei` trata o SEI como texto literal: um SEI
    com espaço extra não deveria casar com o valor sem espaço."""
    assert buscar_por_sei(caminho_base, " 19.20.0001.0000001/2026-01") is None


def test_buscar_por_sei_sql_injection_e_tratado_como_valor_literal(caminho_base):
    assert buscar_por_sei(caminho_base, "x'; DROP TABLE diarias; --") is None
    # confirma que a tabela sobreviveu.
    pagina = listar_diarias(caminho_base, _FILTROS_VAZIOS, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)
    assert pagina.total_itens == 5


def test_buscar_por_sei_base_local_inexistente_levanta_erro_sqlite(tmp_path):
    caminho_inexistente = tmp_path / "nao_existe.sqlite"
    with pytest.raises(sqlite3.Error):
        buscar_por_sei(caminho_inexistente, "19.20.0001.0000001/2026-01")


def test_buscar_por_sei_base_local_invalida_levanta_erro_sqlite(tmp_path):
    caminho_invalido = tmp_path / "corrompido.sqlite"
    caminho_invalido.write_bytes(b"isto nao e um banco sqlite")
    with pytest.raises(sqlite3.Error):
        buscar_por_sei(caminho_invalido, "19.20.0001.0000001/2026-01")


def test_listar_diarias_base_local_inexistente_levanta_erro_sqlite(tmp_path):
    caminho_inexistente = tmp_path / "nao_existe.sqlite"
    with pytest.raises(sqlite3.Error):
        listar_diarias(caminho_inexistente, _FILTROS_VAZIOS, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)


def test_listar_diarias_base_local_invalida_levanta_erro_sqlite(tmp_path):
    caminho_invalido = tmp_path / "corrompido.sqlite"
    caminho_invalido.write_bytes(b"isto nao e um banco sqlite")
    with pytest.raises(sqlite3.Error):
        listar_diarias(caminho_invalido, _FILTROS_VAZIOS, _PAGINACAO_PADRAO, _ORDENACAO_PADRAO)


def test_ultima_sincronizacao_sem_linha_registrada_levanta_erro(tmp_path):
    """Situação que a reconstrução normal nunca produz (schema criado, mas
    nenhuma linha em `sincronizacoes`) — defesa em profundidade contra um
    arquivo corrompido/adulterado por fora do fluxo homologado."""
    caminho = tmp_path / "sem_sincronizacao.sqlite"
    conexao = sqlite3.connect(caminho)
    criar_esquema(conexao)
    conexao.commit()
    conexao.close()

    with pytest.raises(sqlite3.Error):
        ultima_sincronizacao(caminho)


def test_opcoes_filtro_retorna_valores_distintos_ordenados(caminho_base):
    opcoes = opcoes_filtro(caminho_base)
    assert opcoes.motivos == ["Auditoria", "Curso", "Fiscalização", "Reunião"]
    assert opcoes.situacoes == ["Em exercício", "Licença"]
    assert opcoes.municipios == ["ARARIPINA", "CARUARU", "GARANHUNS", "OLINDA", "RECIFE"]


def test_opcoes_filtro_municipio_e_uniao_de_origem_e_destino_sem_duplicata(caminho_base):
    """RECIFE aparece como origem em 3 diárias e como destino em outras
    2 (massa de dados de `_REGISTROS`) — deve aparecer uma única vez."""
    opcoes = opcoes_filtro(caminho_base)
    assert opcoes.municipios.count("RECIFE") == 1


def test_opcoes_filtro_nunca_inclui_valor_nulo_como_opcao(caminho_base):
    """`44444444444` (diária 4 de `_REGISTROS`) não tem servidor cadastrado
    — `servidor_situacao` é `NULL` para essa linha. `NULL` nunca deveria
    virar uma opção de filtro (ex. string `"None"` ou entrada vazia). Só
    2 situações distintas existem na massa de dados (`_SERVIDORES`):
    "Em exercício" e "Licença" — a linha sem cadastro não deveria somar
    uma 3ª entrada nula."""
    opcoes = opcoes_filtro(caminho_base)
    assert None not in opcoes.situacoes
    assert "None" not in opcoes.situacoes
    assert len(opcoes.situacoes) == 2


def test_opcoes_filtro_base_vazia_retorna_listas_vazias(tmp_path):
    caminho = _construir_base(tmp_path, [], {})
    opcoes = opcoes_filtro(caminho)
    assert opcoes.motivos == []
    assert opcoes.situacoes == []
    assert opcoes.municipios == []


def test_opcoes_filtro_base_local_inexistente_levanta_erro_sqlite(tmp_path):
    caminho_inexistente = tmp_path / "nao_existe.sqlite"
    with pytest.raises(sqlite3.Error):
        opcoes_filtro(caminho_inexistente)


def test_opcoes_filtro_base_local_invalida_levanta_erro_sqlite(tmp_path):
    caminho_invalido = tmp_path / "corrompido.sqlite"
    caminho_invalido.write_bytes(b"isto nao e um banco sqlite")
    with pytest.raises(sqlite3.Error):
        opcoes_filtro(caminho_invalido)


# ---------------------------------------------------------------------------
# Sprint 17.4.6 — estado_sincronizacao_registrado / avisos_paginados
# ---------------------------------------------------------------------------


def test_ultima_sincronizacao_e_estado_sincronizacao_registrado_sao_consistentes(caminho_base):
    """Regressão do refactor: os dois devem concordar nos campos em
    comum (mesma linha, mesmo helper privado por baixo)."""
    resumida = ultima_sincronizacao(caminho_base)
    completa = estado_sincronizacao_registrado(caminho_base)
    assert completa.sincronizado_em == resumida.sincronizado_em
    assert completa.total_avisos == resumida.total_avisos


def test_estado_sincronizacao_registrado_le_todos_os_campos(caminho_base):
    info = estado_sincronizacao_registrado(caminho_base)
    assert info.sincronizado_em
    assert info.origem == "teste"
    assert info.linhas_diarias == len(_REGISTROS)
    assert info.linhas_servidores_lidos == len(_SERVIDORES)
    assert info.linhas_ignoradas == 0
    assert info.total_avisos == 0


def _inserir_sincronizacao_extra(caminho_sqlite, *, origem, aviso_motivo=None):
    """Insere uma 2ª linha em `sincronizacoes` (fora do fluxo normal de
    reconstrução total, que nunca produz duas linhas na prática) — só
    para provar que `_linha_sincronizacao_mais_recente` (`ORDER BY id
    DESC LIMIT 1`) usa o maior `id`, não a suposição de que só existe
    uma linha (Sprint 17.4.6.1, achado da auditoria da 17.4.6)."""
    conexao = sqlite3.connect(caminho_sqlite)
    try:
        cursor = conexao.execute(
            """
            INSERT INTO sincronizacoes (
                sincronizado_em, origem, linhas_diarias, linhas_servidores_lidos,
                linhas_ignoradas, status, tamanho_bytes_fonte, mtime_fonte,
                linhas_controle_diarias_fonte
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("2099-01-01T00:00:00", origem, 999, 999, 999, "sucesso", 1, 1.0, 1),
        )
        nova_sincronizacao_id = cursor.lastrowid
        if aviso_motivo is not None:
            conexao.execute(
                "INSERT INTO avisos_sincronizacao (sincronizacao_id, aba, linha, motivo) VALUES (?, ?, ?, ?)",
                (nova_sincronizacao_id, "Aba Nova", 1, aviso_motivo),
            )
        conexao.commit()
    finally:
        conexao.close()
    return nova_sincronizacao_id


def test_estado_sincronizacao_registrado_usa_a_linha_de_maior_id(caminho_base):
    """A base já tem 1 linha (da fixture `caminho_base`); insere uma 2ª
    com `id` maior e confirma que essa — não a primeira — é a lida."""
    _inserir_sincronizacao_extra(caminho_base, origem="mais_recente")

    info = estado_sincronizacao_registrado(caminho_base)
    assert info.origem == "mais_recente"
    assert info.linhas_diarias == 999
    assert info.linhas_servidores_lidos == 999
    assert info.linhas_ignoradas == 999


def test_avisos_paginados_vincula_avisos_a_sincronizacao_de_maior_id(caminho_base):
    """A sincronização original (id menor) não tem avisos; só a nova
    (id maior) tem 1 — se `avisos_paginados` usasse a linha errada (ou
    somasse avisos de todas as sincronizações), `total_itens` não seria
    exatamente 1."""
    _inserir_sincronizacao_extra(
        caminho_base, origem="mais_recente", aviso_motivo="Aviso da sincronização mais recente"
    )

    pagina = avisos_paginados(caminho_base, _PAGINACAO_PADRAO)
    assert pagina.total_itens == 1
    assert pagina.itens[0].motivo == "Aviso da sincronização mais recente"
    assert pagina.itens[0].aba == "Aba Nova"


def test_estado_sincronizacao_registrado_base_local_inexistente_levanta_erro(tmp_path):
    caminho_inexistente = tmp_path / "nao_existe.sqlite"
    with pytest.raises(sqlite3.Error):
        estado_sincronizacao_registrado(caminho_inexistente)


def test_estado_sincronizacao_registrado_base_local_invalida_levanta_erro(tmp_path):
    caminho_invalido = tmp_path / "corrompido.sqlite"
    caminho_invalido.write_bytes(b"isto nao e um banco sqlite")
    with pytest.raises(sqlite3.Error):
        estado_sincronizacao_registrado(caminho_invalido)


def test_estado_sincronizacao_registrado_sem_linha_registrada_levanta_erro(tmp_path):
    caminho = tmp_path / "sem_sincronizacao.sqlite"
    conexao = sqlite3.connect(caminho)
    criar_esquema(conexao)
    conexao.commit()
    conexao.close()

    with pytest.raises(sqlite3.Error):
        estado_sincronizacao_registrado(caminho)


_AVISOS_TESTE = [
    AvisoLinhaIgnorada(aba="Controle de Diárias", linha=10, motivo="SEI ausente"),
    AvisoLinhaIgnorada(aba="Controle de Diárias", linha=15, motivo="CPF inválido"),
    AvisoLinhaIgnorada(aba="Dados", linha=42, motivo="Matrícula duplicada"),
]


def test_avisos_paginados_retorna_avisos_da_sincronizacao_mais_recente(tmp_path):
    caminho = _construir_base(tmp_path, _REGISTROS, _SERVIDORES, avisos=_AVISOS_TESTE)
    pagina = avisos_paginados(caminho, ParametrosPaginacao(pagina=1, tamanho_pagina=25))
    assert pagina.total_itens == 3
    assert len(pagina.itens) == 3
    assert {aviso.motivo for aviso in pagina.itens} == {"SEI ausente", "CPF inválido", "Matrícula duplicada"}


def test_avisos_paginados_pagina_corretamente(tmp_path):
    caminho = _construir_base(tmp_path, _REGISTROS, _SERVIDORES, avisos=_AVISOS_TESTE)
    pagina = avisos_paginados(caminho, ParametrosPaginacao(pagina=2, tamanho_pagina=2))
    assert pagina.total_itens == 3
    assert len(pagina.itens) == 1


def test_avisos_paginados_pagina_alem_do_total_devolve_vazio(tmp_path):
    caminho = _construir_base(tmp_path, _REGISTROS, _SERVIDORES, avisos=_AVISOS_TESTE)
    pagina = avisos_paginados(caminho, ParametrosPaginacao(pagina=10, tamanho_pagina=25))
    assert pagina.total_itens == 3
    assert pagina.itens == []


def test_avisos_paginados_sincronizado_sem_avisos_retorna_lista_vazia_sem_erro(caminho_base):
    """`caminho_base` (fixture padrão) foi sincronizada sem avisos — lista
    vazia é um resultado válido, não um erro (diferente de "nunca
    sincronizado", testado abaixo)."""
    pagina = avisos_paginados(caminho_base, _PAGINACAO_PADRAO)
    assert pagina.total_itens == 0
    assert pagina.itens == []


def test_avisos_paginados_nunca_sincronizado_levanta_erro(tmp_path):
    """Decisão confirmada da 17.4.6: 'nunca sincronizado' é uma condição
    de indisponibilidade técnica para este endpoint (o service mapeia
    para 503), diferente de GET /sincronizacao (200, estado de negócio)."""
    caminho_inexistente = tmp_path / "nao_existe.sqlite"
    with pytest.raises(sqlite3.Error):
        avisos_paginados(caminho_inexistente, _PAGINACAO_PADRAO)


def test_avisos_paginados_base_local_invalida_levanta_erro(tmp_path):
    caminho_invalido = tmp_path / "corrompido.sqlite"
    caminho_invalido.write_bytes(b"isto nao e um banco sqlite")
    with pytest.raises(sqlite3.Error):
        avisos_paginados(caminho_invalido, _PAGINACAO_PADRAO)


# Sprint 19.6.1 (`v2-plano-tecnico.md` § 18) — `agregar_indicadores` reaproveita
# o mesmo `_montar_where`/`FiltrosDiaria` já testado acima por `listar_diarias`;
# aqui só confirmamos que devolve o recorte inteiro (sem paginação) e que o
# filtro de fato restringe o conjunto — o cálculo dos KPIs em si é
# responsabilidade de `app/domain/analitica/indicadores.py`, coberto por
# `tests/unit/test_indicadores.py`.
def test_agregar_indicadores_sem_filtros_devolve_todo_o_recorte_sem_paginacao(caminho_base):
    registros = agregar_indicadores(caminho_base, _FILTROS_VAZIOS)
    assert len(registros) == 5
    assert {registro.cpf for registro in registros} == {
        "11111111111", "22222222222", "33333333333", "44444444444", "55555555555",
    }


def test_agregar_indicadores_aplica_filtro_como_listar_diarias(caminho_base):
    filtros = FiltrosDiaria(motivo="Reunião")
    registros = agregar_indicadores(caminho_base, filtros)
    assert {registro.sei for registro in registros} == {
        "19.20.0001.0000001/2026-01",
        "19.20.0001.0000003/2026-03",
    }


def test_agregar_indicadores_sem_resultado_devolve_lista_vazia(caminho_base):
    registros = agregar_indicadores(caminho_base, FiltrosDiaria(motivo="Motivo Inexistente"))
    assert registros == []


def test_agregar_indicadores_base_local_invalida_levanta_erro(tmp_path):
    caminho_invalido = tmp_path / "corrompido.sqlite"
    caminho_invalido.write_bytes(b"isto nao e um banco sqlite")
    with pytest.raises(sqlite3.Error):
        agregar_indicadores(caminho_invalido, _FILTROS_VAZIOS)
