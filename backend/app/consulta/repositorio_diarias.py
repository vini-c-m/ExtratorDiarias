import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime

from openpyxl.worksheet.worksheet import Worksheet

from app.domain.entities.aviso_linha_ignorada import AvisoLinhaIgnorada
from app.domain.entities.registro_diaria_existente import RegistroDiariaExistente
from app.domain.entities.registro_diaria_indexada import RegistroDiariaIndexada
from app.planilha.escritor_planilha import (
    COLUNA_CPF,
    COLUNA_DH,
    COLUNA_DOC_ORIGEM,
    COLUNA_MOTIVO,
    COLUNA_PERIODO_FINAL,
    COLUNA_PERIODO_INICIAL,
    COLUNA_SEI,
    COLUNA_TRANSPORTE,
    COLUNA_TRECHO,
    COLUNA_VALOR_DIARIAS,
    NOME_ABA,
    PRIMEIRA_LINHA_DADOS,
    _cpf_normalizado,  # noqa: PLC2701 — mesma reutilização de repositorio_servidores.py
)

__all__ = [
    "NOME_ABA",
    "ResultadoDiariasCompletas",
    "ResultadoIndexacaoDiarias",
    "diarias_completas",
    "diarias_por_cpf",
]

_logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ResultadoIndexacaoDiarias:
    """Mesma filosofia de `ResultadoPreenchimento`
    (`app/planilha/escritor_planilha.py`): um objeto nomeado em vez de uma
    tupla posicional, para o resultado de `diarias_por_cpf` continuar
    extensível (um novo campo futuro não quebra callsites existentes, ao
    contrário de inserir uma posição no meio de uma tupla)."""

    diarias: dict[str, list[RegistroDiariaExistente]] = field(default_factory=dict)
    avisos: list[AvisoLinhaIgnorada] = field(default_factory=list)


def _como_data(valor: object) -> date | None:
    """H/I vêm do openpyxl como `datetime.datetime` na esmagadora maioria
    das ~3 mil linhas (célula formatada como data) — mas a planilha oficial
    já acumulou anos de digitação manual, e algumas poucas linhas antigas
    têm essa coluna gravada como texto malformado (ex.: `'22/05/0206'`, ano
    com dígito faltando). `None` sinaliza para `diarias_por_cpf` pular a
    linha (ver `AvisoLinhaIgnorada`) em vez de propagar uma exceção — um
    dado histórico ruim não pode derrubar a consulta inteira (RN-11)."""
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    return None


def diarias_por_cpf(planilha: Worksheet) -> ResultadoIndexacaoDiarias:
    """Indexa `Controle de Diárias` por CPF normalizado — mesmo padrão de
    `escritor_planilha._seis_existentes`, mas agrupando em lista (um CPF
    pode ter várias diárias registradas) em vez de mapear para uma única
    linha. RN-02 (chave de duplicidade: CPF + período inicial + período
    final) — a comparação exata das duas datas fica a cargo de
    `app.domain.rules.conferencia.conferir`, este repositório só lê e
    agrupa.

    Linhas cujo período não é reconhecido como data são desconsideradas da
    indexação (nunca derrubam a consulta) e voltam também em
    `ResultadoIndexacaoDiarias.avisos`, um `AvisoLinhaIgnorada` por linha
    pulada — quem chama decide o que fazer com eles (hoje:
    `conferencia_service` só anexa ao resultado para uso interno futuro)."""
    diarias: dict[str, list[RegistroDiariaExistente]] = {}
    avisos: list[AvisoLinhaIgnorada] = []
    for linha in range(PRIMEIRA_LINHA_DADOS, planilha.max_row + 1):
        cpf_bruto = planilha[f"{COLUNA_CPF}{linha}"].value
        periodo_inicial_bruto = planilha[f"{COLUNA_PERIODO_INICIAL}{linha}"].value
        periodo_final_bruto = planilha[f"{COLUNA_PERIODO_FINAL}{linha}"].value
        if cpf_bruto in (None, "") or periodo_inicial_bruto in (None, "") or periodo_final_bruto in (
            None,
            "",
        ):
            continue

        cpf = _cpf_normalizado(cpf_bruto)
        if not cpf:
            continue

        periodo_inicial = _como_data(periodo_inicial_bruto)
        periodo_final = _como_data(periodo_final_bruto)
        if periodo_inicial is None or periodo_final is None:
            bruto_invalido = periodo_inicial_bruto if periodo_inicial is None else periodo_final_bruto
            motivo = f"Período não reconhecido como data: {bruto_invalido!r}"
            avisos.append(AvisoLinhaIgnorada(aba=NOME_ABA, linha=linha, motivo=motivo))
            _logger.warning("Linha %s de '%s' ignorada na conferência: %s", linha, NOME_ABA, motivo)
            continue

        sei = planilha[f"{COLUNA_SEI}{linha}"].value
        trecho = planilha[f"{COLUNA_TRECHO}{linha}"].value
        registro = RegistroDiariaExistente(
            linha=linha,
            sei=str(sei or "").strip(),
            cpf=cpf,
            periodo_inicial=periodo_inicial,
            periodo_final=periodo_final,
            trecho=str(trecho or "").strip(),
        )
        diarias.setdefault(cpf, []).append(registro)
    return ResultadoIndexacaoDiarias(diarias=diarias, avisos=avisos)


# Achado real (URGENTE — Central Analítica, 2026-08-06): 3 linhas da
# Planilha Oficial real têm a coluna P digitada manualmente como texto
# com o símbolo da moeda (`"R$ 154,09"`), não só o formato brasileiro puro
# (`"652,96"`) que este parser já cobria — o prefixo sozinho já derrubava
# `float()`. Removido só o prefixo `R$`/espaços, nunca dígitos: uma linha
# genuinamente não-numérica (ex. `"DIMOT"`, achado real na mesma auditoria
# — texto de outro campo colado por engano na coluna de valor) continua
# `None` depois da remoção, porque o restante do texto ainda não é um
# número válido.
_PREFIXO_MOEDA = re.compile(r"^\s*R\$\s*", re.IGNORECASE)


def _valor_como_numero(valor: object) -> float | None:
    """Simétrica a `_como_data`: desfaz o que
    `escritor_planilha._escrever_celula(..., moeda=True)` grava. Uma linha
    escrita pelo próprio sistema já vem como `float` puro do openpyxl (o
    escritor reatribui `celula.value` antes de salvar, `escritor_planilha.
    py:338`); uma linha digitada manualmente pode vir como texto no formato
    brasileiro (`"652,96"`) ou, achado real desta auditoria, com o prefixo
    `R$` (`"R$ 154,09"`). Nunca propaga exceção — `None` sinaliza "não foi
    possível ler como número", nunca inventa um valor: uma fórmula com erro
    (`#REF!`, `#VALUE!`, `#N/A` — também achados reais, erro genuíno na
    Planilha Oficial) ou um texto sem relação com valor nenhum (`"DIMOT"`)
    permanecem `None`, nunca viram `0` nem um número adivinhado."""
    if isinstance(valor, (int, float)):
        return float(valor)
    if valor in (None, ""):
        return None
    texto = _PREFIXO_MOEDA.sub("", str(valor)).strip()
    try:
        return float(texto.replace(".", "").replace(",", "."))
    except ValueError:
        return None


def _dividir_trecho(trecho: str) -> tuple[str | None, str | None]:
    """`escritor_planilha._escrever_linha` sempre grava o trecho como
    `f"{cidade_origem} - {cidade_destino}"` (separador literal `" - "`,
    `escritor_planilha.py:287`) — garantido só para linhas escritas pelo
    próprio sistema; linhas históricas/digitadas manualmente podem não
    seguir esse padrão. Nunca adivinha: se o split não resultar em
    exatamente 2 partes não-vazias, devolve `(None, None)` — quem chama
    registra um aviso e mantém a linha (a ausência de cidade_origem/destino
    não invalida SEI/CPF/período, que continuam válidos).

    Sprint 19.10 (achado quantificado na homologação com a Planilha Oficial
    real, `docs/central-analitica/v2-plano-tecnico.md` § 18, entrada
    19.10 — "planilha real pode revelar padrão de dado não coberto pelo
    catálogo"): 87% das 1.822 linhas com trecho preenchido na planilha real
    usam hífen sem espaço ao redor (`"RECIFE-FORTALEZA"`, dado histórico
    digitado manualmente, nunca escrito por este sistema) — o `" - "`
    estrito acima as tratava como "não separável", inflando "Origem e
    destino ausentes" no Diagnóstico e esvaziando as distribuições por
    município/origem-destino do Dashboard mesmo quando o dado existia.
    Fallback deliberadamente restrito a exatamente **um** `-` no texto
    inteiro — o caso inequívoco de duas partes, nunca uma adivinhação de
    qual segmento é origem/destino entre 3+ (ex. `"RECIFE-GRAVATA-
    BEZERROS"`, `"RECIFE-JOAO PESSOA-PB"`, ambíguos de verdade, continuam
    `(None, None)`, mesmo critério de antes). Validado contra a lista de
    municípios do IBGE (`app/extraction/dados/municipios.json`): nenhum
    município de Pernambuco tem hífen no nome (0 de 184); nacionalmente, 27
    de 5.570 têm (ex. "Xique-Xique") — risco residual aceito fora de PE,
    decisão confirmada explicitamente com o usuário antes desta
    implementação."""
    partes = trecho.split(" - ", 1)
    if len(partes) != 2:
        if trecho.count("-") == 1:
            origem, destino = (parte.strip() for parte in trecho.split("-", 1))
            if origem and destino:
                return origem, destino
        return None, None
    origem, destino = partes[0].strip(), partes[1].strip()
    if not origem or not destino:
        return None, None
    return origem, destino


@dataclass(frozen=True)
class ResultadoDiariasCompletas:
    """Mesma filosofia de `ResultadoIndexacaoDiarias`, mas para a
    reconstrução da Base Local em SQLite (Sprint 17.3, `app/consulta/
    base_local_sqlite.py`): chaveado por `sei` normalizado — a chave de
    negócio de uma diária (decisão 8, `docs/central-analitica/README.md
    § 0.1`), não por CPF. `linhas_ignoradas` conta só as linhas que de fato
    não entraram em `diarias` (CPF/SEI ausente, período ilegível, SEI
    duplicado); `avisos` é um superconjunto — inclui também linhas mantidas
    cujo trecho não pôde ser separado em origem/destino (decisão 6: dado
    degradado nunca é silenciado, mesmo quando a linha não é descartada)."""

    diarias: dict[str, RegistroDiariaIndexada] = field(default_factory=dict)
    avisos: list[AvisoLinhaIgnorada] = field(default_factory=list)
    linhas_ignoradas: int = 0


def diarias_completas(planilha: Worksheet) -> ResultadoDiariasCompletas:
    """Leitura completa de `Controle de Diárias` para a reconstrução da
    Base Local em SQLite (Sprint 17.3) — mesmo laço-base de
    `diarias_por_cpf`, mas mais rigorosa: nunca descarta uma linha em
    silêncio, sempre registra um `AvisoLinhaIgnorada` (decisão 6/7 da
    arquitetura — dado potencialmente incompleto nunca é apresentado
    silenciosamente). `diarias_por_cpf` permanece 100% intocada — usada só
    pela Central de Conferência, com seu próprio critério (mais tolerante,
    já homologado) de descarte silencioso."""
    diarias: dict[str, RegistroDiariaIndexada] = {}
    avisos: list[AvisoLinhaIgnorada] = []
    linhas_ignoradas = 0

    for linha in range(PRIMEIRA_LINHA_DADOS, planilha.max_row + 1):
        cpf_bruto = planilha[f"{COLUNA_CPF}{linha}"].value
        periodo_inicial_bruto = planilha[f"{COLUNA_PERIODO_INICIAL}{linha}"].value
        periodo_final_bruto = planilha[f"{COLUNA_PERIODO_FINAL}{linha}"].value
        sei_bruto = planilha[f"{COLUNA_SEI}{linha}"].value

        if cpf_bruto in (None, ""):
            avisos.append(AvisoLinhaIgnorada(aba=NOME_ABA, linha=linha, motivo="CPF ausente"))
            linhas_ignoradas += 1
            continue

        cpf = _cpf_normalizado(cpf_bruto)
        if not cpf:
            avisos.append(
                AvisoLinhaIgnorada(
                    aba=NOME_ABA, linha=linha, motivo=f"CPF não reconhecido: {cpf_bruto!r}"
                )
            )
            linhas_ignoradas += 1
            continue

        periodo_inicial = _como_data(periodo_inicial_bruto)
        periodo_final = _como_data(periodo_final_bruto)
        if periodo_inicial is None or periodo_final is None:
            bruto_invalido = periodo_inicial_bruto if periodo_inicial is None else periodo_final_bruto
            avisos.append(
                AvisoLinhaIgnorada(
                    aba=NOME_ABA,
                    linha=linha,
                    motivo=f"Período não reconhecido como data: {bruto_invalido!r}",
                )
            )
            linhas_ignoradas += 1
            continue

        sei = str(sei_bruto or "").strip()
        if not sei:
            avisos.append(AvisoLinhaIgnorada(aba=NOME_ABA, linha=linha, motivo="SEI ausente"))
            linhas_ignoradas += 1
            continue

        if sei in diarias:
            avisos.append(
                AvisoLinhaIgnorada(
                    aba=NOME_ABA,
                    linha=linha,
                    motivo=(
                        f"SEI duplicado, mantida a primeira ocorrência "
                        f"(linha {diarias[sei].linha})"
                    ),
                )
            )
            linhas_ignoradas += 1
            continue

        trecho = str(planilha[f"{COLUNA_TRECHO}{linha}"].value or "").strip()
        cidade_origem, cidade_destino = (None, None)
        if trecho:
            cidade_origem, cidade_destino = _dividir_trecho(trecho)
            if cidade_origem is None:
                avisos.append(
                    AvisoLinhaIgnorada(
                        aba=NOME_ABA,
                        linha=linha,
                        motivo=f"Trecho não separável em origem/destino: {trecho!r}",
                    )
                )

        doc_origem = str(planilha[f"{COLUNA_DOC_ORIGEM}{linha}"].value or "").strip()
        motivo = str(planilha[f"{COLUNA_MOTIVO}{linha}"].value or "").strip()
        transporte = str(planilha[f"{COLUNA_TRANSPORTE}{linha}"].value or "").strip() or None
        valor_total_diarias = _valor_como_numero(planilha[f"{COLUNA_VALOR_DIARIAS}{linha}"].value)
        # DH vazio é esperado (processo ainda não chegou à fase de
        # liquidação) — nunca gera aviso, mesmo tratamento de `transporte`.
        dh = str(planilha[f"{COLUNA_DH}{linha}"].value or "").strip() or None

        diarias[sei] = RegistroDiariaIndexada(
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
            valor_total_diarias=valor_total_diarias,
            dh=dh,
        )

    return ResultadoDiariasCompletas(diarias=diarias, avisos=avisos, linhas_ignoradas=linhas_ignoradas)
