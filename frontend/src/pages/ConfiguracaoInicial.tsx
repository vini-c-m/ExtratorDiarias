import { useState } from "react";
import FormularioConfiguracao from "../components/configuracao/FormularioConfiguracao";
import ResumoConfiguracao from "../components/configuracao/ResumoConfiguracao";
import Logo from "../components/layout/Logo";
import Botao from "../components/ui/Botao";
import { GLOW_LOGO_NEON } from "../theme/estilos";
import { TIPOGRAFIA } from "../theme/tipografia";
import type { ConfiguracaoAtiva } from "../types/configuracao";

interface Props {
  aoConcluir: () => void;
}

// Sprint 15 — Configuração Inicial da Planilha Oficial (§2 do doc
// arquitetural). Tela obrigatória na primeira execução, antes de
// Boas-vindas/Hub: sem planilha oficial configurada, nenhuma outra
// funcionalidade é liberada. Mesmo tratamento visual de `BoasVindas.tsx`
// (Logo + glow, layout centralizado) para a marca continuar consistente
// entre as duas telas de entrada.
export default function ConfiguracaoInicial({ aoConcluir }: Props) {
  const [configuracao, setConfiguracao] = useState<ConfiguracaoAtiva | null>(null);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center animate-entrada-conteudo px-6 py-16 text-center">
      <span className="relative shrink-0">
        <span aria-hidden="true" className={`absolute -inset-3 -z-10 rounded-[32px] ${GLOW_LOGO_NEON}`} />
        <Logo variante="cor" className="h-20 w-20" />
      </span>

      <h1 className={`mt-6 ${TIPOGRAFIA.titulo}`}>Configuração inicial</h1>
      <p className={`mt-2 max-w-md text-balance ${TIPOGRAFIA.texto}`}>
        Antes de começar, selecione a planilha oficial do DIMCAC — ela passa a ser usada
        automaticamente como base e destino de todos os preenchimentos.
      </p>

      <div className="mt-8 w-full max-w-md text-left">
        {configuracao ? (
          <div className="space-y-6">
            <ResumoConfiguracao
              caminhoPlanilhaOficial={configuracao.caminho_planilha_oficial}
              configuradoEm={configuracao.configurado_em}
              planilhaAcessivel
            />
            <div className="flex justify-center">
              <Botao variante="primaria" tamanho="grande" onClick={aoConcluir}>
                Continuar
              </Botao>
            </div>
          </div>
        ) : (
          <FormularioConfiguracao aoConfigurar={setConfiguracao} />
        )}
      </div>
    </div>
  );
}
