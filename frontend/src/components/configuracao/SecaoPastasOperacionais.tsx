import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { mensagemAmigavel } from "../../lib/mensagens";
import { definirPastasOperacionais } from "../../services/api";
import type { PastasOperacionais } from "../../types/configuracao";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";

type ChavePasta = keyof PastasOperacionais;

const _CAMPOS: { chave: ChavePasta; rotulo: string }[] = [
  { chave: "caminho_pdfs_a_processar", rotulo: "PDFs a Processar" },
  { chave: "caminho_pdfs_complemento_a_processar", rotulo: "PDFs de Complemento a Processar" },
  { chave: "caminho_pdfs_processados", rotulo: "PDFs Processados" },
  { chave: "caminho_pdfs_diarias_a_confirmar", rotulo: "PDFs de Diárias a Confirmar" },
];

interface Props {
  configuracao: PastasOperacionais;
  /** Avisa o pai para re-buscar a configuração completa após uma pasta ser
   * salva com sucesso — mesmo padrão de `atualizar` de `useConfiguracao`,
   * nunca um objeto de estado repassado diretamente (evita acoplar este
   * componente ao tipo exato de configuração de cada tela que o usa). */
  aoAtualizar: () => void;
}

// Organização Automática de PDFs — quatro linhas [rótulo][caminho atual /
// não configurado][Selecionar pasta], seção aditiva dentro de "Alterar
// Planilha Oficial" (nenhuma página/rota nova). Cada linha salva
// individualmente ao ser selecionada — sem botão "Salvar" único.
export default function SecaoPastasOperacionais({ configuracao, aoAtualizar }: Props) {
  const [selecionando, setSelecionando] = useState<ChavePasta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function selecionarPasta(chave: ChavePasta) {
    if (!window.api.selecionarPastaOperacional) return;
    setErro(null);
    let caminho: string | null;
    try {
      caminho = await window.api.selecionarPastaOperacional();
    } catch (erroSeletor) {
      setErro(
        mensagemAmigavel(erroSeletor, "Não foi possível abrir o seletor de pastas. Tente novamente."),
      );
      return;
    }
    if (!caminho) return; // diálogo cancelado

    setSelecionando(chave);
    try {
      await definirPastasOperacionais({ [chave]: caminho });
      aoAtualizar();
    } catch (erroValidacao) {
      setErro(mensagemAmigavel(erroValidacao, "Não foi possível salvar a pasta selecionada."));
    } finally {
      setSelecionando(null);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-200">Pastas Operacionais</h3>
      <p className="text-xs text-slate-500">
        Usadas pela Organização Automática de PDFs após Processamento, Complemento e Finalização.
      </p>

      <div className="space-y-2">
        {_CAMPOS.map(({ chave, rotulo }) => (
          <div
            key={chave}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200">{rotulo}</p>
              <p className="truncate text-xs text-slate-500" title={configuracao[chave] ?? undefined}>
                {configuracao[chave] ?? "Não configurado"}
              </p>
            </div>
            <Botao
              variante="secundaria"
              onClick={() => selecionarPasta(chave)}
              carregando={selecionando === chave}
              disabled={selecionando !== null}
            >
              <FolderOpen aria-hidden="true" className="h-4 w-4" />
              Selecionar pasta
            </Botao>
          </div>
        ))}
      </div>

      {erro && <Alerta variante="erro">{erro}</Alerta>}
    </div>
  );
}
