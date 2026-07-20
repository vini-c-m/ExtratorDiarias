from dataclasses import dataclass, field
from datetime import datetime
from html import escape

from app.domain.entities.fonte_doc_origem import FonteDocOrigem
from app.domain.entities.fonte_transporte import rotulo as rotulo_fonte_transporte
from app.domain.entities.tipo_processo import TipoProcesso
from app.domain.entities.tipo_processo import rotulo as rotulo_tipo_processo
from app.planilha.escritor_planilha import ItemResultado, ResultadoPreenchimento


@dataclass(frozen=True)
class ItemErro:
    arquivo_origem: str
    motivos: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ItemAviso:
    """Um arquivo com pelo menos um campo opcional (DH, transporte ou estado
    do destino) que não pôde ser preenchido com segurança — não é um erro de
    processamento, é um pedido de revisão manual."""

    arquivo_origem: str
    mensagens: list[str] = field(default_factory=list)


# --- Identidade visual da marca (Sprint 07.2) --------------------------------
# Mesmo Design System do aplicativo desktop (Sprint 07): fundo #0F172A,
# degradê azul → ciano → roxo, tipografia Inter, cartões "vidro" translúcidos
# com cantos de 24px. O relatório deixa de ter uma paleta/identidade própria
# — usa exatamente os mesmos tokens do app, para que os dois pareçam o mesmo
# produto do início ao fim do fluxo.
_BG = "#0F172A"
_AZUL = "#2563EB"
_CIANO = "#06B6D4"
_ROXO = "#8B5CF6"

_EMERALD = "#34D399"
_EMERALD_BG = "rgba(16, 185, 129, 0.1)"
_EMERALD_BORDA = "rgba(16, 185, 129, 0.3)"
_AMBAR = "#FBBF24"
_AMBAR_BG = "rgba(245, 158, 11, 0.1)"
_VERMELHO = "#F87171"
_VERMELHO_BG = "rgba(239, 68, 68, 0.1)"
_VERMELHO_BORDA = "rgba(239, 68, 68, 0.3)"
_CIANO_TEXTO = "#22D3EE"
_CIANO_BG = "rgba(6, 182, 212, 0.1)"
_AZUL_CLARO = "#60A5FA"
_AZUL_BG = "rgba(37, 99, 235, 0.1)"

_SLATE_50 = "#F8FAFC"
_SLATE_300 = "#CBD5E1"
_SLATE_400 = "#94A3B8"
_SLATE_500 = "#64748B"

_VERSAO = "1.0"

# --- Ícones (Lucide, mesmos traçados usados no aplicativo React) -------------
# Cada constante é só o miolo (paths/circles) do ícone — a moldura <svg> é
# aplicada uma única vez por `_svg_icone`, com `stroke="currentColor"` para
# herdar a cor do elemento pai (mesmo truque do app: o ícone nunca escolhe a
# própria cor, só o selo/badge que o envolve).
_ICONE_ARQUIVO = (
    '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"></path>'
    '<path d="M14 2v5a1 1 0 0 0 1 1h5"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path>'
)
_ICONE_CHECK = '<circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path>'
_ICONE_COPYX = (
    '<line x1="12" x2="18" y1="12" y2="18"></line><line x1="12" x2="18" y1="18" y2="12"></line>'
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>'
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>'
)
_ICONE_ALERTA = (
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path>'
    '<path d="M12 9v4"></path><path d="M12 17h.01"></path>'
)
_ICONE_XCIRCLE = '<circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path>'
_ICONE_RELOGIO = '<circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path>'
_ICONE_IMPRESSORA = (
    '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>'
    '<path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"></path><rect x="6" y="14" width="12" height="8" rx="1"></rect>'
)
_ICONE_INFO = '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>'

_ICONE_POR_COR = {
    "padrao": _ICONE_ARQUIVO,
    "sucesso": _ICONE_CHECK,
    "info": _ICONE_COPYX,
    "aviso": _ICONE_ALERTA,
    "erro": _ICONE_XCIRCLE,
}


def _svg_icone(caminho_interno: str) -> str:
    return (
        '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{caminho_interno}</svg>'
    )


# Mesmo monograma do aplicativo (`Logo.tsx` — `CAMINHO_MONOGRAMA`): silhueta
# de "D" com um "E" revelado em espaço negativo dentro do bojo. String
# literal (não f-string) — nenhuma chave aqui precisa de escape.
_LOGO_SVG = """<svg viewBox="0 0 100 100" role="img" aria-label="Extrator de Diárias" class="logo">
  <defs>
    <linearGradient id="logo-gradiente-marca" x1="50" y1="16" x2="50" y2="84" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2563EB"></stop>
      <stop offset="50%" stop-color="#06B6D4"></stop>
      <stop offset="100%" stop-color="#8B5CF6"></stop>
    </linearGradient>
  </defs>
  <path fill-rule="evenodd" fill="url(#logo-gradiente-marca)"
    d="M 23 22 A 6 6 0 0 1 29 16 H 43 A 34 34 0 0 1 43 84 H 29 A 6 6 0 0 1 23 78 Z
       M 47 39 A 10 10 0 0 1 67 39 L 67 61 A 10 10 0 0 1 47 61 Z
       M 47 39 H 56 A 4 4 0 0 1 56 47 H 47 Z
       M 47 53 H 56 A 4 4 0 0 1 56 61 H 47 Z"></path>
</svg>"""

_ESTILO = f"""
* {{ box-sizing: border-box; }}

body {{
  margin: 0;
  padding: 2.5rem clamp(1.25rem, 4vw, 3rem) 4rem;
  font-family: "Inter", "Segoe UI", ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  color: {_SLATE_300};
  background-color: {_BG};
  background-image:
    radial-gradient(circle at 12% 8%, rgba(37, 99, 235, 0.28), transparent 42%),
    radial-gradient(circle at 88% 4%, rgba(139, 92, 246, 0.22), transparent 45%),
    radial-gradient(circle at 50% 100%, rgba(6, 182, 212, 0.14), transparent 55%);
  background-attachment: fixed;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}}

.container {{ max-width: 960px; margin: 0 auto; }}

.cabecalho {{ display: flex; align-items: center; justify-content: center; gap: 1rem; text-align: left; }}
.cabecalho .logo {{ width: 56px; height: 56px; flex-shrink: 0; }}
.cabecalho h1 {{ margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 0.01em; color: {_SLATE_50}; line-height: 1.2; }}
.cabecalho .tagline {{ margin: 0.25rem 0 0; font-size: 15px; font-weight: 500; color: {_SLATE_400}; }}

.divisor {{
  height: 1px; width: 60%; margin: 1.5rem auto 0;
  background-image: linear-gradient(to right, transparent 0%, {_AZUL} 18%, {_CIANO} 50%, {_ROXO} 82%, transparent 100%);
}}

.metadados {{ text-align: center; margin: 1rem 0 2.5rem; font-size: 0.8rem; color: {_SLATE_500}; }}

.resumo {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; margin-bottom: 2.5rem; }}

.selo-icone {{ border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }}
.selo-icone svg {{ width: 55%; height: 55%; }}
.selo-icone.padrao {{ background: {_AZUL_BG}; color: {_AZUL_CLARO}; }}
.selo-icone.sucesso {{ background: {_EMERALD_BG}; color: {_EMERALD}; }}
.selo-icone.aviso {{ background: {_AMBAR_BG}; color: {_AMBAR}; }}
.selo-icone.erro {{ background: {_VERMELHO_BG}; color: {_VERMELHO}; }}
.selo-icone.info {{ background: {_CIANO_BG}; color: {_CIANO_TEXTO}; }}

.cartao {{
  border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; background: rgba(255, 255, 255, 0.03);
  padding: 1.5rem; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2);
}}
.cartao .selo-icone {{ width: 40px; height: 40px; margin-bottom: 1rem; }}
.cartao .valor {{ font-size: 1.875rem; font-weight: 700; color: {_SLATE_50}; line-height: 1.2; }}
.cartao .rotulo {{ margin-top: 0.25rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: {_SLATE_500}; }}
.cartao.sucesso .valor {{ color: {_EMERALD}; }}
.cartao.aviso .valor {{ color: {_AMBAR}; }}
.cartao.erro .valor {{ color: {_VERMELHO}; }}
.cartao.info .valor {{ color: {_CIANO_TEXTO}; }}

.titulo-secao {{ display: flex; align-items: center; gap: 0.75rem; margin-top: 3rem; margin-bottom: 1rem; }}
.titulo-secao .selo-icone {{ width: 32px; height: 32px; }}
.titulo-secao h2 {{ margin: 0; font-size: 1.05rem; font-weight: 600; color: {_SLATE_50}; }}
.titulo-secao .contagem {{ color: {_SLATE_500}; font-weight: 400; font-size: 0.85rem; }}

table {{ width: 100%; border-collapse: collapse; font-size: 0.875rem; }}
th, td {{ text-align: left; padding: 0.65rem 0.75rem; border-bottom: 1px solid rgba(255, 255, 255, 0.05); vertical-align: top; }}
th {{ background: rgba(255, 255, 255, 0.05); text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.03em; color: {_SLATE_300}; }}
tr:nth-child(even) td {{ background: rgba(255, 255, 255, 0.02); }}
.vazio {{ color: {_SLATE_500}; font-size: 0.875rem; font-style: italic; }}

.item {{
  border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; background: rgba(255, 255, 255, 0.03);
  padding: 1.25rem 1.5rem; margin-bottom: 0.75rem;
}}
.item .arquivo {{ font-weight: 600; font-size: 0.9rem; color: {_SLATE_50}; }}
.item .sei {{ color: {_SLATE_500}; font-size: 0.8rem; margin-left: 0.5rem; }}
.rodape {{ margin-top: 0.5rem; font-size: 0.78rem; color: {_SLATE_500}; }}

.selo {{ display: inline-block; border-radius: 999px; padding: 0.2rem 0.7rem; font-size: 0.75rem; font-weight: 600; margin-top: 0.5rem; }}
.selo.sucesso {{ background: {_EMERALD_BG}; color: {_EMERALD}; }}
.selo.atencao {{ background: {_AMBAR_BG}; color: {_AMBAR}; }}

.item.critico {{ border: 1px solid {_VERMELHO_BORDA}; background: {_VERMELHO_BG}; }}
.selo.critico {{
  background: #DC2626; color: #ffffff; font-size: 0.85rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.03em; padding: 0.4rem 1rem;
}}

.pendencia {{ margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed rgba(255, 255, 255, 0.1); }}
.pendencia:first-of-type {{ border-top: none; margin-top: 0.6rem; padding-top: 0; }}
.pendencia .motivo {{ color: {_SLATE_300}; }}
.pendencia .acao {{ color: {_CIANO_TEXTO}; font-weight: 600; }}

details.tecnico {{
  margin-top: 2.5rem; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px;
  background: rgba(255, 255, 255, 0.03); padding: 1rem 1.5rem;
}}
details.tecnico summary {{ cursor: pointer; font-weight: 600; color: {_SLATE_400}; font-size: 0.85rem; }}
details.tecnico table {{ margin-top: 1rem; }}

.acoes-relatorio {{ display: flex; justify-content: flex-end; margin-bottom: 1.5rem; }}
.acoes-relatorio button {{
  display: inline-flex; align-items: center; gap: 0.5rem; font-family: inherit;
  border: none; background-image: linear-gradient(90deg, {_AZUL} 0%, {_ROXO} 100%);
  color: #ffffff; font-weight: 600; font-size: 0.875rem; padding: 0.75rem 1.5rem;
  border-radius: 12px; cursor: pointer;
}}
.acoes-relatorio button svg {{ width: 16px; height: 16px; }}

.rodape-marca {{ margin-top: 3.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(255, 255, 255, 0.08); text-align: center; }}
.rodape-marca .nome {{ font-weight: 700; font-size: 0.9rem; color: {_SLATE_300}; }}
.rodape-marca .tagline {{ font-size: 0.8rem; color: {_SLATE_500}; margin-top: 0.15rem; }}
.rodape-marca .versao {{ font-size: 0.72rem; color: {_SLATE_500}; margin-top: 0.6rem; }}
.rodape-marca .gerado-em {{ font-size: 0.72rem; color: {_SLATE_500}; margin-top: 0.15rem; }}

@media print {{
  .acoes-relatorio {{ display: none; }}
}}
"""

# Orientações padronizadas por campo pendente — a mesma redação em toda
# execução, para o usuário aprender a reconhecer o padrão rapidamente.
_ORIENTACOES_CAMPO: dict[str, tuple[str, str]] = {
    "transporte": (
        "Não foi possível determinar o transporte.",
        "Conferir o despacho do processo e preencher manualmente a coluna TRANSPORTE.",
    ),
    "local": (
        "Não foi possível identificar com segurança o município informado.",
        "Verifique o processo SEI e preencha manualmente a coluna LOCAL da planilha.",
    ),
    "valor_diarias": (
        "Não foi possível identificar o valor das diárias no despacho do GABPGJ.",
        "Verifique o despacho do processo e preencha manualmente a coluna VALOR TOTAL DAS DIÁRIAS.",
    ),
    "documento_habil": (
        "Foi encontrado mais de um Documento Hábil no processo.",
        "Verifique o processo SEI e confirme manualmente o número correto na coluna DH.",
    ),
    "doc_origem": (
        "DOC DE ORIGEM preenchido através da extração do processo. Não foi localizado "
        "histórico deste servidor na planilha oficial do DIMCAC.",
        "Recomenda-se conferir manualmente a nomenclatura institucional da unidade "
        "administrativa e, se necessário, substituí-la pela padronização atualmente "
        "utilizada pelo DIMCAC.",
    ),
}
_MARCA_DH_CONFLITO = "Mais de um Documento Hábil"

_ORIENTACAO_ERRO = (
    "Abra o processo no SEI, confira os dados indicados acima e insira o registro manualmente "
    "na planilha (Documento Hábil, SEI, Nome, CPF, Datas, Transporte e Local)."
)


def _pendencias_do_item(item: ItemResultado, avisos_do_arquivo: list[str]) -> list[tuple[str, str]]:
    """Traduz o estado já resolvido da Diaria em orientações amigáveis — só
    os campos genuinamente em branco viram pendência de revisão. Um
    Documento Hábil ainda não localizado porque o processo não chegou à
    fase de liquidação é esperado (ver `enriquecimento/documento_habil.py`)
    e nunca aparece aqui; só o caso de conflito (mais de um DH encontrado)
    é uma pendência real. Nenhuma regra de extração é alterada por esta
    função — ela só lê os campos já computados pelas Sprints anteriores."""
    pendencias: list[tuple[str, str]] = []

    if item.transporte is None:
        pendencias.append(_ORIENTACOES_CAMPO["transporte"])

    if item.estado_destino is None:
        pendencias.append(_ORIENTACOES_CAMPO["local"])

    if item.doc_origem_fonte is FonteDocOrigem.EXTRACAO_PDF:
        pendencias.append(_ORIENTACOES_CAMPO["doc_origem"])

    if item.tipo_processo is TipoProcesso.DIARIA_MEMBRO and item.valor_total_diarias is None:
        pendencias.append(_ORIENTACOES_CAMPO["valor_diarias"])

    if any(_MARCA_DH_CONFLITO in aviso for aviso in avisos_do_arquivo):
        pendencias.append(_ORIENTACOES_CAMPO["documento_habil"])

    return pendencias


def _agrupar_avisos_por_arquivo(avisos: list[ItemAviso]) -> dict[str, list[str]]:
    agrupado: dict[str, list[str]] = {}
    for aviso in avisos:
        agrupado.setdefault(aviso.arquivo_origem, []).extend(aviso.mensagens)
    return agrupado


def _formatar_duracao(ms: int) -> str:
    if ms < 0:
        ms = 0
    if ms < 60_000:
        return f"{ms / 1000:.1f}s"
    minutos, resto_ms = divmod(ms, 60_000)
    segundos = round(resto_ms / 1000)
    return f"{minutos}min {segundos}s"


def _cabecalho() -> str:
    """Cabeçalho da identidade visual definitiva do produto (Sprint 07.2) —
    o mesmo logo + nome + tagline do aplicativo desktop (`Cabecalho.tsx`),
    sem nenhuma referência institucional. Puramente apresentação; não
    participa de nenhuma regra de classificação ou cálculo do relatório."""
    return f"""<div class="cabecalho">
  {_LOGO_SVG}
  <div>
    <h1>Extrator de Diárias</h1>
    <p class="tagline">Automação Inteligente de Processos</p>
  </div>
</div>
<div class="divisor"></div>"""


def _metadados(agora: datetime, caminho_planilha: str) -> str:
    return (
        f'<p class="metadados">Gerado em {escape(agora.strftime("%d/%m/%Y %H:%M:%S"))} '
        f"· Planilha: {escape(caminho_planilha)}</p>"
    )


def _acoes_relatorio() -> str:
    """Botão de impressão nativa — `window.print()` é a API padrão do
    navegador, sem dependência externa; some do próprio documento
    impresso/PDF via `@media print` em `_ESTILO`."""
    return f"""<div class="acoes-relatorio">
  <button type="button" onclick="window.print()">{_svg_icone(_ICONE_IMPRESSORA)}Imprimir</button>
</div>"""


def _rodape(agora: datetime) -> str:
    return f"""<div class="rodape-marca">
  <div class="nome">Extrator de Diárias</div>
  <p class="tagline">Automação Inteligente de Processos</p>
  <p class="versao">Versão {escape(_VERSAO)}</p>
  <p class="gerado-em">Gerado em {escape(agora.strftime('%d/%m/%Y'))} às {escape(agora.strftime('%H:%M:%S'))}</p>
</div>"""


def _titulo_secao(icone: str, cor: str, texto: str, contagem: int) -> str:
    return (
        f'<div class="titulo-secao">'
        f'<div class="selo-icone {cor}">{_svg_icone(icone)}</div>'
        f"<h2>{escape(texto)} <span class=\"contagem\">({contagem})</span></h2>"
        f"</div>"
    )


def gerar_relatorio_html(
    caminho_relatorio: str,
    caminho_planilha: str,
    resultado: ResultadoPreenchimento,
    erros: list[ItemErro],
    avisos: list[ItemAviso] | None = None,
    agora: datetime | None = None,
    *,
    tempo_processamento_ms: int | None = None,
) -> None:
    """Grava um relatório em HTML autocontido (sem dependências externas),
    pensado como documento de conferência operacional: um resumo executivo
    no topo, e as diárias organizadas em três níveis — 🔴 crítico (necessita
    inserção manual, nunca inserido), 🟡 atenção (inserido, mas com algum
    campo opcional pendente de revisão) e 🟢 sucesso (inserido sem nenhuma
    pendência) — cada uma com orientação do que exatamente fazer, não só o
    motivo técnico. Duplicidades continuam listadas à parte, e as mensagens
    técnicas originais (avisos) ficam preservadas numa seção recolhida ao
    final, para não perder nenhuma informação já homologada nas Sprints
    anteriores.

    Sprint 07.2 — identidade visual: usa exatamente o mesmo Design System do
    aplicativo desktop (fundo/gradiente/tipografia/cartões), para que app e
    relatório pareçam o mesmo produto. Nenhuma regra de classificação,
    cálculo ou dado exibido muda em relação às Sprints anteriores — só a
    apresentação."""
    agora = agora or datetime.now()
    avisos = avisos or []
    avisos_por_arquivo = _agrupar_avisos_por_arquivo(avisos)

    sucesso: list[ItemResultado] = []
    atencao: list[tuple[ItemResultado, list[tuple[str, str]]]] = []
    for item in resultado.gravados:
        pendencias = _pendencias_do_item(item, avisos_por_arquivo.get(item.arquivo_origem, []))
        if pendencias:
            atencao.append((item, pendencias))
        else:
            sucesso.append(item)

    total_analisados = resultado.total_gravado + resultado.duplicadas_ignoradas + len(erros)
    tempo_formatado = (
        _formatar_duracao(tempo_processamento_ms) if tempo_processamento_ms is not None else "—"
    )

    html = f"""<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="theme-color" content="{_BG}">
<title>Relatório — Extrator de Diárias</title>
<style>{_ESTILO}</style>
</head>
<body>
<div class="container">
{_cabecalho()}
{_metadados(agora, caminho_planilha)}
{_acoes_relatorio()}

<div class="resumo">
  {_cartao("PDFs analisados", total_analisados, "padrao")}
  {_cartao("Diárias inseridas", resultado.total_gravado, "sucesso")}
  {_cartao("Duplicados", resultado.duplicadas_ignoradas, "info")}
  {_cartao("Revisões recomendadas", len(atencao), "aviso")}
  {_cartao("Necessitam inserção manual", len(erros), "erro")}
  {_cartao("Tempo de processamento", tempo_formatado, "padrao", _ICONE_RELOGIO)}
</div>

{_titulo_secao(_ICONE_XCIRCLE, "erro", "Necessitam inserção manual", len(erros))}
{_secao_criticos(erros)}

{_titulo_secao(_ICONE_ALERTA, "aviso", "Revisão recomendada", len(atencao))}
{_secao_atencao(atencao)}

{_titulo_secao(_ICONE_CHECK, "sucesso", "Inserido automaticamente", len(sucesso))}
{_secao_sucesso(sucesso)}

{_titulo_secao(_ICONE_INFO, "info", "Duplicadas — mesmo SEI repetido neste lote", len(resultado.duplicados_no_lote))}
{_tabela(resultado.duplicados_no_lote, ["Arquivo", "SEI"], lambda i: [i.arquivo_origem, i.sei])}

{_titulo_secao(_ICONE_INFO, "info", "Duplicadas — SEI já existente na planilha", len(resultado.duplicados_na_planilha))}
{_tabela(
    resultado.duplicados_na_planilha,
    ["Arquivo", "SEI", "Já existe na linha"],
    lambda i: [i.arquivo_origem, i.sei, str(i.linha)],
)}

{_secao_detalhes_tecnicos(avisos)}

{_rodape(agora)}
</div>
</body>
</html>
"""

    with open(caminho_relatorio, "w", encoding="utf-8") as arquivo:
        arquivo.write(html)


def _cartao(rotulo: str, valor: object, cor: str = "padrao", icone: str | None = None) -> str:
    icone_svg = _svg_icone(icone if icone is not None else _ICONE_POR_COR.get(cor, _ICONE_ARQUIVO))
    return (
        f'<div class="cartao {cor}">'
        f'<div class="selo-icone {cor}">{icone_svg}</div>'
        f'<div class="valor">{escape(str(valor))}</div>'
        f'<div class="rotulo">{escape(rotulo)}</div>'
        f"</div>"
    )


def _valor_formatado(item: ItemResultado) -> str:
    if not item.valor_total_diarias:
        return ""
    return f"R$ {item.valor_total_diarias}"


def _rodape_item(item: ItemResultado) -> str:
    partes = [f"Tipo do processo: {rotulo_tipo_processo(item.tipo_processo)}"]
    if item.valor_total_diarias:
        partes.append(f"Valor Total das Diárias: {_valor_formatado(item)}")
    if item.transporte:
        fonte = f" ({rotulo_fonte_transporte(item.transporte_fonte)})" if item.transporte_fonte else ""
        partes.append(f"Transporte: {item.transporte}{fonte}")
    return f'<div class="rodape">{escape(" · ".join(partes))}</div>'


def _secao_criticos(erros: list[ItemErro]) -> str:
    if not erros:
        return '<p class="vazio">Nenhum processo precisou de inserção manual nesta execução.</p>'

    return "".join(
        f"""<div class="item critico">
  <div><span class="arquivo">{escape(erro.arquivo_origem)}</span></div>
  <div class="selo critico">❌ NECESSITA INSERÇÃO MANUAL</div>
  <div class="pendencia">
    <div class="motivo"><strong>Motivo:</strong> {escape('; '.join(erro.motivos))}</div>
    <div class="acao"><strong>Ação recomendada:</strong> {escape(_ORIENTACAO_ERRO)}</div>
  </div>
</div>"""
        for erro in erros
    )


def _secao_atencao(atencao: list[tuple[ItemResultado, list[tuple[str, str]]]]) -> str:
    if not atencao:
        return '<p class="vazio">Nenhuma diária inserida precisou de revisão adicional.</p>'

    return "".join(
        f"""<div class="item">
  <div><span class="arquivo">{escape(item.arquivo_origem)}</span><span class="sei">SEI {escape(item.sei)} · linha {item.linha}</span></div>
  <div class="selo atencao">⚠ Revisão recomendada</div>
  {_lista_pendencias(pendencias)}
  {_rodape_item(item)}
</div>"""
        for item, pendencias in atencao
    )


def _lista_pendencias(pendencias: list[tuple[str, str]]) -> str:
    return "".join(
        f"""<div class="pendencia">
    <div class="motivo"><strong>Motivo:</strong> {escape(motivo)}</div>
    <div class="acao"><strong>Ação recomendada:</strong> {escape(acao)}</div>
  </div>"""
        for motivo, acao in pendencias
    )


def _secao_sucesso(sucesso: list[ItemResultado]) -> str:
    if not sucesso:
        return '<p class="vazio">Nenhuma diária inserida sem pendências nesta execução.</p>'

    cabecalho = "".join(
        f"<th>{escape(c)}</th>"
        for c in (
            "Arquivo",
            "SEI",
            "Linha",
            "Tipo do processo",
            "Valor Total das Diárias",
            "Transporte",
            "Origem do Transporte",
            "Situação",
        )
    )
    linhas = "".join(
        f"""<tr>
  <td>{escape(item.arquivo_origem)}</td>
  <td>{escape(item.sei)}</td>
  <td>{item.linha}</td>
  <td>{escape(rotulo_tipo_processo(item.tipo_processo))}</td>
  <td>{escape(_valor_formatado(item))}</td>
  <td>{escape(item.transporte or "")}</td>
  <td>{escape(rotulo_fonte_transporte(item.transporte_fonte) if item.transporte_fonte else "")}</td>
  <td><span class="selo sucesso">✔ Inserido automaticamente</span></td>
</tr>"""
        for item in sucesso
    )
    return f"<table><thead><tr>{cabecalho}</tr></thead><tbody>{linhas}</tbody></table>"


def _secao_detalhes_tecnicos(avisos: list[ItemAviso]) -> str:
    """Preserva, sem reescrever, todas as mensagens técnicas originais das
    Sprints anteriores — inclusive as puramente informativas (ex.:
    desambiguação por contexto) que não geram pendência nas seções
    curadas acima. Recolhida por padrão para não competir visualmente com
    as seções de ação, mas nada é omitido do relatório."""
    if not avisos:
        return ""

    linhas = "".join(
        f"<tr><td>{escape(aviso.arquivo_origem)}</td><td>{escape('; '.join(aviso.mensagens))}</td></tr>"
        for aviso in avisos
    )
    return f"""<details class="tecnico">
<summary>Observações técnicas adicionais ({len(avisos)} arquivo(s))</summary>
<table><thead><tr><th>Arquivo</th><th>Observação</th></tr></thead><tbody>{linhas}</tbody></table>
</details>"""


def _tabela(itens: list[ItemResultado], colunas: list[str], linha_de) -> str:
    if not itens:
        return '<p class="vazio">Nenhum item nesta categoria.</p>'

    cabecalho = "".join(f"<th>{escape(c)}</th>" for c in colunas)
    linhas = "".join(
        "<tr>" + "".join(f"<td>{escape(valor)}</td>" for valor in linha_de(item)) + "</tr>"
        for item in itens
    )
    return f"<table><thead><tr>{cabecalho}</tr></thead><tbody>{linhas}</tbody></table>"
