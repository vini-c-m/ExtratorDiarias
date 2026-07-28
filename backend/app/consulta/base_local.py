"""Base Local de Consulta — a cópia somente-leitura da planilha oficial que a
Central Inteligente de Conferência consulta (RN-11: nunca escreve na
planilha oficial, nunca decide, só lê e informa).

Nota arquitetural: esta é hoje um mecanismo de CONSULTA, implementado como
arquivo `.xlsx` sincronizado — não uma cópia permanente com valor próprio.
O resto do sistema (`app/domain/rules/conferencia.py`,
`app/services/conferencia_service.py`) só conhece a interface deste pacote
(`servidores_por_cpf`, `diarias_por_cpf`, `caminho_base_local`), nunca o
formato do arquivo em si — isso preserva uma migração futura para SQLite (ou
equivalente) sem impacto em nenhuma camada acima de `app/consulta/`.
"""

import os
import shutil
from pathlib import Path

NOME_PASTA_DADOS_FALLBACK = "ExtratorDiarias"
NOME_ARQUIVO_BASE_LOCAL = "base_local_consulta.xlsx"
VAR_AMBIENTE_USER_DATA = "EXTRATOR_DIARIAS_USER_DATA"


def _diretorio_dados_usuario() -> Path:
    """`electron/main.ts` passa `app.getPath("userData")` via variável de
    ambiente ao subir o backend — é a mesma pasta de dados que o resto do
    app Electron já usa, garantindo um único lugar por instalação. Sem
    Electron (backend rodando standalone, ex. em desenvolvimento), cai para
    `%APPDATA%/ExtratorDiarias` — o mesmo "AppData" já decidido oficialmente
    (§ 0 item 6 do doc arquitetural), só sem depender do Electron para
    calculá-lo."""
    caminho_env = os.environ.get(VAR_AMBIENTE_USER_DATA)
    if caminho_env:
        return Path(caminho_env)
    appdata = os.environ.get("APPDATA")
    base = Path(appdata) if appdata else Path.home()
    return base / NOME_PASTA_DADOS_FALLBACK


def caminho_base_local(*, diretorio_base: Path | str | None = None) -> Path:
    diretorio = Path(diretorio_base) if diretorio_base is not None else _diretorio_dados_usuario()
    return diretorio / "central-conferencia" / NOME_ARQUIVO_BASE_LOCAL


def base_local_disponivel(*, diretorio_base: Path | str | None = None) -> bool:
    return caminho_base_local(diretorio_base=diretorio_base).is_file()


def sincronizar(caminho_planilha_preenchida: str, *, diretorio_base: Path | str | None = None) -> Path:
    """Sobrescreve a Base Local com a planilha oficial recém-preenchida —
    chamada como um hook aditivo ao final do fluxo de preenchimento já
    homologado (`app/services/planilha_service.py`), nunca no caminho
    crítico da gravação em si.

    Escreve para um arquivo temporário no mesmo diretório e finaliza com
    `os.replace` (troca atômica no mesmo volume) em vez de sobrescrever o
    destino diretamente — evita que uma leitura concorrente da Central (a
    própria API roda em threadpool, duas requisições podem ser simultâneas
    de fato) encontre um `.xlsx` parcialmente escrito."""
    destino = caminho_base_local(diretorio_base=diretorio_base)
    destino.parent.mkdir(parents=True, exist_ok=True)

    temporario = destino.with_suffix(destino.suffix + ".tmp")
    shutil.copyfile(caminho_planilha_preenchida, temporario)
    os.replace(temporario, destino)
    # TODO(Sprint futura): instrumentar logging real da sincronização
    # (sucesso/falha) — nesta Sprint o hook em `planilha_service.py` engole
    # qualquer exceção daqui em silêncio (risco aceito explicitamente: sem
    # infraestrutura de logging no projeto ainda, `app/infra/logging/`
    # continua vazia). Se a sincronização falhar persistentemente, hoje não
    # há nenhum sinal disso para o usuário nem para o desenvolvedor.
    return destino
