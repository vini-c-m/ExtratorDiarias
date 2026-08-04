import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";
import { useSincronizacao } from "../../hooks/useSincronizacao";
import type { VarianteStatus } from "../../theme/cores";
import { TIPOGRAFIA } from "../../theme/tipografia";

interface Props {
  backendOnline: boolean;
}

// Sprint 18.4.3 — tempo em que o banner "Base Local atualizada" fica
// visível antes de voltar ao estado normal (wireframe, `ui-wireframes.md`
// § 6: "some sozinho em poucos segundos") — só neste componente, nunca no
// hook (`ui-plano-tecnico.md` § 8).
const DURACAO_BANNER_SUCESSO_MS = 3000;

function formatarHorario(isoSemFuso: string): string {
  const data = new Date(isoSemFuso);
  if (Number.isNaN(data.getTime())) return isoSemFuso;
  const hora = String(data.getHours()).padStart(2, "0");
  const minuto = String(data.getMinutes()).padStart(2, "0");
  return `${hora}:${minuto}`;
}

interface PropsLinhaDeEstado {
  mensagem: ReactNode;
  /** Ausente = texto simples (`<p role="status">`); presente = `Alerta`
   * com a variante indicada. Só "erro"/"aviso" são usados aqui — sucesso
   * é tratado à parte (sem botão) e "info" não é necessário nesta
   * Sprint. */
  varianteAlerta?: Extract<VarianteStatus, "erro" | "aviso">;
  rotuloBotao: string;
  aoClicarBotao?: () => void;
  botaoDesabilitado?: boolean;
}

// Sprint 18.4.3.1 — extraído para eliminar a duplicação de "mensagem +
// botão" que se repetia em 6 dos estados do indicador (achado da
// auditoria consolidada das Sprints 18.4.1–18.4.3). Texto simples usa
// `role="status"` (região viva "polite") para leitores de tela
// anunciarem a troca de estado — `Alerta` já traz o próprio `role`
// internamente (`status`/`alert`), então não precisa de nada extra aqui.
function LinhaDeEstado({
  mensagem,
  varianteAlerta,
  rotuloBotao,
  aoClicarBotao,
  botaoDesabilitado = false,
}: PropsLinhaDeEstado) {
  return (
    <div className="flex items-center justify-between gap-4">
      {varianteAlerta ? (
        <Alerta variante={varianteAlerta}>{mensagem}</Alerta>
      ) : (
        <p role="status" className={TIPOGRAFIA.textoAuxiliar}>
          {mensagem}
        </p>
      )}
      <Botao variante="secundaria" onClick={aoClicarBotao} disabled={botaoDesabilitado}>
        {rotuloBotao}
      </Botao>
    </div>
  );
}

/** Os estados de sincronização da Central Analítica, ligados a `GET`/`POST
 * /api/v1/analitica/sincronizacao` (Sprint 17.4.6, homologado — nenhum
 * contrato alterado aqui). Fixo no topo da tela, acima do painel de
 * filtros — a verificação de frescor é do módulo inteiro, não de uma
 * visualização específica (resultados/dashboard/relatório/diagnóstico). */
export default function IndicadorSincronizacao({ backendOnline }: Props) {
  const { carregando, erro, dado, sincronizando, ultimaExecucao, atualizar, sincronizarAgora } =
    useSincronizacao(backendOnline);

  const [mostrarBannerSucesso, setMostrarBannerSucesso] = useState(false);

  useEffect(() => {
    if (ultimaExecucao?.tipo !== "sucesso") return;
    setMostrarBannerSucesso(true);
    const temporizador = setTimeout(() => setMostrarBannerSucesso(false), DURACAO_BANNER_SUCESSO_MS);
    return () => clearTimeout(temporizador);
  }, [ultimaExecucao]);

  // 1. Base Local indisponível (503 em `GET /sincronizacao`) — falha
  // técnica, sempre vermelha; nenhum outro estado é avaliado enquanto
  // este persistir.
  if (erro) {
    return (
      <LinhaDeEstado
        varianteAlerta="erro"
        mensagem="Não foi possível carregar o status de sincronização agora."
        rotuloBotao="Tentar novamente"
        aoClicarBotao={atualizar}
      />
    );
  }

  // 2. Verificação inicial de frescor (decisão 1 da arquitetura de
  // backend — ao entrar no módulo).
  if (carregando) {
    return (
      <p role="status" className={TIPOGRAFIA.textoAuxiliar}>
        ⏳ Verificando atualizações...
      </p>
    );
  }

  // 3. Sincronização em andamento — dura só enquanto `sincronizando` é
  // `true` (a própria chamada, disparada por este cliente ou recusada
  // com 409 por já haver outra em curso, RN-A). Correção 18.4.3.1: não
  // depende mais de `ultimaExecucao`, que nunca fica "preso" nesta
  // exibição — assim que a chamada resolve (em qualquer desfecho,
  // inclusive 409), o indicador cai no estado normal derivado de `dado`
  // (itens 7–9), sempre com um botão funcional.
  if (sincronizando) {
    return (
      <LinhaDeEstado mensagem="🔄 Sincronizando..." rotuloBotao="Sincronizar agora" botaoDesabilitado />
    );
  }

  // 4. Planilha Oficial indisponível (422 — `PlanilhaOficialIndisponivel`
  // no `POST`) — pré-requisito não satisfeito, não é uma falha da própria
  // sincronização; mensagem vem direta do backend (`mensagemAmigavel`).
  if (ultimaExecucao?.tipo === "planilha_indisponivel") {
    return (
      <LinhaDeEstado
        varianteAlerta="aviso"
        mensagem={ultimaExecucao.mensagem}
        rotuloBotao="Tentar novamente"
        aoClicarBotao={sincronizarAgora}
      />
    );
  }

  // 5. Falha da sincronização manual (resposta `status: "falha"` ou 503
  // durante o `POST`) — persiste até o usuário agir de novo, nunca some
  // sozinha (diferente do sucesso, item 6 abaixo).
  if (ultimaExecucao?.tipo === "falha") {
    return (
      <LinhaDeEstado
        varianteAlerta="erro"
        mensagem="Falha ao sincronizar — os dados podem estar desatualizados."
        rotuloBotao="Tentar novamente"
        aoClicarBotao={sincronizarAgora}
      />
    );
  }

  // 6. Sucesso recém-concluído — confirmação breve, `mostrarBannerSucesso`
  // (efeito acima) a esconde sozinha depois de `DURACAO_BANNER_SUCESSO_MS`.
  if (mostrarBannerSucesso) {
    return <Alerta variante="sucesso">Base Local atualizada.</Alerta>;
  }

  if (!dado) {
    // Só alcançável se `backendOnline` nunca chegou a ficar `true` (a
    // busca inicial nunca rodou) — nada a mostrar ainda, mesmo padrão de
    // outras páginas aguardando o primeiro estado do backend.
    return null;
  }

  // 7. Possivelmente desatualizado (RN-E — nunca assumir frescor sem
  // provar) — aviso, nunca erro (é um estado de negócio, não uma falha).
  if (dado.status === "possivelmente_desatualizado") {
    return (
      <LinhaDeEstado
        varianteAlerta="aviso"
        mensagem="Os dados podem estar desatualizados."
        rotuloBotao="Sincronizar agora"
        aoClicarBotao={sincronizarAgora}
      />
    );
  }

  // 8. Nunca sincronizado (J7 — primeira utilização) — estado de negócio
  // válido, nunca um erro.
  if (dado.status === "nunca_sincronizado") {
    return (
      <LinhaDeEstado
        mensagem="Nenhuma sincronização realizada ainda."
        rotuloBotao="Sincronizar agora"
        aoClicarBotao={sincronizarAgora}
      />
    );
  }

  // 9. Estado normal — atualizado.
  return (
    <LinhaDeEstado
      mensagem={`🕐 Base Local sincronizada às ${formatarHorario(dado.sincronizado_em ?? "")}`}
      rotuloBotao="Sincronizar agora"
      aoClicarBotao={sincronizarAgora}
    />
  );
}
