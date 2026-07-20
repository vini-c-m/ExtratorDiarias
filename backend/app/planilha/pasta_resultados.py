import os
import shutil
from dataclasses import dataclass
from datetime import datetime

from app.planilha.escritor_planilha import CategoriaResultado, ResultadoPreenchimento
from app.planilha.relatorio import ItemAviso, ItemErro, gerar_relatorio_html

_ROTULO_CATEGORIA = {
    CategoriaResultado.INSERIDO: "INSERIDO",
    CategoriaResultado.DUPLICADO_NO_LOTE: "DUPLICADO_NO_LOTE",
    CategoriaResultado.DUPLICADO_NA_PLANILHA: "DUPLICADO_NA_PLANILHA",
}


@dataclass(frozen=True)
class ArquivosGerados:
    pasta_resultados: str
    caminho_planilha_gerada: str
    caminho_relatorio: str
    caminho_log: str


def montar(
    caminho_planilha: str,
    resultado: ResultadoPreenchimento,
    erros: list[ItemErro],
    avisos: list[ItemAviso] | None = None,
    *,
    tempo_processamento_ms: int | None = None,
) -> ArquivosGerados:
    """Reúne, numa pasta própria desta execução (ao lado da planilha
    original), uma cópia da planilha já preenchida, o relatório em HTML e um
    log em texto — para o usuário achar tudo junto sem procurar manualmente
    no Windows. A planilha original continua sendo gravada no lugar onde o
    usuário a selecionou; esta cópia é só para arquivar o resultado desta
    execução específica."""
    avisos = avisos or []
    agora = datetime.now()
    pasta_base = os.path.dirname(caminho_planilha)
    pasta_resultados = os.path.join(pasta_base, f"resultado_{agora.strftime('%Y%m%d_%H%M%S')}")
    os.makedirs(pasta_resultados, exist_ok=True)

    caminho_planilha_gerada = os.path.join(pasta_resultados, os.path.basename(caminho_planilha))
    shutil.copyfile(caminho_planilha, caminho_planilha_gerada)

    caminho_relatorio = os.path.join(pasta_resultados, "relatorio.html")
    gerar_relatorio_html(
        caminho_relatorio,
        caminho_planilha,
        resultado,
        erros,
        avisos,
        agora,
        tempo_processamento_ms=tempo_processamento_ms,
    )

    caminho_log = os.path.join(pasta_resultados, "log.txt")
    _gerar_log(caminho_log, resultado, erros, avisos, agora)

    return ArquivosGerados(
        pasta_resultados=pasta_resultados,
        caminho_planilha_gerada=caminho_planilha_gerada,
        caminho_relatorio=caminho_relatorio,
        caminho_log=caminho_log,
    )


def _gerar_log(
    caminho_log: str,
    resultado: ResultadoPreenchimento,
    erros: list[ItemErro],
    avisos: list[ItemAviso],
    agora: datetime,
) -> None:
    marca = agora.strftime("%Y-%m-%d %H:%M:%S")
    linhas = [f"[{marca}] Início do preenchimento"]

    for item in resultado.itens:
        rotulo = _ROTULO_CATEGORIA[item.categoria]
        if item.categoria is CategoriaResultado.INSERIDO:
            detalhe = f"gravado na linha {item.linha}"
        elif item.categoria is CategoriaResultado.DUPLICADO_NA_PLANILHA:
            detalhe = f"já existe na linha {item.linha}"
        else:
            detalhe = "repetido neste lote"
        linhas.append(
            f"[{marca}] {rotulo} SEI {item.sei} — {detalhe} (arquivo: {item.arquivo_origem})"
        )

    for erro in erros:
        linhas.append(
            f"[{marca}] ERRO arquivo: {erro.arquivo_origem} — {'; '.join(erro.motivos)}"
        )

    for aviso in avisos:
        linhas.append(
            f"[{marca}] REVISAO_MANUAL arquivo: {aviso.arquivo_origem} — "
            f"{'; '.join(aviso.mensagens)}"
        )

    linhas.append(
        f"[{marca}] Fim do preenchimento — {resultado.total_gravado} inserida(s), "
        f"{resultado.duplicadas_ignoradas} ignorada(s) por duplicidade, {len(erros)} erro(s), "
        f"{len(avisos)} com revisão manual pendente"
    )

    with open(caminho_log, "w", encoding="utf-8") as arquivo:
        arquivo.write("\n".join(linhas) + "\n")
