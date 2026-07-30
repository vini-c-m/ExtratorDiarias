import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { mensagemAmigavel } from "../../lib/mensagens";
import { definirConfiguracao } from "../../services/api";
import type { ConfiguracaoAtiva } from "../../types/configuracao";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";

interface Props {
  aoConfigurar: (configuracao: ConfiguracaoAtiva) => void;
  rotuloBotao?: string;
}

// Sprint 15 — Configuração Inicial da Planilha Oficial (§8 do doc
// arquitetural): único componente de seleção/validação, reaproveitado
// tanto pela tela obrigatória de primeira execução quanto pela ação
// "Alterar Planilha Oficial" — nenhuma regra duplicada entre os dois
// fluxos, só o que acontece depois de `aoConfigurar` muda por quem chama.
export default function FormularioConfiguracao({
  aoConfigurar,
  rotuloBotao = "Selecionar planilha oficial (.xlsx)",
}: Props) {
  const [validando, setValidando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function selecionarEValidar() {
    const caminho = await window.api.selecionarPlanilhaOficial();
    if (!caminho) return; // diálogo cancelado

    setValidando(true);
    setErro(null);
    try {
      const configuracao = await definirConfiguracao(caminho);
      aoConfigurar(configuracao);
    } catch (erroValidacao) {
      setErro(mensagemAmigavel(erroValidacao, "Não foi possível validar a planilha selecionada."));
    } finally {
      setValidando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Botao
        variante="primaria"
        onClick={selecionarEValidar}
        carregando={validando}
        disabled={validando}
      >
        {!validando && <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />}
        {validando ? "Validando..." : rotuloBotao}
      </Botao>

      {erro && <Alerta variante="erro">{erro}</Alerta>}
    </div>
  );
}
