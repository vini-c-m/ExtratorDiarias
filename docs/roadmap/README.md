# Roadmap

Histórico de sprints do Extrator de Diárias. As Sprints até a 10 foram reconstruídas a partir dos comentários e docstrings deixados no próprio código-fonte (não havia histórico de Git anterior a essa publicação pública — reconstrução mais fiel possível a partir da evidência disponível, sinalizada como tal onde incompleta). A partir da Sprint 11, cada entrega é rastreável tanto ao código-fonte quanto à documentação própria (ver [`docs/central-conferencia/`](../central-conferencia/README.md) e [`docs/backlog/`](../backlog/README.md)) e ao histórico de commits do repositório.

## Concluído

| Sprint | Entrega |
| --- | --- |
| **00** | Estrutura de diretórios do projeto (`frontend/`, `backend/`, `docs/`, `tests/`) — nenhuma funcionalidade de negócio ainda. |
| **01 / 02** | Fundação do parser SEI: leitura de texto de PDF (`pdf_reader.py`) e extração inicial dos campos-chave (`sei_parser_v1.py`). O código não distingue o que coube a cada uma das duas — tratadas em conjunto. |
| **03** | Camada de enriquecimento: Documento Hábil, Transporte e Local de destino (colunas A/K/Q da planilha), com validação contra PDFs reais do script legado. |
| **03.1** | Correção definitiva da identificação de LOCAL: correspondência aproximada para erros de digitação e desambiguação de municípios por contexto. |
| **04** | Suporte ao tipo de processo "Diária de Membro" (distinto do fluxo Padrão), com valor total das diárias autorizado por despacho específico (coluna P). |
| **04.1** | Regra operacional de transporte (fallback determinístico quando não há evidência textual direta) e refinamento do LOCAL (expansão de abreviações administrativas como "Sta"/"Sto"). |
| **04.2** | Robustez do parser contra 4 padrões documentais reais de processos SEI: múltiplos Requerimentos/Validações anexados no mesmo processo (sempre o último vence), campo partido por quebra de página, e prefixo institucional "PJ" antes do nome do município. |
| **05.1** | "Tempo de processamento" no resumo do relatório HTML; hierarquia de revisão manual mais clara ("Revisão recomendada" vs. "Inserido automaticamente"). |
| **05.2** | Consolidação de componentes de UI reutilizáveis (`BotaoArquivo`, `Badge`) e do modal de confirmação. |
| **05.3** | Cancelamento seguro de um processamento em andamento (interrompe antes do próximo arquivo, nunca no meio de uma requisição). |
| **06** | Segunda fonte para a coluna de unidade de origem: histórico da própria planilha oficial por CPF, com a evidência extraída do PDF como segunda prioridade. |
| **07** | Identidade visual própria (Design System v2.0), substituindo a identidade institucional usada até então — cores, tipografia, espaçamento e componentes de base. |
| **07.1** | Logo/monograma "ED" definitivo e geração do ícone do executável a partir do SVG aprovado. |
| **07.2** | Identidade unificada entre o app e o relatório HTML gerado (mesma paleta, mesmo cabeçalho, autossuficiente — sem referência institucional). |
| **08** | Empacotamento: backend FastAPI compilado com PyInstaller (standalone, sem exigir Python na máquina do usuário) e integração com `electron-builder` para gerar o instalador Windows final. |
| **09** | Identidade visual "Neon Tech UI": fundo em degradê de 4 tons, sistema de glow/sombra e micro-animações. |
| **09.1** | Refinamento da escala de sombra/glow, ajuste fino de timing de animação e do painel decorativo de fundo. |
| **09.2** | Indicador de status do cabeçalho trocado de estado técnico (status do backend) para estágio do fluxo do usuário (4 estágios). |
| **09.3** | "Campo estelar" do fundo decorativo — efeito de cintilação sutil, puramente visual. |
| **10** | **Publicação pública** — auditoria de privacidade completa, substituição de todas as fixtures de teste por dados 100% sintéticos, documentação profissional (README, arquitetura, branding, changelog, políticas de contribuição/segurança) e primeira release pública (v1.0.0). Ver [`docs/branding/`](../branding/) e [`docs/architecture/`](../architecture/). |
| — *(sem número, "Sprint de Correção Crítica")* | Correção de um bug de produção: um CPF truncado por quebra de linha/página no PDF conseguia passar como válido e ser gravado incorretamente na planilha. Corrigido na camada de validação (`validacao_diaria._cpf_valido`), não na escrita — a barreira certa é impedir o dado ruim de chegar lá, não mudar o formato de gravação já homologado. |
| **11** | **Engenharia reversa das regras de negócio da planilha oficial** (sem código de produção alterado) — mapeamento completo das três abas (`Controle de Diárias`, `Dados`, `Tabela Valores`), tradução de todas as fórmulas relevantes para linguagem de negócio e proposta arquitetural da futura **Central Inteligente de Conferência**. Ver [`docs/central-conferencia/`](../central-conferencia/README.md) e [`docs/backlog/`](../backlog/README.md). |
| **12** | **UX da Central Inteligente de Conferência** — proposta de interface aprovada pelo DIMCAC (2026-07-22): fluxo em 2 etapas (diagnóstico → geração do histórico do e-Fisco), checklist de 7 linhas, veredito único (`APTO_PARA_PROCESSAMENTO` / `REVISAR`) e a regra permanente de nunca usar vermelho para um "não apto" de negócio — vermelho fica reservado a falha técnica do sistema (RN-08). Sem código de produção alterado; a Sprint 13 implementa exatamente o que foi aprovado aqui. |
| **13** | **Implementação da Central Inteligente de Conferência** — módulo novo completo, seguindo a proposta arquitetural da Sprint 11 e a UX da Sprint 12: backend (`app/domain/rules/conferencia.py`, `app/consulta/`, `app/api/conferencia.py`, `app/services/conferencia_service.py`) e frontend (`pages/Conferencia.tsx`, `FormularioConferencia`, `ChecklistConferencia`, `FormularioHistorico`). Duas regras novas confirmadas durante a implementação — RN-12 (preservação literal do número do SEI) e RN-13 (template de texto do histórico do e-Fisco) — documentadas em [`docs/central-conferencia/`](../central-conferencia/README.md#rn-12--preservação-do-número-do-processo-sei). |
| **13.1** | **Linha de base de desempenho da Central de Conferência** — medição ponta a ponta das duas operações (Realizar Conferência, Gerar Histórico) contra a fixture de teste (≈1.980 diárias, ≈1.580 servidores): ambas em torno de 2,3–2,4s, quase inteiramente dominadas pela abertura do `.xlsx` via `openpyxl`. Resultado documentado, sem implementação de cache nesta Sprint (decisão explícita) — ver [`docs/central-conferencia/README.md § 5`](../central-conferencia/README.md#5-riscos-e-pontos-de-atenção). |
| **14** | **Hub de funcionalidades e Boas-vindas** — navegação passa de tela única para 4 telas (Boas-vindas → Hub → Processamento \| Conferência), sempre reversível via "← Hub" no cabeçalho; a Central de Conferência deixa de ser a única funcionalidade e passa a conviver com o Processamento como dois módulos escolhidos a partir do Hub. Refinamento visual do fundo decorativo (logos holográficos "ED" promovidos a elemento permanente da identidade, não mais decorativo) e do glow do logo no cabeçalho/Boas-vindas. Ver [`docs/branding/README.md`](../branding/README.md#fundo-decorativo-fundodecorativotsx). |
| **14.1** | **Revisão completa da documentação pública** — README reescrito para refletir o estado atual do app (Central de Conferência, Hub, Boas-vindas), screenshots e GIF de demonstração regerados a partir do app real (automação Playwright estendida, `frontend/scripts/capturar-screenshots.mjs` e `frontend/scripts/gerar-gif.mjs`, novo) e este roadmap atualizado. Exclusivamente documentação — nenhuma regra de negócio, layout ou comportamento do app alterado. |

## Em desenvolvimento

Nenhum item em desenvolvimento ativo no momento desta publicação — a Sprint 15 (Build e Distribuição, rumo à Release Candidate v1.0.0-RC1) ainda não foi iniciada.

## Planejado (não implementado)

Os READMEs de arquitetura de cada camada do backend (escritos antes da Sprint 00) descrevem duas peças que nunca chegaram a ser implementadas no fluxo atual — mantidas aqui como possibilidades futuras, não como compromisso de roadmap:

- **Barramento de eventos / progresso via SSE** (`app/events/`) — o fluxo atual processa o lote em requisições síncronas por arquivo; um stream de progresso via Server-Sent Events foi cogitado na concepção original, mas a pasta nunca foi criada.
- **Camada de persistência local** (`app/infra/db/`) — preparada na estrutura de pastas, sem uso no fluxo atual (o aplicativo não mantém estado entre execuções além dos arquivos gerados no disco).
