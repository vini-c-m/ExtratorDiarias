import { useCallback, useEffect, useRef, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import {
  configurarTemplateRelatorioTransparencia,
  gerarRelatorioTransparencia,
  obterStatusTemplateRelatorioTransparencia,
} from "../services/api";
import type { ParametrosFontesRelatorioTransparencia } from "../types/relatorioTransparencia";

/** Micro-sprint 3H — nome sugerido do XLSX final: reflete o mesmo texto do
 * título já escrito dentro da planilha pelo gerador homologado
 * (`escritor_relatorio_transparencia.py`: `ws["A3"] = f"PAGAS ATÉ {mes_nome}/
 * {ano_exercicio}"`) — nenhuma convenção nova inventada, só o mesmo rótulo
 * em formato de nome de arquivo. Lista própria (não compartilhada com
 * `PainelEntrada.tsx`) — mesmo critério de duplicação isolada já usado pelo
 * backend (`_MESES_EXTENSO` do escritor não é compartilhado com nenhum
 * outro módulo). */
const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function nomeArquivoRelatorioTransparencia(anoExercicio: number, mesReferencia: number): string {
  const mes = MESES[mesReferencia - 1] ?? String(mesReferencia);
  return `Relatório de Diárias - Portal da Transparência - ${mes} ${anoExercicio}.xlsx`;
}

function nomeDoArquivo(caminho: string): string {
  return caminho.split(/[\\/]/).pop() ?? caminho;
}

function pastaDoArquivo(caminho: string): string {
  const indice = Math.max(caminho.lastIndexOf("\\"), caminho.lastIndexOf("/"));
  return indice === -1 ? caminho : caminho.slice(0, indice);
}

export type StatusTemplateRelatorioTransparenciaUI =
  | { fase: "carregando" }
  | { fase: "nao-configurado" }
  | { fase: "indisponivel" }
  | { fase: "pronto"; nomeArquivo: string }
  | { fase: "erro"; mensagem: string };

export type FaseGeracaoRelatorioTransparencia =
  | { fase: "ocioso" }
  | {
      fase: "sucesso";
      caminhoArquivo: string;
      caminhoPasta: string;
      totalOcorrencias: number;
      // Sprint 5 — resumo do XLSX operacional (mesma geração, mesmo
      // ResultadoRevisado do oficial). `naoPublicadasGerado=false` cobre
      // dois cenários que a UI precisa distinguir: nenhuma diária a
      // reportar (`totalNaoPublicadas === 0`, `erroNaoPublicadas === null`)
      // ou uma falha na escrita do operacional depois do oficial já salvo
      // (`erroNaoPublicadas` preenchido) — nunca tratados como o mesmo
      // "sucesso completo".
      naoPublicadasGerado: boolean;
      caminhoArquivoNaoPublicadas: string | null;
      totalNaoPublicadas: number;
      erroNaoPublicadas: string | null;
    }
  | { fase: "erro"; mensagem: string };

export interface EstadoUseGerarRelatorioTransparencia {
  statusTemplate: StatusTemplateRelatorioTransparenciaUI;
  carregarStatusTemplate: () => Promise<void>;
  configurandoTemplate: boolean;
  configurarTemplate: (caminhoTemplate: string) => Promise<void>;
  estadoGeracao: FaseGeracaoRelatorioTransparencia;
  gerando: boolean;
  gerar: (parametrosFontes: ParametrosFontesRelatorioTransparencia) => Promise<void>;
  erroAcaoPosGeracao: string | null;
  abrirRelatorio: () => Promise<void>;
  abrirPasta: () => Promise<void>;
  abrirArquivoNaoPublicadas: () => Promise<void>;
}

/** Micro-sprint 3H — máquina de estados da geração final do XLSX (mesmo
 * espírito de `useGerarRelatorio.ts`, adaptado ao contrato deste módulo:
 * `pode_gerar_relatorio` continua vindo só do backend — este hook nunca
 * recalcula pendências, só orquestra Template Oficial + diálogo de destino
 * + `POST /gerar`).
 *
 * `caminhoConfiguracaoTemplate` é infraestrutura interna (resolvida via IPC
 * pela página, mesmo padrão de `caminho_decisoes`) — `null` até resolver. */
export function useGerarRelatorioTransparencia(
  caminhoConfiguracaoTemplate: string | null,
): EstadoUseGerarRelatorioTransparencia {
  const [statusTemplate, setStatusTemplate] = useState<StatusTemplateRelatorioTransparenciaUI>({
    fase: "carregando",
  });
  const configurandoTemplateRef = useRef(false);
  const [configurandoTemplate, setConfigurandoTemplate] = useState(false);

  const [estadoGeracao, setEstadoGeracao] = useState<FaseGeracaoRelatorioTransparencia>({ fase: "ocioso" });
  const gerandoRef = useRef(false);
  const [gerando, setGerando] = useState(false);
  const [erroAcaoPosGeracao, setErroAcaoPosGeracao] = useState<string | null>(null);

  const carregarStatusTemplate = useCallback(async () => {
    if (!caminhoConfiguracaoTemplate) return;
    setStatusTemplate({ fase: "carregando" });
    try {
      const resultado = await obterStatusTemplateRelatorioTransparencia(caminhoConfiguracaoTemplate);
      if (!resultado.configurado) {
        setStatusTemplate({ fase: "nao-configurado" });
      } else if (!resultado.disponivel || !resultado.caminho_template) {
        setStatusTemplate({ fase: "indisponivel" });
      } else {
        setStatusTemplate({ fase: "pronto", nomeArquivo: nomeDoArquivo(resultado.caminho_template) });
      }
    } catch (erroCaptura) {
      setStatusTemplate({
        fase: "erro",
        mensagem: mensagemAmigavel(erroCaptura, "Não foi possível verificar o template oficial."),
      });
    }
  }, [caminhoConfiguracaoTemplate]);

  // Verifica o status assim que o caminho de configuração (infraestrutura
  // interna) estiver resolvido — mesmo critério de `caminho_decisoes` na
  // página: o usuário nunca precisa pedir isso manualmente.
  useEffect(() => {
    carregarStatusTemplate();
  }, [carregarStatusTemplate]);

  const configurarTemplate = useCallback(
    async (caminhoTemplate: string) => {
      if (!caminhoConfiguracaoTemplate || configurandoTemplateRef.current) return;
      configurandoTemplateRef.current = true;
      setConfigurandoTemplate(true);
      try {
        const resultado = await configurarTemplateRelatorioTransparencia({
          caminho_configuracao_template: caminhoConfiguracaoTemplate,
          caminho_template: caminhoTemplate,
        });
        setStatusTemplate(
          resultado.configurado && resultado.disponivel && resultado.caminho_template
            ? { fase: "pronto", nomeArquivo: nomeDoArquivo(resultado.caminho_template) }
            : { fase: "nao-configurado" },
        );
      } catch (erroCaptura) {
        setStatusTemplate({
          fase: "erro",
          mensagem: mensagemAmigavel(erroCaptura, "Não foi possível salvar o template selecionado."),
        });
      } finally {
        configurandoTemplateRef.current = false;
        setConfigurandoTemplate(false);
      }
    },
    [caminhoConfiguracaoTemplate],
  );

  const gerar = useCallback(
    async (parametrosFontes: ParametrosFontesRelatorioTransparencia) => {
      if (gerandoRef.current || !caminhoConfiguracaoTemplate) return;
      gerandoRef.current = true;
      setGerando(true);
      setErroAcaoPosGeracao(null);
      try {
        if (typeof window.api?.escolherDestinoRelatorioTransparencia !== "function") {
          setEstadoGeracao({
            fase: "erro",
            mensagem: "Não foi possível abrir o diálogo para escolher onde salvar o relatório.",
          });
          return;
        }

        const nomeSugerido = nomeArquivoRelatorioTransparencia(
          parametrosFontes.ano_exercicio,
          parametrosFontes.mes_referencia,
        );
        const caminhoDestino = await window.api.escolherDestinoRelatorioTransparencia(nomeSugerido);
        if (caminhoDestino === null) return; // cancelado — permanece no estado atual, sem erro

        const resultado = await gerarRelatorioTransparencia({
          ...parametrosFontes,
          caminho_configuracao_template: caminhoConfiguracaoTemplate,
          caminho_destino: caminhoDestino,
        });

        setEstadoGeracao({
          fase: "sucesso",
          caminhoArquivo: resultado.caminho_arquivo,
          caminhoPasta: pastaDoArquivo(resultado.caminho_arquivo),
          totalOcorrencias: resultado.total_ocorrencias,
          naoPublicadasGerado: resultado.nao_publicadas_gerado,
          caminhoArquivoNaoPublicadas: resultado.caminho_arquivo_nao_publicadas,
          totalNaoPublicadas: resultado.total_nao_publicadas,
          erroNaoPublicadas: resultado.erro_nao_publicadas,
        });
      } catch (erroCaptura) {
        setEstadoGeracao({
          fase: "erro",
          mensagem: mensagemAmigavel(erroCaptura, "Não foi possível gerar o relatório."),
        });
      } finally {
        gerandoRef.current = false;
        setGerando(false);
      }
    },
    [caminhoConfiguracaoTemplate],
  );

  const abrirRelatorio = useCallback(async () => {
    if (estadoGeracao.fase !== "sucesso") return;
    setErroAcaoPosGeracao(null);
    if (typeof window.api?.abrirArquivo !== "function") {
      setErroAcaoPosGeracao("Não foi possível abrir o relatório. Localize-o manualmente na pasta de destino.");
      return;
    }
    try {
      await window.api.abrirArquivo(estadoGeracao.caminhoArquivo);
    } catch {
      setErroAcaoPosGeracao("Não foi possível abrir o relatório. Localize-o manualmente na pasta de destino.");
    }
  }, [estadoGeracao]);

  const abrirPasta = useCallback(async () => {
    if (estadoGeracao.fase !== "sucesso") return;
    setErroAcaoPosGeracao(null);
    if (typeof window.api?.abrirArquivo !== "function") {
      setErroAcaoPosGeracao("Não foi possível abrir a pasta do relatório.");
      return;
    }
    try {
      await window.api.abrirArquivo(estadoGeracao.caminhoPasta);
    } catch {
      setErroAcaoPosGeracao("Não foi possível abrir a pasta do relatório.");
    }
  }, [estadoGeracao]);

  // Sprint 5 — mesmo mecanismo genérico de `abrirRelatorio`/`abrirPasta`
  // (`window.api.abrirArquivo` → `shell.openPath`), nenhum IPC novo. Só age
  // quando o operacional foi de fato gerado nesta execução.
  const abrirArquivoNaoPublicadas = useCallback(async () => {
    if (estadoGeracao.fase !== "sucesso" || !estadoGeracao.caminhoArquivoNaoPublicadas) return;
    const caminho = estadoGeracao.caminhoArquivoNaoPublicadas;
    setErroAcaoPosGeracao(null);
    if (typeof window.api?.abrirArquivo !== "function") {
      setErroAcaoPosGeracao(
        "Não foi possível abrir a planilha de diárias não publicadas. Localize-a manualmente na pasta de destino.",
      );
      return;
    }
    try {
      await window.api.abrirArquivo(caminho);
    } catch {
      setErroAcaoPosGeracao(
        "Não foi possível abrir a planilha de diárias não publicadas. Localize-a manualmente na pasta de destino.",
      );
    }
  }, [estadoGeracao]);

  return {
    statusTemplate,
    carregarStatusTemplate,
    configurandoTemplate,
    configurarTemplate,
    estadoGeracao,
    gerando,
    gerar,
    erroAcaoPosGeracao,
    abrirRelatorio,
    abrirPasta,
    abrirArquivoNaoPublicadas,
  };
}
