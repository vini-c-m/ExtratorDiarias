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
EFETIVO na identidade/fingerprint — ver `decisao._campos_linha_publicavel`."""

from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.entities.registro_controle import RegistroControle

__all__ = ["nome_publicado", "valor_do_controle_com_fallback"]


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
