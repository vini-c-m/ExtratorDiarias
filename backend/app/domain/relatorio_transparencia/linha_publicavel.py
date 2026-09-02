"""Micro-sprint corretiva HOMO-RT-05 — funções puras que decidem o VALOR
EFETIVAMENTE PUBLICÁVEL de campos derivados de mais de uma fonte (Nome via
NOME/CREDOR, Cargo/Transporte via Controle DIMCAC com fallback para a Base
OB). Extraídas de `app/planilha/escritor_relatorio_transparencia.py`
(único lugar que antes as definia) para serem reutilizadas também por
`app/domain/relatorio_transparencia/decisao.py` — nunca duas
implementações paralelas da mesma regra.

Por que isto precisou de um módulo próprio (nunca `decisao.py` importando
direto de `escritor_relatorio_transparencia.py`, nem o inverso): `decisao.py`
é domínio puro; `escritor_relatorio_transparencia.py` é infraestrutura de
planilha e JÁ importa `decisao.ResultadoRevisado` — se `decisao.py`
importasse de volta o escritor para reaproveitar estas funções, seria um
import circular. Este módulo fica só com as duas funções puras (sem
nenhuma dependência de openpyxl/planilha), importável por ambos sem ciclo.

Confronto QA Codex / HOMO-RT-05 (achado real e BLOQUEANTE, motivo desta
extração): a identidade/fingerprint de uma ocorrência (`decisao.py`)
cobria só `CAMPOS_EVIDENCIA_MATERIAL` — campos de ENTRADA de
`OrdemBancaria`. O Nome efetivamente publicado no XLSX depende de
`OrdemBancaria.nome` **e** `.credor` (`nome_publicado` abaixo); Cargo/
Transporte efetivamente publicados dependem de `RegistroControle` (com
precedência sobre a Base OB, `valor_do_controle_com_fallback` abaixo) —
nenhum dos dois nunca era considerado pela identidade/fingerprint. Duas
ocorrências podiam ser tratadas como a MESMA (mesmo hash) e ainda assim
produzir uma linha diferente no relatório final. `decisao.py` agora
reutiliza estas MESMAS funções (nunca uma cópia) para incluir o valor
EFETIVO na identidade/fingerprint — ver `decisao._campos_linha_publicavel`.

Sprint 3 (HOMO-RT-06, plano "Valor da Passagem no XLSX Oficial") — mesmo
padrão, agora para `valor_passagem_publicavel`: o Valor da Passagem
(cruzamento exato por OB com a Planilha de Passagens, Sprint 1/2) passa a
integrar a linha efetivamente publicável e, por isso, a identidade/
fingerprint — reaproveitando exatamente este módulo, nunca uma função nova
em outro lugar."""

from dataclasses import dataclass

from app.domain.entities.linha_passagem import EstadoPassagem, LinhaPassagem
from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.entities.registro_controle import RegistroControle

__all__ = [
    "nome_publicado",
    "valor_do_controle_com_fallback",
    "ValorPassagemPublicavel",
    "valor_passagem_publicavel",
]


def valor_do_controle_com_fallback(
    registros_controle: list[RegistroControle],
    atributo: str,
    valor_base_ob: str | None,
) -> str | None:
    """Micro-sprint 3G.1 — precedência confirmada pelo negócio (matriz de
    origem): Cargo e Transporte vêm PRIMEIRO do Controle DIMCAC
    (`registros_controle`); a Base OB (`OrdemBancaria`) é só fallback
    quando o Controle não tiver o dado. Mesma filosofia de conflito de
    `resolver_quantidade_diarias`: quando há mais de um `RegistroControle`
    (repetição física do DH) e eles DIVERGEM entre si nesse atributo, não
    há um valor único e confiável do Controle — trata como "ausente no
    Controle" e cai no fallback, nunca escolhe um dos dois à toa. Nunca
    inventa um valor quando as duas fontes estão vazias."""
    valores_controle = {getattr(r, atributo) for r in registros_controle if getattr(r, atributo)}
    if len(valores_controle) == 1:
        return valores_controle.pop()
    return valor_base_ob


def nome_publicado(ordem: OrdemBancaria) -> str | None:
    """Micro-sprint corretiva NOME×CREDOR — decisão de negócio aprovada
    após investigação read-only dedicada (ver relatório da investigação):
    `nome` (Base OB.NOME) continua a fonte PRIMÁRIA; só cai para
    `credor` (Base OB.CREDOR) quando houver relação de truncamento/prefixo
    COMPROVADA — nunca por `nome` ter 30 caracteres, nunca só por serem
    diferentes. Detecção deliberadamente conservadora: só remove espaços
    externos (necessário para reconhecer continuação com segurança sem
    depender de como a fonte formatou o campo); NENHUMA normalização de
    acento/caixa, NENHUM fuzzy matching, NENHUMA tentativa de decidir qual
    grafia é "correta" — isso trataria uma simples divergência de nome
    (ex.: "LUIS"/"LUIZ", acento diferente) como se fosse truncamento, o
    que a investigação explicitamente definiu como fora do escopo desta
    regra. Na dúvida (relação de prefixo não comprovada), mantém `nome` —
    o mesmo comportamento de sempre."""
    nome = ordem.nome
    credor = ordem.credor
    if not isinstance(nome, str) or not isinstance(credor, str):
        return nome
    nome_stripped = nome.strip()
    credor_stripped = credor.strip()
    if not nome_stripped:
        return nome
    if len(credor_stripped) > len(nome_stripped) and credor_stripped.startswith(nome_stripped):
        return credor_stripped
    return nome


@dataclass(frozen=True)
class ValorPassagemPublicavel:
    """Sprint 3 (HOMO-RT-06) — representação canônica e ÚNICA do Valor da
    Passagem efetivamente publicável, usada tanto pelo fingerprint/
    identidade (`decisao._campos_linha_publicavel`) quanto pelo escritor do
    XLSX oficial (`escritor_relatorio_transparencia._escrever_linha_ocorrencia`).
    Nunca duas implementações: qualquer um dos dois que precisar saber "o
    que vai na coluna J" ou "o que entra no hash" chama a MESMA função,
    `valor_passagem_publicavel` abaixo — exatamente o padrão já usado por
    `nome_publicado`/`valor_do_controle_com_fallback` desde HOMO-RT-05.

    `valor`: número a publicar (estado A), ou `None` — célula vazia — para
    os estados B (ausente), C (não se aplica), D (inválido) e E (sem
    correspondência). Nunca `0` para nenhum desses quatro: ausência não é o
    mesmo que zero, e inconsistência da fonte não é o mesmo que ausência.

    `inconsistente`: `True` SOMENTE para o estado D (INVALIDO) — nunca
    inferido para nenhum outro estado. DECISÃO DE PRODUTO FINAL (fechamento
    HOMO-RT-06): D produz célula pública vazia, IGUAL a B/C/E, e NUNCA
    bloqueia a geração do relatório oficial — mas o estado INVALIDO
    permanece preservado aqui e no domínio (`OcorrenciaFinanceira.passagem.
    estado`), nunca silenciosamente reescrito para AUSENTE/NAO_SE_APLICA/
    zero. Este campo participa do fingerprint (ver `decisao.
    _campos_linha_publicavel`) precisamente para que uma decisão humana
    tomada sobre uma ocorrência com fonte "limpa" (B/C/E) não continue
    válida silenciosamente se a fonte degradar para D antes da próxima
    geração — a diferença entre "sem passagem" e "passagem inconsistente na
    fonte" é administrativamente real mesmo quando a célula pública é
    idêntica (ver `valor_passagem_publicavel` para a justificativa
    completa). Reservado também para uma futura exposição no relatório
    operacional interno (Sprint 4), que ainda não existe."""

    valor: float | None
    inconsistente: bool = False


def valor_passagem_publicavel(linha_passagem: LinhaPassagem | None) -> ValorPassagemPublicavel:
    """Sprint 3 (HOMO-RT-06) — resolve o Valor da Passagem efetivamente
    publicável a partir do resultado do cruzamento exato por OB
    (`cruzamento_passagens.py`, Sprint 2). `linha_passagem is None` é o
    estado E (OB da Base OB sem correspondente na Planilha de Passagens) —
    célula vazia, nunca um valor inventado, mesmo tratamento de B/C/D.

    Os estados B (ausente), C (não se aplica), D (inválido, ver abaixo) e E
    produzem a MESMA representação PÚBLICA (célula vazia) — decisão de
    produto (fechamento HOMO-RT-06): nenhum dos quatro tem um valor
    monetário confiável a publicar, e o Portal da Transparência não é o
    lugar para reproduzir texto bruto da fonte ("NÃO SE APLICA"/"#VALOR!"
    nunca aparecem literalmente na coluna) nem um código de erro de
    planilha. B/C/E são também indistinguíveis ENTRE SI no fingerprint —
    são três formas equivalentes de "esta OB não tem passagem", e o
    princípio de HOMO-RT-05 é o fingerprint refletir o que é EFETIVAMENTE
    publicado, nunca um estado interno sem efeito administrativo real.

    O estado D (INVALIDO — inconsistência da própria fonte, ex.
    `"#VALOR!"`) É diferente dos outros três nesse sentido: embora a célula
    pública seja igualmente vazia, `inconsistente=True` é propositalmente
    incluído no fingerprint (ver `decisao._campos_linha_publicavel`) porque
    "sem passagem" (dado limpo) e "passagem inconsistente na fonte" (dado
    suspeito, pede investigação) são circunstâncias administrativas
    distintas — se uma decisão humana foi tomada com a fonte "limpa" e ela
    degradar para D antes da próxima geração, a decisão antiga precisa
    virar DESATUALIZADA, nunca continuar valendo silenciosamente só porque
    a célula pública não mudou. FECHAMENTO HOMO-RT-06 (decisão de produto
    final, substitui a versão provisória da Sprint 3): D NUNCA bloqueia a
    geração do relatório oficial — a inconsistência é preservada para
    diagnóstico/auditoria (e para uma futura aba do relatório operacional,
    Sprint 4), nunca para impedir a publicação das demais ocorrências."""
    if linha_passagem is None:
        return ValorPassagemPublicavel(valor=None)  # estado E
    if linha_passagem.estado is EstadoPassagem.NUMERICO:
        return ValorPassagemPublicavel(valor=linha_passagem.valor)  # estado A
    if linha_passagem.estado in (EstadoPassagem.AUSENTE, EstadoPassagem.NAO_SE_APLICA):
        return ValorPassagemPublicavel(valor=None)  # estados B/C
    if linha_passagem.estado is EstadoPassagem.INVALIDO:
        return ValorPassagemPublicavel(valor=None, inconsistente=True)  # estado D
    raise AssertionError(f"Estado de passagem não tratado: {linha_passagem.estado!r}")  # defensivo — nunca alcançado
