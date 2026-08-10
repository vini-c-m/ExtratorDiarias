import { ExternalLink, X } from "lucide-react";
import { type ChangeEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { useOpcoesCadastroServidor } from "../../hooks/useOpcoesCadastroServidor";
import { mensagemAmigavel, MENSAGENS } from "../../lib/mensagens";
import { cpfValido, normalizarCpf } from "../../lib/normalizarCpf";
import { cadastrarServidor } from "../../services/api";
import { FOCO_ANEL, PAINEL_MODAL } from "../../theme/estilos";
import { TIPOGRAFIA } from "../../theme/tipografia";
import type { RespostaCadastroServidor } from "../../types/conferencia";
import Alerta from "../ui/Alerta";
import Botao from "../ui/Botao";
import Campo from "../ui/Campo";
import ComboboxPesquisavel from "../ui/ComboboxPesquisavel";
import Selecao from "../ui/Selecao";

interface Props {
  /** CPF já consultado na Central de Conferência — só pré-preenche o
   * campo (sugestão/autopreenchimento). Ajuste Funcional + UX (item 2):
   * o campo continua EDITÁVEL — o CPF pesquisado pode estar digitado
   * errado, e o servidor pode corrigi-lo (ex.: após consultar o
   * Arquimedes) antes de salvar. */
  cpf: string;
  onFechar: () => void;
  /** Chamado quando o CPF passa a ser encontrável (estado `duplicado` ou
   * `concluido`, ambos após reconfirmação pela mesma fonte que a
   * Conferência já usa) — quem chama deve reconsultar (`conferir`) de
   * novo, nunca aceitar um resultado construído aqui no frontend (RN-11:
   * fonte única de verdade é sempre o backend). Recebe o CPF FINAL
   * normalizado (o que foi de fato enviado/salvo) — como o campo é
   * editável, pode ser diferente do CPF originalmente pesquisado (prop
   * `cpf` acima); quem chama deve reconsultar por ESTE CPF, nunca pelo
   * antigo. */
  onCpfResolvido: (cpfFinal: string) => void;
}

const SITUACAO_PADRAO = "Em exercício";

const URL_ARQUIMEDES = "https://arquimedes.mppe.mp.br/arquimedes/";

export default function ModalCadastrarServidor({ cpf, onFechar, onCpfResolvido }: Props) {
  // Editável (item 2 do pedido "Ajuste Funcional + UX") — `cpf` (prop) só
  // pré-preenche o estado inicial, nunca é lido de novo depois disso.
  const [cpfEditavel, setCpfEditavel] = useState(cpf);
  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  const [cargo, setCargo] = useState("");
  const [previdencia, setPrevidencia] = useState("");
  const [orgaoOrigem, setOrgaoOrigem] = useState("");
  const [regimePrevidencia, setRegimePrevidencia] = useState("");
  const [situacao, setSituacao] = useState("");

  const [carregando, setCarregando] = useState(false);
  const [resposta, setResposta] = useState<RespostaCadastroServidor | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Trava síncrona contra clique duplo — mesmo padrão de
  // `useGerarRelatorio`/`SelecionarProcessar` (Sprint Loading/Bloqueio de
  // Ações): `carregando` só reflete no próximo re-render, insuficiente
  // sozinho contra dois cliques disparados antes do primeiro.
  const emVooRef = useRef(false);

  // Valores reais já levantados na aba `Dados` (RN-01) — nunca lista
  // hardcoded (item 8 do pedido "Ajuste Final"): Cargo/Órgão de origem
  // usam essas sugestões num combobox pesquisável (aceitam valor novo);
  // Previdência/Regime/Situação usam um seletor fechado (só aceitam um
  // valor desta lista).
  const { opcoes } = useOpcoesCadastroServidor();

  // Pré-seleciona "Em exercício" (padrão institucional para um cadastro
  // novo) só depois que a lista real carrega e realmente contém esse
  // valor — nunca antes, para o seletor fechado nunca começar com um
  // valor fora da lista recebida.
  useEffect(() => {
    if (opcoes?.situacoes.includes(SITUACAO_PADRAO) && !situacao) {
      setSituacao(SITUACAO_PADRAO);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opcoes]);

  const podeSalvar =
    cpfValido(cpfEditavel) &&
    nome.trim().length > 0 &&
    matricula.trim().length > 0 &&
    cargo.trim().length > 0;

  async function salvar() {
    if (emVooRef.current || !podeSalvar) return;
    emVooRef.current = true;
    setCarregando(true);
    setErro(null);

    // CPF FINAL — normalizado a partir do que está no campo AGORA, nunca
    // da prop `cpf` original: o usuário pode ter corrigido o valor
    // pesquisado antes de salvar (item 2 do pedido).
    const cpfFinalNormalizado = normalizarCpf(cpfEditavel);

    try {
      const resultado = await cadastrarServidor({
        cpf: cpfFinalNormalizado,
        nome: nome.trim(),
        matricula: matricula.trim(),
        cargo: cargo.trim(),
        previdencia: previdencia.trim() || null,
        orgao_origem: orgaoOrigem.trim() || null,
        regime_previdencia: regimePrevidencia.trim() || null,
        situacao: situacao.trim() || null,
      });

      if (resultado.estado === "nao_salvo") {
        // Erro comum: formulário continua preenchido, nada foi persistido
        // — usuário pode tentar de novo livremente.
        setErro(resultado.mensagem ?? "Não foi possível salvar o cadastro.");
      } else {
        setResposta(resultado);
      }
    } catch (erroCapturado) {
      setErro(mensagemAmigavel(erroCapturado, "Não foi possível salvar o cadastro."));
    } finally {
      setCarregando(false);
      emVooRef.current = false;
    }
  }

  function fecharAposResolucao() {
    // `cpfEditavel` não muda mais a partir daqui (os campos somem assim
    // que `resposta` é definido) — sempre o mesmo CPF que foi de fato
    // enviado/salvo na última chamada a `salvar()`.
    onCpfResolvido(normalizarCpf(cpfEditavel));
    onFechar();
  }

  // Sempre pelo mecanismo seguro do Electron (`shell.openExternal`, via
  // `window.api.abrirLinkExterno` — ver `electron/ipc/link.ts`), nunca uma
  // nova janela dentro do próprio app nem substituindo a tela atual: só
  // `preventDefault` no clique e delega ao processo main. Fora do Electron
  // (ex.: navegador comum em dev), `window.api` não existe e o `<a
  // target="_blank">` nativo assume sozinho, sem tratamento extra.
  function abrirArquimedes(evento: MouseEvent<HTMLAnchorElement>) {
    if (window.api?.abrirLinkExterno) {
      evento.preventDefault();
      window.api.abrirLinkExterno(URL_ARQUIMEDES);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-cadastrar-servidor-titulo"
        className={`w-full max-w-lg p-8 ${PAINEL_MODAL}`}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="modal-cadastrar-servidor-titulo" className={TIPOGRAFIA.titulo}>
            {MENSAGENS.cadastrarServidorTitulo}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onFechar}
            disabled={carregando}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {resposta?.estado === "concluido" && (
          <div className="mt-6 space-y-4">
            <Alerta variante="sucesso">{MENSAGENS.cadastroServidorSalvo}</Alerta>
            <Alerta variante="aviso">{MENSAGENS.cadastroServidorAvisoDrive}</Alerta>
            <div className="flex justify-end">
              <Botao variante="primaria" onClick={fecharAposResolucao}>
                {MENSAGENS.cadastroServidorContinuar}
              </Botao>
            </div>
          </div>
        )}

        {resposta?.estado === "duplicado" && (
          <div className="mt-6 space-y-4">
            <Alerta variante="aviso">
              {resposta.mensagem ?? "Este CPF já está cadastrado."}
              {resposta.servidor && ` (${resposta.servidor.nome} — ${resposta.servidor.cargo})`}
            </Alerta>
            <div className="flex justify-end">
              <Botao variante="primaria" onClick={fecharAposResolucao}>
                Fechar
              </Botao>
            </div>
          </div>
        )}

        {resposta?.estado === "salvo_sync_pendente" && (
          <div className="mt-6 space-y-4">
            <Alerta variante="aviso">{resposta.mensagem}</Alerta>
            <div className="flex justify-end gap-3">
              <Botao variante="secundaria" onClick={onFechar}>
                Fechar
              </Botao>
              <Botao variante="primaria" onClick={salvar} carregando={carregando}>
                {MENSAGENS.cadastroServidorTentarSincronizarNovamente}
              </Botao>
            </div>
          </div>
        )}

        {!resposta && (
          <>
            <p className={`mt-2 ${TIPOGRAFIA.textoAuxiliar}`}>
              Este CPF ainda não foi localizado na aba Dados da Planilha Oficial.
            </p>
            <p className={`mt-1 ${TIPOGRAFIA.textoAuxiliar}`}>
              Consultar dados cadastrais no sistema{" "}
              <a
                href={URL_ARQUIMEDES}
                target="_blank"
                rel="noopener noreferrer"
                onClick={abrirArquimedes}
                className={`inline-flex items-center gap-0.5 rounded-sm text-cyan-400/90 underline decoration-cyan-400/40 underline-offset-2 transition hover:text-cyan-300 hover:decoration-cyan-300 ${FOCO_ANEL}`}
              >
                Arquimedes
                <ExternalLink aria-hidden="true" className="h-3 w-3" />
              </a>
            </p>

            <div className="mt-6 space-y-4">
              <Campo
                rotulo="CPF"
                value={cpfEditavel}
                disabled={carregando}
                onChange={(evento: ChangeEvent<HTMLInputElement>) => setCpfEditavel(evento.target.value)}
              />
              <Campo
                rotulo="Nome"
                value={nome}
                disabled={carregando}
                onChange={(evento: ChangeEvent<HTMLInputElement>) => setNome(evento.target.value)}
              />
              {/* Matrícula + Cargo — `items-end` alinha os dois inputs pela
                  base (não pelo topo): se um dos dois rótulos quebrar em
                  duas linhas, o item mais curto é empurrado para baixo até
                  a base bater com o outro, então os inputs continuam na
                  mesma linha-base independente de quantas linhas cada
                  rótulo ocupa. Mesmo tratamento aplicado ao par Regime de
                  previdência + Situação abaixo. */}
              <div className="grid grid-cols-2 items-end gap-3">
                <Campo
                  rotulo="Matrícula"
                  value={matricula}
                  disabled={carregando}
                  onChange={(evento: ChangeEvent<HTMLInputElement>) => setMatricula(evento.target.value)}
                />
                <ComboboxPesquisavel
                  rotulo="Cargo"
                  valor={cargo}
                  opcoes={opcoes?.cargos ?? []}
                  disabled={carregando}
                  onMudar={setCargo}
                  larguraDropdown="expandida"
                />
              </div>

              <Selecao
                rotulo="Previdência (opcional)"
                valor={previdencia}
                opcoes={opcoes?.previdencias ?? []}
                disabled={carregando}
                onMudar={setPrevidencia}
              />

              <ComboboxPesquisavel
                rotulo="Órgão de origem (opcional)"
                valor={orgaoOrigem}
                opcoes={opcoes?.orgaos_origem ?? []}
                disabled={carregando}
                onMudar={setOrgaoOrigem}
              />

              <div className="grid grid-cols-2 items-end gap-3">
                <Selecao
                  rotulo="Regime de previdência (opcional)"
                  valor={regimePrevidencia}
                  opcoes={opcoes?.regimes_previdencia ?? []}
                  disabled={carregando}
                  onMudar={setRegimePrevidencia}
                />
                <Selecao
                  rotulo="Situação (opcional)"
                  valor={situacao}
                  opcoes={opcoes?.situacoes ?? []}
                  disabled={carregando}
                  onMudar={setSituacao}
                />
              </div>

              {erro && <Alerta variante="erro">{erro}</Alerta>}
            </div>

            <div className="mt-7 flex justify-end gap-3">
              <Botao variante="secundaria" onClick={onFechar} disabled={carregando}>
                Cancelar
              </Botao>
              <Botao variante="primaria" onClick={salvar} disabled={!podeSalvar} carregando={carregando}>
                {carregando ? "Salvando..." : "Salvar"}
              </Botao>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
