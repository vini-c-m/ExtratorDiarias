"""Configuração local da instalação (Sprint 15) — o caminho da planilha
oficial que o usuário selecionou. Ver `docs/configuracao-inicial/README.md`.

Persistência simples em JSON, sem SQLite: um único registro por
instalação, sempre lido/escrito por inteiro (§ 9 do doc arquitetural). A
planilha escolhida nunca é copiada nem movida — só o caminho é guardado.
"""

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook

from app.planilha.escritor_planilha import NOME_ABA

NOME_PASTA_DADOS_FALLBACK = "ExtratorDiarias"
NOME_ARQUIVO_CONFIGURACAO = "configuracao.json"
VAR_AMBIENTE_USER_DATA = "EXTRATOR_DIARIAS_USER_DATA"

# Mesmas colunas que `escritor_planilha.preencher` de fato escreve, com os
# rótulos reais documentados em `docs/central-conferencia/README.md` — ver
# § 5 do doc arquitetural desta Sprint. Colunas de fórmula/manuais
# (E/F/G/M/N/O/R/S/...) nunca são tocadas pelo escritor, então não entram
# aqui.
CABECALHO_EXIGIDO = {
    "A": "DH",
    "B": "SEI",
    "C": "DOC ORIGEM",
    "D": "CPF",
    "H": "PERÍODO INICIAL",
    "I": "PERÍODO FINAL",
    "J": "TRECHO",
    "K": "TRANSPORTE",
    "L": "MOTIVO",
    "P": "VALOR TOTAL DAS DIÁRIAS",
    "Q": "LOCAL",
}


class PlanilhaInvalida(Exception):
    """A mensagem já é adequada para exibição direta ao usuário (§5)."""


@dataclass(frozen=True)
class FingerprintEstrutural:
    """Só elementos estruturais que não mudam no uso normal — nunca
    tamanho ou data de modificação do arquivo (§6 do doc arquitetural:
    ambos mudam a cada gravação legítima, então não servem para detectar
    substituição)."""

    abas: list[str]
    hash_cabecalho: str

    def to_dict(self) -> dict:
        return {"abas": self.abas, "hash_cabecalho": self.hash_cabecalho}

    @staticmethod
    def from_dict(dados: dict) -> "FingerprintEstrutural":
        return FingerprintEstrutural(abas=list(dados["abas"]), hash_cabecalho=dados["hash_cabecalho"])


@dataclass(frozen=True)
class Configuracao:
    caminho_planilha_oficial: str
    configurado_em: str
    fingerprint_estrutural: FingerprintEstrutural

    def to_dict(self) -> dict:
        return {
            "caminho_planilha_oficial": self.caminho_planilha_oficial,
            "configurado_em": self.configurado_em,
            "fingerprint_estrutural": self.fingerprint_estrutural.to_dict(),
        }

    @staticmethod
    def from_dict(dados: dict) -> "Configuracao":
        return Configuracao(
            caminho_planilha_oficial=dados["caminho_planilha_oficial"],
            configurado_em=dados["configurado_em"],
            fingerprint_estrutural=FingerprintEstrutural.from_dict(dados["fingerprint_estrutural"]),
        )


@dataclass(frozen=True)
class EstadoConfiguracao:
    """Espelha o contrato do `GET /api/v1/configuracao` (§4) — booleanos
    independentes, sem estados de texto."""

    configurado: bool
    planilha_acessivel: bool = False
    requer_revalidacao: bool = False
    configuracao: Configuracao | None = None


def _diretorio_dados_usuario() -> Path:
    """Mesma resolução já usada por `app/consulta/base_local.py` — mesma
    variável de ambiente, mesmo fallback — para as duas partes do app
    concordarem sobre o mesmo diretório sem duplicar a lógica."""
    caminho_env = os.environ.get(VAR_AMBIENTE_USER_DATA)
    if caminho_env:
        return Path(caminho_env)
    appdata = os.environ.get("APPDATA")
    base = Path(appdata) if appdata else Path.home()
    return base / NOME_PASTA_DADOS_FALLBACK


def caminho_configuracao(*, diretorio_base: Path | str | None = None) -> Path:
    diretorio = Path(diretorio_base) if diretorio_base is not None else _diretorio_dados_usuario()
    return diretorio / NOME_ARQUIVO_CONFIGURACAO


def _calcular_fingerprint(workbook) -> FingerprintEstrutural:
    planilha = workbook[NOME_ABA]
    valores = [str(planilha[f"{coluna}1"].value or "").strip() for coluna in sorted(CABECALHO_EXIGIDO)]
    digest = hashlib.sha256("|".join(valores).encode("utf-8")).hexdigest()
    return FingerprintEstrutural(abas=list(workbook.sheetnames), hash_cabecalho=f"sha256:{digest}")


def validar_planilha(caminho_planilha: str) -> FingerprintEstrutural:
    """Valida os 5 critérios do §5, nesta ordem, parando no primeiro que
    falhar. Levanta `PlanilhaInvalida` com mensagem específica; devolve o
    fingerprint estrutural quando a planilha passa em todos."""
    if not os.path.isfile(caminho_planilha):
        raise PlanilhaInvalida(f"Arquivo não encontrado: {caminho_planilha}")

    if not caminho_planilha.lower().endswith(".xlsx"):
        raise PlanilhaInvalida("Formato não suportado — selecione um arquivo .xlsx")

    try:
        workbook = load_workbook(caminho_planilha, read_only=True, data_only=False)
    except Exception as erro:
        raise PlanilhaInvalida(
            f"Não foi possível abrir a planilha — arquivo corrompido ou bloqueado ({erro})"
        ) from erro

    try:
        if NOME_ABA not in workbook.sheetnames:
            raise PlanilhaInvalida(f"Aba '{NOME_ABA}' não encontrada na planilha")

        planilha = workbook[NOME_ABA]
        for coluna, rotulo_esperado in CABECALHO_EXIGIDO.items():
            valor = str(planilha[f"{coluna}1"].value or "").strip()
            if valor != rotulo_esperado:
                raise PlanilhaInvalida(
                    f"Cabeçalho inesperado na coluna {coluna}1 "
                    f"(esperado '{rotulo_esperado}', encontrado '{valor}')"
                )

        return _calcular_fingerprint(workbook)
    finally:
        workbook.close()


def persistir(
    caminho_planilha: str,
    fingerprint: FingerprintEstrutural,
    *,
    diretorio_base: Path | str | None = None,
) -> Configuracao:
    """Escrita segura contra corrupção (§9): arquivo temporário no mesmo
    diretório + `os.replace` — mesma técnica já homologada em
    `app/consulta/base_local.py::sincronizar`."""
    configuracao = Configuracao(
        caminho_planilha_oficial=caminho_planilha,
        configurado_em=datetime.now().isoformat(timespec="seconds"),
        fingerprint_estrutural=fingerprint,
    )

    destino = caminho_configuracao(diretorio_base=diretorio_base)
    destino.parent.mkdir(parents=True, exist_ok=True)

    temporario = destino.with_suffix(destino.suffix + ".tmp")
    temporario.write_text(
        json.dumps(configuracao.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    os.replace(temporario, destino)

    return configuracao


def carregar(*, diretorio_base: Path | str | None = None) -> Configuracao | None:
    origem = caminho_configuracao(diretorio_base=diretorio_base)
    if not origem.is_file():
        return None
    return Configuracao.from_dict(json.loads(origem.read_text(encoding="utf-8")))


def avaliar_estado_atual(*, diretorio_base: Path | str | None = None) -> EstadoConfiguracao:
    """Única leitura de disco/planilha que alimenta o `GET
    /api/v1/configuracao` inteiro — evita reabrir o arquivo duas vezes
    para `planilha_acessivel` e `requer_revalidacao` separadamente."""
    configuracao = carregar(diretorio_base=diretorio_base)
    if configuracao is None:
        return EstadoConfiguracao(configurado=False)

    if not os.path.isfile(configuracao.caminho_planilha_oficial):
        return EstadoConfiguracao(configurado=True, planilha_acessivel=False, configuracao=configuracao)

    try:
        workbook = load_workbook(configuracao.caminho_planilha_oficial, read_only=True, data_only=False)
    except Exception:
        return EstadoConfiguracao(configurado=True, planilha_acessivel=False, configuracao=configuracao)

    try:
        if NOME_ABA not in workbook.sheetnames:
            fingerprint_atual = None
        else:
            fingerprint_atual = _calcular_fingerprint(workbook)
    finally:
        workbook.close()

    exige_revalidacao = fingerprint_atual is None or fingerprint_atual != configuracao.fingerprint_estrutural

    return EstadoConfiguracao(
        configurado=True,
        planilha_acessivel=True,
        requer_revalidacao=exige_revalidacao,
        configuracao=configuracao,
    )


class PlanilhaOficialIndisponivel(Exception):
    """A mensagem já é adequada para exibição direta ao usuário — quem
    chama `resolver_caminho_para_preenchimento` não precisa saber qual das
    três checagens (configurado/acessível/revalidação) falhou."""


def resolver_caminho_para_preenchimento(*, diretorio_base: Path | str | None = None) -> str:
    """Único ponto de entrada que a camada de API de preenchimento deveria
    conhecer (§7.1 do doc arquitetural — Sprint 15): resolve e valida a
    configuração atual, devolvendo um caminho pronto para uso, ou levanta
    `PlanilhaOficialIndisponivel`. Quem chama esta função nunca precisa
    saber que existe um `configuracao.json`, qual sua estrutura, ou como o
    fingerprint é calculado — isso permanece inteiramente encapsulado
    aqui."""
    estado = avaliar_estado_atual(diretorio_base=diretorio_base)

    if not estado.configurado:
        raise PlanilhaOficialIndisponivel(
            "Nenhuma planilha oficial configurada. Configure em 'Alterar Planilha Oficial'."
        )
    if not estado.planilha_acessivel:
        raise PlanilhaOficialIndisponivel(
            "A planilha oficial configurada está inacessível — foi movida, renomeada ou "
            "excluída? Selecione-a novamente em 'Alterar Planilha Oficial'."
        )
    if estado.requer_revalidacao:
        raise PlanilhaOficialIndisponivel(
            "A estrutura da planilha oficial mudou desde a última configuração. "
            "Revalide em 'Alterar Planilha Oficial' antes de continuar."
        )

    assert estado.configuracao is not None
    return estado.configuracao.caminho_planilha_oficial
