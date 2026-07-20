import os

from app.domain.entities.erro_extracao import ErroExtracao
from app.domain.entities.lote_processamento import LoteProcessamento
from app.domain.entities.processo import Processo, StatusProcesso
from app.domain.rules.validacao_diaria import validar
from app.extraction import pdf_reader
from app.extraction.enriquecimento import enriquecer_processo
from app.extraction.parsers.parser_factory import obter_parser


def processar_lote(caminhos: list[str]) -> LoteProcessamento:
    """Orquestra leitura -> parser -> domínio -> validação para cada PDF do lote.

    Um PDF ilegível/corrompido vira um Processo com erro, sem derrubar o resto
    do lote — o objetivo desta Sprint é 'selecionar -> processar -> ver resultado'
    funcionando de verdade, inclusive quando um arquivo é ruim.
    """
    parser = obter_parser()
    processos: list[Processo] = []

    for caminho in caminhos:
        nome_arquivo = os.path.basename(caminho)
        try:
            texto = pdf_reader.ler_texto(caminho)
            campos = parser.extrair(texto)
            processo = validar(nome_arquivo, campos)
            if processo.status is StatusProcesso.SUCESSO:
                processo = enriquecer_processo(processo, texto)
            processos.append(processo)
        except Exception as erro:
            processos.append(
                Processo(
                    arquivo_origem=nome_arquivo,
                    status=StatusProcesso.ERRO,
                    erro=ErroExtracao(
                        arquivo=nome_arquivo, motivos=[f"Falha ao ler o PDF: {erro}"]
                    ),
                )
            )

    return LoteProcessamento(processos=processos)
