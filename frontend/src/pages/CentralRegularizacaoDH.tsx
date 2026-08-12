import { useState } from "react";
import DetalheProcessoAguardandoDH from "../components/regularizacaoDh/DetalheProcessoAguardandoDH";
import ListaProcessosAguardandoDH from "../components/regularizacaoDh/ListaProcessosAguardandoDH";
import Alerta from "../components/ui/Alerta";
import { useProcessosAguardandoDH } from "../hooks/useProcessosAguardandoDH";
import { mensagemAmigavel } from "../lib/mensagens";
import { detalharProcessoAguardandoDH, registrarDH } from "../services/api";
import { TIPOGRAFIA } from "../theme/tipografia";
import type { DetalheProcessoAguardandoDH as DetalheProcesso, ResultadoRegistroDH } from "../types/regularizacaoDh";

interface Props {
  backendOnline: boolean;
}

// Micro-sprint B ("Central de Regularização de DH", SOMENTE LEITURA) — quarta
// central do aplicativo. Localiza, lista e apresenta o detalhe de diárias JÁ
// CADASTRADAS aguardando DH — reaproveita a mesma fonte homologada da
// Central Analítica (`useProcessosAguardandoDH` -> `GET /regularizacao-dh`
// -> mesma detecção de `documentos_habeis_pendentes.py`), nunca uma segunda
// regra.
//
// Micro-sprint D ("Escrita Exclusiva do DH") acrescenta a única capacidade
// de escrita desta Central (`registrarDhClique`) — depois de um registro
// bem-sucedido, reconsulta o MESMO detalhe (nunca assume localmente o novo
// estado) e atualiza a lista em segundo plano (mesma fonte homologada,
// nunca uma segunda consulta).
export default function CentralRegularizacaoDH({ backendOnline }: Props) {
  const { carregando, erro, resultado, atualizar } = useProcessosAguardandoDH();

  const [seiSelecionado, setSeiSelecionado] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<DetalheProcesso | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);

  const [dhDigitado, setDhDigitado] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [resultadoRegistro, setResultadoRegistro] = useState<ResultadoRegistroDH | null>(null);
  const [erroRegistro, setErroRegistro] = useState<string | null>(null);

  async function carregarDetalhe(sei: string) {
    setSeiSelecionado(sei);
    setDetalhe(null);
    setErroDetalhe(null);
    setDhDigitado("");
    setResultadoRegistro(null);
    setErroRegistro(null);
    setCarregandoDetalhe(true);
    try {
      const dados = await detalharProcessoAguardandoDH(sei);
      setDetalhe(dados);
    } catch (erroCaptura) {
      setErroDetalhe(mensagemAmigavel(erroCaptura, "Não foi possível carregar o processo."));
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  function voltarParaLista() {
    setSeiSelecionado(null);
    setDetalhe(null);
    setErroDetalhe(null);
    setDhDigitado("");
    setResultadoRegistro(null);
    setErroRegistro(null);
  }

  async function registrarDhClique() {
    if (!seiSelecionado || !dhDigitado.trim() || registrando) return;

    setRegistrando(true);
    setErroRegistro(null);
    try {
      const resultado = await registrarDH(seiSelecionado, dhDigitado.trim());
      setResultadoRegistro(resultado);

      if (resultado.situacao !== "nao_salvo") {
        // Reconsulta o MESMO detalhe (nunca assume localmente o novo
        // estado) — se essa reconsulta falhar, o resultado do registro já
        // exibido continua válido, então não é tratada como erro do fluxo.
        try {
          setDetalhe(await detalharProcessoAguardandoDH(seiSelecionado));
        } catch {
          // Confirmação visual apenas — não desfaz o registro já concluído.
        }
        atualizar(); // lista em segundo plano, mesma fonte homologada
      }
    } catch (erroCaptura) {
      setErroRegistro(mensagemAmigavel(erroCaptura, "Não foi possível registrar o Documento Hábil."));
    } finally {
      setRegistrando(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl animate-entrada-conteudo px-6 py-14 md:px-10">
      <div>
        <h2 className={TIPOGRAFIA.titulo}>Central de Regularização de DH</h2>
        <p className={`mt-2 ${TIPOGRAFIA.texto}`}>
          Processos já cadastrados que estão aguardando Documento Hábil. Consulte o Histórico e o
          Valor e registre o DH depois de gerá-lo no e-Fisco.
        </p>
      </div>

      {!backendOnline && (
        <div className="mt-4">
          <Alerta variante="aviso">Aguardando o aplicativo terminar de iniciar...</Alerta>
        </div>
      )}

      <div className="mt-8">
        {seiSelecionado === null ? (
          <ListaProcessosAguardandoDH
            resultado={resultado}
            carregando={carregando}
            erro={erro}
            aoAtualizar={atualizar}
            aoSelecionarProcesso={carregarDetalhe}
          />
        ) : (
          <DetalheProcessoAguardandoDH
            sei={seiSelecionado}
            detalhe={detalhe}
            carregando={carregandoDetalhe}
            erro={erroDetalhe}
            aoVoltar={voltarParaLista}
            aoTentarNovamente={() => carregarDetalhe(seiSelecionado)}
            dhDigitado={dhDigitado}
            onMudarDh={setDhDigitado}
            onRegistrarDh={registrarDhClique}
            registrando={registrando}
            resultadoRegistro={resultadoRegistro}
            erroRegistro={erroRegistro}
          />
        )}
      </div>
    </div>
  );
}
