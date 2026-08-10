import Botao from "../ui/Botao";
import { useSincronizacao } from "../../hooks/useSincronizacao";
import { TIPOGRAFIA } from "../../theme/tipografia";

interface Props {
  backendOnline: boolean;
}

/** MS UX — Simplificação da Central Analítica (2026-08-10): a sincronização
 * da Base Local deixou de expor um botão permanente. `useSincronizacao` já
 * dispara `sincronizarAgora` sozinho ao montar (mesmo mecanismo homologado
 * do botão manual, nenhum endpoint/lógica novos) — sucesso (automático ou
 * de uma nova tentativa) não deixa rastro nenhum na tela; só uma falha real
 * precisa de ação do usuário, e só ela ganha interface. "Zero botão" é o
 * estado normal, não uma ausência a ser explicada — os 9 estados textuais
 * anteriores (verificando/nunca sincronizado/possivelmente desatualizado/
 * banner de sucesso/...) davam lugar a ruído administrativo permanente que
 * a Central não precisa mostrar quando está tudo bem. */
export default function IndicadorSincronizacao({ backendOnline }: Props) {
  const { erro, sincronizando, ultimaExecucao, atualizar, sincronizarAgora } = useSincronizacao(backendOnline);

  // Falha ao ler o estado (GET) — mesma classe de "algo precisa de ação",
  // mesmo tratamento visual mínimo da falha de sincronização abaixo.
  if (erro) {
    return (
      <div className="flex items-center justify-between gap-4">
        <p className={TIPOGRAFIA.textoAuxiliar}>Não foi possível verificar a sincronização da Base Local.</p>
        <Botao variante="secundaria" onClick={atualizar} carregando={sincronizando}>
          Tentar novamente
        </Botao>
      </div>
    );
  }

  if (ultimaExecucao?.tipo === "falha" || ultimaExecucao?.tipo === "planilha_indisponivel") {
    return (
      <div className="flex items-center justify-between gap-4">
        <p className={TIPOGRAFIA.textoAuxiliar}>
          {ultimaExecucao.tipo === "planilha_indisponivel"
            ? ultimaExecucao.mensagem
            : "Falha ao sincronizar a Base Local — os dados podem estar desatualizados."}
        </p>
        <Botao variante="secundaria" onClick={sincronizarAgora} carregando={sincronizando}>
          Sincronizar novamente
        </Botao>
      </div>
    );
  }

  // Sucesso (automático ou de uma tentativa manual) e "sincronizando" em
  // andamento (auto ou retry) — nenhum dos dois precisa de interface.
  return null;
}
