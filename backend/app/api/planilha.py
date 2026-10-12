from fastapi import APIRouter, HTTPException

from app import diagnostico_complemento_temp as diag  # DIAGNÓSTICO TEMPORÁRIO — remover após causa raiz confirmada/corrigida
from app.domain.entities.diaria import Diaria
from app.domain.entities.modo_processamento import ModoProcessamento
from app.domain.entities.processo import Processo, StatusProcesso
from app.infra.config import configuracao_app
from app.planilha.organizador_arquivos import ResultadoOrganizacao
from app.planilha.relatorio import ItemAviso, ItemErro
from app.schemas.planilha import (
    ItemResultadoResposta,
    OrganizacaoItemResposta,
    RequisicaoPreenchimento,
    ResultadoPreenchimentoResposta,
)
from app.services.planilha_service import ErroPreenchimentoPlanilha, preencher_planilha

router = APIRouter(prefix="/api/v1", tags=["planilha"])


def _organizacao_resposta(resultado: ResultadoOrganizacao | None) -> OrganizacaoItemResposta | None:
    if resultado is None:
        return None
    return OrganizacaoItemResposta(
        sucesso=resultado.sucesso, status=resultado.status.value, detalhe=resultado.detalhe
    )


@router.post("/planilha/preencher", response_model=ResultadoPreenchimentoResposta)
def preencher(requisicao: RequisicaoPreenchimento) -> ResultadoPreenchimentoResposta:
    # Sprint 15 — o backend é a única autoridade sobre o caminho da planilha
    # oficial (§7.1 do doc arquitetural). Esta rota não sabe (e não deveria
    # saber) que existe um `configuracao.json`, qual sua estrutura ou como a
    # validação/fingerprint funcionam — tudo isso fica encapsulado em
    # `configuracao_app`, que expõe só esta função e esta exceção.
    with diag.etapa("api_planilha_preencher", total_itens=len(requisicao.itens), modo=requisicao.modo):
        try:
            caminho_planilha = configuracao_app.resolver_caminho_para_preenchimento()
        except configuracao_app.PlanilhaOficialIndisponivel as erro:
            raise HTTPException(status_code=422, detail=str(erro)) from erro

        processos = [
            Processo(
                arquivo_origem=item.arquivo_origem,
                status=StatusProcesso.SUCESSO,
                diaria=Diaria(**item.diaria.model_dump()),
            )
            for item in requisicao.itens
        ]
        erros = [
            ItemErro(arquivo_origem=erro.arquivo_origem, motivos=erro.motivos)
            for erro in requisicao.erros
        ]
        avisos = [
            ItemAviso(arquivo_origem=aviso.arquivo_origem, mensagens=aviso.mensagens)
            for aviso in requisicao.avisos
        ]

        # Organização Automática de PDFs — pastas operacionais são
        # independentes da planilha oficial (podem nunca ter sido
        # configuradas); ausentes, `preencher_planilha` só devolve um
        # dicionário de organização vazio, sem afetar a gravação em si.
        # Nota: chaveado por `arquivo_origem` (nome-base) — se dois PDFs
        # selecionados no mesmo lote tiverem exatamente o mesmo nome de
        # arquivo (pastas de origem diferentes), só o último "vence" aqui.
        # Na prática isso nunca acontece com a guarda de pasta do frontend
        # ativa (mesma pasta não permite dois arquivos com o mesmo nome);
        # sem a guarda configurada, o pior caso é a organização mover o
        # arquivo físico errado — nunca afeta a gravação administrativa em
        # si (SEI/planilha), que não depende deste mapa.
        modo = ModoProcessamento(requisicao.modo)
        configuracao_pastas = configuracao_app.carregar()
        caminhos_absolutos = {
            item.arquivo_origem: item.caminho_absoluto
            for item in requisicao.itens
            if item.caminho_absoluto
        }
        pasta_origem = None
        pasta_destino = None
        if configuracao_pastas is not None:
            pasta_destino = configuracao_pastas.caminho_pdfs_processados
            pasta_origem = (
                configuracao_pastas.caminho_pdfs_a_processar
                if modo is ModoProcessamento.PADRAO
                else configuracao_pastas.caminho_pdfs_complemento_a_processar
            )

        try:
            resultado, arquivos_gerados, organizacoes = preencher_planilha(
                caminho_planilha,
                processos,
                erros,
                avisos,
                tempo_processamento_ms=requisicao.tempo_processamento_ms,
                modo=modo,
                caminhos_absolutos=caminhos_absolutos,
                pasta_origem=pasta_origem,
                pasta_destino=pasta_destino,
            )
        except ErroPreenchimentoPlanilha as erro:
            raise HTTPException(status_code=422, detail=str(erro)) from erro

        with diag.etapa("montagem_resposta"):
            resposta = ResultadoPreenchimentoResposta(
                total_gravado=resultado.total_gravado,
                duplicadas_ignoradas=resultado.duplicadas_ignoradas,
                linha_inicial=resultado.linha_inicial,
                linha_final=resultado.linha_final,
                itens=[
                    ItemResultadoResposta(
                        arquivo_origem=item.arquivo_origem,
                        sei=item.sei,
                        categoria=item.categoria.value,
                        linha=item.linha,
                        sei_ja_existente_em_linha=item.sei_ja_existente_em_linha,
                        organizacao=_organizacao_resposta(organizacoes.get(item.arquivo_origem)),
                    )
                    for item in resultado.itens
                ],
                pasta_resultados=arquivos_gerados.pasta_resultados,
                caminho_planilha_gerada=arquivos_gerados.caminho_planilha_gerada,
                caminho_relatorio=arquivos_gerados.caminho_relatorio,
                caminho_log=arquivos_gerados.caminho_log,
                sincronizacao_analitica_falhou=resultado.sincronizacao_analitica_falhou,
            )

        diag.registrar(
            "resposta_pronta_para_envio",
            total_gravado=resultado.total_gravado,
            sincronizacao_analitica_falhou=resultado.sincronizacao_analitica_falhou,
        )
        return resposta
