import difflib
import json
import os
import re
from functools import lru_cache

from app.extraction.enriquecimento._texto import normalizar

_CAMINHO_DADOS = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "dados", "municipios.json"
)

# Correspondência aproximada só entra quando a busca exata falha, e só aceita
# o resultado quando há confiança alta e sem ambiguidade de estado (ver
# `_estados_candidatos_do_municipio`). 0.86 foi calibrado nos testes reais
# desta Sprint: pega erros de digitação de 1 caractere
# (Petrolna->Petrolina, 0.94; Garanhus->Garanhuns, 0.94; Cabo de Santo
# Augustinho->Agostinho, 0.94; Natl->Natal, 0.89) e ao mesmo tempo rejeita
# coincidências de município diferente (Petrolna->Pérola/PR, 0.86 exatos —
# abaixo do corte).
_LIMIAR_CORRESPONDENCIA_APROXIMADA = 0.86
_TOLERANCIA_TAMANHO = 2


def _carregar_base() -> dict:
    with open(_CAMINHO_DADOS, encoding="utf-8") as arquivo:
        return json.load(arquivo)


_BASE = _carregar_base()

_UF_POR_SIGLA = {sigla: estado for sigla, estado in _BASE["uf_para_estado"].items()}
_SIGLAS_VALIDAS = set(_UF_POR_SIGLA.keys())
_ESTADOS_VALIDOS = set(_UF_POR_SIGLA.values())

_ALIASES_FERNANDO_DE_NORONHA = {
    normalizar(nome) for nome in _BASE["fernando_de_noronha_aliases"]
}

# Município normalizado -> conjunto de estados onde existe um município com
# esse nome. A maioria mapeia para um único estado, mas 241 nomes (ex.:
# "Bonito") existem em mais de um estado do Brasil — por isso o valor é um
# conjunto, não uma string: tratar isso como estado único (o que a versão
# anterior desta base fazia, por acidente, enquanto os outros estados só
# tinham a capital) seria "adivinhar" exatamente o que a regra de negócio
# proíbe.
_MUNICIPIO_PARA_ESTADOS: dict[str, set[str]] = {}
for _estado, _municipios in _BASE["municipios_por_estado"].items():
    for _municipio in _municipios:
        _MUNICIPIO_PARA_ESTADOS.setdefault(normalizar(_municipio), set()).add(_estado)

# Lista plana dos nomes normalizados, para a busca aproximada.
_CANDIDATOS_NORMALIZADOS = sorted(_MUNICIPIO_PARA_ESTADOS.keys())

# Separadores "fortes" — nunca fazem parte de um nome de município, então
# viram hífen (o separador final único) sem risco de cortar um nome ao meio.
# Parênteses também: "Recife (PE)" -> "Recife - PE ".
_PARENTESES = re.compile(r"\(([^)]*)\)")
_SEPARADORES_FORTES = re.compile(r"[;,\n\r/→]")  # ; , quebra de linha / →

# Separadores "fracos" — só valem como separador quando aparecem como palavra
# isolada ('e', 'x'), porque também podem fazer parte do nome do município
# (ex.: "Abreu e Lima", um município real de Pernambuco).
_SEPARADOR_PALAVRA = re.compile(r"\s+(?:e|x)\s+", re.IGNORECASE)

# Sprint 04.2 (Caso 4) — prefixo institucional que às vezes acompanha o nome
# do município no campo "CIDADE(S) DESTINO/ORIGEM" (ex.: "PJ Bom Jardim",
# "PJ de Garanhuns", "Promotoria de Justiça de Limoeiro"). "PJ" é a
# abreviação usada no órgão tanto para "Procuradoria de Justiça" quanto para
# "Promotoria de Justiça" — nenhuma das duas é, nem nunca será, parte do
# nome de um município brasileiro, então a remoção é sempre segura,
# independente de qual cidade venha depois. O conector "de" entre o prefixo
# e o nome do município é opcional ("PJ Palmares" e "PJ de Garanhuns" são
# igualmente comuns nos processos reais).
#
# Correção de 2026-08-05 (Programa de Validação Evolutiva, caso real SEI
# 19.20.0001.0014871/2026-40): "Promotoria"/"Procuradoria" também aparecem
# SEM o complemento "de Justiça" (ex.: "PROMOTORIA PALMARES") — mesma forma
# abreviada de "PJ", só que por extenso. "DE JUSTIÇA" vira opcional depois
# do nome do órgão, nunca deixando de reconhecer a forma completa já
# homologada.
_PREFIXO_INSTITUCIONAL = re.compile(
    r"^\s*(?:PJ|PROCURADORIA(?:\s+DE\s+JUSTI[ÇC]A)?|PROMOTORIA(?:\s+DE\s+JUSTI[ÇC]A)?)(?:\s+DE)?\s+",
    re.IGNORECASE,
)


def _remover_prefixo_institucional(chunk: str) -> str:
    """Remove um prefixo institucional (ver `_PREFIXO_INSTITUCIONAL`) do
    início do texto de uma cidade, antes de qualquer tentativa de resolvê-la
    contra a base de municípios — aplicado sempre, para qualquer município do
    país, não só os já vistos em processos reais. Se a remoção esvaziasse o
    texto por completo (chunk era só o prefixo, sem nome de cidade depois),
    devolve o chunk original em vez de uma string vazia."""
    sem_prefixo = _PREFIXO_INSTITUCIONAL.sub("", chunk, count=1)
    return sem_prefixo if sem_prefixo.strip() else chunk


# Programa Permanente de QA Evolutivo (2026-08-06) — caso real SEI
# 19.20.0001.0001165/2026-47: "CIDADE(S) DESTINO:" trouxe "Santa Filomena/PE"
# — a UF já é tratada como separador forte por `_associar_cidades_e_uf` (usada
# para resolver a coluna Q), mas o TRECHO (coluna J) grava `cidade_destino`
# tal como veio do PDF, sem passar por essa resolução — nas quase 1900 linhas
# já existentes na planilha oficial, TRECHO nunca traz um sufixo de UF. Esta
# função só cuida da apresentação em TRECHO (nunca é chamada antes da
# resolução de estado/regra de transporte, que continuam recebendo o campo
# bruto, sufixo incluído — é exatamente esse sufixo que as desambigua).
_SUFIXO_UF = re.compile(r"^(.*\S)\s*/\s*([A-Za-zÀ-ú]{2})$")


def remover_sufixo_uf(cidade: str | None) -> str | None:
    """Remove um sufixo '/UF' final (ex.: 'Santa Filomena/PE' -> 'Santa
    Filomena') quando a sigla é uma UF brasileira válida — só para exibição
    (TRECHO); nunca usada antes da resolução de estado/cidade, que depende do
    sufixo original para desambiguar."""
    if not cidade:
        return cidade
    correspondencia = _SUFIXO_UF.match(cidade.strip())
    if not correspondencia:
        return cidade
    nome, sigla = correspondencia.groups()
    if normalizar(sigla) in _SIGLAS_VALIDAS:
        return nome.strip()
    return cidade


def _dividir_em_chunks_fortes(cidade_destino: str) -> list[str]:
    texto = _PARENTESES.sub(lambda m: f" - {m.group(1)} ", cidade_destino)
    texto = _SEPARADORES_FORTES.sub("-", texto)
    return [chunk.strip(" .") for chunk in texto.split("-") if chunk.strip(" .")]


def _e_token_de_uf_ou_estado(chunk_normalizado: str) -> bool:
    return chunk_normalizado in _SIGLAS_VALIDAS or chunk_normalizado in _ESTADOS_VALIDOS


def _resolver_estado_do_token_uf(chunk_normalizado: str) -> str:
    if chunk_normalizado in _SIGLAS_VALIDAS:
        return _UF_POR_SIGLA[chunk_normalizado]
    return chunk_normalizado


def _expandir_chunk_em_cidades(chunk: str) -> list[str]:
    """Um chunk pode conter mais de uma cidade separada por 'e'/'x', mas só
    tenta separar quando o chunk inteiro não bate como um único município já
    reconhecido — isso protege nomes como 'Abreu e Lima' (município real de
    Pernambuco que tem a palavra 'e' no meio) de serem cortados ao meio."""
    if _estados_candidatos_do_municipio(chunk):
        return [chunk]
    partes = [parte.strip(" .") for parte in _SEPARADOR_PALAVRA.split(chunk) if parte.strip(" .")]
    return partes if len(partes) > 1 else [chunk]


def _tokenizar(cidade_destino: str) -> list[str]:
    tokens: list[str] = []
    for chunk_bruto in _dividir_em_chunks_fortes(cidade_destino):
        chunk = _remover_prefixo_institucional(chunk_bruto)
        chunk_normalizado = normalizar(chunk)
        if chunk_normalizado in _SIGLAS_VALIDAS:
            # Sigla de 2 letras nunca é nome de município — sempre marcador
            # de UF, então nem passa pela checagem de "é uma cidade".
            tokens.append(chunk)
        else:
            # Nomes de estado (ex.: "Pernambuco", "Rio de Janeiro") também
            # podem ser o nome de um município (a própria capital) — por
            # isso passam pela expansão normal, que primeiro tenta
            # reconhecer o chunk inteiro como cidade.
            tokens.extend(_expandir_chunk_em_cidades(chunk))
    return tokens


def _associar_cidades_e_uf(cidade_destino: str) -> list[tuple[str, str | None]]:
    """Percorre os tokens em ordem e associa cada cidade à UF/estado que vier
    logo em seguida, se houver — cobre tanto 'Recife - PE' (um par) quanto
    'Recife - PE - Sanharó - PE' (dois pares intercalados).

    Um nome de estado só é tratado como qualificador da cidade anterior
    quando não contradiz o que já se sabe sobre ela: em 'Recife - Rio de
    Janeiro', Recife já resolve, sozinho, para Pernambuco — então 'Rio de
    Janeiro' não pode ser um qualificador de UF para Recife, e é tratado
    como uma segunda cidade (que por sinal também é nome de um estado)."""
    tokens = _tokenizar(cidade_destino)
    pares: list[tuple[str, str | None]] = []
    indice = 0
    while indice < len(tokens):
        token = tokens[indice]
        token_normalizado = normalizar(token)

        if token_normalizado in _SIGLAS_VALIDAS:
            # UF solta sem cidade correspondente antes — não deveria ocorrer
            # em uso normal do campo, ignorada com segurança.
            indice += 1
            continue

        uf_token: str | None = None
        if indice + 1 < len(tokens):
            proximo_normalizado = normalizar(tokens[indice + 1])
            if _e_token_de_uf_ou_estado(proximo_normalizado):
                estado_proposto = _resolver_estado_do_token_uf(proximo_normalizado)
                candidatos_cidade = _estados_candidatos_do_municipio(token)
                sem_contradicao = not candidatos_cidade or estado_proposto in candidatos_cidade
                if sem_contradicao:
                    uf_token = proximo_normalizado
                    indice += 1

        pares.append((token, uf_token))
        indice += 1

    return pares


@lru_cache(maxsize=4096)
def _estados_candidatos_do_municipio(cidade: str) -> frozenset[str]:
    """Devolve o conjunto de estados compatíveis com o nome da cidade —
    vazio se não reconhecida, com 1 elemento se resolvida com segurança, com
    mais de 1 se o nome for ambíguo (existe em mais de um estado, ou a
    correspondência aproximada bateu com municípios de estados diferentes).
    A busca aproximada só é tentada quando a busca exata não encontra nada.

    Cacheada porque o mesmo nome de cidade agora é consultado mais de uma
    vez por chamada (uma vez ao tokenizar, outra ao resolver o estado final,
    e possivelmente mais ao checar se um nome de estado é qualificador
    válido) — sem cache, isso dobraria o custo da busca aproximada, que é a
    parte mais cara.

    Sprint 04.1: quando a busca direta (exata + aproximada) falha por
    completo, tenta de novo depois de expandir uma abreviação administrativa
    comum no início do nome ('Sta'/'Sto'/'Stº'/'Stª'/'S.' -> 'Santa'/'Santo'/
    'São') — ver `_expandir_abreviacoes_de_municipio`. Isso nunca muda o
    resultado de um nome que já resolve sozinho: só é tentado depois que a
    busca direta devolve vazio."""
    cidade_normalizada = normalizar(cidade)

    estados = _resolver_exato_e_aproximado(cidade_normalizada)
    if estados:
        return estados

    estados_por_abreviacao: set[str] = set()
    for variante in _expandir_abreviacoes_de_municipio(cidade_normalizada):
        estados_por_abreviacao |= _resolver_exato_e_aproximado(variante)
    return frozenset(estados_por_abreviacao)


def _resolver_exato_e_aproximado(cidade_normalizada: str) -> frozenset[str]:
    """Núcleo de busca (exata, depois aproximada) já usado por
    `_estados_candidatos_do_municipio` antes desta Sprint — extraído para
    poder ser aplicado tanto ao nome original quanto às variantes expandidas
    de abreviação, sem duplicar a lógica de correspondência aproximada."""
    estados_exatos = _MUNICIPIO_PARA_ESTADOS.get(cidade_normalizada)
    if estados_exatos:
        return frozenset(estados_exatos)

    candidatos_proximos = difflib.get_close_matches(
        cidade_normalizada,
        _candidatos_por_tamanho(cidade_normalizada),
        n=4,
        cutoff=_LIMIAR_CORRESPONDENCIA_APROXIMADA,
    )
    estados_aproximados: set[str] = set()
    for candidato in candidatos_proximos:
        estados_aproximados |= _MUNICIPIO_PARA_ESTADOS[candidato]
    return frozenset(estados_aproximados)


# Abreviações administrativas comuns em documentos do órgão, sempre no
# início do nome do município. 'Stº'/'Stª' já chegam aqui como 'STO'/'STA'
# (o indicador ordinal º/ª é removido por `normalizar`, que descompõe
# unicode e remove marcas combinantes — mesmo tratamento de acento já usado
# em todo o módulo). 'S.' é a única ambígua (São ou Santo): gera as duas
# variantes, e só resolve quando exatamente uma delas encontra um município
# real — a outra continua vazia. Isso beneficia qualquer município
# brasileiro com esse prefixo, não um caso específico.
_ABREVIACOES_PREFIXO_MUNICIPIO: dict[str, tuple[str, ...]] = {
    "STA": ("SANTA",),
    "STO": ("SANTO",),
    "S": ("SAO", "SANTO"),
}


def _expandir_abreviacoes_de_municipio(cidade_normalizada: str) -> list[str]:
    """Gera as variantes de `cidade_normalizada` com a abreviação do
    primeiro nome expandida por extenso. Devolve lista vazia quando a
    primeira palavra não é uma abreviação reconhecida — nomes de município
    comuns nunca são afetados."""
    primeira, _, resto = cidade_normalizada.partition(" ")
    expansoes = _ABREVIACOES_PREFIXO_MUNICIPIO.get(primeira.rstrip("."))
    if not expansoes:
        return []
    return [f"{expansao} {resto}".strip() for expansao in expansoes]


def _candidatos_por_tamanho(alvo: str) -> list[str]:
    """Restringe a busca aproximada a candidatos de tamanho parecido —
    erros de digitação comuns (letra trocada, faltando ou sobrando) quase
    nunca mudam o tamanho da palavra em mais de 1-2 caracteres. Isso deixa a
    busca bem mais rápida sem perder os casos reais de typo."""
    return [
        candidato
        for candidato in _CANDIDATOS_NORMALIZADOS
        if abs(len(candidato) - len(alvo)) <= _TOLERANCIA_TAMANHO
    ]


def _estado_de_contexto(texto: str | None) -> str | None:
    """Resolve uma string de localização (tipicamente CIDADE ORIGEM) para um
    único estado confiável, para servir de contexto de desempate. Só devolve
    um estado quando há consenso — nunca usa uma origem ela mesma ambígua ou
    com cidades de estados diferentes como contexto, para não propagar uma
    incerteza sobre a outra."""
    if not texto or not texto.strip():
        return None

    estados: set[str] = set()
    for cidade, uf_token in _associar_cidades_e_uf(texto):
        if uf_token:
            estados.add(_resolver_estado_do_token_uf(uf_token))
            continue
        candidatos = _estados_candidatos_do_municipio(cidade)
        if len(candidatos) == 1:
            estados.add(next(iter(candidatos)))

    return next(iter(estados)) if len(estados) == 1 else None


def identificar_estado_destino(
    cidade_destino: str | None, cidade_origem: str | None = None
) -> tuple[str | None, str | None]:
    """Identifica o estado (coluna Q) a partir do campo 'CIDADE(S) DESTINO:'.

    O campo pode trazer mais de uma cidade, separadas de formas bem
    diferentes ('-', '/', ';', ',', quebra de linha, 'e', 'x', '→',
    parênteses), e cada cidade pode vir com sua própria UF ou nome de estado
    logo em seguida ('Recife - PE - Sanharó - PE'). Regras, nesta ordem:
    1. Fernando de Noronha nunca é tratado como Pernambuco, mesmo que venha
       com sufixo '/PE' — essa regra continua bloqueando o preenchimento
       quando combinada com outra cidade, sem exceção.
    2. Cada cidade é resolvida individualmente, na ordem em que aparece no
       documento: se ela trouxer UF/estado explícito logo depois, essa
       informação tem prioridade — inclusive para desempatar nomes ambíguos
       na base nacional ('Bonito - PE'). Sem UF explícita, a cidade é
       procurada na base local (exata, depois aproximada, para tolerar erro
       de digitação).
    3. Desempate contextual: uma cidade que continue ambígua (nome existe em
       mais de um estado) é resolvida se, e somente se, exatamente um dos
       seus estados candidatos coincidir com o contexto da mesma diária —
       as demais cidades já resolvidas no próprio campo de destino, mais a
       CIDADE ORIGEM (quando ela mesma resolve, sem ambiguidade, para um
       único estado). Se o contexto não achar exatamente um candidato em
       comum, a cidade continua ambígua e é ignorada, como antes — o
       sistema nunca escolhe entre 2 ou mais candidatos restantes.
    4. Regra operacional do órgão: uma diária representa uma viagem com um
       destino final, não uma lista de paradas de mesmo peso. Por isso, o
       ESTADO DO ÚLTIMO MUNICÍPIO VÁLIDO identificado no campo (na ordem do
       documento, já considerando o desempate contextual) é o que preenche
       a coluna Q — mesmo quando outras cidades do campo são de estados
       diferentes. Isso não é tratado como erro de extração; é só
       registrado num aviso para revisão, sem bloquear o preenchimento.
    Só fica vazio quando NENHUMA cidade do campo pôde ser identificada com
    segurança (nem diretamente, nem por contexto), ou no caso de Fernando de
    Noronha combinado com outra cidade."""
    _, estado_final, aviso = _resolver_municipio_e_estado_destino(cidade_destino, cidade_origem)
    return estado_final, aviso


def identificar_municipio_final_destino(
    cidade_destino: str | None, cidade_origem: str | None = None
) -> tuple[str | None, str | None]:
    """Mesma resolução usada para a coluna Q (`identificar_estado_destino`),
    mas devolvendo o nome do último município válido do campo de destino em
    vez do estado. Usada pela regra operacional de transporte (Sprint
    04.1), que precisa saber especificamente se o município final é
    Petrolina — não só o estado."""
    cidade_final, _, aviso = _resolver_municipio_e_estado_destino(cidade_destino, cidade_origem)
    return cidade_final, aviso


def _resolver_municipio_e_estado_destino(
    cidade_destino: str | None, cidade_origem: str | None = None
) -> tuple[str | None, str | None, str | None]:
    """Núcleo de resolução compartilhado por `identificar_estado_destino` e
    `identificar_municipio_final_destino` — mesmo código, devolvendo tanto o
    município quanto o estado finais, para nenhuma das duas funções precisar
    duplicar a lógica (nem repetir o trabalho caro da correspondência
    aproximada, que já é cacheada por cidade)."""
    if not cidade_destino or not cidade_destino.strip():
        return (
            None,
            None,
            "Cidade de destino não informada — não foi possível identificar o estado.",
        )

    pares = _associar_cidades_e_uf(cidade_destino)
    if not pares:
        return (
            None,
            None,
            "Não foi possível identificar a cidade de destino — necessita revisão manual.",
        )

    tem_fernando_de_noronha = any(
        normalizar(cidade) in _ALIASES_FERNANDO_DE_NORONHA for cidade, _ in pares
    )
    if tem_fernando_de_noronha:
        if len(pares) == 1:
            return "FERNANDO DE NORONHA", "FERNANDO DE NORONHA", None
        return (
            None,
            None,
            "Destino combina Fernando de Noronha com outra(s) cidade(s) — necessita revisão manual.",
        )

    # Resolve cada cidade guardando sua posição no documento. Só entram em
    # `validas` as que resolveram, sem ambiguidade, para um único estado.
    validas: list[tuple[int, str, str]] = []
    nao_encontradas: list[str] = []
    ambiguas: list[tuple[int, str, frozenset[str]]] = []

    for indice, (cidade, uf_token) in enumerate(pares):
        if uf_token:
            validas.append((indice, cidade, _resolver_estado_do_token_uf(uf_token)))
            continue

        candidatos = _estados_candidatos_do_municipio(cidade)
        if len(candidatos) == 1:
            validas.append((indice, cidade, next(iter(candidatos))))
        elif len(candidatos) == 0:
            nao_encontradas.append(cidade)
        else:
            ambiguas.append((indice, cidade, candidatos))

    # Desempate contextual: as cidades já resolvidas no próprio campo, mais
    # a cidade de origem (se ela mesma for inequívoca), formam o contexto.
    contexto = {estado for _, _, estado in validas}
    estado_origem = _estado_de_contexto(cidade_origem)
    if estado_origem:
        contexto.add(estado_origem)

    ainda_ambiguas: list[tuple[str, frozenset[str]]] = []
    resolvidas_por_contexto: list[tuple[str, str, frozenset[str]]] = []
    for indice, cidade, candidatos in ambiguas:
        interseccao = candidatos & contexto
        if len(interseccao) == 1:
            estado_escolhido = next(iter(interseccao))
            validas.append((indice, cidade, estado_escolhido))
            resolvidas_por_contexto.append((cidade, estado_escolhido, candidatos))
        else:
            ainda_ambiguas.append((cidade, candidatos))

    if not validas:
        detalhes: list[str] = []
        if nao_encontradas:
            detalhes.append(f"não reconhecida(s) na base local: {', '.join(nao_encontradas)}")
        if ainda_ambiguas:
            detalhes.append(
                "; ".join(
                    f"'{cidade}' existe em mais de um estado ({', '.join(sorted(estados))})"
                    for cidade, estados in ainda_ambiguas
                )
            )
        return (
            None,
            None,
            f"Cidade(s) de destino {' | '.join(detalhes)} — necessita revisão manual.",
        )

    validas.sort(key=lambda item: item[0])  # ordem do documento
    _, cidade_final, estado_final = validas[-1]
    estados_distintos = {estado for _, _, estado in validas}

    avisos: list[str] = []
    if resolvidas_por_contexto:
        avisos.append(
            "Desambiguação por contexto da diária: "
            + "; ".join(
                f"'{cidade}' era ambígua entre {', '.join(sorted(candidatos))}, considerada "
                f"{estado_escolhido} pelo contexto (cidade de origem e/ou demais destinos da "
                "mesma diária)"
                for cidade, estado_escolhido, candidatos in resolvidas_por_contexto
            )
            + "."
        )
    if len(estados_distintos) > 1:
        avisos.append(
            f"Destino com cidades de mais de um estado ({', '.join(sorted(estados_distintos))}); "
            f"considerado o último município válido do campo, '{cidade_final}' ({estado_final}), "
            "conforme regra operacional do órgão."
        )
    nao_identificadas = nao_encontradas + [cidade for cidade, _ in ainda_ambiguas]
    if nao_identificadas:
        avisos.append(
            f"Cidade(s) do campo de destino não reconhecida(s) na base local, ignorada(s) na "
            f"escolha do destino final: {', '.join(nao_identificadas)}."
        )

    return cidade_final, estado_final, " ".join(avisos) if avisos else None
