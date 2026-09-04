import { BrowserWindow, app, dialog, ipcMain } from "electron";
import * as path from "path";

// Micro-sprint 3E.1 — `caminho_decisoes` é infraestrutura interna da API
// (persistência de decisões humanas com fingerprint, `app/consulta/
// persistencia_decisoes.py`), nunca um campo que o servidor escolhe (regra
// aprovada na investigação UX 3E, item 4). O frontend precisa de ALGUM
// caminho de arquivo para reenviar em toda chamada da API — este handler
// devolve um caminho fixo por instalação, dentro da MESMA pasta de dados já
// usada pelo resto do app (`app.getPath("userData")`, o mesmo valor
// repassado ao backend via `EXTRATOR_DIARIAS_USER_DATA` em `main.ts` — ver
// `app/infra/config/configuracao_app.py::_diretorio_dados_usuario`, que já
// lê essa mesma variável para a planilha oficial e a Base Local). Nenhuma
// alteração de contrato backend: o backend continua recebendo só uma string
// de caminho, exatamente como já faz hoje.
const NOME_ARQUIVO_DECISOES = "relatorio_transparencia_decisoes.json";

// Micro-sprint 3H — mesmo raciocínio de `NOME_ARQUIVO_DECISOES`, mas para a
// configuração isolada do Template Oficial (`app/consulta/
// configuracao_template_relatorio_transparencia.py`): infraestrutura
// interna, nunca um campo digitado pelo usuário. Arquivo próprio, nunca o
// mesmo de `caminho_decisoes` nem de `configuracao.json` da Central de
// Conferência.
const NOME_ARQUIVO_CONFIGURACAO_TEMPLATE = "relatorio_transparencia_template_configuracao.json";

// Micro-sprint UX operacional — mesmo raciocínio de
// `NOME_ARQUIVO_CONFIGURACAO_TEMPLATE`, mas para a persistência dos
// caminhos de Base E-Fisco e Controle DIMCAC (`app/consulta/
// configuracao_fontes_relatorio_transparencia.py`): infraestrutura interna,
// nunca um campo digitado pelo usuário. Arquivo próprio, nunca reaproveita
// nenhum dos dois arquivos acima.
const NOME_ARQUIVO_CONFIGURACAO_FONTES = "relatorio_transparencia_fontes_configuracao.json";

export function registrarIpcRelatorioTransparencia(): void {
  ipcMain.handle("relatorio-transparencia:obter-caminho-decisoes", () =>
    path.join(app.getPath("userData"), NOME_ARQUIVO_DECISOES),
  );

  ipcMain.handle("relatorio-transparencia:obter-caminho-configuracao-template", () =>
    path.join(app.getPath("userData"), NOME_ARQUIVO_CONFIGURACAO_TEMPLATE),
  );

  ipcMain.handle("relatorio-transparencia:obter-caminho-configuracao-fontes", () =>
    path.join(app.getPath("userData"), NOME_ARQUIVO_CONFIGURACAO_FONTES),
  );

  // Micro-sprint 3H — diálogo nativo "Salvar como" para o XLSX final. Ao
  // contrário de `relatorio:salvar-como` (`ipc/relatorio.ts`), este handler
  // NUNCA copia um arquivo: o backend ainda não gerou nada neste ponto do
  // fluxo (`POST /gerar` escreve diretamente em `caminho_destino`, ver
  // `escritor_relatorio_transparencia.py`) — só devolve o caminho escolhido
  // pelo usuário, ou `null` se o diálogo foi cancelado (nunca um erro).
  ipcMain.handle(
    "relatorio-transparencia:escolher-destino",
    async (evento, nomeSugerido: string) => {
      const janela = BrowserWindow.fromWebContents(evento.sender);
      const opcoes = {
        defaultPath: nomeSugerido,
        filters: [{ name: "Excel", extensions: ["xlsx"] }],
      };
      const resultado = await (janela
        ? dialog.showSaveDialog(janela, opcoes)
        : dialog.showSaveDialog(opcoes));

      if (resultado.canceled || !resultado.filePath) return null;
      return resultado.filePath;
    },
  );
}
