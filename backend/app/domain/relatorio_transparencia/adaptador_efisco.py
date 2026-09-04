"""Plano de Migração E-Fisco, Sprint B — adaptador `LinhaEfisco` (+ Controle
DIMCAC) → `OrdemBancaria`, a entidade canônica já homologada, consumida sem
nenhuma alteração por `motor_reconciliacao.reconciliar`, `motor_decisao.
classificar` (RN01-RN07), `decisao.py`, `linha_publicavel.py` e pelos
escritores do XLSX oficial/operacional. Domínio puro — sem I/O, nunca lê
arquivo, só transforma estruturas já lidas por `app/consulta/`.

Princípio de autoridade (Plano de Migração E-Fisco): E-Fisco fornece a
verdade FINANCEIRA (ob, dh, credor, cpf, situação, data de pagamento,
valor); Controle DIMCAC fornece a verdade ADMINISTRATIVA (sei, cargo,
período, trecho, cidade origem/destino, transporte, motivo). A Base OB
(ClickView) NUNCA é fonte de nenhum campo aqui — só serve para comparação
histórica, feita fora deste módulo, em auditoria.

Achado real da auditoria de domínio (Sprint B, item 1) que motiva as
decisões abaixo:

- `OrdemBancaria` continua adequada — nenhum campo consumido por
  `motor_reconciliacao`/`motor_decisao`/`decisao`/`linha_publicavel`/
  escritores exige mudança de forma. Não foi redesenhada.
- `RegistroControle` (Controle DIMCAC) NÃO TEM campo `nome` — só
  `doc_origem`/`cargo`/`sei`/período/trecho/transporte/motivo. A sugestão
  inicial "NOME ← preferencialmente DIMCAC" não é realizável sem alterar
  `repositorio_controle_dimcac.py` (fora do escopo autorizado desta
  sprint, risco desnecessário sobre leitor já homologado). Decisão: `nome`
  e `credor` usam a MESMA fonte, `Razão Social do Credor` do E-Fisco — que
  é, coincidentemente, exatamente o campo que a Sprint A/investigação
  original já provou ser 100% confiável (a ambiguidade NOME×CREDOR que
  motivou toda a migração desaparece: só existe uma fonte de nome agora).
- `doc_origem` (RegistroControle) não tem campo correspondente em
  `OrdemBancaria` e não é usado por nenhum escritor do Relatório de
  Diárias — Portal da Transparência (confirmado por grep) — não mapeado,
  sem impacto.
- `item_de_gasto`/`duplicidade`/`valor_bruto_sem_formula` não são
  consumidos por nenhuma RN nem escritor (confirmado na Sprint A) — `item_
  de_gasto` recebe a Natureza do E-Fisco (mesmo papel conceitual, dado
  disponível sem custo); os outros dois ficam `None` (a Base E-Fisco não
  tem o artefato de fórmula do Excel nem duplicidade física — Sprint A já
  provou 0 OBs fisicamente repetidas em 17.461 linhas reais)."""

from dataclasses import dataclass, field

from app.domain.entities.linha_efisco import LinhaEfisco
from app.domain.entities.ordem_bancaria import OrdemBancaria
from app.domain.entities.registro_controle import RegistroControle

__all__ = [
    "linha_para_ordem_bancaria",
    "ResultadoAdaptacaoEfisco",
    "ordens_bancarias_por_dh_via_efisco",
]


def _somente_digitos(texto: str) -> str:
    return "".join(caractere for caractere in texto if caractere.isdigit())


def _unico_valor_do_controle_ou_none(registros_controle: list[RegistroControle], atributo: str) -> object | None:
    """Mesma lógica de conflito de `linha_publicavel.valor_do_controle_com_
    fallback` (cargo/transporte já homologados) — quando há mais de um
    `RegistroControle` para o mesmo DH e eles DIVERGEM nesse atributo, não
    há um valor único e confiável: trata como ausente, nunca escolhe um
    dos dois à toa. Reimplementada localmente (não importada) porque
    `valor_do_controle_com_fallback` é tipada para `str | None` com um
    `valor_base_ob` de fallback — aqui o "fallback" é SEMPRE `None` (o
    E-Fisco não tem sei/período/trecho/motivo estruturados) e alguns dos
    atributos resolvidos aqui são `date`, não `str` (período_inicial/
    final) — reusar a função tipada como `str` seria incorreto para esses
    campos. Achado real (auditoria de cruzamento): entre os DHs elegíveis
    com múltiplos `RegistroControle`, SEI e CARGO nunca divergiram — este
    ramo de conflito é defesa em profundidade, não um caso frequente."""
    valores = {getattr(registro, atributo) for registro in registros_controle if getattr(registro, atributo) is not None}
    if len(valores) == 1:
        return valores.pop()
    return None


def linha_para_ordem_bancaria(linha: LinhaEfisco, registros_controle_do_dh: list[RegistroControle]) -> OrdemBancaria:
    """Converte uma `LinhaEfisco` JÁ elegível (`filtro_diaria_efisco.
    diaria_elegivel(linha) is True` — este adaptador não filtra, só
    transforma) em `OrdemBancaria`. `registros_controle_do_dh` é a lista
    (pode ser vazia) de `RegistroControle` do Controle DIMCAC para o MESMO
    `linha.dh` — ausência de registro NUNCA impede a construção da
    `OrdemBancaria` (a diária continua existindo financeiramente; os
    campos administrativos só ficam `None`, e as RN01-RN07 já sabem lidar
    com campo ausente, mesmo comportamento de hoje para um DH só na Base
    OB).

    `linha.documento_credor` já foi validado como CPF de 11 dígitos por
    `diaria_elegivel` antes de esta função ser chamada — `_somente_digitos`
    aqui só extrai o formato final, nunca revalida."""
    return OrdemBancaria(
        linha=linha.linha,
        dh=linha.dh or "",
        ob=linha.ob,
        credor=linha.credor,
        situacao=linha.situacao,
        data_pagamento=linha.data_pagamento_devolucao,
        sei=_unico_valor_do_controle_ou_none(registros_controle_do_dh, "sei"),
        cpf=_somente_digitos(linha.documento_credor) if linha.documento_credor else None,
        nome=linha.credor,
        cargo=_unico_valor_do_controle_ou_none(registros_controle_do_dh, "cargo"),
        periodo_inicial=_unico_valor_do_controle_ou_none(registros_controle_do_dh, "periodo_inicial"),
        periodo_final=_unico_valor_do_controle_ou_none(registros_controle_do_dh, "periodo_final"),
        cidade_origem=_unico_valor_do_controle_ou_none(registros_controle_do_dh, "cidade_origem"),
        cidade_destino=_unico_valor_do_controle_ou_none(registros_controle_do_dh, "cidade_destino"),
        transporte=_unico_valor_do_controle_ou_none(registros_controle_do_dh, "transporte"),
        motivo=_unico_valor_do_controle_ou_none(registros_controle_do_dh, "motivo"),
        valor=linha.valor_bruto,
        valor_bruto_sem_formula=None,
        restituicao=None,
        duplicidade=None,
        item_de_gasto=linha.natureza,
        trecho=_unico_valor_do_controle_ou_none(registros_controle_do_dh, "trecho"),
    )


@dataclass(frozen=True)
class ResultadoAdaptacaoEfisco:
    """`por_dh` tem a MESMA forma de `ResultadoLeituraOrdensBancarias.por_dh`
    (Base OB) — compatível com `motor_reconciliacao.reconciliar` sem
    nenhuma mudança de assinatura. `sem_dh` conta linhas elegíveis sem DH
    (achado real: 0 em 2044 linhas reais — diária sem Documento Hábil não
    ocorre na prática, mas o caso é tratado explicitamente, nunca
    presumido impossível) — mesma filosofia de `linhas_ignoradas` em
    `ordens_bancarias_por_dh`: uma linha sem DH não pode ser reconciliada
    (chave de negócio primária ausente), então não entra em `por_dh`, mas
    NUNCA desaparece silenciosamente — fica contada aqui."""

    por_dh: dict[str, list[OrdemBancaria]] = field(default_factory=dict)
    sem_dh: int = 0


def ordens_bancarias_por_dh_via_efisco(
    linhas_elegiveis: list[LinhaEfisco],
    controle_por_dh: dict[str, list[RegistroControle]],
) -> ResultadoAdaptacaoEfisco:
    """Agrupa `OrdemBancaria` adaptadas por DH, a partir de linhas JÁ
    filtradas por `filtro_diaria_efisco.diaria_elegivel` (este módulo não
    filtra) — pronto para `motor_reconciliacao.reconciliar(controle_por_dh,
    resultado.por_dh)`, o mesmo ponto de entrada já homologado, sem
    nenhuma mudança nele."""
    por_dh: dict[str, list[OrdemBancaria]] = {}
    sem_dh = 0
    for linha in linhas_elegiveis:
        if not linha.dh:
            sem_dh += 1
            continue
        registros_do_dh = controle_por_dh.get(linha.dh, [])
        ordem = linha_para_ordem_bancaria(linha, registros_do_dh)
        por_dh.setdefault(linha.dh, []).append(ordem)
    return ResultadoAdaptacaoEfisco(por_dh=por_dh, sem_dh=sem_dh)
