"""Micro-sprint UX operacional — persistência dos caminhos de Base de Ordens
Bancárias e Controle DIMCAC do Relatório de Diárias — Portal da
Transparência.

Módulo exclusivo deste módulo (`§0 isolamento arquitetural`,
`docs/relatorio-transparencia/README.md`), mesmo padrão de
`configuracao_template_relatorio_transparencia.py`: NUNCA reaproveita
`app/infra/config/configuracao_app.py` (planilha oficial da Central de
Conferência) nem nenhuma outra configuração persistente de outro módulo. O
CAMINHO do próprio arquivo de configuração é sempre informado por quem chama
(resolvido pelo Electron via IPC para dentro de `userData`) — este módulo
nunca decide onde fica o próprio arquivo, só como ele é lido/escrito.

Diferente do Template Oficial, aqui só se guarda ONDE o usuário apontou da
última vez — nenhuma validação de conteúdo é feita neste módulo (a Base OB e
o Controle DIMCAC já são validados de forma robusta pelo fluxo normal de
`preparar_relatorio`, `BaseOBNaoEncontrada`/`EstruturaBaseOBInvalida`/etc. —
duplicar essa validação aqui só criaria uma segunda fonte de verdade). Os
dois caminhos são independentes e persistidos separadamente: selecionar um
nunca apaga o outro já configurado (`persistir_configuracao_fontes` só
sobrescreve o campo que recebeu um valor novo)."""

import json
import os
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import filelock

__all__ = [
    "ConfiguracaoFontesCorrompida",
    "ConfiguracaoFontesEmUso",
    "ConfiguracaoFontes",
    "carregar_configuracao_fontes",
    "persistir_configuracao_fontes",
]


class ConfiguracaoFontesCorrompida(Exception):
    """Mesmo papel de `ConfiguracaoTemplateCorrompida`/
    `PersistenciaDecisoesCorrompida` para este arquivo irmão de
    configuração: o arquivo existe, mas não pôde ser lido como configuração
    válida (JSON inválido, estrutura que não é um objeto, campo de tipo
    errado, bytes que não decodificam como UTF-8, ou erro de I/O) — nunca
    falha silenciosamente, nunca deixa `JSONDecodeError`/`KeyError`/
    `TypeError`/`UnicodeDecodeError`/`OSError` escaparem para um 500
    genérico; mensagem já adequada para exibição direta ao usuário."""


class ConfiguracaoFontesEmUso(Exception):
    """QA Codex (BUG-02, correção cross-process) — a trava do arquivo de
    configuração (`filelock.FileLock`, ver `_trava_fontes`) não foi obtida
    dentro do timeout de 10s — outro processo/thread mantém a seção crítica
    aberta por tempo anormal. Mensagem já adequada para exibição direta ao
    usuário, nunca a exceção técnica (`filelock.Timeout`) crua."""


@dataclass(frozen=True)
class ConfiguracaoFontes:
    caminho_base_ordens_bancarias: str | None
    caminho_controle_dimcac: str | None
    atualizado_em: str
    # Sprint 1 (plano "Valor da Passagem no XLSX Oficial") — terceira fonte
    # persistida, mesmo mecanismo dos dois campos acima (atualização parcial,
    # independente). Campo NOVO e OPCIONAL: `from_dict` trata sua ausência em
    # configurações já persistidas antes desta mudança como `None` (nunca
    # `KeyError`), para não quebrar a leitura de um `configuracao.json` já
    # existente no `userData` de quem já usava só Base OB/Controle DIMCAC.
    caminho_planilha_passagens: str | None = None

    def to_dict(self) -> dict:
        return {
            "caminho_base_ordens_bancarias": self.caminho_base_ordens_bancarias,
            "caminho_controle_dimcac": self.caminho_controle_dimcac,
            "caminho_planilha_passagens": self.caminho_planilha_passagens,
            "atualizado_em": self.atualizado_em,
        }

    @staticmethod
    def from_dict(dados: dict) -> "ConfiguracaoFontes":
        """Levanta `KeyError`/`TypeError` quando `dados` não corresponde ao
        esquema esperado — `carregar_configuracao_fontes` é quem traduz isso
        para `ConfiguracaoFontesCorrompida`, mesmo critério de
        `ConfiguracaoTemplate.from_dict`."""
        caminho_base = dados["caminho_base_ordens_bancarias"]
        caminho_controle = dados["caminho_controle_dimcac"]
        # `.get(..., None)` (não `dados[...]`) — só este campo é retrocompatível
        # com um `configuracao.json` gravado antes do Sprint 1 existir.
        caminho_passagens = dados.get("caminho_planilha_passagens")
        atualizado_em = dados["atualizado_em"]
        if caminho_base is not None and not isinstance(caminho_base, str):
            raise TypeError("'caminho_base_ordens_bancarias' deve ser string ou nulo")
        if caminho_controle is not None and not isinstance(caminho_controle, str):
            raise TypeError("'caminho_controle_dimcac' deve ser string ou nulo")
        if caminho_passagens is not None and not isinstance(caminho_passagens, str):
            raise TypeError("'caminho_planilha_passagens' deve ser string ou nulo")
        if not isinstance(atualizado_em, str):
            raise TypeError("'atualizado_em' deve ser string")
        return ConfiguracaoFontes(
            caminho_base_ordens_bancarias=caminho_base,
            caminho_controle_dimcac=caminho_controle,
            caminho_planilha_passagens=caminho_passagens,
            atualizado_em=atualizado_em,
        )


# QA Codex (achado real, BUG-02; revalidação cross-process) — mesma classe
# de defeito de `persistencia_decisoes.py` (ver o comentário lá para a
# análise completa, inclusive por que `filelock.FileLock` não deixa lock
# órfão após um crash): `persistir_configuracao_fontes` fazia um ciclo
# read-modify-write (carregar a config atual → mesclar só o(s) campo(s)
# informado(s) → escrever tudo) sem trava, com um `.tmp` fixo compartilhado
# — duas atualizações parciais concorrentes (ex.: usuário seleciona Base OB
# e Controle DIMCAC quase ao mesmo tempo, ou dois workers Uvicorn distintos
# sob `WEB_CONCURRENCY>1`) liam o mesmo estado antes de qualquer uma
# escrever, e a que escrevesse por último "vencia" sozinha, descartando o
# campo da outra (lost update) — ou colidiam no mesmo `.tmp` e corrompiam
# o JSON final. Uma correção anterior usou `threading.Lock()` em memória —
# insuficiente porque só protege threads do MESMO processo, não processos
# distintos (comprovado por QA com `WEB_CONCURRENCY=2`). `filelock.FileLock`
# protege os dois níveis com o mesmo mecanismo (trava real do SO).
def _trava_fontes(caminho_configuracao_fontes: str) -> filelock.FileLock:
    return filelock.FileLock(f"{caminho_configuracao_fontes}.lock", timeout=10)


# Achado real durante a homologação (volume alto de requisições HTTP
# concorrentes, servidor Uvicorn multi-worker de verdade) — mesma classe de
# `PermissionError: [WinError 5]` documentada em
# `app/consulta/persistencia_decisoes.py` (leitor×escritor no `os.replace`
# do Windows, não a mesma corrida escritor×escritor que a trava já
# elimina). Mesmo remédio já homologado em `base_local_sqlite.
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
# para a análise completa): `carregar_configuracao_fontes` também pode
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


def carregar_configuracao_fontes(caminho_configuracao_fontes: str) -> ConfiguracaoFontes | None:
    """`None` quando nada foi configurado ainda — nunca um erro (mesmo
    critério de `configuracao_app.carregar`/`carregar_configuracao_template`).
    Qualquer outra falha de leitura sempre levanta
    `ConfiguracaoFontesCorrompida`."""
    if not os.path.isfile(caminho_configuracao_fontes):
        return None

    try:
        texto = _ler_texto_com_retry(caminho_configuracao_fontes)
    except UnicodeDecodeError as erro:
        raise ConfiguracaoFontesCorrompida(
            "Configuração das fontes corrompida (codificação de texto inválida)."
        ) from erro
    except PermissionError as erro:
        raise ConfiguracaoFontesCorrompida(
            "Configuração das fontes não pôde ser lida (permissão negada)."
        ) from erro
    except OSError as erro:
        raise ConfiguracaoFontesCorrompida(
            "Configuração das fontes não pôde ser lida (falha de leitura)."
        ) from erro

    try:
        dados = json.loads(texto)
    except json.JSONDecodeError as erro:
        raise ConfiguracaoFontesCorrompida(
            f"Configuração das fontes corrompida (JSON inválido: {erro})."
        ) from erro

    if not isinstance(dados, dict):
        raise ConfiguracaoFontesCorrompida("Configuração das fontes corrompida (estrutura inesperada).")

    try:
        return ConfiguracaoFontes.from_dict(dados)
    except (KeyError, TypeError) as erro:
        raise ConfiguracaoFontesCorrompida(
            f"Configuração das fontes corrompida (campo ausente ou inválido: {erro})."
        ) from erro


def persistir_configuracao_fontes(
    caminho_configuracao_fontes: str,
    *,
    caminho_base_ordens_bancarias: str | None = None,
    caminho_controle_dimcac: str | None = None,
    caminho_planilha_passagens: str | None = None,
) -> ConfiguracaoFontes:
    """Atualização parcial: só sobrescreve o(s) campo(s) recebido(s)
    (não-`None`), preservando os demais já persistidos — permite selecionar
    Base OB, Controle DIMCAC e Planilha de Passagens em momentos diferentes
    sem que um apague os outros. Escrita segura (arquivo `.tmp` +
    `os.replace`, mesma técnica de
    `configuracao_template_relatorio_transparencia.persistir_configuracao_template`).

    QA Codex (BUG-02, correção cross-process) — todo o ciclo leitura+
    mesclagem+escrita+promoção corre sob `_trava_fontes(...)`
    (`filelock.FileLock`): duas atualizações parciais concorrentes (campos
    diferentes), mesmo vindas de processos distintos, agora são
    serializadas e as duas ficam mescladas no arquivo final, em vez de uma
    descartar a outra."""
    try:
        with _trava_fontes(caminho_configuracao_fontes):
            atual = carregar_configuracao_fontes(caminho_configuracao_fontes)

            configuracao = ConfiguracaoFontes(
                caminho_base_ordens_bancarias=(
                    caminho_base_ordens_bancarias
                    if caminho_base_ordens_bancarias is not None
                    else (atual.caminho_base_ordens_bancarias if atual else None)
                ),
                caminho_controle_dimcac=(
                    caminho_controle_dimcac
                    if caminho_controle_dimcac is not None
                    else (atual.caminho_controle_dimcac if atual else None)
                ),
                caminho_planilha_passagens=(
                    caminho_planilha_passagens
                    if caminho_planilha_passagens is not None
                    else (atual.caminho_planilha_passagens if atual else None)
                ),
                atualizado_em=datetime.now().isoformat(timespec="seconds"),
            )

            destino = Path(caminho_configuracao_fontes)
            destino.parent.mkdir(parents=True, exist_ok=True)
            temporario = destino.with_suffix(destino.suffix + ".tmp")
            temporario.write_text(json.dumps(configuracao.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
            _substituir_com_retry(temporario, destino)

            return configuracao
    except filelock.Timeout as erro:
        raise ConfiguracaoFontesEmUso(
            "A configuração das fontes está sendo usada por outro processo. Tente novamente em instantes."
        ) from erro
