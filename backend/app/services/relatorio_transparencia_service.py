"""Micro-sprint 3D — camada de orquestração do Relatório de Diárias —
Portal da Transparência. Conecta os componentes já homologados das
Micro-sprints 1-3C (leitores, motor de reconciliação, motor de decisão,
persistência de decisões) sem reimplementar nenhuma regra de negócio —
este módulo só ORQUESTRA, nunca decide (RN01-RN07 continuam
responsabilidade exclusiva de `motor_decisao.classificar`).

**Decisão arquitetural de estado (item 9 da Micro-sprint 3D)**: nenhum
resultado derivado da reconciliação é persistido entre chamadas. Toda
operação — inclusive `registrar_decisao_revisao` — reconstrói o estado
completo a partir das fontes brutas (E-Fisco + Controle DIMCAC) e das
decisões já persistidas, sempre. Isso significa que uma decisão nunca é
validada contra o que o frontend *acha* que é a evidência atual — ela é
sempre calculada contra o que as fontes *realmente* dizem no momento do
registro (item 4 da especificação: "nunca confiar apenas em dados
enviados pelo frontend"). O custo é reler as fontes a cada chamada; o
ganho é determinismo e segurança contra decisão tomada sobre evidência
obsoleta — preferido explicitamente a um cache frágil (§9 da
especificação da Micro-sprint 3D).

Plano de Migração E-Fisco, Sprint C — a fonte financeira primária deste
módulo passou da Base de Ordens Bancárias (ClickView) para a Base E-Fisco
(`repositorio_efisco` → `filtro_diaria_efisco` → `adaptador_efisco`, já
homologados nas Sprints A/B). `repositorio_ordens_bancarias.py`
(ClickView) NÃO é mais importado aqui — nenhum fallback, nenhum pipeline
duplo: se a Base E-Fisco falhar, a falha propaga como sempre propagou
para a Base OB (mesmas exceções, ver abaixo), nunca um retorno silencioso
ao ClickView. Controle DIMCAC e Planilha de Passagens continuam
exatamente como estavam — nenhuma mudança nesses dois módulos.

Plano de Migração E-Fisco, Sprint D — renomeação coordenada concluída: o
parâmetro `caminho_base_efisco` e as exceções `BaseEfiscoNaoEncontrada`/
`EstruturaBaseEfiscoInvalida` (antes `caminho_base_ordens_bancarias`/
`BaseOBNaoEncontrada`/`EstruturaBaseOBInvalida`, nomes do ClickView) agora
refletem a fonte real em todo o contrato público — `app/api/
relatorio_transparencia.py`, `app/schemas/relatorio_transparencia.py` e
`app/consulta/configuracao_fontes_relatorio_transparencia.py` foram
atualizados juntos, na mesma Sprint. Retrocompatibilidade da configuração
persistida (chave JSON antiga) é responsabilidade exclusiva de
`configuracao_fontes_relatorio_transparencia.ConfiguracaoFontes.from_dict`
— este módulo nunca lida com o formato legado diretamente."""

import logging
import os
import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, datetime

from app.consulta.configuracao_template_relatorio_transparencia import (
    ConfiguracaoTemplateCorrompida,
    TemplateOficialIndisponivel,
    resolver_caminho_template,
)
from app.consulta.persistencia_decisoes import (
    PersistenciaDecisoesCorrompida,
    VersaoEsquemaIncompativel,
    carregar_decisoes,
    salvar_decisao,
)
from app.consulta.repositorio_controle_dimcac import (
    ControleDimcacEstruturalmenteInvalido,
    abrir_controle_dimcac,
    controle_dimcac_por_dh,
)
from app.consulta.repositorio_efisco import (
    EfiscoEstruturalmenteInvalido,
    abrir_base_efisco,
    linhas_efisco,
)
from app.consulta.repositorio_planilha_passagens import (
    EstruturaPlanilhaPassagensInvalida,
    PlanilhaPassagensNaoEncontrada,
    abrir_planilha_passagens,
    linhas_passagens_por_ob,
)
from app.domain.relatorio_transparencia.adaptador_efisco import ordens_bancarias_por_dh_via_efisco
from app.domain.relatorio_transparencia.competencia import intervalo_acumulado
from app.domain.relatorio_transparencia.cruzamento_passagens import anexar_passagens_ao_resultado
from app.domain.relatorio_transparencia.filtro_diaria_efisco import diaria_elegivel
from app.domain.relatorio_transparencia.gates_qualidade_efisco import (
    CoberturaInsuficienteEfisco,
    DiagnosticoQualidadeEfisco,
    avaliar_qualidade_efisco,
)
from app.domain.relatorio_transparencia.decisao import (
    AcaoDecisao,
    CategoriaNaoPublicada,
    ContextoRevisaoParaExibicao,
    DecisaoHumana,
    EstadoRevisao,
    ResultadoRevisado,
    RevisaoComEstado,
    aplicar_decisoes,
    contexto_para_exibicao,
    identidade_grupo as calcular_identidade_grupo,
    identidades_ocorrencias,
    registrar_decisao,
)
from app.domain.relatorio_transparencia.motor_decisao import OcorrenciaFinanceira, classificar
from app.domain.relatorio_transparencia.motor_reconciliacao import reconciliar
from app.planilha.escritor_relatorio_nao_publicadas import (
    gerar_xlsx_diarias_nao_publicadas,
)
from app.planilha.escritor_relatorio_transparencia import (
    DestinoInacessivel,
    DestinoJaExiste,
    GeracaoConcorrenteEmAndamento,
    RelatorioBloqueadoPorPendencias,
    RelatorioGeradoResultado,
    TemplateEstruturalmenteInvalido,
    _MESES_EXTENSO,  # noqa: PLC2701 — mesmo reuso já praticado (ex. `_cpf_normalizado`, `_adquirir_trava_destino`): nunca uma segunda lista de nomes de mês
    gerar_xlsx_relatorio_transparencia,
)

__all__ = [
    "BaseEfiscoNaoEncontrada",
    "EstruturaBaseEfiscoInvalida",
    "CoberturaInsuficienteEfisco",
    "ControleDimcacNaoEncontrado",
    "EstruturaControleInvalida",
    "PlanilhaPassagensNaoEncontrada",
    "EstruturaPlanilhaPassagensInvalida",
    "RevisaoNaoEncontrada",
    "DecisaoInvalida",
    "PersistenciaDecisoesCorrompida",
    "VersaoEsquemaIncompativel",
    "RelatorioBloqueadoPorPendencias",
    "DestinoJaExiste",
    "DestinoInacessivel",
    "VersaoDeGeracaoEsgotada",
    "GeracaoConcorrenteEmAndamento",
    "TemplateEstruturalmenteInvalido",
    "TemplateOficialIndisponivel",
    "ConfiguracaoTemplateCorrompida",
    "OcorrenciaResumo",
    "RevisaoResumo",
    "ResumoRelatorio",
    "RelatorioCompletoGeradoResultado",
    "preparar_relatorio",
    "listar_revisoes",
    "registrar_decisao_revisao",
    "gerar_relatorio_xlsx",
]

_logger = logging.getLogger(__name__)


class BaseEfiscoNaoEncontrada(Exception):
    """Caminho da Base E-Fisco informado não existe no filesystem —
    distinto de estrutura inválida (arquivo existe, mas não tem as
    colunas/aba esperadas)."""


class EstruturaBaseEfiscoInvalida(Exception):
    """Base E-Fisco existe, mas `abrir_base_efisco` rejeitou (extensão
    errada, corrompida, colunas obrigatórias ausentes)."""


class ControleDimcacNaoEncontrado(Exception):
    """Caminho do Controle DIMCAC informado não existe no filesystem."""


class EstruturaControleInvalida(Exception):
    """Controle DIMCAC existe, mas `abrir_controle_dimcac` rejeitou
    (extensão errada, corrompido, aba obrigatória ausente)."""


class RevisaoNaoEncontrada(Exception):
    """`identidade_grupo` informado não corresponde a nenhuma revisão do
    estado atual (recalculado na hora, nunca de um cache antigo)."""


class DecisaoInvalida(Exception):
    """OB selecionada não pertence ao grupo da revisão, ou combinação de
    campos contraditória (ex.: ADIAR com OBs selecionadas)."""


@dataclass(frozen=True)
class OcorrenciaResumo:
    """Visão principal de uma ocorrência (`docs/relatorio-transparencia/
    README.md` § 6) — só os campos que a futura tela de revisão precisa;
    nunca expõe `RegistroControle`, fingerprint ou qualquer estrutura
    interna do motor."""

    ob: str
    dh: str
    beneficiario: str | None
    sei: str | None
    data_ob: datetime | None
    periodo_inicial: date | None
    periodo_final: date | None
    trecho: str | None
    valor: float | None
    motivo: str | None
    restituicao: float | None
    identidade: str
    """Identidade por ocorrência (HOMO-RT-02) — igual a `ob` quando a OB
    não se repete fisicamente no grupo (todo RN07); `"{ob}#{N}"` quando se
    repete (RN04, I11). É essa identidade, nunca `ob` isolada, que a UI
    deve usar como React key e como chave de seleção dos checkboxes —
    `ob` sozinha não distingue duas ocorrências físicas da mesma OB."""


@dataclass(frozen=True)
class RevisaoResumo:
    identidade_grupo: str
    regra: str
    estado: str
    explicacao: str
    campos_iguais: list[str]
    campos_diferentes: list[str]
    ocorrencias: list[OcorrenciaResumo]
    autor: str | None = None
    decidido_em: datetime | None = None
    observacao: str | None = None
    obs_publicaveis: list[str] | None = None
    # Sprint D.1 (QA manual, transparência de reaproveitamento) — `True`
    # quando `decisao` já existia de uma execução/competência ANTERIOR a
    # esta preparação (`decisao.ano_exercicio`/`mes_referencia` diferentes
    # dos informados agora, ou ausentes por serem de formato legado). Nunca
    # `True` quando `autor`/`decidido_em` são `None` (nada decidido).
    reaplicada_de_execucao_anterior: bool = False
    """Histórico da última decisão registrada para este grupo (HOMO-RT-02
    / histórico de decisões) — `None` quando o grupo nunca teve decisão
    (PENDENTE). `obs_publicaveis` é exposto exatamente como persistido
    (pode estar no formato antigo, por OB, para decisões anteriores a esta
    correção — nunca reinterpretado aqui, só exibido)."""


@dataclass(frozen=True)
class ResumoRelatorio:
    total_candidatos_normais: int
    total_revisoes: int
    total_pendentes: int
    total_decididas: int
    total_adiadas: int
    total_desatualizadas: int
    total_ocorrencias_nao_publicaveis: int
    pode_gerar_relatorio: bool
    revisoes: list[RevisaoResumo] = field(default_factory=list)
    total_requer_nova_decisao: int = 0
    # Plano de Migração E-Fisco, Sprint D — diagnóstico de qualidade da
    # Base E-Fisco (`gates_qualidade_efisco.avaliar_qualidade_efisco`):
    # nunca bloqueante por si só (um bloqueio real já impediu a
    # reconstrução antes de chegar aqui, via `CoberturaInsuficienteEfisco`)
    # — só informativo, para a tela de revisão sinalizar ao usuário.
    avisos_qualidade_fonte: list[str] = field(default_factory=list)
    diagnosticos_qualidade_fonte: list[str] = field(default_factory=list)
    # Sprint D.1 (QA manual) — quantas das revisões DECIDIDA/ADIADA acima
    # vieram de uma decisão de execução/competência anterior, reaplicada
    # silenciosamente (nunca reperguntada — G06 preservado); soma de
    # `RevisaoResposta.reaplicada_de_execucao_anterior`. Puramente
    # informativo, nunca afeta `pode_gerar_relatorio`.
    total_decisoes_reaproveitadas: int = 0
    # Sprint D.1 (P2, cobertura parcial E-Fisco) — `True` quando esta
    # preparação prosseguiu apesar de cobertura insuficiente (o chamador
    # aceitou explicitamente `aceitar_cobertura_parcial=True`); `cobertura_
    # efisco_ate` é a última data de pagamento confirmada USADA — nunca
    # inventa cobertura além do que a fonte realmente comprova.
    cobertura_parcial: bool = False
    cobertura_efisco_ate: date | None = None


@dataclass(frozen=True)
class RelatorioCompletoGeradoResultado:
    """Sprint 5 (plano "Valor da Passagem + Não Publicadas") — resultado da
    geração CONJUNTA dos dois artefatos, a partir do MESMO `ResultadoRevisado`
    (nunca reprocessado entre um arquivo e outro). Nunca substitui
    `RelatorioGeradoResultado` (contrato do escritor oficial, já homologado,
    intocado) — só agrega o resultado dele com o do escritor operacional
    (Sprint 4).

    `nao_publicadas_gerado=False` cobre DOIS cenários bem distintos, cada um
    com seu próprio significado:
    - `total_nao_publicadas == 0`: não havia nada a gerar (G04 já garantiu
      isso — nenhuma diária ficou de fora). Comportamento intencional
      (item 1 do pedido): NUNCA cria um XLSX operacional vazio.
      `erro_nao_publicadas` permanece `None` neste caso — não é uma falha.
    - `total_nao_publicadas > 0` mas a escrita do arquivo operacional
      falhou DEPOIS do oficial já ter sido promovido com sucesso: estado
      PARCIAL, nunca escondido — `erro_nao_publicadas` traz a causa. O
      oficial já está seguro no destino (nunca desfeito); só o operacional
      precisa ser gerado de novo (mesma proteção de no-clobber do escritor
      operacional protege uma nova tentativa)."""

    oficial: RelatorioGeradoResultado
    caminho_arquivo_nao_publicadas: str | None
    total_nao_publicadas: int
    total_categoria_a: int
    total_categoria_b: int
    nao_publicadas_gerado: bool
    erro_nao_publicadas: str | None = None


_PADRAO_SUFIXO_VERSAO = re.compile(r"(\.\d+)$")


def _sufixo_versao(caminho_destino_oficial: str) -> str:
    """Achado real (auditoria de falha na geração do operacional) — o
    caminho do oficial é escolhido livremente pelo usuário num diálogo
    nativo do SO (`dialog.showSaveDialog`, sem nenhuma convenção de
    versionamento própria do app); quando o destino sugerido já existe, o
    próprio usuário tipicamente acrescenta ".2"/".3"/... ao nome antes de
    salvar de novo. Esta função só LÊ esse sufixo do nome REAL que o
    usuário efetivamente escolheu (nunca um segundo esquema independente
    de versionamento, nunca um contador mantido por este módulo) — se o
    nome termina em ".<dígitos>", ecoa o mesmo sufixo; caso contrário
    (primeira geração, ou o usuário escolheu um nome sem esse padrão),
    devolve string vazia. Deliberadamente não confunde o "2026" do ano
    civil com um sufixo de versão: só casa um PONTO literal seguido de
    dígitos no fim do nome (o ano vem sempre precedido de um espaço no
    nome sugerido, nunca de um ponto)."""
    raiz, _extensao = os.path.splitext(os.path.basename(caminho_destino_oficial))
    correspondencia = _PADRAO_SUFIXO_VERSAO.search(raiz)
    return correspondencia.group(1) if correspondencia else ""


def _derivar_caminho_nao_publicadas(caminho_destino_oficial: str, *, ano_exercicio: int, mes_referencia: int) -> str:
    """Mesma pasta do XLSX oficial (item 1: "a partir do MESMO
    ResultadoRevisado", mesma operação, sem pedir um segundo diálogo ao
    usuário — nenhuma seleção nova de destino). Nome por competência, mesma
    convenção já usada no nome sugerido do oficial (mês por extenso + ano)
    — `_MESES_EXTENSO` é a MESMA lista já usada para o título dentro do
    XLSX oficial, nunca uma segunda lista de nomes de mês.

    QA Codex (achado real, falha de geração) — o nome do operacional era
    fixo por competência, nunca refletindo o nome REAL escolhido para o
    oficial: numa segunda geração da mesma competência (oficial salvo com
    um nome novo, ex. "...2026.2.xlsx", para não sobrescrever o anterior),
    o operacional tentava sempre o MESMO caminho da primeira geração e
    colidia com o arquivo que ela já tinha criado (`DestinoJaExiste`) —
    mesmo com o oficial tendo sido gerado com sucesso. Corrigido ecoando o
    sufixo de versão do nome REAL do oficial (`_sufixo_versao`) no nome do
    operacional — os dois artefatos desta geração agora sempre compartilham
    a mesma versão, sem precisar de um segundo diálogo nem de um segundo
    esquema de versionamento."""
    diretorio = os.path.dirname(os.path.abspath(caminho_destino_oficial)) or "."
    mes_nome = _MESES_EXTENSO[mes_referencia - 1].capitalize()
    sufixo = _sufixo_versao(caminho_destino_oficial)
    return os.path.join(diretorio, f"Diarias_Nao_Publicadas_{mes_nome}_{ano_exercicio}{sufixo}.xlsx")


def _raiz_sem_sufixo_versao(caminho: str) -> str:
    """Remove um sufixo de versão (`_sufixo_versao`) já presente no
    caminho, se houver — devolve a raiz estável a partir da qual
    `_proximo_par_de_versao_livre` sempre recomeça a busca em N=1, nunca
    um segundo padrão de detecção: reaproveita literalmente `_sufixo_
    versao`. Sem isso, um caminho que o chamador já tivesse passado com
    ".2" faria a busca recomeçar em ".2.2"/".2.3"/... em vez de N=1,2,3."""
    sufixo = _sufixo_versao(caminho)
    if not sufixo:
        return caminho
    diretorio, nome = os.path.split(caminho)
    raiz, extensao = os.path.splitext(nome)
    return os.path.join(diretorio, raiz[: -len(sufixo)] + extensao)


class VersaoDeGeracaoEsgotada(Exception):
    """Nenhuma das primeiras `_MAX_TENTATIVAS_VERSAO_PAR` versões estava
    livre para os DOIS artefatos — praticamente impossível em uso real
    (exigiria milhares de gerações acumuladas da mesma competência no
    mesmo diretório); existe só como rede de segurança explícita, nunca um
    laço infinito silencioso."""


_MAX_TENTATIVAS_VERSAO_PAR = 1000


def _proximo_par_de_versao_livre(
    caminho_destino_base: str, *, ano_exercicio: int, mes_referencia: int
) -> tuple[str, str]:
    """QA Codex (achado real, complemento) — mesmo depois de o operacional
    passar a acompanhar a versão REAL do oficial (`_derivar_caminho_nao_
    publicadas`), o usuário ainda precisava escolher manualmente um nome
    novo para o oficial toda vez que a competência já tinha sido gerada
    antes (senão o PRÓPRIO oficial batia no no-clobber). Esta função
    elimina essa necessidade: devolve o par (oficial, operacional) da
    PRIMEIRA versão (1, 2, 3, ...) em que NENHUM dos dois já existe —
    nunca dois algoritmos de versionamento independentes, o candidato do
    operacional de cada N é sempre obtido reaproveitando literalmente
    `_derivar_caminho_nao_publicadas` (a MESMA função já homologada).

    Requisito de produto: se QUALQUER um dos dois nomes da versão N já
    existir, a versão N inteira é pulada para os DOIS artefatos — nunca um
    oficial na versão 2 pareado com um operacional na versão 3. Preenche
    lacunas naturalmente (é uma busca linear a partir de N=1, para na
    PRIMEIRA livre) — uma versão 2 livre entre a 1 e a 3 já ocupadas é
    escolhida, nunca pulada para a 4.

    `os.path.exists` aqui é só uma checagem OTIMISTA — evita a imensa
    maioria das tentativas fracassadas no uso normal (sequencial, um
    processo por vez); não é, sozinha, a garantia contra corrida entre
    processos (isso continua sendo a trava+no-clobber já homologada de
    cada escritor). `gerar_relatorio_xlsx` trata explicitamente o caso de
    a escrita real perder essa corrida, tentando a próxima versão
    automaticamente — ver comentário no call site."""
    raiz = _raiz_sem_sufixo_versao(caminho_destino_base)
    diretorio, nome = os.path.split(raiz)
    base, extensao = os.path.splitext(nome)
    for versao in range(1, _MAX_TENTATIVAS_VERSAO_PAR + 1):
        sufixo = "" if versao == 1 else f".{versao}"
        candidato_oficial = os.path.join(diretorio, f"{base}{sufixo}{extensao}")
        candidato_nao_publicadas = _derivar_caminho_nao_publicadas(
            candidato_oficial, ano_exercicio=ano_exercicio, mes_referencia=mes_referencia
        )
        if not os.path.exists(candidato_oficial) and not os.path.exists(candidato_nao_publicadas):
            return candidato_oficial, candidato_nao_publicadas
    raise VersaoDeGeracaoEsgotada(
        f"Não foi possível encontrar uma versão livre para esta geração depois de "
        f"{_MAX_TENTATIVAS_VERSAO_PAR} tentativas — verifique o diretório de destino: {diretorio}"
    )


def _ordens_bancarias_via_efisco(caminho_base_efisco: str, controle_por_dh: dict) -> tuple[dict, list, list]:
    """Plano de Migração E-Fisco, Sprint C — substitui `_abrir_base_ob` +
    `ordens_bancarias_por_dh` (Base OB/ClickView) no pipeline produtivo.
    Abre a Base E-Fisco, aplica o filtro de diária elegível já homologado
    (`filtro_diaria_efisco.diaria_elegivel`, Sprint A) e adapta para
    `OrdemBancaria` usando o Controle DIMCAC já lido (`adaptador_efisco`,
    Sprint B). Devolve `(por_dh, linhas_brutas, linhas_elegiveis)`: `por_dh`
    tem exatamente a mesma forma (`dict[str, list[OrdemBancaria]]`) que
    `ordens_bancarias_por_dh` sempre devolveu, para que `motor_
    reconciliacao.reconciliar` (chamado logo depois) não precise de nenhuma
    mudança; `linhas_brutas`/`linhas_elegiveis` (Sprint D) alimentam
    `gates_qualidade_efisco.avaliar_qualidade_efisco`, chamado por quem
    invoca esta função.

    Mesma ordem de checagem/mesmas exceções públicas de sempre
    (`BaseEfiscoNaoEncontrada`/`EstruturaBaseEfiscoInvalida` — nomes históricos,
    ver docstring do módulo): arquivo ausente é checado ANTES de tentar
    abrir (mesmo padrão já usado para a Base OB), para que "não
    encontrado" (404 na API) nunca seja confundido com "estrutura
    inválida" (422). Nenhum fallback: se `abrir_base_efisco`/`linhas_
    efisco` falhar, a exceção propaga — `repositorio_ordens_bancarias.py`
    (ClickView) nem é importado neste módulo."""
    if not os.path.isfile(caminho_base_efisco):
        raise BaseEfiscoNaoEncontrada(f"Base E-Fisco não encontrada: {caminho_base_efisco}")
    try:
        planilha_efisco = abrir_base_efisco(caminho_base_efisco)
    except EfiscoEstruturalmenteInvalido as erro:
        raise EstruturaBaseEfiscoInvalida(str(erro)) from erro

    resultado_leitura = linhas_efisco(planilha_efisco)
    linhas_elegiveis = [linha for linha in resultado_leitura.linhas if diaria_elegivel(linha)]
    resultado_adaptacao = ordens_bancarias_por_dh_via_efisco(linhas_elegiveis, controle_por_dh)
    return resultado_adaptacao.por_dh, resultado_leitura.linhas, linhas_elegiveis


def _abrir_controle(caminho: str):
    if not os.path.isfile(caminho):
        raise ControleDimcacNaoEncontrado(f"Controle DIMCAC não encontrado: {caminho}")
    try:
        return abrir_controle_dimcac(caminho)
    except ControleDimcacEstruturalmenteInvalido as erro:
        raise EstruturaControleInvalida(str(erro)) from erro


def _montar_resultado_revisado(
    *,
    caminho_base_efisco: str,
    caminho_controle_dimcac: str,
    ano_exercicio: int,
    mes_referencia: int,
    caminho_decisoes: str,
    caminho_planilha_passagens: str | None = None,
    aceitar_cobertura_parcial: bool = False,
) -> tuple[ResultadoRevisado, DiagnosticoQualidadeEfisco]:
    """Núcleo único de reconstrução — reaproveitado por `preparar_relatorio`,
    `listar_revisoes`, `registrar_decisao_revisao` e `gerar_relatorio_xlsx`.
    Nunca lê nem escreve nada além do que os componentes já homologados
    leem/escrevem (nenhum novo formato de arquivo, nenhuma nova leitura de
    estado).

    Sprint 3 (HOMO-RT-06) — `caminho_planilha_passagens` é OPCIONAL e
    retrocompatível: `None` (padrão) preserva EXATAMENTE o comportamento
    anterior a esta Sprint, nenhuma leitura nova, `OcorrenciaFinanceira.
    passagem` permanece `None` (estado E) para toda ocorrência — nenhum
    chamador existente precisa mudar. Quando informado, a Planilha de
    Passagens é lida e cruzada por OB (Sprint 1/2) e anexada ao resultado
    JÁ CLASSIFICADO por `classificar()` (RN01-RN07), ANTES de
    `aplicar_decisoes` — para que o fingerprint calculado ali já reflita o
    Valor da Passagem (HOMO-RT-06).

    Plano de Migração E-Fisco, Sprint C — Controle DIMCAC é lido ANTES da
    fonte financeira (ordem invertida em relação à Base OB): o adaptador
    E-Fisco (`_ordens_bancarias_via_efisco`) precisa de `resultado_
    controle.por_dh` já em mãos para enriquecer cada `OrdemBancaria` com
    SEI/cargo/período/trecho/transporte/motivo no momento em que ela é
    criada — ao contrário da Base OB, que trazia esses campos prontos e só
    era cruzada com o Controle depois, em `reconciliar`."""
    planilha_controle = _abrir_controle(caminho_controle_dimcac)
    resultado_controle = controle_dimcac_por_dh(planilha_controle)

    ordens_por_dh, linhas_brutas, linhas_elegiveis = _ordens_bancarias_via_efisco(
        caminho_base_efisco, resultado_controle.por_dh
    )

    intervalo = intervalo_acumulado(ano_exercicio, mes_referencia)

    # Plano de Migração E-Fisco, Sprint D — gate de qualidade da fonte,
    # ANTES de reconciliar/classificar: um BLOQUEIO aqui propaga como
    # `CoberturaInsuficienteEfisco`, nunca prossegue silenciosamente com
    # uma competência que a fonte comprovadamente não cobre. Avisos/
    # diagnósticos (nunca bloqueantes) seguem junto no retorno, para quem
    # chamou expor a quem revisa — ausência de Controle DIMCAC nunca entra
    # aqui como bloqueio (princípio já homologado: nunca exclui diária).
    diagnostico_qualidade = avaliar_qualidade_efisco(
        linhas_brutas=linhas_brutas,
        linhas_elegiveis=linhas_elegiveis,
        controle_por_dh=resultado_controle.por_dh,
        intervalo=intervalo,
    )
    # Sprint D.1 (P2, cobertura parcial) — `aceitar_cobertura_parcial=True`
    # transforma o BLOQUEIO em prosseguimento explícito, nunca silencioso:
    # quem chamou já foi avisado (`cobertura_paga_ate`) e escolheu
    # ativamente continuar. Nada além disto muda — nenhum candidato/linha é
    # filtrado por data aqui (RN01-RN07 continuam intocadas): a fonte já só
    # inclui o que tem Situação=Paga comprovada (nunca infere pagamento
    # futuro nem trata ausência como recusa), então "cobertura parcial" é
    # sempre uma limitação do QUANTO a fonte cobre, nunca do QUE é
    # processado dentro do que ela cobre.
    if diagnostico_qualidade.bloqueios and not aceitar_cobertura_parcial:
        raise CoberturaInsuficienteEfisco(
            " ".join(diagnostico_qualidade.bloqueios),
            cobertura_paga_ate=diagnostico_qualidade.cobertura_paga_ate,
        )

    resultado_reconciliado = reconciliar(resultado_controle.por_dh, ordens_por_dh)
    resultado_classificado = classificar(resultado_reconciliado, intervalo)

    if caminho_planilha_passagens is not None:
        tabela_passagens = abrir_planilha_passagens(caminho_planilha_passagens)
        resultado_passagens = linhas_passagens_por_ob(tabela_passagens)
        resultado_classificado = anexar_passagens_ao_resultado(resultado_classificado, resultado_passagens.por_ob)

    decisoes = carregar_decisoes(caminho_decisoes)
    revisado = aplicar_decisoes(
        resultado_classificado,
        decisoes,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        cobertura_efisco_ate=diagnostico_qualidade.cobertura_paga_ate if diagnostico_qualidade.bloqueios else None,
    )
    return revisado, diagnostico_qualidade


def _ocorrencia_resumo(oc: OcorrenciaFinanceira, identidade: str) -> OcorrenciaResumo:
    ordem = oc.ordem_bancaria
    return OcorrenciaResumo(
        ob=ordem.ob,
        dh=oc.dh,
        beneficiario=ordem.nome,
        sei=ordem.sei,
        data_ob=ordem.data_pagamento,
        periodo_inicial=ordem.periodo_inicial,
        periodo_final=ordem.periodo_final,
        trecho=ordem.trecho,
        valor=ordem.valor,
        motivo=ordem.motivo,
        restituicao=ordem.restituicao,
        identidade=identidade,
    )


# Sprint D.1 — os dois únicos estados onde uma decisão foi de fato
# aplicada (PENDENTE/DESATUALIZADA/REQUER_NOVA_DECISAO nunca contam para
# "decisões reaproveitadas": não há decisão vigente nesses estados).
_ESTADOS_RESOLVIDOS = frozenset({EstadoRevisao.DECIDIDA, EstadoRevisao.ADIADA})


def _revisao_resumo(
    contexto: ContextoRevisaoParaExibicao,
    estado: EstadoRevisao,
    decisao: DecisaoHumana | None = None,
    *,
    reaplicada_de_execucao_anterior: bool = False,
) -> RevisaoResumo:
    identidades = identidades_ocorrencias(contexto.ocorrencias)
    return RevisaoResumo(
        identidade_grupo=contexto.identidade_grupo,
        regra=contexto.regra,
        estado=estado.value,
        explicacao=contexto.explicacao,
        campos_iguais=contexto.campos_iguais,
        campos_diferentes=contexto.campos_diferentes,
        ocorrencias=[
            _ocorrencia_resumo(oc, identidade) for oc, identidade in zip(contexto.ocorrencias, identidades)
        ],
        autor=decisao.autor if decisao else None,
        decidido_em=decisao.decidido_em if decisao else None,
        observacao=decisao.observacao if decisao else None,
        obs_publicaveis=sorted(decisao.obs_publicaveis) if decisao else None,
        reaplicada_de_execucao_anterior=reaplicada_de_execucao_anterior,
    )


def _resumo(revisado: ResultadoRevisado, diagnostico_qualidade: DiagnosticoQualidadeEfisco) -> ResumoRelatorio:
    por_estado = Counter(r.estado for r in revisado.revisoes)
    revisoes = [
        _revisao_resumo(
            contexto_para_exibicao(r.revisao),
            r.estado,
            r.decisao,
            reaplicada_de_execucao_anterior=r.reaplicada_de_execucao_anterior,
        )
        for r in revisado.revisoes
    ]
    total_reaproveitadas = sum(
        1 for r in revisado.revisoes if r.reaplicada_de_execucao_anterior and r.estado in _ESTADOS_RESOLVIDOS
    )
    return ResumoRelatorio(
        total_candidatos_normais=len(revisado.candidatos_publicaveis),
        total_revisoes=len(revisado.revisoes),
        total_pendentes=por_estado[EstadoRevisao.PENDENTE],
        total_decididas=por_estado[EstadoRevisao.DECIDIDA],
        total_adiadas=por_estado[EstadoRevisao.ADIADA],
        total_desatualizadas=por_estado[EstadoRevisao.DESATUALIZADA],
        total_ocorrencias_nao_publicaveis=len(revisado.ocorrencias_nao_publicaveis),
        pode_gerar_relatorio=revisado.pode_gerar_relatorio,
        revisoes=revisoes,
        total_requer_nova_decisao=por_estado[EstadoRevisao.REQUER_NOVA_DECISAO],
        avisos_qualidade_fonte=diagnostico_qualidade.avisos,
        diagnosticos_qualidade_fonte=diagnostico_qualidade.diagnosticos,
        total_decisoes_reaproveitadas=total_reaproveitadas,
        cobertura_parcial=bool(diagnostico_qualidade.bloqueios),
        cobertura_efisco_ate=diagnostico_qualidade.cobertura_paga_ate,
    )


def preparar_relatorio(
    *,
    caminho_base_efisco: str,
    caminho_controle_dimcac: str,
    ano_exercicio: int,
    mes_referencia: int,
    caminho_decisoes: str,
    caminho_planilha_passagens: str | None = None,
    aceitar_cobertura_parcial: bool = False,
) -> ResumoRelatorio:
    """FONTES + RNs + DECISÕES HUMANAS VÁLIDAS → estado atual. Sempre
    reconstrói do zero — nunca lê um resultado derivado salvo de uma
    chamada anterior (só as decisões humanas, que são o único estado que
    de fato precisa sobreviver entre chamadas)."""
    revisado, diagnostico_qualidade = _montar_resultado_revisado(
        caminho_base_efisco=caminho_base_efisco,
        caminho_controle_dimcac=caminho_controle_dimcac,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        caminho_decisoes=caminho_decisoes,
        caminho_planilha_passagens=caminho_planilha_passagens,
        aceitar_cobertura_parcial=aceitar_cobertura_parcial,
    )
    resumo = _resumo(revisado, diagnostico_qualidade)
    _logger.info(
        "Relatório preparado: %s candidatos, %s revisões (%s pendentes, %s decididas, "
        "%s adiadas, %s desatualizadas), pode_gerar_relatorio=%s",
        resumo.total_candidatos_normais,
        resumo.total_revisoes,
        resumo.total_pendentes,
        resumo.total_decididas,
        resumo.total_adiadas,
        resumo.total_desatualizadas,
        resumo.pode_gerar_relatorio,
    )
    return resumo


def listar_revisoes(
    *,
    caminho_base_efisco: str,
    caminho_controle_dimcac: str,
    ano_exercicio: int,
    mes_referencia: int,
    caminho_decisoes: str,
    caminho_planilha_passagens: str | None = None,
    aceitar_cobertura_parcial: bool = False,
) -> list[RevisaoResumo]:
    revisado, _diagnostico_qualidade = _montar_resultado_revisado(
        caminho_base_efisco=caminho_base_efisco,
        caminho_controle_dimcac=caminho_controle_dimcac,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        caminho_decisoes=caminho_decisoes,
        caminho_planilha_passagens=caminho_planilha_passagens,
        aceitar_cobertura_parcial=aceitar_cobertura_parcial,
    )
    return [
        _revisao_resumo(
            contexto_para_exibicao(r.revisao),
            r.estado,
            r.decisao,
            reaplicada_de_execucao_anterior=r.reaplicada_de_execucao_anterior,
        )
        for r in revisado.revisoes
    ]


def _normalizar_autor(autor: str) -> str:
    """Sprint D.1 (QA manual — 6 grafias diferentes de autor em 15
    decisões) — normalização MÍNIMA e segura, compatível com o modelo
    atual (autor continua texto livre, nenhum login/autenticação foi
    inventado): remove espaços nas pontas e colapsa espaços internos
    repetidos (mesma normalização que o frontend já aplicava só no
    cliente — `PainelEntrada.aoClicarPreparar`/`autor.trim().replace(/\\s+/g,
    " ")` — agora também aplicada aqui, servidor, para qualquer chamador,
    HTTP ou não). NUNCA reescreve autores JÁ persistidos (decisões
    históricas) — só normaliza o texto de uma decisão NOVA antes de
    gravá-la. NÃO resolve variações reais de nome/apelido entre si (ex.:
    "vini" vs "vini bala" vs "viniboy" continuam textos diferentes) — isso
    exigiria identidade de usuário real (login), fora do escopo desta
    correção (ver relatório da Sprint D.1)."""
    return re.sub(r"\s+", " ", autor.strip())


def registrar_decisao_revisao(
    *,
    caminho_base_efisco: str,
    caminho_controle_dimcac: str,
    ano_exercicio: int,
    mes_referencia: int,
    caminho_decisoes: str,
    identidade_grupo: str,
    acao: AcaoDecisao,
    obs_selecionadas: Iterable[str] = (),
    autor: str,
    observacao: str | None = None,
    caminho_planilha_passagens: str | None = None,
    aceitar_cobertura_parcial: bool = False,
) -> ResumoRelatorio:
    """Registra uma decisão humana e devolve o estado já atualizado.
    Reconstrói o estado ANTES de decidir (nunca confia em nenhuma
    evidência que o chamador possa ter enviado) — o fingerprint gravado é
    sempre calculado sobre a leitura fresca das fontes feita aqui dentro,
    nunca sobre o que o frontend acreditava ser a evidência no momento em
    que o usuário abriu a tela."""
    autor = _normalizar_autor(autor)
    if not autor:
        raise DecisaoInvalida("Autor da decisão é obrigatório.")
    obs_selecionadas_set = frozenset(obs_selecionadas)
    if acao is AcaoDecisao.ADIAR and obs_selecionadas_set:
        raise DecisaoInvalida("ADIAR não aceita OBs selecionadas.")
    # Micro-sprint 3E.2 — garantia REAL (nunca depende só do schema
    # Pydantic da API): PUBLICAR com zero OBs selecionadas exclui TODAS as
    # ocorrências do grupo da publicação — decisão administrativa válida
    # (G04), mas excepcional o bastante para exigir justificativa não-vazia.
    # Vale mesmo chamando este service diretamente (teste, script, futura
    # integração sem HTTP) — é o único ponto de entrada real desta
    # operação, nenhum outro caminho registra uma decisão. Não altera
    # RN01-RN07/motor de decisão/reconciliação/fingerprint: só valida a
    # decisão humana antes de construí-la.
    if acao is AcaoDecisao.PUBLICAR and not obs_selecionadas_set:
        if observacao is None or not observacao.strip():
            raise DecisaoInvalida(
                "Publicar sem nenhuma OB selecionada exclui todas as ocorrências deste grupo — "
                "informe uma justificativa (observacao) para confirmar esta decisão."
            )

    revisado, diagnostico_qualidade = _montar_resultado_revisado(
        caminho_base_efisco=caminho_base_efisco,
        caminho_controle_dimcac=caminho_controle_dimcac,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        caminho_decisoes=caminho_decisoes,
        caminho_planilha_passagens=caminho_planilha_passagens,
        aceitar_cobertura_parcial=aceitar_cobertura_parcial,
    )

    revisao_alvo: RevisaoComEstado | None = None
    for revisao_com_estado in revisado.revisoes:
        obs_do_grupo = [oc.ordem_bancaria.ob for oc in revisao_com_estado.revisao.ocorrencias]
        if calcular_identidade_grupo(revisao_com_estado.revisao.regra, obs_do_grupo) == identidade_grupo:
            revisao_alvo = revisao_com_estado
            break

    if revisao_alvo is None:
        raise RevisaoNaoEncontrada(f"Nenhuma revisão pendente encontrada para o grupo {identidade_grupo!r}.")

    # HOMO-RT-02: identidade por ocorrência, não mais por OB isolada — um
    # grupo RN04 com repetição física (I11) tem duas ocorrências com a
    # MESMA OB, e o frontend agora seleciona por ocorrência (`"{ob}#{N}"`),
    # nunca por OB pura, para poder publicar só uma delas. Grupos sem
    # repetição física (todo RN07) têm identidade == ob — validação
    # equivalente à anterior, zero mudança de comportamento.
    identidades_do_grupo = set(identidades_ocorrencias(revisao_alvo.revisao.ocorrencias))
    identidades_fora_do_grupo = obs_selecionadas_set - identidades_do_grupo
    if identidades_fora_do_grupo:
        raise DecisaoInvalida(f"OB(s) fora do grupo desta revisão: {sorted(identidades_fora_do_grupo)}")

    decisao = registrar_decisao(
        revisao_alvo.revisao,
        acao=acao,
        autor=autor,
        obs_publicaveis=obs_selecionadas_set,
        observacao=observacao,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        # Sprint D.1 (P2) — a MESMA convenção de `_montar_resultado_revisado`:
        # `None` quando a cobertura já é suficiente para esta competência
        # (nenhum bloqueio), a data comprovada quando prosseguiu sob
        # cobertura parcial (`aceitar_cobertura_parcial=True`).
        cobertura_efisco_ate=diagnostico_qualidade.cobertura_paga_ate if diagnostico_qualidade.bloqueios else None,
    )
    salvar_decisao(caminho_decisoes, decisao)
    # Autor deliberadamente FORA do log (Micro-sprint 3D.1, minimização de
    # dados): identificação de quem decidiu pertence ao registro da
    # decisão persistida (`DecisaoHumana.autor`, já gravado por
    # `salvar_decisao` acima), não a um log técnico — evita duplicar dado
    # de identificação de servidor em um canal sem o mesmo controle de
    # acesso/retenção do JSON de decisões.
    _logger.info(
        "Decisão registrada para o grupo %s (regra %s): acao=%s, %s OB(s) publicável(is)",
        identidade_grupo,
        revisao_alvo.revisao.regra,
        acao.value,
        len(obs_selecionadas_set),
    )

    revisado_atualizado, diagnostico_qualidade_atualizado = _montar_resultado_revisado(
        caminho_base_efisco=caminho_base_efisco,
        caminho_controle_dimcac=caminho_controle_dimcac,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        caminho_decisoes=caminho_decisoes,
        caminho_planilha_passagens=caminho_planilha_passagens,
        aceitar_cobertura_parcial=aceitar_cobertura_parcial,
    )
    return _resumo(revisado_atualizado, diagnostico_qualidade_atualizado)


def gerar_relatorio_xlsx(
    *,
    caminho_base_efisco: str,
    caminho_controle_dimcac: str,
    ano_exercicio: int,
    mes_referencia: int,
    caminho_decisoes: str,
    caminho_configuracao_template: str,
    caminho_destino: str,
    hoje: date | None = None,
    caminho_planilha_passagens: str | None = None,
    aceitar_cobertura_parcial: bool = False,
) -> RelatorioCompletoGeradoResultado:
    """Micro-sprint 3F/3H, estendido na Sprint 5 — único ponto de entrada
    real para gerar os DOIS artefatos desta competência. Nunca recebe do
    chamador uma lista de OBs a publicar ou qualquer outro dado de
    conteúdo: o frontend (ou qualquer outro chamador) só pode pedir "gerar
    o relatório desta competência" — todo o conteúdo vem, sempre, da
    reconstrução por `_montar_resultado_revisado` (mesmo núcleo único de
    `preparar_relatorio`/`registrar_decisao_revisao`, fontes brutas +
    RN01-RN07 + decisões já persistidas). `pode_gerar_relatorio` (G05) é
    verificado dentro de `gerar_xlsx_relatorio_transparencia` mesmo que
    este service seja contornado — a garantia real não depende desta
    camada.

    Micro-sprint 3H — `caminho_configuracao_template` é só o ponteiro para
    a configuração do Template Oficial (mesmo padrão de `caminho_decisoes`);
    o caminho real do template é resolvido aqui, nunca recebido diretamente
    do chamador (o template é infraestrutura fixa do módulo, configurada
    uma vez, não um parâmetro de cada geração).

    Sprint 5 — os dois artefatos nascem do MESMO `revisado` (uma única
    reconstrução, um único `aplicar_decisoes`): o XLSX oficial consome
    `revisado.candidatos_publicaveis` (via `gerar_xlsx_relatorio_
    transparencia`, INTOCADO); o operacional consome `revisado.
    ocorrencias_nao_publicaveis` (via `gerar_xlsx_diarias_nao_publicadas`,
    Sprint 4, também INTOCADO) — nunca uma segunda leitura de fontes, nunca
    uma segunda aplicação de decisões, nunca reclassificação. Estruturalmente
    impossível uma ocorrência aparecer nos dois arquivos: as duas listas
    vêm da mesma partição de `ResultadoRevisado`, calculada uma única vez.

    Geração conjunta, NUNCA uma segunda implementação de segurança: os dois
    escritores mantêm, cada um, seu PRÓPRIO lock/tmp/no-clobber já
    homologados (destinos diferentes nunca colidem entre si — mesma
    garantia já testada para gerações simultâneas em destinos distintos).
    O oficial é gerado PRIMEIRO e sempre é o produto principal — se ele
    falhar (por qualquer motivo que não seja a versão já ocupada — ver
    abaixo), nada mais acontece (comportamento já homologado, propagado
    sem mudança). Se o oficial tiver sucesso mas o operacional falhar
    depois, o oficial NUNCA é desfeito (não há como desfazer uma promoção
    atômica já efetivada sem abrir uma nova janela TOCTOU, e o oficial já
    é confiável) — o resultado volta com `nao_publicadas_gerado=False` e
    `erro_nao_publicadas` preenchido, nunca um sucesso silencioso do tipo
    "os dois foram gerados" quando só um foi.

    QA Codex (achado real, complemento) — `caminho_destino` deixou de ser
    o caminho FINAL exato: é a raiz/preferência de nome (mesma que o
    usuário confirma no diálogo nativo do SO, tipicamente sempre o nome
    sugerido, sem precisar renomear nada). O par de artefatos desta
    geração recebe automaticamente a PRIMEIRA versão livre a partir dela
    (`_proximo_par_de_versao_livre`) — o usuário nunca mais precisa evitar
    colisão manualmente. Se a escrita real do oficial perder uma corrida
    contra outro processo para a mesma versão (checagem otimista de
    `_proximo_par_de_versao_livre`, não uma trava — a trava real é a de
    cada escritor), tenta automaticamente a próxima versão livre, até
    `_MAX_TENTATIVAS_VERSAO_PAR` tentativas — nunca propaga essa colisão
    ao usuário como falha; a garantia de não sobrescrita continua sendo
    inteiramente a trava+no-clobber já homologada de cada escritor,
    intocada. Só `DestinoJaExiste`/`GeracaoConcorrenteEmAndamento`
    disparam esse avanço automático — são, por definição, sinais de que
    ESTA versão específica está ocupada, nunca de um problema geral no
    destino. `DestinoInacessivel` (pasta protegida/sem permissão/arquivo
    bloqueado — ver `_adquirir_trava_destino`) nunca é capturada aqui de
    propósito: um problema real de acesso afeta qualquer candidato de
    versão igualmente, então propaga direto, rápido, com mensagem de
    domínio útil — nunca mascarado atrás de centenas de tentativas
    inúteis."""
    caminho_template = resolver_caminho_template(caminho_configuracao_template)
    revisado, _diagnostico_qualidade = _montar_resultado_revisado(
        caminho_base_efisco=caminho_base_efisco,
        caminho_controle_dimcac=caminho_controle_dimcac,
        ano_exercicio=ano_exercicio,
        mes_referencia=mes_referencia,
        caminho_decisoes=caminho_decisoes,
        caminho_planilha_passagens=caminho_planilha_passagens,
        aceitar_cobertura_parcial=aceitar_cobertura_parcial,
    )

    tentativa = 0
    while True:
        tentativa += 1
        caminho_oficial_candidato, caminho_nao_publicadas = _proximo_par_de_versao_livre(
            caminho_destino, ano_exercicio=ano_exercicio, mes_referencia=mes_referencia
        )
        try:
            resultado_oficial = gerar_xlsx_relatorio_transparencia(
                revisado,
                caminho_template=caminho_template,
                caminho_destino=caminho_oficial_candidato,
                ano_exercicio=ano_exercicio,
                mes_referencia=mes_referencia,
                hoje=hoje,
            )
            break
        except (DestinoJaExiste, GeracaoConcorrenteEmAndamento):
            if tentativa >= _MAX_TENTATIVAS_VERSAO_PAR:
                raise
            # Corrida real perdida para esta versão específica, entre a
            # checagem otimista acima e esta escrita — nunca uma falha do
            # usuário, tenta a próxima versão livre automaticamente (mesmo
            # espírito de `_proximo_par_de_versao_livre`: nenhuma ação
            # manual). Duas causas possíveis, mesmo tratamento para as
            # duas: outro processo já concluiu esta versão (`DestinoJa
            # Existe`), ou está ativamente escrevendo nela (`GeracaoConcor
            # renteEmAndamento`, trava `.gerando.lock`).
            #
            # QA Codex (achado real, diagnóstico dedicado) — `PermissionError`
            # NUNCA é capturado aqui de propósito: reproduzido e isolado por
            # diagnóstico dirigido, a única origem real é a criação do
            # arquivo de trava (`_adquirir_trava_destino`), que já absorve a
            # corrida TRANSITÓRIA internamente (retry curto, mesmo padrão já
            # homologado em `persistencia_decisoes.py`) e converte qualquer
            # falha PERSISTENTE em `DestinoInacessivel` — nunca um
            # `PermissionError` cru chega até aqui. Tratar `PermissionError`
            # como "esta versão específica está ocupada, tenta a próxima"
            # seria enganoso: um problema real de acesso à pasta (protegida,
            # sem permissão, antivírus) afeta IGUALMENTE qualquer candidato
            # de versão — avançar por até 1000 tentativas não ajudaria,
            # mascararia o erro real atrás de uma demora artificial, e
            # `DestinoInacessivel` (não capturada aqui, propaga direto) já
            # entrega ao usuário uma mensagem de domínio útil rapidamente.
            continue

    _logger.info(
        "Relatório XLSX oficial gerado: %s (%s ocorrências, valor total diárias %.2f)",
        resultado_oficial.caminho_arquivo,
        resultado_oficial.total_ocorrencias,
        resultado_oficial.total_valor_diarias,
    )

    nao_publicaveis = revisado.ocorrencias_nao_publicaveis
    total_a = sum(
        1 for item in nao_publicaveis if item.categoria is CategoriaNaoPublicada.NAO_PUBLICADA_POR_DECISAO_HUMANA
    )
    total_b = len(nao_publicaveis) - total_a

    # Item 1 do pedido: nunca cria um XLSX operacional vazio — G04 já
    # garante que "zero não publicadas" é um estado real e válido (não uma
    # falha), então esse caso nem tenta escrever o segundo arquivo.
    if not nao_publicaveis:
        return RelatorioCompletoGeradoResultado(
            oficial=resultado_oficial,
            caminho_arquivo_nao_publicadas=None,
            total_nao_publicadas=0,
            total_categoria_a=0,
            total_categoria_b=0,
            nao_publicadas_gerado=False,
        )

    # `caminho_nao_publicadas` já foi calculado junto com `caminho_oficial_
    # candidato` acima (o par vencedor de `_proximo_par_de_versao_livre`) —
    # nunca uma segunda derivação, que poderia (em tese) resolver para uma
    # versão diferente se o filesystem mudasse entre as duas chamadas.
    try:
        resultado_operacional = gerar_xlsx_diarias_nao_publicadas(
            nao_publicaveis, caminho_destino=caminho_nao_publicadas
        )
    except DestinoJaExiste as erro:
        # QA Codex (achado real, complemento) — com o PAR inteiro
        # (`_proximo_par_de_versao_livre`) já verificado livre logo antes
        # de o oficial ser escrito, esta colisão deixou de ser o caso
        # rotineiro de "regerar a mesma competência" (isso agora recebe
        # automaticamente uma versão nova, sem ação nenhuma do usuário) —
        # só pode acontecer numa corrida real e estreita: outro processo
        # criou exatamente este arquivo operacional no intervalo entre a
        # checagem otimista e esta escrita. Mensagem explicitamente
        # acionável para esse cenário específico, nunca um genérico "tente
        # novamente" sem explicar o motivo.
        mensagem = (
            f"Já existe uma planilha de diárias não publicadas para esta mesma versão da geração "
            f"({caminho_nao_publicadas}). Isso normalmente indica que outra geração desta "
            f"competência ocorreu ao mesmo tempo. Gerar novamente deve resolver automaticamente, "
            f"escolhendo uma nova versão para os dois arquivos."
        )
        _logger.error(
            "Relatório oficial gerado com sucesso, mas o XLSX operacional já existe no destino "
            "versionado (%s): %s",
            caminho_nao_publicadas,
            erro,
        )
        return RelatorioCompletoGeradoResultado(
            oficial=resultado_oficial,
            caminho_arquivo_nao_publicadas=None,
            total_nao_publicadas=len(nao_publicaveis),
            total_categoria_a=total_a,
            total_categoria_b=total_b,
            nao_publicadas_gerado=False,
            erro_nao_publicadas=mensagem,
        )
    except Exception as erro:  # noqa: BLE001 — deliberado: o oficial JÁ foi
        # promovido com sucesso acima (arquivo real, seguro, no destino do
        # usuário) — uma falha aqui NUNCA pode derrubar essa informação nem
        # fingir sucesso; precisa virar estado PARCIAL explícito no
        # resultado, não uma exceção que esconderia do chamador que o
        # oficial deu certo. Qualquer outra causa (geração concorrente,
        # disco cheio, permissão) recebe o MESMO tratamento: reportar,
        # nunca inventar um resultado melhor do que o real.
        _logger.error(
            "Relatório oficial gerado com sucesso, mas falhou a geração do XLSX operacional (%s): %s",
            caminho_nao_publicadas,
            erro,
        )
        return RelatorioCompletoGeradoResultado(
            oficial=resultado_oficial,
            caminho_arquivo_nao_publicadas=None,
            total_nao_publicadas=len(nao_publicaveis),
            total_categoria_a=total_a,
            total_categoria_b=total_b,
            nao_publicadas_gerado=False,
            erro_nao_publicadas=str(erro),
        )

    _logger.info(
        "Relatório XLSX operacional gerado: %s (%s ocorrências: %s categoria A, %s categoria B)",
        resultado_operacional.caminho_arquivo,
        resultado_operacional.total_ocorrencias,
        resultado_operacional.total_categoria_a,
        resultado_operacional.total_categoria_b,
    )
    return RelatorioCompletoGeradoResultado(
        oficial=resultado_oficial,
        caminho_arquivo_nao_publicadas=resultado_operacional.caminho_arquivo,
        total_nao_publicadas=len(nao_publicaveis),
        total_categoria_a=total_a,
        total_categoria_b=total_b,
        nao_publicadas_gerado=True,
    )
