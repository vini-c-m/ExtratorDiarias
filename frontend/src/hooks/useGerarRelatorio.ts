import { useCallback, useRef, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import { gerarRelatorio } from "../services/api";
import type { ParametrosRelatorioQuery } from "../types/analitica";

/** Sprint 19.7.3 — máquina de estados de `POST /relatorios` + IPC de
 * exportação (`v2-plano-tecnico.md` § 11.2), implementada exatamente com
 * as arestas do diagrama, nenhuma inventada:
 *
 * ```
 * Configurando --> PréVisualizando: "Pré-visualizar"
 * PréVisualizando --> Configurando: "← Voltar"
 * PréVisualizando --> Gerando: "Gerar relatório"
 * Gerando --> Sucesso: POST 200 + IPC concluído
 * Gerando --> Erro: falha na geração ou no salvamento
 * Sucesso --> [*]: fechar modal
 * Erro --> Gerando: "Tentar novamente"
 * Erro --> Configurando: "Cancelar"
 * ```
 *
 * O diagrama não desenha nenhuma aresta de falha saindo de
 * "Configurando" (uma falha ao pré-visualizar não tem uma fase "Erro"
 * própria para ir) — uma falha em `preVisualizar` permanece na fase
 * `"configurando"`, com `erro` preenchido para o formulário mostrar um
 * alerta inline, nunca uma tela nova não desenhada no diagrama. */
export type EstadoGeracaoRelatorio =
  | { fase: "configurando"; erro: string | null }
  | {
      fase: "pre-visualizando";
      previa: { caminhoArquivoTemporario: string; nomeSugerido: string; sincronizadoEm: string };
    }
  | { fase: "gerando" }
  | { fase: "sucesso"; resultado: { caminhoArquivo: string; pastaArquivo: string } }
  | { fase: "erro"; mensagem: string };

const ESTADO_INICIAL: EstadoGeracaoRelatorio = { fase: "configurando", erro: null };

export interface EstadoUseGerarRelatorio {
  estado: EstadoGeracaoRelatorio;
  preVisualizar: (parametros: ParametrosRelatorioQuery) => Promise<void>;
  voltar: () => void;
  gerar: (parametros: ParametrosRelatorioQuery) => Promise<void>;
  tentarNovamente: () => void;
  cancelar: () => void;
}

/** `POST /relatorios` (Sprint 19.7.2) + IPC `relatorio:salvar-como`
 * (mesmo canal já usado pelo relatório de Processamento, generalizado na
 * Sprint 19.7.5 para aceitar um `nomeSugerido` opcional — nenhum canal
 * novo criado). Sem "pasta de resultados" própria para a Central
 * Analítica (diferente do Processamento) — string vazia deixa o diálogo
 * nativo escolher a pasta padrão do sistema operacional. */
export function useGerarRelatorio(): EstadoUseGerarRelatorio {
  const [estado, setEstado] = useState<EstadoGeracaoRelatorio>(ESTADO_INICIAL);
  const ultimosParametrosRef = useRef<ParametrosRelatorioQuery | null>(null);

  const preVisualizar = useCallback(async (parametros: ParametrosRelatorioQuery) => {
    try {
      const previa = await gerarRelatorio({ ...parametros, modo: "previsualizacao" });
      setEstado({
        fase: "pre-visualizando",
        previa: {
          caminhoArquivoTemporario: previa.caminho_arquivo_temporario,
          nomeSugerido: previa.nome_sugerido,
          sincronizadoEm: previa.sincronizado_em,
        },
      });
    } catch (erroCaptura) {
      setEstado({
        fase: "configurando",
        erro: mensagemAmigavel(erroCaptura, "Não foi possível pré-visualizar o relatório."),
      });
    }
  }, []);

  const voltar = useCallback(() => {
    setEstado({ fase: "configurando", erro: null });
  }, []);

  const executarGeracao = useCallback(async (parametros: ParametrosRelatorioQuery) => {
    setEstado({ fase: "gerando" });
    try {
      const gerado = await gerarRelatorio({ ...parametros, modo: "final" });

      if (typeof window.api?.salvarRelatorio !== "function") {
        // Mesmo critério defensivo já usado em `PainelDetalhamentoDiaria`
        // para `window.api.copiarTexto` ausente: preload não anexado é
        // uma falha técnica real, nunca tratada como sucesso silencioso.
        throw new Error("Não foi possível abrir o diálogo para salvar o arquivo.");
      }
      // Sprint 19.7.5 — `nomeSugerido` (3º argumento) faz o diálogo nativo
      // sugerir nome/extensão corretos por formato (`gerado.nome_sugerido`
      // já vem com a extensão certa do backend, 19.7.2) — antes desta
      // Sprint, o IPC só sabia sugerir o nome fixo do Processamento.
      const salvo = await window.api.salvarRelatorio(gerado.caminho_arquivo_temporario, "", gerado.nome_sugerido);

      if (salvo === null) {
        // Usuário cancelou o diálogo nativo — não é falha ("Cancelar
        // sempre disponível sem perguntar confirmação",
        // `v2-demonstracao-visual.md` § 7); volta à configuração em
        // silêncio, sem transição de erro (aresta não desenhada em
        // § 11.2 para este caso).
        setEstado({ fase: "configurando", erro: null });
        return;
      }

      setEstado({ fase: "sucesso", resultado: salvo });
    } catch (erroCaptura) {
      setEstado({ fase: "erro", mensagem: mensagemAmigavel(erroCaptura, "Não foi possível gerar o relatório.") });
    }
  }, []);

  const gerar = useCallback(
    async (parametros: ParametrosRelatorioQuery) => {
      ultimosParametrosRef.current = parametros;
      await executarGeracao(parametros);
    },
    [executarGeracao],
  );

  const tentarNovamente = useCallback(() => {
    if (ultimosParametrosRef.current !== null) {
      executarGeracao(ultimosParametrosRef.current);
    }
  }, [executarGeracao]);

  const cancelar = useCallback(() => {
    setEstado({ fase: "configurando", erro: null });
  }, []);

  return { estado, preVisualizar, voltar, gerar, tentarNovamente, cancelar };
}
