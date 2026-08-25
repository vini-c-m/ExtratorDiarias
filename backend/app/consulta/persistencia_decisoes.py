"""Micro-sprint 3C — persistência local das decisões humanas sobre casos
REVISAO_NECESSARIA (`app/domain/relatorio_transparencia/decisao.py`).

Um único arquivo JSON, nunca um por competência — decisão é reaproveitável
entre gerações futuras do relatório acumulativo (G06,
`docs/relatorio-transparencia/README.md`): modelar "um arquivo por mês"
obrigaria persistir a mesma decisão em N lugares e resincronizá-los, o que
contradiz diretamente G06. Escrita atômica (`.tmp` + `os.replace`), mesma
técnica já homologada em `app/infra/config/configuracao_app.py` e
`app/consulta/base_local.py` — reaproveitada aqui, nunca duplicando lógica
daqueles módulos (que continuam intocados).

Deliberadamente separado de `base_local.sqlite`/Central de Conferência —
este módulo não lê nem escreve nada além do seu próprio arquivo JSON."""

import json
import os
from datetime import datetime
from pathlib import Path

from app.domain.relatorio_transparencia.decisao import AcaoDecisao, DecisaoHumana

__all__ = [
    "VERSAO_ESQUEMA_ATUAL",
    "PersistenciaDecisoesCorrompida",
    "VersaoEsquemaIncompativel",
    "carregar_decisoes",
    "salvar_decisao",
]

VERSAO_ESQUEMA_ATUAL = 1


class PersistenciaDecisoesCorrompida(Exception):
    """JSON malformado, estrutura interna que não corresponde ao esquema
    esperado, bytes que não decodificam como UTF-8, ou o arquivo
    simplesmente não pôde ser lido (permissão negada, bloqueado por outro
    processo, outro erro de I/O) — nunca silenciada, nunca "corrigida"
    automaticamente (mesma filosofia de
    `OrdensBancariasEstruturalmenteInvalida`/
    `ControleDimcacEstruturalmenteInvalido`: falha explícita, mensagem já
    adequada para o usuário). Mesmo critério de
    `configuracao_template_relatorio_transparencia.ConfiguracaoTemplateCorrompida`
    para o arquivo irmão de configuração do template (confronto QA Codex /
    QA-RT-03) — nunca deixa `UnicodeDecodeError`/`PermissionError`/
    `OSError` escaparem como um 500 genérico."""


class VersaoEsquemaIncompativel(PersistenciaDecisoesCorrompida):
    """Caso específico de arquivo corrompido: `versao_esquema` presente,
    mas diferente da versão que este código sabe ler. Subclasse de
    `PersistenciaDecisoesCorrompida` — quem só quer tratar "arquivo
    ilegível" genericamente pode capturar a classe-base; quem precisa
    distinguir migração de esquema de corrupção de dado captura esta."""


def _decisao_para_dict(decisao: DecisaoHumana) -> dict:
    return {
        "identidade_grupo": decisao.identidade_grupo,
        "regra": decisao.regra,
        "obs_envolvidas": sorted(decisao.obs_envolvidas),
        "fingerprint_evidencias": decisao.fingerprint_evidencias,
        "acao": decisao.acao.value,
        "obs_publicaveis": sorted(decisao.obs_publicaveis),
        "autor": decisao.autor,
        "decidido_em": decisao.decidido_em.isoformat(),
        "observacao": decisao.observacao,
    }


def _decisao_de_dict(dados: dict) -> DecisaoHumana:
    return DecisaoHumana(
        identidade_grupo=dados["identidade_grupo"],
        regra=dados["regra"],
        obs_envolvidas=frozenset(dados["obs_envolvidas"]),
        fingerprint_evidencias=dados["fingerprint_evidencias"],
        acao=AcaoDecisao(dados["acao"]),
        obs_publicaveis=frozenset(dados["obs_publicaveis"]),
        autor=dados["autor"],
        decidido_em=datetime.fromisoformat(dados["decidido_em"]),
        observacao=dados.get("observacao"),
    )


def carregar_decisoes(caminho: str | Path) -> dict[str, DecisaoHumana]:
    """Arquivo inexistente é um estado normal (nenhuma decisão registrada
    ainda) — devolve `{}`, nunca levanta exceção. Qualquer outra falha de
    leitura (JSON malformado, campo obrigatório ausente, versão de
    esquema diferente, bytes que não decodificam como UTF-8, ou o arquivo
    existir mas não poder ser lido) é sempre explícita, nunca silenciada
    (confronto QA Codex — achado real: `UnicodeDecodeError`/
    `PermissionError`/`OSError` genérico escapavam daqui até `/preparar`,
    `/revisoes`, o registro de decisão e `/gerar` como um 500 técnico)."""
    caminho = Path(caminho)
    if not caminho.is_file():
        return {}

    try:
        texto = caminho.read_text(encoding="utf-8")
    except UnicodeDecodeError as erro:
        raise PersistenciaDecisoesCorrompida(
            "Arquivo de decisões corrompido (codificação de texto inválida)."
        ) from erro
    except PermissionError as erro:
        raise PersistenciaDecisoesCorrompida(
            "Arquivo de decisões não pôde ser lido (permissão negada)."
        ) from erro
    except OSError as erro:
        raise PersistenciaDecisoesCorrompida(
            "Arquivo de decisões não pôde ser lido (falha de leitura)."
        ) from erro

    try:
        bruto = json.loads(texto)
    except json.JSONDecodeError as erro:
        raise PersistenciaDecisoesCorrompida(
            f"Arquivo de decisões corrompido (JSON inválido): {caminho} ({erro})"
        ) from erro

    if not isinstance(bruto, dict) or "versao_esquema" not in bruto:
        raise PersistenciaDecisoesCorrompida(
            f"Arquivo de decisões corrompido (estrutura inesperada): {caminho}"
        )

    versao = bruto["versao_esquema"]
    if versao != VERSAO_ESQUEMA_ATUAL:
        raise VersaoEsquemaIncompativel(
            f"Versão de esquema incompatível em {caminho}: {versao!r} "
            f"(esperado {VERSAO_ESQUEMA_ATUAL!r})"
        )

    try:
        return {
            identidade: _decisao_de_dict(dados) for identidade, dados in bruto["decisoes"].items()
        }
    except (KeyError, TypeError, ValueError) as erro:
        raise PersistenciaDecisoesCorrompida(
            f"Arquivo de decisões corrompido (campo ausente ou inválido): {caminho} ({erro})"
        ) from erro


def salvar_decisao(caminho: str | Path, decisao: DecisaoHumana) -> None:
    """Adiciona ou substitui a decisão de `decisao.identidade_grupo`,
    preservando todas as demais já persistidas — nunca sobrescreve o
    arquivo inteiro com uma única decisão. Escrita atômica: grava em
    `<caminho>.tmp` e só then troca com `os.replace` (mesma técnica já
    homologada em `configuracao_app.persistir_pastas_operacionais`) — uma
    falha no meio da escrita nunca deixa o arquivo real corrompido."""
    caminho = Path(caminho)
    decisoes = carregar_decisoes(caminho)
    decisoes[decisao.identidade_grupo] = decisao

    caminho.parent.mkdir(parents=True, exist_ok=True)
    conteudo = {
        "versao_esquema": VERSAO_ESQUEMA_ATUAL,
        "decisoes": {identidade: _decisao_para_dict(d) for identidade, d in decisoes.items()},
    }
    temporario = caminho.with_suffix(caminho.suffix + ".tmp")
    temporario.write_text(json.dumps(conteudo, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporario, caminho)
