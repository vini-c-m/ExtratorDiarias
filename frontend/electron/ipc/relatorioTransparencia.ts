import { app, ipcMain } from "electron";
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

export function registrarIpcRelatorioTransparencia(): void {
  ipcMain.handle("relatorio-transparencia:obter-caminho-decisoes", () =>
    path.join(app.getPath("userData"), NOME_ARQUIVO_DECISOES),
  );
}
