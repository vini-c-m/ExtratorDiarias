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
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook

__all__ = [
    "TemplateOficialInvalido",
    "TemplateOficialIndisponivel",
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


@dataclass(frozen=True)
class ConfiguracaoTemplate:
    caminho_template: str
    configurado_em: str

    def to_dict(self) -> dict:
        return {"caminho_template": self.caminho_template, "configurado_em": self.configurado_em}

    @staticmethod
    def from_dict(dados: dict) -> "ConfiguracaoTemplate":
        return ConfiguracaoTemplate(
            caminho_template=dados["caminho_template"], configurado_em=dados["configurado_em"]
        )


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
    critério de `configuracao_app.carregar`)."""
    if not os.path.isfile(caminho_configuracao_template):
        return None
    dados = json.loads(Path(caminho_configuracao_template).read_text(encoding="utf-8"))
    return ConfiguracaoTemplate.from_dict(dados)


def persistir_configuracao_template(
    caminho_configuracao_template: str, caminho_template: str
) -> ConfiguracaoTemplate:
    """Valida o arquivo selecionado e grava a configuração — escrita segura
    (arquivo `.tmp` + `os.replace`, mesma técnica de
    `configuracao_app.persistir`)."""
    _validar_template(caminho_template)

    configuracao = ConfiguracaoTemplate(
        caminho_template=caminho_template,
        configurado_em=datetime.now().isoformat(timespec="seconds"),
    )

    destino = Path(caminho_configuracao_template)
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporario = destino.with_suffix(destino.suffix + ".tmp")
    temporario.write_text(json.dumps(configuracao.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporario, destino)

    return configuracao


def resolver_caminho_template(caminho_configuracao_template: str) -> str:
    """Único ponto de entrada que `gerar_relatorio_xlsx` deveria conhecer —
    devolve um caminho de template pronto para uso, ou levanta
    `TemplateOficialIndisponivel` com mensagem já pronta para a tela."""
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
