import { useCallback, useEffect, useRef, useState } from "react";
import { mensagemAmigavel } from "../lib/mensagens";
import {
  configurarFontesRelatorioTransparencia,
  obterStatusFontesRelatorioTransparencia,
} from "../services/api";
import type { StatusArquivoFonteRelatorioTransparencia } from "../types/relatorioTransparencia";

function nomeDoArquivo(caminho: string): string {
  return caminho.split(/[\\/]/).pop() ?? caminho;
}

export type StatusArquivoFonteUI =
  | { fase: "carregando" }
  | { fase: "nao-configurado" }
  | { fase: "indisponivel" }
  | { fase: "pronto"; caminho: string; nomeArquivo: string }
  | { fase: "erro"; mensagem: string };

function statusUIDoResultado(resultado: StatusArquivoFonteRelatorioTransparencia): StatusArquivoFonteUI {
  if (!resultado.configurado) return { fase: "nao-configurado" };
  if (!resultado.disponivel || !resultado.caminho) return { fase: "indisponivel" };
  return { fase: "pronto", caminho: resultado.caminho, nomeArquivo: nomeDoArquivo(resultado.caminho) };
}

export interface EstadoUseFontesRelatorioTransparencia {
  statusBaseOB: StatusArquivoFonteUI;
  statusControleDimcac: StatusArquivoFonteUI;
  // Sprint 1 (plano "Valor da Passagem no XLSX Oficial") — terceira fonte
  // persistida, mesmo mecanismo independente das duas acima.
  statusPlanilhaPassagens: StatusArquivoFonteUI;
  carregando: boolean;
  configurarBaseOB: (caminho: string) => Promise<void>;
  configurarControleDimcac: (caminho: string) => Promise<void>;
  configurarPlanilhaPassagens: (caminho: string) => Promise<void>;
}

/** Micro-sprint UX operacional (item 3) — os caminhos de Base de Ordens
 * Bancárias e Controle DIMCAC, uma vez selecionados, ficam persistidos
 * (`GET/POST /fontes`, `app/consulta/
 * configuracao_fontes_relatorio_transparencia.py`) e reaparecem já
 * pré-selecionados da próxima vez que o módulo é reaberto — mesmo espírito
 * do Template Oficial (`useGerarRelatorioTransparencia`), mas com DOIS
 * arquivos independentes (cada um pode ser selecionado/reselecionado sem
 * afetar o outro).
 *
 * `caminhoConfiguracaoFontes` é infraestrutura interna (resolvida via IPC
 * pela página, mesmo padrão de `caminho_decisoes`/`caminho_configuracao_
 * template`) — `null` até resolver, e nenhuma chamada é feita enquanto
 * isso. */
export function useFontesRelatorioTransparencia(
  caminhoConfiguracaoFontes: string | null,
): EstadoUseFontesRelatorioTransparencia {
  const [statusBaseOB, setStatusBaseOB] = useState<StatusArquivoFonteUI>({ fase: "carregando" });
  const [statusControleDimcac, setStatusControleDimcac] = useState<StatusArquivoFonteUI>({ fase: "carregando" });
  const [statusPlanilhaPassagens, setStatusPlanilhaPassagens] = useState<StatusArquivoFonteUI>({
    fase: "carregando",
  });
  // Três referências independentes — os três arquivos são selecionados por
  // controles separados na tela e podem ser configurados em qualquer ordem
  // ou até em paralelo, sem que um bloqueie o outro.
  const configurandoBaseOBRef = useRef(false);
  const configurandoControleRef = useRef(false);
  const configurandoPassagensRef = useRef(false);

  const carregarStatus = useCallback(async () => {
    if (!caminhoConfiguracaoFontes) return;
    setStatusBaseOB({ fase: "carregando" });
    setStatusControleDimcac({ fase: "carregando" });
    setStatusPlanilhaPassagens({ fase: "carregando" });
    try {
      const resultado = await obterStatusFontesRelatorioTransparencia(caminhoConfiguracaoFontes);
      setStatusBaseOB(statusUIDoResultado(resultado.base_ordens_bancarias));
      setStatusControleDimcac(statusUIDoResultado(resultado.controle_dimcac));
      setStatusPlanilhaPassagens(statusUIDoResultado(resultado.planilha_passagens));
    } catch (erroCaptura) {
      const mensagem = mensagemAmigavel(erroCaptura, "Não foi possível verificar as fontes salvas.");
      setStatusBaseOB({ fase: "erro", mensagem });
      setStatusControleDimcac({ fase: "erro", mensagem });
      setStatusPlanilhaPassagens({ fase: "erro", mensagem });
    }
  }, [caminhoConfiguracaoFontes]);

  // Mesmo critério de `caminho_decisoes`/Template Oficial: o usuário nunca
  // precisa pedir isso manualmente — verifica assim que o caminho de
  // configuração (infraestrutura interna) estiver resolvido.
  useEffect(() => {
    carregarStatus();
  }, [carregarStatus]);

  const configurarBaseOB = useCallback(
    async (caminho: string) => {
      if (!caminhoConfiguracaoFontes || configurandoBaseOBRef.current) return;
      configurandoBaseOBRef.current = true;
      setStatusBaseOB({ fase: "carregando" });
      try {
        const resultado = await configurarFontesRelatorioTransparencia({
          caminho_configuracao_fontes: caminhoConfiguracaoFontes,
          caminho_base_ordens_bancarias: caminho,
        });
        setStatusBaseOB(statusUIDoResultado(resultado.base_ordens_bancarias));
      } catch (erroCaptura) {
        setStatusBaseOB({
          fase: "erro",
          mensagem: mensagemAmigavel(erroCaptura, "Não foi possível salvar a Base de Ordens Bancárias selecionada."),
        });
      } finally {
        configurandoBaseOBRef.current = false;
      }
    },
    [caminhoConfiguracaoFontes],
  );

  const configurarControleDimcac = useCallback(
    async (caminho: string) => {
      if (!caminhoConfiguracaoFontes || configurandoControleRef.current) return;
      configurandoControleRef.current = true;
      setStatusControleDimcac({ fase: "carregando" });
      try {
        const resultado = await configurarFontesRelatorioTransparencia({
          caminho_configuracao_fontes: caminhoConfiguracaoFontes,
          caminho_controle_dimcac: caminho,
        });
        setStatusControleDimcac(statusUIDoResultado(resultado.controle_dimcac));
      } catch (erroCaptura) {
        setStatusControleDimcac({
          fase: "erro",
          mensagem: mensagemAmigavel(erroCaptura, "Não foi possível salvar o Controle DIMCAC selecionado."),
        });
      } finally {
        configurandoControleRef.current = false;
      }
    },
    [caminhoConfiguracaoFontes],
  );

  const configurarPlanilhaPassagens = useCallback(
    async (caminho: string) => {
      if (!caminhoConfiguracaoFontes || configurandoPassagensRef.current) return;
      configurandoPassagensRef.current = true;
      setStatusPlanilhaPassagens({ fase: "carregando" });
      try {
        const resultado = await configurarFontesRelatorioTransparencia({
          caminho_configuracao_fontes: caminhoConfiguracaoFontes,
          caminho_planilha_passagens: caminho,
        });
        setStatusPlanilhaPassagens(statusUIDoResultado(resultado.planilha_passagens));
      } catch (erroCaptura) {
        setStatusPlanilhaPassagens({
          fase: "erro",
          mensagem: mensagemAmigavel(erroCaptura, "Não foi possível salvar a Planilha de Passagens selecionada."),
        });
      } finally {
        configurandoPassagensRef.current = false;
      }
    },
    [caminhoConfiguracaoFontes],
  );

  return {
    statusBaseOB,
    statusControleDimcac,
    statusPlanilhaPassagens,
    carregando:
      statusBaseOB.fase === "carregando" ||
      statusControleDimcac.fase === "carregando" ||
      statusPlanilhaPassagens.fase === "carregando",
    configurarBaseOB,
    configurarControleDimcac,
    configurarPlanilhaPassagens,
  };
}
