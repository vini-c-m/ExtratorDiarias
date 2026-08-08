import Logo from "../components/layout/Logo";
import Botao from "../components/ui/Botao";
import { GLOW_LOGO_NEON } from "../theme/estilos";
import { TIPOGRAFIA } from "../theme/tipografia";

interface Props {
  aoComecar: () => void;
}

// Sprint 14 — primeira tela do app (item "Nova tela de Boas-vindas" do
// briefing): antes desta Sprint, `App.tsx` ia direto para o formulário de
// Processamento. Não reaproveita `Cabecalho.tsx` de propósito — papéis
// diferentes (vitrine de entrada única por abertura do app vs. status de
// trabalho, presente em toda tela de funcionalidade) — mas reaproveita
// `Logo.tsx` (mesmo SVG, só maior) e `GLOW_LOGO_NEON` (mesmo tratamento do
// logo do cabeçalho, ver `theme/estilos.ts`), para a marca ficar
// consistente entre as duas telas.
//
// "Começar" sempre habilitado, mesmo com o backend ainda subindo — decisão
// registrada na proposta desta Sprint: a tela seguinte (Hub) e as telas de
// funcionalidade já tratam `backendOnline` como fazem hoje: não faz
// sentido bloquear a navegação num degrau que não depende do backend.
export default function BoasVindas({ aoComecar }: Props) {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center animate-entrada-conteudo px-6 py-16 text-center">
      <span className="relative shrink-0">
        <span aria-hidden="true" className={`absolute -inset-3 -z-10 rounded-[32px] ${GLOW_LOGO_NEON}`} />
        <Logo variante="cor" className="h-28 w-28" />
      </span>

      {/* Título/tagline em tamanho "hero" — maiores que `TIPOGRAFIA.tituloApp`/
          `subtituloApp` (reservados ao cabeçalho compacto), mesmo peso e
          tratamento de letras, só para esta tela de entrada única. */}
      <h1 className="mt-7 text-[34px] font-extrabold leading-tight tracking-[0.01em] text-slate-50 text-balance">
        Automatizador de Diárias
      </h1>
      <p className="mt-2 text-[13px] font-medium uppercase tracking-[0.14em] text-slate-400">
        Automação Inteligente do Processo de Concessão de Diárias
      </p>
      <p className={`mt-5 max-w-md text-balance ${TIPOGRAFIA.texto}`}>
        Centraliza o processamento, conferência e organização das solicitações de diárias do DIMCAC de
        forma rápida, segura e padronizada.
      </p>

      <div className="mt-9">
        <Botao variante="primaria" tamanho="grande" onClick={aoComecar}>
          Começar
        </Botao>
      </div>
    </div>
  );
}
