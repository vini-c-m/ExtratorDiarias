# Roadmap

Histórico de sprints do Extrator de Diárias, reconstruído a partir dos comentários e docstrings deixados no próprio código-fonte (não há backlog formal em `docs/backlog/` nem histórico de Git anterior à Sprint 10 — este documento é a reconstrução mais fiel possível a partir da evidência disponível). Onde a evidência é incompleta, isso é sinalizado explicitamente em vez de inventado.

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

## Em desenvolvimento

Nenhum item em desenvolvimento ativo identificável no código no momento desta publicação. A Sprint 12 (implementação da Central Inteligente de Conferência) depende da validação das perguntas em aberto listadas em [`docs/central-conferencia/README.md`](../central-conferencia/README.md#6-perguntas-em-aberto-antes-da-sprint-12).

## Planejado (não implementado)

Os READMEs de arquitetura de cada camada do backend (escritos antes da Sprint 00) descrevem duas peças que nunca chegaram a ser implementadas no fluxo atual — mantidas aqui como possibilidades futuras, não como compromisso de roadmap:

- **Barramento de eventos / progresso via SSE** (`app/events/`) — o fluxo atual processa o lote em requisições síncronas por arquivo; um stream de progresso via Server-Sent Events foi cogitado na concepção original, mas a pasta nunca foi criada.
- **Camada de persistência local** (`app/infra/db/`) — preparada na estrutura de pastas, sem uso no fluxo atual (o aplicativo não mantém estado entre execuções além dos arquivos gerados no disco).
