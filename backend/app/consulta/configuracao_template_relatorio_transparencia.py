"""Micro-sprint 3H — configuração do Template Oficial (modelo XLSX) do
Relatório de Diárias — Portal da Transparência.

Módulo exclusivo deste módulo (`§0 isolamento arquitetural`,
`docs/relatorio-transparencia/README.md`): NUNCA reaproveita
`app/infra/config/configuracao_app.py` (planilha oficial da Central de
Conferência) — persistência própria, formato próprio, nenhum acoplamento
com a configuração de nenhuma outra Central. Mesmo princípio de
`app/consulta/persistencia_decisoes.py`: o CAMINHO do arquivo de
configuração é sempre informado por quem chama (resolvido pelo Electron via
IPC para dentro de `userData`, nunca escolhido pelo backend) — este módulo
nunca decide onde fica o próprio arquivo, só como ele é lido/escrito.

O template em si (`caminho_template`) é infraestrutura fixa do módulo — o
usuário seleciona uma vez ("Selecionar Template Oficial") e o caminho é
reaproveitado em toda geração futura, nunca perguntado de novo. Se o
arquivo configurado deixar de existir, `resolver_caminho_template` levanta
`TemplateOficialIndisponivel` com mensagem já pronta para a tela, pedindo
nova seleção — nunca falha silenciosamente nem gera com um caminho morto.
"""

import json
import os
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import filelock
from openpyxl import load_workbook

__all__ = [
    "TemplateOficialInvalido",
    "TemplateOficialIndisponivel",
    "ConfiguracaoTemplateCorrompida",
    "ConfiguracaoTemplateEmUso",
    "ConfiguracaoTemplate",
    "carregar_configuracao_template",
    "persistir_configuracao_template",
    "resolver_caminho_template",
]


class TemplateOficialInvalido(Exception):
    """Arquivo selecionado não existe, não é `.xlsx`, ou está corrompido/
    bloqueado — mensagem já adequada para exibição direta ao usuário."""


class TemplateOficialIndisponivel(Exception):
    """Nenhum template configurado ainda, ou o template configurado não
    existe mais no filesystem (movido/renomeado/excluído) — mensagem já
    adequada para exibição direta ao usuário, nunca menciona caminho
    interno."""


class ConfiguracaoTemplateCorrompida(Exception):
    """Confronto QA Codex / QA-RT-03 — o arquivo de configuração
    (`caminho_configuracao_template`, infraestrutura interna) existe, mas
    não pôde ser lido como configuração válida: JSON sintaticamente
    inválido, estrutura que não é um objeto, campos obrigatórios ausentes/
    de tipo errado, bytes que não decodificam como UTF-8, ou o arquivo
    simplesmente não pôde ser lido (permissão negada, bloqueado por outro
    processo, outro erro de I/O). Mesmo papel de
    `PersistenciaDecisoesCorrompida` (`app/consulta/persistencia_decisoes.py`)
    para o arquivo irmão de decisões — nunca falha silenciosamente, nunca
    deixa `JSONDecodeError`/`KeyError`/`TypeError`/`UnicodeDecodeError`/
    `OSError` escaparem para um 500 genérico; mensagem já adequada para
    exibição direta ao usuário, nunca menciona caminho interno (o arquivo
    de configuração é infraestrutura, não algo que o usuário escolheu
    nesta ação)."""


class ConfiguracaoTemplateEmUso(Exception):
    """QA Codex (correção cross-process) — a trava do arquivo de
    configuração (`filelock.FileLock`, ver `_trava_template`) não foi
    obtida dentro do timeout de 10s. Mensagem já adequada para exibição
    direta ao usuário, nunca a exceção técnica (`filelock.Timeout`) crua."""


@dataclass(frozen=True)
class ConfiguracaoTemplate:
    caminho_template: str
    configurado_em: str

    def to_dict(self) -> dict:
        return {"caminho_template": self.caminho_template, "configurado_em": self.configurado_em}

    @staticmethod
    def from_dict(dados: dict) -> "ConfiguracaoTemplate":
        """Levanta `KeyError` (campo ausente) ou `TypeError` (campo com
        tipo errado) quando `dados` não corresponde ao esquema esperado —
        `carregar_configuracao_template` é quem traduz isso para
        `ConfiguracaoTemplateCorrompida`, nunca esta função (mantém o
        mesmo nível de responsabilidade de `_decisao_de_dict` em
        `persistencia_decisoes.py`, que também não trata seus próprios
        erros)."""
        caminho_template = dados["caminho_template"]
        configurado_em = dados["configurado_em"]
        if not isinstance(caminho_template, str) or not isinstance(configurado_em, str):
            raise TypeError("'caminho_template' e 'configurado_em' devem ser strings")
        return ConfiguracaoTemplate(caminho_template=caminho_template, configurado_em=configurado_em)


# Auditoria de concorrência (mesma sprint que corrigiu BUG-01/BUG-02 —
# `persistencia_decisoes.py`/`configuracao_fontes_relatorio_transparencia.py`)
# — achado colateral confirmado: `persistir_configuracao_template` usa a
# mesma técnica `.tmp` fixo + `os.replace` sem nenhuma trava. Diferente dos
# outros dois, esta função não faz merge de campos (não lê a configuração
# anterior — `caminho_template`/`configurado_em` são sempre um overwrite
# completo), então não há "lost update" de um campo por outro; o risco real
# aqui é duas chamadas concorrentes escrevendo no mesmo `.tmp`
# compartilhado ao mesmo tempo — JSON corrompido ou `PermissionError` no
# Windows durante `os.replace`, exatamente como nos outros dois.
#
# Revalidação cross-process (QA Codex): `threading.Lock()` (correção
# anterior) só protege threads do mesmo processo — insuficiente sob
# `WEB_CONCURRENCY`/múltiplos workers. Trocado por `filelock.FileLock`
# (ver `persistencia_decisoes.py` para a análise completa da escolha e da
# garantia de não deixar lock órfão após um crash). Resultado esperado sob
# concorrência: last-write-wins determinístico e sem corrupção (a mesma
# semântica de negócio de hoje para "o usuário selecionou o template duas
# vezes seguidas") — nunca um JSON malformado, nunca uma exceção técnica
# vazando para o chamador.
def _trava_template(caminho_configuracao_template: str) -> filelock.FileLock:
    return filelock.FileLock(f"{caminho_configuracao_template}.lock", timeout=10)


# Achado real durante a homologação (volume alto de requisições HTTP
# concorrentes, servidor Uvicorn multi-worker de verdade) — mesma classe de
# `PermissionError: [WinError 5]` documentada em
# `app/consulta/persistencia_decisoes.py` (leitor×escritor no `os.replace`
# do Windows). Mesmo remédio já homologado em `base_local_sqlite.
# _substituir_com_retry`, reaproveitado aqui.
_TENTATIVAS_REPLACE = 3
_INTERVALO_BASE_RETRY_REPLACE_S = 0.05


def _substituir_com_retry(caminho_tmp: Path, caminho_destino: Path) -> None:
    ultimo_erro: PermissionError | None = None
    for tentativa in range(_TENTATIVAS_REPLACE):
        try:
            os.replace(caminho_tmp, caminho_destino)
            return
        except PermissionError as erro:
            ultimo_erro = erro
            if tentativa < _TENTATIVAS_REPLACE - 1:
                time.sleep(_INTERVALO_BASE_RETRY_REPLACE_S * (tentativa + 1))
    assert ultimo_erro is not None
    raise ultimo_erro


# Mesmo achado, lado LEITOR (ver `app/consulta/persistencia_decisoes.py`
# para a análise completa): `carregar_configuracao_template` também pode
# colidir com um `os.replace` em andamento e receber `PermissionError`.
def _ler_texto_com_retry(caminho: str) -> str:
    ultimo_erro: PermissionError | None = None
    for tentativa in range(_TENTATIVAS_REPLACE):
        try:
            return Path(caminho).read_text(encoding="utf-8")
        except PermissionError as erro:
            ultimo_erro = erro
            if tentativa < _TENTATIVAS_REPLACE - 1:
                time.sleep(_INTERVALO_BASE_RETRY_REPLACE_S * (tentativa + 1))
    assert ultimo_erro is not None
    raise ultimo_erro


def _validar_template(caminho_template: str) -> None:
    if not os.path.isfile(caminho_template):
        raise TemplateOficialInvalido(f"Arquivo não encontrado: {caminho_template}")
    if not caminho_template.lower().endswith(".xlsx"):
        raise TemplateOficialInvalido("Formato não suportado — selecione um arquivo .xlsx")
    try:
        workbook = load_workbook(caminho_template, read_only=True, data_only=False)
    except Exception as erro:
        raise TemplateOficialInvalido(
            f"Não foi possível abrir o arquivo selecionado — corrompido ou bloqueado ({erro})"
        ) from erro
    workbook.close()


def carregar_configuracao_template(caminho_configuracao_template: str) -> ConfiguracaoTemplate | None:
    """`None` quando nada foi configurado ainda — nunca um erro (mesmo
    critério de `configuracao_app.carregar`). Qualquer outra falha de
    leitura (JSON malformado, estrutura que não é um objeto, campo
    obrigatório ausente ou de tipo errado, bytes que não decodificam como
    UTF-8, ou o arquivo existir mas não poder ser lido — permissão negada,
    bloqueado por outro processo, outro erro de I/O) sempre levanta
    `ConfiguracaoTemplateCorrompida` — nunca deixa `JSONDecodeError`/
    `KeyError`/`TypeError`/`UnicodeDecodeError`/`OSError` escaparem para
    quem chamou como um 500 genérico (confronto QA Codex / QA-RT-03; mesmo
    critério de `persistencia_decisoes.carregar_decisoes`)."""
    if not os.path.isfile(caminho_configuracao_template):
        return None

    try:
        texto = _ler_texto_com_retry(caminho_configuracao_template)
    except UnicodeDecodeError as erro:
        raise ConfiguracaoTemplateCorrompida(
            "Configuração do template oficial corrompida (codificação de texto inválida)."
        ) from erro
    except PermissionError as erro:
        raise ConfiguracaoTemplateCorrompida(
            "Configuração do template oficial não pôde ser lida (permissão negada)."
        ) from erro
    except OSError as erro:
        raise ConfiguracaoTemplateCorrompida(
            "Configuração do template oficial não pôde ser lida (falha de leitura)."
        ) from erro

    try:
        dados = json.loads(texto)
    except json.JSONDecodeError as erro:
        raise ConfiguracaoTemplateCorrompida(
            f"Configuração do template oficial corrompida (JSON inválido: {erro})."
        ) from erro

    if not isinstance(dados, dict):
        raise ConfiguracaoTemplateCorrompida(
            "Configuração do template oficial corrompida (estrutura inesperada)."
        )

    try:
        return ConfiguracaoTemplate.from_dict(dados)
    except (KeyError, TypeError) as erro:
        raise ConfiguracaoTemplateCorrompida(
            f"Configuração do template oficial corrompida (campo ausente ou inválido: {erro})."
        ) from erro


def persistir_configuracao_template(
    caminho_configuracao_template: str, caminho_template: str
) -> ConfiguracaoTemplate:
    """Valida o arquivo selecionado e grava a configuração — escrita segura
    (arquivo `.tmp` + `os.replace`, mesma técnica de
    `configuracao_app.persistir`).

    A validação (`_validar_template`, que só lê o arquivo de template
    escolhido, nunca o arquivo de configuração compartilhado) roda FORA da
    trava de propósito — não faz parte do recurso protegido, e mantém a
    seção crítica sempre rápida. Só a escrita da configuração (que de fato
    lê/escreve o `.tmp`/destino compartilhados) corre sob
    `_trava_template(...)` (`filelock.FileLock`, cross-process)."""
    _validar_template(caminho_template)

    configuracao = ConfiguracaoTemplate(
        caminho_template=caminho_template,
        configurado_em=datetime.now().isoformat(timespec="seconds"),
    )

    try:
        with _trava_template(caminho_configuracao_template):
            destino = Path(caminho_configuracao_template)
            destino.parent.mkdir(parents=True, exist_ok=True)
            temporario = destino.with_suffix(destino.suffix + ".tmp")
            temporario.write_text(json.dumps(configuracao.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
            _substituir_com_retry(temporario, destino)
    except filelock.Timeout as erro:
        raise ConfiguracaoTemplateEmUso(
            "A configuração do template oficial está sendo usada por outro processo. Tente novamente em instantes."
        ) from erro

    return configuracao


def resolver_caminho_template(caminho_configuracao_template: str) -> str:
    """Único ponto de entrada que `gerar_relatorio_xlsx` deveria conhecer —
    devolve um caminho de template pronto para uso, ou levanta
    `TemplateOficialIndisponivel` com mensagem já pronta para a tela.
    Também pode propagar `ConfiguracaoTemplateCorrompida` (vinda de
    `carregar_configuracao_template`) quando o arquivo de configuração em
    si está corrompido — o chamador (API) mapeia as duas para respostas
    HTTP distintas, nunca deixa nenhuma das duas virar um 500 genérico."""
    configuracao = carregar_configuracao_template(caminho_configuracao_template)
    if configuracao is None:
        raise TemplateOficialIndisponivel(
            "Nenhum template oficial configurado. Selecione o template oficial antes de gerar o relatório."
        )
    if not os.path.isfile(configuracao.caminho_template):
        raise TemplateOficialIndisponivel(
            "O template oficial configurado não foi encontrado — foi movido, renomeado ou excluído? "
            "Selecione-o novamente."
        )
    return configuracao.caminho_template
