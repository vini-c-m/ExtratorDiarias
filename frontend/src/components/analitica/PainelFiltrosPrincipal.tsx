import ChipsFiltroAtivo from "./ChipsFiltroAtivo";
import FiltrosRapidos from "./FiltrosRapidos";
import PainelFiltrosAvancados from "./PainelFiltrosAvancados";
import type { CampoDeFiltro } from "../../hooks/useDiarias";
import type { OpcoesFiltroResposta, ParametrosPesquisaDiariasQuery } from "../../types/analitica";

interface Props {
  filtros: ParametrosPesquisaDiariasQuery;
  opcoes: OpcoesFiltroResposta | null;
  erroOpcoes: string | null;
  onTentarNovamenteOpcoes: () => void;
  onMudarFiltro: (parcial: Partial<Record<CampoDeFiltro, string | undefined>>) => void;
  onRemoverFiltro: (campo: CampoDeFiltro) => void;
  onLimparTudo: () => void;
}

// Sprint 19.5.5 — composição do painel de filtros único do novo shell
// (`v2-arquitetura-funcional.md` § 3), reaproveitando os componentes já
// existentes e homologados sem alterar a lógica interna de nenhum deles.
// "Limpar filtros" já é coberto pelo botão de `ChipsFiltroAtivo` — nenhum
// botão "Aplicar"/"Limpar" novo foi criado, já que todo campo de
// `PainelFiltrosAvancados` já aplica ao mudar (nenhuma funcionalidade
// ausente a suprir).
//
// Sprint 19.5.6.1 — fecha o achado da auditoria da 19.5.6 (`FiltrosRapidos`
// existia, mas não estava conectado a nenhuma tela real): `FiltrosRapidos`
// entra acima de `PainelFiltrosAvancados` (mesma posição dos documentos
// aprovados, `v2-wireframes.md` § 1.1/`v2-demonstracao-visual.md` § 1),
// recebendo o **mesmo** `onMudarFiltro` já passado para
// `PainelFiltrosAvancados` — nenhum estado novo, nenhum callback paralelo,
// nenhuma segunda fonte de verdade de filtro. Um atalho rápido e um campo
// do painel avançado disparam exatamente a mesma função.
export default function PainelFiltrosPrincipal({
  filtros,
  opcoes,
  erroOpcoes,
  onTentarNovamenteOpcoes,
  onMudarFiltro,
  onRemoverFiltro,
  onLimparTudo,
}: Props) {
  return (
    <div className="space-y-3">
      <FiltrosRapidos onMudarFiltro={onMudarFiltro} />
      <PainelFiltrosAvancados
        filtros={filtros}
        opcoes={opcoes}
        erroOpcoes={erroOpcoes}
        onTentarNovamenteOpcoes={onTentarNovamenteOpcoes}
        onMudarFiltro={onMudarFiltro}
      />
      <ChipsFiltroAtivo filtros={filtros} onRemover={onRemoverFiltro} onLimparTudo={onLimparTudo} />
    </div>
  );
}
