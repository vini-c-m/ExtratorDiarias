import { Clock, FileSpreadsheet, FolderOpen } from "lucide-react";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";
import Cartao from "../ui/Cartao";

interface Props {
  /** Ausentes quando `planilhaAcessivel` é `false` — o contrato de `GET
   * /api/v1/configuracao` (§4) não devolve nome/local/data nesse caso
   * (resposta mínima, `{configurado:true, planilha_acessivel:false}`). */
  caminhoPlanilhaOficial?: string;
  configuradoEm?: string;
  /** Sprint 15 — quando `false`, o resumo é o próprio aviso de bloqueio da
   * ação "Preencher Planilha" (§7 do doc arquitetural): a planilha
   * configurada não está acessível agora (movida/renomeada/excluída). */
  planilhaAcessivel: boolean;
  /** `true` quando a estrutura da planilha divergiu do que foi validado da
   * última vez (§6) — nunca bloqueia por si só em outros contextos, mas
   * bloqueia especificamente a ação de preenchimento (§7.1). */
  requerRevalidacao?: boolean;
  /** Omitido quando o resumo é mostrado logo após a própria ação de
   * alterar/configurar ter acabado de ter sucesso (ex.: dentro do modal de
   * "Alterar Planilha Oficial") — o botão seria redundante ali. */
  aoAlterarPlanilha?: () => void;
}

function nomeDoArquivo(caminho: string): string {
  return caminho.split(/[\\/]/).pop() ?? caminho;
}

function formatarDataHora(isoSemFuso: string): string {
  const data = new Date(isoSemFuso);
  if (Number.isNaN(data.getTime())) return isoSemFuso;
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const hora = String(data.getHours()).padStart(2, "0");
  const minuto = String(data.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${data.getFullYear()} ${hora}:${minuto}`;
}

// Sprint 15 — Configuração Inicial da Planilha Oficial (§10 do doc
// arquitetural). Três pontos de uso, o mesmo componente: tela de
// Configuração Inicial, "Alterar Planilha Oficial" e, desde a correção de
// escopo (§7.1), no lugar do antigo seletor manual dentro de Processamento
// — por isso mostra também situação de acessibilidade e a ação de troca,
// não só nome/local/data.
export default function ResumoConfiguracao({
  caminhoPlanilhaOficial,
  configuradoEm,
  planilhaAcessivel,
  requerRevalidacao = false,
  aoAlterarPlanilha,
}: Props) {
  return (
    <div className="space-y-4">
      {!planilhaAcessivel ? (
        <Alerta variante="erro">
          A planilha oficial configurada está inacessível — foi movida, renomeada ou excluída.
          Selecione-a novamente para continuar.
        </Alerta>
      ) : requerRevalidacao ? (
        <Alerta variante="aviso">
          A estrutura da planilha oficial mudou desde a última configuração. Revalide antes de
          preencher.
        </Alerta>
      ) : (
        <Alerta variante="sucesso">Planilha configurada</Alerta>
      )}

      {planilhaAcessivel && caminhoPlanilhaOficial && configuradoEm && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Cartao
            rotulo="Nome"
            valor={nomeDoArquivo(caminhoPlanilhaOficial)}
            tamanho="compacto"
            icone={FileSpreadsheet}
          />
          <Cartao rotulo="Local" valor={caminhoPlanilhaOficial} tamanho="compacto" icone={FolderOpen} />
          <Cartao
            rotulo="Configurada em"
            valor={formatarDataHora(configuradoEm)}
            tamanho="compacto"
            icone={Clock}
          />
        </div>
      )}

      {aoAlterarPlanilha && (
        <Botao variante="secundaria" onClick={aoAlterarPlanilha}>
          <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
          Alterar Planilha Oficial
        </Botao>
      )}
    </div>
  );
}
