from app.extraction.enriquecimento.local_destino import (
    identificar_estado_destino,
    identificar_municipio_final_destino,
    remover_sufixo_uf,
)


def test_cidade_pernambucana_sem_sufixo_de_uf():
    valor, aviso = identificar_estado_destino("Nazaré da Mata")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_cidade_com_sufixo_de_uf_explicito():
    valor, aviso = identificar_estado_destino("Garanhuns/PE")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_sufixo_de_uf_de_outro_estado():
    valor, aviso = identificar_estado_destino("São Paulo/SP")
    assert valor == "SÃO PAULO"
    assert aviso is None


def test_multiplas_cidades_todas_pernambucanas():
    valor, aviso = identificar_estado_destino("Cabo de Santo Agostinho / Palmares")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_fernando_de_noronha_nunca_e_pernambuco():
    valor, aviso = identificar_estado_destino("Fernando de Noronha")
    assert valor == "FERNANDO DE NORONHA"
    assert aviso is None


def test_fernando_de_noronha_com_sufixo_pe_continua_fernando_de_noronha():
    valor, aviso = identificar_estado_destino("Fernando de Noronha/PE")
    assert valor == "FERNANDO DE NORONHA"
    assert aviso is None


def test_fernando_de_noronha_combinado_com_outra_cidade_fica_ambiguo():
    valor, aviso = identificar_estado_destino("Fernando de Noronha / Recife")
    assert valor is None
    assert "Fernando de Noronha" in aviso


def test_erro_de_digitacao_real_e_corrigido_por_correspondencia_aproximada():
    """Erro de digitação real encontrado num PDF de exemplo: 'Cabo de Santo
    Augustinho' em vez de 'Cabo de Santo Agostinho'. A correspondência
    aproximada resolve com segurança porque só há um candidato acima do
    limiar de confiança, e ele é inequivocamente de Pernambuco."""
    valor, aviso = identificar_estado_destino("Cabo de Santo Augustinho")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_cidade_totalmente_desconhecida_fica_vazia_com_aviso():
    valor, aviso = identificar_estado_destino("Cidade Que Nao Existe De Verdade")
    assert valor is None
    assert "não reconhecida" in aviso


def test_cidades_de_estados_diferentes_usa_o_ultimo_municipio_valido():
    """Regra operacional do órgão: o último município válido do campo é o
    destino final — cidades de estados diferentes não bloqueiam mais o
    preenchimento, só geram um aviso para revisão."""
    valor, aviso = identificar_estado_destino("Recife / São Paulo")
    assert valor == "SÃO PAULO"
    assert "mais de um estado" in aviso


def test_nome_de_cidade_que_existe_em_mais_de_um_estado_fica_ambiguo():
    """'Bonito' existe em Pernambuco, Bahia, Mato Grosso do Sul e Pará — sem
    mais contexto (UF explícita), não dá para saber qual. Nunca deve
    escolher um estado só porque é o mais provável."""
    valor, aviso = identificar_estado_destino("Bonito")
    assert valor is None
    assert "mais de um estado" in aviso
    assert "PERNAMBUCO" in aviso and "MATO GROSSO DO SUL" in aviso


def test_nome_ambiguo_com_uf_explicita_e_resolvido():
    valor, aviso = identificar_estado_destino("Bonito/MS")
    assert valor == "MATO GROSSO DO SUL"
    assert aviso is None


def test_capital_de_outro_estado_sem_sufixo_de_uf():
    valor, aviso = identificar_estado_destino("Brasília")
    assert valor == "BRASÍLIA"
    assert aviso is None


def test_campo_vazio_fica_sem_estado():
    valor, aviso = identificar_estado_destino("")
    assert valor is None
    assert aviso is not None


def test_campo_none_fica_sem_estado():
    valor, aviso = identificar_estado_destino(None)
    assert valor is None
    assert aviso is not None


# --- Sprint 04.1 — município final do destino (regra de transporte) -------------


def test_municipio_final_de_destino_simples():
    valor, aviso = identificar_municipio_final_destino("Petrolina")
    assert valor == "Petrolina"
    assert aviso is None


def test_municipio_final_usa_o_ultimo_municipio_valido_como_o_estado():
    """Mesma regra do 'último município válido' já usada para a coluna Q —
    aqui devolvendo o nome do município em vez do estado."""
    valor, aviso = identificar_municipio_final_destino("Recife / São Paulo")
    assert valor == "São Paulo"


def test_municipio_final_vazio_quando_campo_nao_e_reconhecido():
    valor, aviso = identificar_municipio_final_destino("Cidade Que Nao Existe De Verdade")
    assert valor is None
    assert aviso is not None


# --- Sprint 04.1 — refinamento: abreviações administrativas (Sta/Sto/S.) --------
#
# Causa raiz do caso real (processo 19.20.0001.0000910/2025-10, destino "Sta
# Cuz do Capibaribe"): o filtro de tamanho da busca aproximada
# (`_candidatos_por_tamanho`, tolerância de 2 caracteres) excluía "SANTA CRUZ
# DO CAPIBARIBE" (24 caracteres) da lista de candidatos para "STA CUZ DO
# CAPIBARIBE" (21 caracteres) — diferença de 3, acima da tolerância — antes
# mesmo de a correspondência aproximada rodar. A solução expande a
# abreviação ("Sta" -> "Santa") primeiro, reduzindo a diferença de tamanho
# para 1 (só o "Cuz"/"Cruz" resta), o que já estava dentro da tolerância e
# tem similaridade 0.97 — bem acima do corte de 0.86.


def test_processo_real_sta_cuz_do_capibaribe_resolve_pernambuco():
    """Processo fictício 19.20.0001.0000910/2025-10: 'Sta Cuz do Capibaribe'
    combina abreviação ('Sta' por 'Santa') com erro de digitação ('Cuz' por
    'Cruz') — o caso que motivou esta Sprint."""
    valor, aviso = identificar_estado_destino("Sta Cuz do Capibaribe", "Recife")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_abreviacao_sta_sem_erro_de_digitacao_tambem_resolve():
    """A expansão de abreviação não depende de haver também um erro de
    digitação — 'Sta Cruz do Capibaribe' (grafia correta) resolve igual."""
    valor, aviso = identificar_estado_destino("Sta Cruz do Capibaribe")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_abreviacao_sto_resolve_santo_amaro_bahia():
    valor, aviso = identificar_estado_destino("Sto Amaro")
    assert valor == "BAHIA"
    assert aviso is None


def test_abreviacao_sto_resolve_santo_antonio_rio_grande_do_norte():
    valor, aviso = identificar_estado_destino("Sto Antônio")
    assert valor == "RIO GRANDE DO NORTE"
    assert aviso is None


def test_abreviacao_sta_maria_e_genuinamente_ambigua_entre_dois_estados():
    """'Santa Maria' existe de verdade em mais de um estado (Rio Grande do
    Norte e Rio Grande do Sul) — a expansão da abreviação encontra os dois
    municípios reais, e o sistema corretamente continua sem escolher entre
    eles (nunca 'adivinha'), exatamente a mesma regra de ambiguidade já
    homologada para nomes não abreviados (ex.: 'Bonito')."""
    valor, aviso = identificar_estado_destino("Sta Maria")
    assert valor is None
    assert "mais de um estado" in aviso
    assert "RIO GRANDE DO NORTE" in aviso and "RIO GRANDE DO SUL" in aviso


def test_ordinal_sto_e_sta_normalizam_como_as_formas_por_extenso_do_ponto():
    """'Stº'/'Stª' (indicador ordinal masculino/feminino) já viram 'STO'/
    'STA' na normalização de acentos existente — mesma expansão se aplica,
    sem precisar de tratamento especial para o caractere ordinal."""
    valor_sto, _ = identificar_estado_destino("Stº Amaro")
    valor_sta, _ = identificar_estado_destino("Stª Cruz do Capibaribe")
    assert valor_sto == "BAHIA"
    assert valor_sta == "PERNAMBUCO"


def test_abreviacao_ponto_s_resolve_sao_jose_quando_contexto_permite():
    """'S.' é ambígua (São ou Santo) — só resolve quando exatamente uma das
    duas expansões encontra um município real. 'São José' existe (Santa
    Catarina); 'Santo José' não existe, então não há ambiguidade real aqui."""
    valor, aviso = identificar_estado_destino("S. José")
    assert valor == "SANTA CATARINA"
    assert aviso is None


def test_nome_sem_abreviacao_reconhecida_continua_sem_estado():
    """Uma cidade genuinamente desconhecida, sem prefixo abreviado, não é
    afetada pela expansão — continua caindo no aviso de sempre."""
    valor, aviso = identificar_estado_destino("Cidade Que Nao Existe De Verdade")
    assert valor is None
    assert "não reconhecida" in aviso


# --- Normalização (acento/caixa/espaço) e correspondência aproximada ------------


def test_normalizacao_reconhece_variacoes_de_caixa_e_acento():
    variacoes = ["João Pessoa", "JOAO PESSOA", "Joao Pessoa", "joão pessoa", "  João   Pessoa  "]
    resultados = {identificar_estado_destino(v)[0] for v in variacoes}
    assert resultados == {"PARAÍBA"}


def test_correspondencia_aproximada_petrolna_para_petrolina():
    valor, aviso = identificar_estado_destino("Petrolna")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_correspondencia_aproximada_garanhus_para_garanhuns():
    valor, aviso = identificar_estado_destino("Garanhus")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_correspondencia_aproximada_nao_gera_falso_positivo_entre_estados():
    """'Acar' bate por correspondência aproximada com 'Acari' (Rio Grande do
    Norte) e 'Acará' (Pará) ao mesmo tempo — estados diferentes. Mesmo com
    confiança alta na aproximação, o sistema não pode escolher nenhum dos
    dois; fica em branco e sinaliza a ambiguidade."""
    valor, aviso = identificar_estado_destino("Acar")
    assert valor is None
    assert "mais de um estado" in aviso


def test_correspondencia_aproximada_multiplas_cidades_no_mesmo_campo():
    valor, aviso = identificar_estado_destino("Petrolna / Garanhus")
    assert valor == "PERNAMBUCO"
    assert aviso is None


# --- Cobertura completa: cidades de estados diferentes (Sprint 03.1) ------------


def test_reconhece_capitais_inequivocas_de_varios_estados_sem_uf():
    """Nem toda capital é inequívoca a nível nacional (ex.: 'Rio Branco'
    também existe no Mato Grosso, 'Belém' também na Paraíba e em Alagoas —
    cobertas no teste seguinte, via UF explícita). Estas aqui só existem
    num estado, então resolvem sem precisar de UF."""
    casos = {
        "Salvador": "BAHIA",
        "Fortaleza": "CEARÁ",
        "São Luís": "MARANHÃO",
        "João Pessoa": "PARAÍBA",
        "Teresina": "PIAUÍ",
        "Natal": "RIO GRANDE DO NORTE",
        "Aracaju": "SERGIPE",
        "Manaus": "AMAZONAS",
        "Macapá": "AMAPÁ",
        "Porto Velho": "RONDÔNIA",
        "Goiânia": "GOIÁS",
        "Cuiabá": "MATO GROSSO",
        "Porto Alegre": "RIO GRANDE DO SUL",
        "Florianópolis": "SANTA CATARINA",
        "Curitiba": "PARANÁ",
        "Belo Horizonte": "MINAS GERAIS",
        "Rio de Janeiro": "RIO DE JANEIRO",
        "Vitória": "ESPÍRITO SANTO",
        "São Paulo": "SÃO PAULO",
        "Maceió": "ALAGOAS",
        "Recife": "PERNAMBUCO",
    }
    for cidade, estado_esperado in casos.items():
        valor, aviso = identificar_estado_destino(cidade)
        assert valor == estado_esperado, f"{cidade}: esperava {estado_esperado}, veio {valor}"
        assert aviso is None


def test_reconhece_capitais_ambiguas_via_uf_explicita():
    """'Rio Branco' (também existe no Mato Grosso), 'Boa Vista' (também na
    Paraíba), 'Belém' (também na Paraíba e em Alagoas), 'Palmas' (também no
    Paraná) e 'Campo Grande' (também em Alagoas) só resolvem com segurança
    quando o processo traz a UF explícita — exatamente o padrão real
    observado nos PDFs do legado para destinos fora de Pernambuco."""
    casos = {
        "Rio Branco/AC": "ACRE",
        "Boa Vista/RR": "RORAIMA",
        "Belém/PA": "PARÁ",
        "Palmas/TO": "TOCANTINS",
        "Campo Grande/MS": "MATO GROSSO DO SUL",
    }
    for cidade, estado_esperado in casos.items():
        valor, aviso = identificar_estado_destino(cidade)
        assert valor == estado_esperado, f"{cidade}: esperava {estado_esperado}, veio {valor}"
        assert aviso is None

    # Sem a UF, os mesmos nomes ficam ambíguos — não escolhem um estado.
    for cidade in ("Rio Branco", "Boa Vista", "Belém", "Palmas", "Campo Grande"):
        valor, aviso = identificar_estado_destino(cidade)
        assert valor is None
        assert "mais de um estado" in aviso


# --- Hotfix Sprint 03.1: múltiplas cidades e separadores diversos --------------


def test_hotfix_caso_reportado_recife_pe_sanharo_pe():
    """Caso relatado na homologação manual: campo com cidade+UF repetido
    duas vezes, sem nenhum separador que o parser antigo reconhecesse."""
    valor, aviso = identificar_estado_destino("Recife - PE - Sanharó - PE")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_hotfix_todos_os_formatos_pedidos_resolvem_para_pernambuco():
    formatos = [
        "Recife - PE",
        "Recife/PE",
        "Recife (PE)",
        "Recife - Pernambuco",
        "Recife, Caruaru e Garanhuns",
        "Recife; Caruaru; Garanhuns",
        "Recife / Caruaru / Garanhuns",
        "Recife\nCaruaru\nGaranhuns",
        "Recife → Caruaru",
        "Recife x Caruaru",
        "Caruaru, Belo Jardim, Sanharó",
    ]
    for cidade_destino in formatos:
        valor, aviso = identificar_estado_destino(cidade_destino)
        assert valor == "PERNAMBUCO", f"{cidade_destino!r}: esperava PERNAMBUCO, veio {valor!r} ({aviso!r})"
        assert aviso is None


def test_hotfix_cidades_de_estados_diferentes_com_uf_por_cidade_usa_ultimo_valido():
    """Regra operacional do órgão (ajuste posterior ao hotfix): mesmo com UF
    explícita por cidade e estados divergentes, o último município válido do
    campo determina a coluna Q — com aviso registrando a divergência."""
    valor, aviso = identificar_estado_destino("Recife - PE\nJoão Pessoa - PB")
    assert valor == "PARAÍBA"
    assert "mais de um estado" in aviso
    assert "PERNAMBUCO" in aviso and "PARAÍBA" in aviso


def test_hotfix_uf_explicita_por_cidade_desempata_ambiguidade_nacional():
    valor, aviso = identificar_estado_destino("Bonito - PE")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_hotfix_nome_de_cidade_igual_ao_nome_do_estado_sozinho():
    """'Rio de Janeiro' e 'São Paulo' são, ao mesmo tempo, nome de cidade e
    nome de estado — sozinhos no campo, têm que ser tratados como a cidade
    (que é a própria capital), não como um marcador de UF sem cidade."""
    assert identificar_estado_destino("Rio de Janeiro") == ("RIO DE JANEIRO", None)
    assert identificar_estado_destino("São Paulo") == ("SÃO PAULO", None)


def test_hotfix_cidade_com_e_no_nome_nao_e_cortada_pelo_separador_e():
    """'Abreu e Lima' é um município real de Pernambuco — o 'e' faz parte do
    nome, não pode ser interpretado como separador de lista."""
    valor, aviso = identificar_estado_destino("Abreu e Lima")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_hotfix_cidade_com_e_no_nome_combinada_com_uf():
    valor, aviso = identificar_estado_destino("Abreu e Lima - PE")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_hotfix_cidade_real_seguida_de_nome_de_estado_nao_e_forcada_como_qualificador():
    """'Recife - Rio de Janeiro' não pode virar 'Recife no estado do Rio de
    Janeiro' (Recife nunca fica no Rio de Janeiro) — o sistema detecta a
    contradição e trata como duas cidades separadas, cada uma no seu
    estado. Pela regra do último município válido, o destino final passa a
    ser 'Rio de Janeiro' (a última cidade do campo), com aviso registrando
    que havia mais de um estado envolvido."""
    valor, aviso = identificar_estado_destino("Recife - Rio de Janeiro")
    assert valor == "RIO DE JANEIRO"
    assert "mais de um estado" in aviso


def test_hotfix_multiplas_cidades_todas_com_uf_e_erro_de_digitacao():
    """Combina os dois hotfixes: várias cidades com UF por cidade, incluindo
    uma com erro de digitação real do legado."""
    valor, aviso = identificar_estado_destino("Cabo de Santo Augustinho - PE - Sanharó - PE")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_regressao_campo_real_do_processo_sei_19_20_0222_0000179_2026_03():
    """Campo 'CIDADE(S) DESTINO:' exato extraído do processo SEI
    19.20.0001.0000111/2026-11 durante a homologação — uma única cidade com
    UF, separada por hífen ASCII comum. Não deve ser confundido com o
    TRECHO (origem + destino concatenados), que é uma string diferente e
    nunca chega a este parser."""
    valor, aviso = identificar_estado_destino("Sanharó - PE")
    assert valor == "PERNAMBUCO"
    assert aviso is None


# --- Regra de negócio: último município válido é o destino final ---------------


def test_regra_ultimo_municipio_exemplo_recife_pe_sanharo_pe():
    valor, aviso = identificar_estado_destino("Recife - PE - Sanharó - PE")
    assert valor == "PERNAMBUCO"
    # Mesmo estado do início ao fim — não há divergência para avisar.
    assert aviso is None


def test_regra_ultimo_municipio_exemplo_joao_pessoa_pb_palmares_pe():
    valor, aviso = identificar_estado_destino("João Pessoa - PB - Palmares - PE")
    assert valor == "PERNAMBUCO"
    assert "mais de um estado" in aviso
    assert "Palmares" in aviso
    assert "PARAÍBA" in aviso and "PERNAMBUCO" in aviso


def test_regra_ultimo_municipio_exemplo_recife_pe():
    valor, aviso = identificar_estado_destino("Recife - PE")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_regra_ultimo_municipio_exemplo_joao_pessoa_pb():
    valor, aviso = identificar_estado_destino("João Pessoa - PB")
    assert valor == "PARAÍBA"
    assert aviso is None


def test_regra_ultimo_municipio_nao_e_tratada_como_erro_de_extracao():
    """Estados diferentes no campo não podem virar erro de processamento —
    só um aviso de revisão, mantendo a diária como sucesso."""
    valor, aviso = identificar_estado_destino("João Pessoa - PB - Palmares - PE")
    assert valor is not None
    assert aviso is not None  # aviso existe, mas não bloqueia o preenchimento


def test_regra_ultimo_municipio_mantem_ordem_do_documento():
    """A ordem importa: invertendo a ordem das mesmas duas cidades, o
    destino final também inverte."""
    valor_a, _ = identificar_estado_destino("Palmares - PE - João Pessoa - PB")
    valor_b, _ = identificar_estado_destino("João Pessoa - PB - Palmares - PE")
    assert valor_a == "PARAÍBA"
    assert valor_b == "PERNAMBUCO"


def test_regra_ultimo_municipio_ignora_cidade_nao_reconhecida_no_meio():
    """Uma cidade não reconhecida no meio do campo não pode virar o destino
    final nem travar a resolução — o valor resolve normalmente (mesmo
    estado no início e no fim), mas ela é citada num aviso para
    transparência no relatório."""
    valor, aviso = identificar_estado_destino("Recife - PE - Cidade Inventada Xyz - Sanharó - PE")
    assert valor == "PERNAMBUCO"
    assert "Cidade Inventada Xyz" in aviso
    assert "ignorada" in aviso


def test_regra_ultimo_municipio_ultima_cidade_nao_reconhecida_usa_a_anterior_valida():
    """Se a ÚLTIMA cidade do campo não for reconhecida, o destino final cai
    para o último município que resolveu com segurança, e o aviso registra
    a cidade ignorada."""
    valor, aviso = identificar_estado_destino("Sanharó - PE - Cidade Inventada Xyz")
    assert valor == "PERNAMBUCO"
    assert "Cidade Inventada Xyz" in aviso
    assert "ignorada" in aviso


def test_regra_ultimo_municipio_fernando_de_noronha_continua_bloqueando_combinacao():
    """A regra de Fernando de Noronha (nunca tratado como Pernambuco) é uma
    regra já validada e não muda com este ajuste — continua bloqueando o
    preenchimento quando combinado com outra cidade, em vez de usar a
    última."""
    valor, aviso = identificar_estado_destino("Recife - PE - Fernando de Noronha")
    assert valor is None
    assert "Fernando de Noronha" in aviso


# --- Desempate contextual (homologação: SEI 19.20.0001.0000112/2025-12) --------


def test_contexto_desempata_bonito_pela_cidade_de_origem():
    """Caso real da homologação: CIDADE ORIGEM = 'Recife', CIDADE(S)
    DESTINO = 'Bonito'. 'Bonito' sozinho é ambíguo entre 4 estados, mas
    Recife é inequivocamente pernambucana — o contexto desempata para
    Pernambuco, e o aviso registra que a desambiguação aconteceu."""
    valor, aviso = identificar_estado_destino("Bonito", cidade_origem="Recife")
    assert valor == "PERNAMBUCO"
    assert "Desambiguação por contexto" in aviso
    assert "Bonito" in aviso


def test_contexto_nao_desempata_quando_origem_nao_e_informada():
    """Sem `cidade_origem`, o comportamento é idêntico ao de antes desta
    regra — 'Bonito' sozinho continua ambíguo."""
    valor, aviso = identificar_estado_destino("Bonito")
    assert valor is None
    assert "mais de um estado" in aviso


def test_contexto_nao_desempata_quando_origem_tambem_e_ambigua():
    """Se a própria cidade de origem for ambígua (existe em mais de um
    estado), ela não pode servir de contexto — não dá para usar uma
    incerteza para resolver outra."""
    valor, aviso = identificar_estado_destino("Bonito", cidade_origem="Bonito")
    assert valor is None
    assert "mais de um estado" in aviso


def test_contexto_nao_desempata_quando_estado_da_origem_nao_e_candidato():
    """Se o estado da origem não estiver entre os candidatos da cidade
    ambígua, o contexto não força uma resposta errada — continua ambíguo.
    'Acar' é ambíguo entre Rio Grande do Norte e Pará; origem em Pernambuco
    não está nessa lista."""
    valor, aviso = identificar_estado_destino("Acar", cidade_origem="Recife")
    assert valor is None
    assert "mais de um estado" in aviso


def test_contexto_nunca_escolhe_entre_dois_candidatos_restantes():
    """'Bonito' é ambíguo entre BAHIA, MATO GROSSO DO SUL, PARÁ e
    PERNAMBUCO. Se o contexto da própria diária tiver cidades de DOIS
    desses estados ao mesmo tempo (Palmares/PE e Salvador/BAHIA), a
    interseção fica com 2 candidatos, não 1 — o sistema não escolhe entre
    eles. 'Bonito' continua ignorado/ambíguo (não aparece como
    'desambiguado por contexto'); o resultado final vem das outras cidades
    do campo, que são válidas por si só (regra do último município)."""
    valor, aviso = identificar_estado_destino("Palmares - Salvador - Bonito")
    assert valor == "BAHIA"  # último município válido é "Salvador", não "Bonito"
    assert "Desambiguação por contexto" not in aviso
    assert "Bonito" in aviso
    assert "ignorada" in aviso


def test_contexto_usa_outras_cidades_do_proprio_campo_destino_alem_da_origem():
    """O contexto não vem só da origem — cidades já resolvidas dentro do
    próprio campo de destino também contam, na ordem em que aparecem."""
    valor, aviso = identificar_estado_destino("Palmares - Bonito")
    assert valor == "PERNAMBUCO"
    assert "Desambiguação por contexto" in aviso


def test_contexto_desempate_conta_como_municipio_valido_para_ordem_final():
    """Uma cidade desambiguada por contexto passa a valer como 'município
    válido' para a regra do último município — se ela for a última do
    campo, o resultado final é o dela."""
    valor, aviso = identificar_estado_destino("Palmares - PE - Bonito", cidade_origem="Recife")
    assert valor == "PERNAMBUCO"  # Bonito, desambiguado, é o último válido
    assert "Desambiguação por contexto" in aviso


# --- Sprint 04.2 — Caso 4: prefixo institucional "PJ"/"Procuradoria/Promotoria
# de Justiça" antes do nome do município -----------------------------------


def test_pj_seguido_do_municipio_sem_conector():
    """'PJ' é a abreviação do órgão para Procuradoria/Promotoria de Justiça
    — nunca faz parte do nome de um município."""
    valor, aviso = identificar_estado_destino("PJ Palmares")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_pj_seguido_de_de_e_o_municipio():
    valor, aviso = identificar_estado_destino("PJ de Garanhuns")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_procuradoria_de_justica_por_extenso():
    valor, aviso = identificar_estado_destino("Procuradoria de Justiça de Serra Talhada")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_promotoria_de_justica_por_extenso():
    """'Promotoria de Justiça' (não só 'Procuradoria') é a grafia usada nos
    processos reais — a regra cobre as duas."""
    valor, aviso = identificar_estado_destino("Promotoria de Justiça de Limoeiro")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_pj_regra_generica_nao_limitada_a_bom_jardim_ou_palmares():
    """A regra vale para qualquer município do país, não só os vistos nos
    processos de referência."""
    valor, aviso = identificar_estado_destino("PJ Petrolina")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_pj_cidade_ambigua_ainda_resolve_por_contexto_da_origem():
    """Processo fictício 19.20.0001.0000109/2026-09: 'PJ Bom Jardim' como
    destino, 'São José do Egito' como origem. 'Bom Jardim' sozinho é
    ambíguo (existe em PE, MA e RJ) — removido o prefixo 'PJ', a
    desambiguação por contexto (já homologada) resolve normalmente para
    PERNAMBUCO, a mesma UF da origem."""
    valor, aviso = identificar_estado_destino("PJ Bom Jardim", cidade_origem="São José do Egito")
    assert valor == "PERNAMBUCO"
    assert "Desambiguação por contexto" in aviso


def test_pj_sem_remover_prefixo_ficaria_nao_reconhecida_regressao_do_bug():
    """Confirma a causa raiz do Caso 4: sem a remoção do prefixo, 'PJ
    Palmares' não bate com nenhum município da base (o 'PJ ' extra quebra
    tanto a busca exata quanto a aproximada, já que a diferença de tamanho
    excede a tolerância da correspondência aproximada)."""
    valor, aviso = identificar_estado_destino("PJ Xyzabcinexistente")
    assert valor is None
    assert "não reconhecida" in aviso


# --- Correção de 2026-08-05 (Programa de Validação Evolutiva) — "Promotoria"/
# "Procuradoria" sem o complemento "de Justiça" ----------------------------


def test_promotoria_sem_de_justica_seguida_do_municipio():
    """Processo real SEI 19.20.0001.0014871/2026-40: 'CIDADE(S) DESTINO:
    PROMOTORIA PALMARES' — mesmo padrão de 'PJ Palmares' (Caso 4), só que
    escrito por extenso e sem o complemento 'de Justiça'."""
    valor, aviso = identificar_estado_destino("PROMOTORIA PALMARES")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_procuradoria_sem_de_justica_seguida_do_municipio():
    valor, aviso = identificar_estado_destino("PROCURADORIA GARANHUNS")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_promotoria_sem_de_justica_com_conector_de():
    valor, aviso = identificar_estado_destino("Promotoria de Garanhuns")
    assert valor == "PERNAMBUCO"
    assert aviso is None


def test_promotoria_de_justica_por_extenso_continua_funcionando_apos_a_correcao():
    """Regressão: a forma completa 'Promotoria de Justiça de <cidade>'
    (já homologada) precisa continuar reconhecida depois de 'DE JUSTIÇA'
    virar opcional."""
    valor, aviso = identificar_estado_destino("Promotoria de Justiça de Limoeiro")
    assert valor == "PERNAMBUCO"
    assert aviso is None


# --- Programa Permanente de QA Evolutivo (2026-08-06) — sufixo de UF
# vazando para o TRECHO exibido na planilha --------------------------------


def test_remover_sufixo_uf_remove_uf_valida():
    """Processo real SEI 19.20.0001.0001165/2026-47: 'CIDADE(S) DESTINO:
    Santa Filomena/PE' — usado tal como veio do PDF para resolver a coluna Q
    (o sufixo desambigua), mas vazava para o TRECHO (coluna J), onde nenhuma
    das quase 1900 linhas já existentes na planilha oficial usa esse
    formato."""
    assert remover_sufixo_uf("Santa Filomena/PE") == "Santa Filomena"


def test_remover_sufixo_uf_preserva_nome_sem_sufixo():
    assert remover_sufixo_uf("Recife") == "Recife"


def test_remover_sufixo_uf_nao_remove_sufixo_que_nao_e_uf_valida():
    """Só remove quando as duas letras finais são mesmo uma UF brasileira —
    nunca 'adivinha' que qualquer coisa depois de '/' é descartável."""
    assert remover_sufixo_uf("Cidade/XX") == "Cidade/XX"


def test_remover_sufixo_uf_preserva_none():
    assert remover_sufixo_uf(None) is None
