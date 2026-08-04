"""Sprint 19.6.2.1 — correção do achado da Auditoria Técnica da 19.6.2:
`ParametrosIndicadoresQuery` é intencionalmente uma classe própria, não
herdada de `ParametrosPesquisaDiariasQuery` (mesma "regra de posse de
tipos" já adotada entre serviço/repositório). Duplicação deliberada exige
uma rede de segurança permanente: este teste compara os schemas campo a
campo (fora paginação/ordenação/`dimensao`) e falha se um dia divergirem
em nome, tipo, default ou presença de validação — sem isso, a duplicação
podia silenciosamente sair de sincronia.

Sprint 19.6.3 estende a mesma rede de segurança para `ParametrosDistribuicaoQuery`
(mesma "regra de posse de tipos", terceira cópia independente dos 15
campos de filtro)."""

import pytest
from pydantic import ValidationError

from app.schemas.analitica import (
    ParametrosDistribuicaoQuery,
    ParametrosIndicadoresQuery,
    ParametrosPesquisaDiariasQuery,
)

# Campos que só existem em `ParametrosPesquisaDiariasQuery` porque
# `/indicadores`/`/distribuicoes` operam sobre o recorte inteiro
# (`v2-plano-tecnico.md` § 12.2/§ 12.3) — nunca comparados entre os schemas.
CAMPOS_EXCLUSIVOS_DE_PAGINACAO_OU_ORDENACAO = {"pagina", "tamanho_pagina", "ordenar_por", "ordem"}

# Campo que só existe em `ParametrosDistribuicaoQuery` (qual dimensão
# agregar, § 12.3) — sem equivalente nos outros dois schemas.
CAMPOS_EXCLUSIVOS_DE_DISTRIBUICAO = {"dimensao"}

_SCHEMAS_COM_OS_15_CAMPOS_DE_FILTRO = {
    "ParametrosIndicadoresQuery": (ParametrosIndicadoresQuery, set()),
    "ParametrosDistribuicaoQuery": (ParametrosDistribuicaoQuery, CAMPOS_EXCLUSIVOS_DE_DISTRIBUICAO),
}


@pytest.mark.parametrize("nome_schema", _SCHEMAS_COM_OS_15_CAMPOS_DE_FILTRO)
def test_schema_tem_exatamente_os_campos_de_filtro_de_diarias(nome_schema):
    schema, campos_exclusivos_do_schema = _SCHEMAS_COM_OS_15_CAMPOS_DE_FILTRO[nome_schema]
    campos_diarias = set(ParametrosPesquisaDiariasQuery.model_fields) - CAMPOS_EXCLUSIVOS_DE_PAGINACAO_OU_ORDENACAO
    campos_do_schema = set(schema.model_fields) - campos_exclusivos_do_schema

    assert campos_do_schema == campos_diarias


@pytest.mark.parametrize("nome_schema", _SCHEMAS_COM_OS_15_CAMPOS_DE_FILTRO)
def test_schema_campos_de_filtro_tem_mesmo_tipo_e_default_que_diarias(nome_schema):
    schema, _ = _SCHEMAS_COM_OS_15_CAMPOS_DE_FILTRO[nome_schema]
    campos_de_filtro = set(ParametrosPesquisaDiariasQuery.model_fields) - CAMPOS_EXCLUSIVOS_DE_PAGINACAO_OU_ORDENACAO

    for campo in campos_de_filtro:
        campo_diarias = ParametrosPesquisaDiariasQuery.model_fields[campo]
        campo_do_schema = schema.model_fields[campo]

        assert campo_do_schema.annotation == campo_diarias.annotation, (
            f"Campo '{campo}': tipo diverge entre {nome_schema} e ParametrosPesquisaDiariasQuery "
            f"({campo_do_schema.annotation!r} != {campo_diarias.annotation!r})."
        )
        assert campo_do_schema.default == campo_diarias.default, (
            f"Campo '{campo}': default diverge entre {nome_schema} e ParametrosPesquisaDiariasQuery "
            f"({campo_do_schema.default!r} != {campo_diarias.default!r})."
        )


@pytest.mark.parametrize(
    "schema",
    [ParametrosPesquisaDiariasQuery, ParametrosIndicadoresQuery, ParametrosDistribuicaoQuery],
)
def test_schema_tem_os_mesmos_validadores_de_periodo_e_valor_que_diarias(schema):
    """Os dois validadores de invariante (`periodo_final >= periodo_inicial`,
    `valor_maximo >= valor_minimo`) precisam existir nos três schemas —
    não são campos, então os testes acima não os cobrem. `ParametrosDistribuicaoQuery`
    também precisa de `dimensao` para validar (campo obrigatório, sem
    default)."""
    base = {"dimensao": "periodo"} if schema is ParametrosDistribuicaoQuery else {}
    dados_invalidos_periodo = {**base, "periodo_inicial": "2026-05-01", "periodo_final": "2026-01-01"}
    dados_invalidos_valor = {**base, "valor_minimo": 300, "valor_maximo": 100}

    with pytest.raises(ValidationError):
        schema.model_validate(dados_invalidos_periodo)
    with pytest.raises(ValidationError):
        schema.model_validate(dados_invalidos_valor)
