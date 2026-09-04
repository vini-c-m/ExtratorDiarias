"""Plano de Migração E-Fisco, Sprint A — regra de identificação de diária
elegível dentro da Base E-Fisco (export de TODAS as despesas do MPPE, não
só diárias). Módulo de domínio puro (sem I/O, nunca importa de
`app/consulta/`) — consome só `LinhaEfisco`, mesma separação já praticada
por `motor_decisao.py`/`cruzamento_passagens.py` em relação a
`OrdemBancaria`/`LinhaPassagem`.

Regra aprovada no Plano de Migração E-Fisco (auditoria real, 4 rodadas,
2065 diárias conhecidas da Base OB atual usadas como verdade de campo):

    Situação == "Paga"
    AND ( Natureza == "33901400"
          OR (Natureza == "33909200" AND evidência POSITIVA de diária) )
    AND documento do credor tem exatamente 11 dígitos (CPF, nunca CNPJ)

Cada condição tem uma causa raiz específica, investigada e confirmada
individualmente (não é uma composição arbitrária):

- `Situação == "Paga"` é a PRIMEIRA checagem, sempre — achado real: uma
  linha `Devolvida` no E-Fisco pode ter `Data Pagto./Devol.` preenchida
  (data da devolução, não de um pagamento válido); como o domínio
  (`motor_decisao.classificar`) nunca teve necessidade própria de checar
  Situação (a Base OB/ClickView sempre chegou pré-filtrada só para "Paga"),
  aceitar Devolvida/Cancelada aqui publicaria devolução como se fosse
  diária paga. Gerada (ainda não liquidada) também é excluída — não tem
  `Data Pagto./Devol.` e não representa um pagamento efetivado.
- `Natureza == "33901400"` sozinha já é altamente discriminante (achado
  real: 2047 de 2065 diárias conhecidas têm exatamente este código; nenhuma
  outra natureza aparece nessas 2065 além de 33909200) — nunca precisa de
  evidência textual. Micro-sprint de fechamento: nenhuma evidência nova
  encontrada contra este ramo — permanece intocado.
- `Natureza == "33909200"` ("despesas de exercícios anteriores") é um
  código genérico do orçamento público — exige evidência POSITIVA de
  diária na Observação (ver `_tem_evidencia_positiva_de_diaria` abaixo).

Micro-sprint de fechamento (auditoria individual das 19 linhas 33909200
elegíveis na fonte real, cruzadas com Controle DIMCAC) — a regra textual
original ("qualquer um de 7 marcadores de viagem") foi comprovadamente
ampla demais: 18 das 19 são diárias reais confirmadas (registro completo
no Controle DIMCAC — período, trecho, motivo, transporte, valor idêntico
ao Valor Bruto do E-Fisco); a 19ª, `2026OB700001`, é um RESSARCIMENTO DE
TRANSPORTE (confirmado pelo negócio como NÃO diária) — sem nenhum registro
no Controle DIMCAC, valor (9825,00) muito acima de qualquer diária real
observada (faixa 154,09-1069,14 nas outras 18), e cujo único marcador
disparado foi "TRANSPORTE".

Investigação da causa (não hardcode de OB/DH/CPF/nome — distinção
semântica generalizável):

1. Das 19 linhas, 17 contêm a palavra "DIÁRIA"/"DIARIA" explicitamente
   (ex. "UMA DIARIA PARCIAL", "02 (DUAS) DIÁRIAS INTEGRAIS") — sinal direto
   e inequívoco, nunca ambíguo.
2. Uma (`2026OB700002`) não contém "DIÁRIA" mas tem o padrão estrutural
   "COM DESTINO <cidade> EM <data> A <data>" — confirmada diária real por
   registro completo no Controle DIMCAC; precisa do marcador "DESTINO".
3. A única linha problemática (`2026OB700001`) só dispara por "TRANSPORTE"
   — e, testado contra as 39 linhas 33909200+Paga+CPF da fonte real (não
   só as 19 hoje elegíveis), "TRANSPORTE" NUNCA foi o marcador que tornou
   elegível nenhuma das diárias confirmadas — a única vez que apareceu
   sozinho foi neste ressarcimento. Removido da lista de marcadores por
   não ter nenhum valor discriminante comprovado e ser a causa direta do
   único falso positivo conhecido.
4. Busca ampla por RESSARCIMENTO/REEMBOLSO/INDENIZAÇÃO em toda a Base
   E-Fisco (Paga + CPF, qualquer natureza) confirma uma categoria
   RECORRENTE de pagamento a pessoa física que não é diária: 49 linhas
   reais (ressarcimento de combustível, de mudança, de transporte —
   naturezas 33909200/31909200/33909300). Nenhuma dessas 49 linhas contém
   "DIÁRIA"/"DIARIA" — zero sobreposição real entre as duas categorias na
   fonte inteira. Por isso "RESSARCIMENTO" é uma exclusão semântica segura
   para os marcadores mais fracos (nunca para "DIARIA", que é evidência
   direta e não precisa de proteção adicional).

Resultado: `_tem_evidencia_positiva_de_diaria` — "DIARIA" continua
suficiente sozinho (marcador forte, nunca vetado); os marcadores restantes
("DESTINO"/"DEST."/"TRECHO"/"PASSAGEM"/"VIAGEM", sem "TRANSPORTE") só
valem quando a Observação NÃO contém "RESSARCIMENTO" — nunca dependem do
Controle DIMCAC para decidir (a decisão vem inteiramente de dentro do
próprio E-Fisco), e nunca citam OB/DH/CPF/nome específicos.

Busca textual participa SOMENTE do caso 33909200 — nunca é usada como
regra principal, nunca decide sozinha para 33901400 nem para nenhuma outra
natureza (Situação/CPF continuam obrigatórios mesmo quando a evidência
textual está presente)."""

import re
import unicodedata

from app.domain.entities.linha_efisco import LinhaEfisco

__all__ = [
    "NATUREZA_DIARIA_PADRAO",
    "NATUREZA_EXERCICIOS_ANTERIORES",
    "MARCADOR_FORTE_DIARIA",
    "MARCADORES_FRACOS_EVIDENCIA_VIAGEM",
    "TERMOS_EXCLUSAO_NAO_DIARIA",
    "SITUACAO_ELEGIVEL",
    "diaria_elegivel",
]

NATUREZA_DIARIA_PADRAO = "33901400"
NATUREZA_EXERCICIOS_ANTERIORES = "33909200"

SITUACAO_ELEGIVEL = "Paga"

# Marcador forte: a palavra "diária" em si (já normalizada, sem acento).
# Suficiente sozinho, nunca vetado pelos termos de exclusão abaixo — é
# evidência direta do que estamos procurando, não uma pista indireta.
MARCADOR_FORTE_DIARIA = "DIARIA"

# Marcadores fracos: vocabulário aprovado no Plano de Migração, MENOS
# "TRANSPORTE" (removido nesta Micro-sprint — ver docstring do módulo,
# achado real: nunca discriminou nenhuma diária verdadeira, foi a causa
# direta do único falso positivo conhecido). Só valem quando a Observação
# não contém nenhum de `TERMOS_EXCLUSAO_NAO_DIARIA`.
MARCADORES_FRACOS_EVIDENCIA_VIAGEM = (
    "TRECHO",
    "PASSAGEM",
    "VIAGEM",
    "DESTINO",
    "DEST.",
)

# Achado real (busca ampla, 49 linhas reais Paga+CPF): "RESSARCIMENTO" é
# uma categoria recorrente e consistente de pagamento a pessoa física que
# NUNCA é diária na fonte real (combustível, mudança, transporte) e NUNCA
# coexiste, nos dados observados, com a palavra "DIÁRIA"/"DIARIA" no mesmo
# texto — por isso veta só os marcadores fracos, nunca o marcador forte.
TERMOS_EXCLUSAO_NAO_DIARIA = ("RESSARCIMENTO",)

_TAMANHO_CPF = 11


def _normalizar_natureza(valor: str | None) -> str:
    return (valor or "").strip()


def _normalizar_texto_evidencia(texto: str) -> str:
    """Remove acentuação (decomposição NFKD + descarte dos caracteres de
    combinação) e converte para maiúsculas, para que 'diária'/'Diária'/
    'DIÁRIA'/'diaria' sejam todos reconhecidos pelo mesmo marcador
    ('DIARIA', já sem acento) — nunca decide sinônimos, só normaliza
    grafia."""
    sem_acento = "".join(
        caractere for caractere in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(caractere)
    )
    return sem_acento.upper()


def _tem_evidencia_positiva_de_diaria(observacao: str | None) -> bool:
    """Regra POSITIVA (não é uma blacklist crescente): pergunta "há
    evidência suficiente de que isto representa pagamento de diária?",
    nunca só "isso parece relacionado a viagem?" (ver docstring do
    módulo). `MARCADOR_FORTE_DIARIA` sozinho já basta, incondicionalmente.
    Os marcadores fracos só contam quando nenhum termo de
    `TERMOS_EXCLUSAO_NAO_DIARIA` está presente — evidência indireta de
    viagem (destino, trecho, passagem) não é suficiente quando o próprio
    texto já se identifica como outra categoria de pagamento
    (ressarcimento)."""
    if not observacao:
        return False
    texto_normalizado = _normalizar_texto_evidencia(observacao)
    if MARCADOR_FORTE_DIARIA in texto_normalizado:
        return True
    if any(termo in texto_normalizado for termo in TERMOS_EXCLUSAO_NAO_DIARIA):
        return False
    return any(marcador in texto_normalizado for marcador in MARCADORES_FRACOS_EVIDENCIA_VIAGEM)


def _documento_e_cpf(documento: str | None) -> bool:
    """CPF tem exatamente 11 dígitos; CNPJ tem 14. Qualquer outra
    contagem de dígitos — vazio, malformado, ambíguo, ou mesmo um CNPJ —
    NUNCA é tratada como CPF por omissão: a ausência de certeza exclui,
    nunca inclui (mesmo espírito de `nome_publicado`/`_e_placeholder_
    vazio`: na dúvida, o comportamento mais conservador)."""
    if not documento:
        return False
    digitos = re.sub(r"\D", "", documento)
    return len(digitos) == _TAMANHO_CPF


def diaria_elegivel(linha: LinhaEfisco) -> bool:
    """Aplica a regra completa (ver docstring do módulo) a uma `LinhaEfisco`
    já lida por `repositorio_efisco.linhas_efisco`. Função pura — nenhuma
    leitura de arquivo, nenhum cruzamento com Controle DIMCAC (Sprint B).
    O Controle DIMCAC é usado só para VALIDAR a classificação durante a
    auditoria/homologação, nunca como condição desta função — uma diária
    Paga válida no E-Fisco nunca pode deixar de ser identificada só porque
    o Controle DIMCAC está temporariamente desatualizado.

    Ordem das checagens é deliberada (a mais barata/discriminante primeiro,
    mas o resultado final é o mesmo independente da ordem — são todas
    condições `AND`): Situação primeiro (só um valor possível é aceito),
    depois Natureza (com o caso 33909200 exigindo evidência positiva),
    depois CPF por último."""
    if linha.situacao != SITUACAO_ELEGIVEL:
        return False

    natureza = _normalizar_natureza(linha.natureza)
    if natureza == NATUREZA_DIARIA_PADRAO:
        elegivel_por_natureza = True
    elif natureza == NATUREZA_EXERCICIOS_ANTERIORES:
        elegivel_por_natureza = _tem_evidencia_positiva_de_diaria(linha.observacao)
    else:
        elegivel_por_natureza = False

    if not elegivel_por_natureza:
        return False

    return _documento_e_cpf(linha.documento_credor)
