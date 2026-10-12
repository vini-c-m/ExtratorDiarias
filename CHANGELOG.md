# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/), e este projeto segue [Versionamento Semântico](https://semver.org/lang/pt-BR/).

Para o histórico de desenvolvimento sprint a sprint, veja [`docs/roadmap/`](docs/roadmap/).

## [2.3.1] - 2026-08-20

### Corrigido

- Corrige responsividade e scroll do modal de Configuração.
- Mantém o botão Fechar acessível em telas menores.
- Corrige atualização imediata das Pastas Operacionais.
- Mantém nomes físicos de pasta livres.
- Adiciona feedback amigável para falhas de seleção de pasta/planilha.

## [2.3.0] - 2026-08-19

### Adicionado

- **Organização Automática de PDFs**: após um Processamento ou Complemento com gravação confirmada (categoria `INSERIDO`), o PDF de origem é movido automaticamente para a pasta "PDFs Processados"; após uma Finalização confirmada (`FINALIZADO`/`JA_CONFIRMADO`), o PDF é excluído da pasta "PDFs de Diárias a Confirmar". Duplicidade, erro ou qualquer estado sem gravação comprovada nunca é movido/excluído. Conflito de nome no destino é resolvido por hash SHA-256 (conteúdo diferente ganha sufixo numérico seguro, nunca sobrescreve; conteúdo idêntico remove só a cópia redundante da origem). Uma falha de organização nunca desfaz um resultado administrativo já gravado — é sempre reportada como um resultado paralelo, por item.
- **Configuração das Pastas Operacionais**: quatro novos caminhos configuráveis (PDFs a Processar, PDFs de Complemento a Processar, PDFs Processados, PDFs de Diárias a Confirmar), persistidos na mesma configuração local já usada pela Planilha Oficial — sem nova tela de Configurações. Cada funcionalidade fica bloqueada individualmente (nunca o app inteiro) enquanto suas pastas obrigatórias não estiverem configuradas e acessíveis.
- **Validação de pertencimento à pasta operacional**: um PDF selecionado fora da pasta configurada para a função em uso (Processamento, Complemento ou Finalização) é rejeitado antes do processamento, com aviso explícito. Seleção de PDF continua via `<input type="file">` + `webUtils.getPathForFile` — nenhuma mudança no mecanismo de seleção.

### Corrigido

- **Preload do Electron**: removida uma referência ao módulo `node:path` que, executando dentro do processo de preload sandboxado (padrão do Electron desde a v20), impedia `window.api` de ser exposto por inteiro — afetando também funcionalidades já existentes e sem relação com a mudança (seletor de Planilha Oficial, fechamento seguro pelo X, entre outras). A validação de pertencimento a pastas passou a rodar no processo principal, via IPC.

## [2.2.0] - 2026-08-13

### Adicionado

- **Histórico e-Fisco para Membro na Central de Conferência**: ao gerar o Histórico e-Fisco para uma diária de Membro (Promotor/Procurador de Justiça), a Central de Conferência passa a pedir a quantidade de diárias integrais e parcial efetivamente concedidas pelo GABPGJ, já que esse dado — determinado pelo despacho do processo — não pode ser inferido apenas pela duração do período consultado. As quantidades informadas são usadas exclusivamente para compor o texto do Histórico; período consultado, valor da diária e Planilha Oficial não são afetados. Disponível tanto no fluxo Padrão quanto no modo Complemento de Diárias. Para Servidor, nenhuma alteração de comportamento.

## [2.1.0] - 2026-08-12

### Adicionado

- **Central de Regularização de DH**: quarta central do aplicativo, para resolver operacionalmente diárias já cadastradas na Planilha Oficial que estão aguardando Documento Hábil. Reaproveita a mesma detecção já homologada da Central Analítica (nunca uma segunda regra — mesma população, mesmos SEIs, garantido por teste de invariante) para listar os processos pendentes; ao abrir o detalhe de um processo, apresenta o Histórico e-Fisco normal (mesmo gerador homologado da Central de Conferência, nunca um segundo template) e o Valor já registrado na diária (lido diretamente do registro existente, nunca recalculado); permite registrar o número do DH obtido no e-Fisco, com escrita restrita exclusivamente à célula do Documento Hábil (nunca toca fórmula, cache ou qualquer outra célula da planilha), idempotente e com sincronização automática da Base Local. Acessível pelo Hub e a partir da notificação de Documentos Hábeis Pendentes na Central Analítica.
- **Valor automático na Central de Conferência**: ao gerar o Histórico e-Fisco para uma diária de Servidor ainda não cadastrada, a Central de Conferência agora também calcula e apresenta o valor da diária (fórmula RN-05, lendo a Tabela Valores oficial dinamicamente — nunca um valor fixo no código), com resolução automática da UF de destino e confirmação manual quando o destino for ambíguo. Validado contra 1.486 diárias reais de Servidor (99,60% de reprodução exata). Diárias de Membro continuam fora do escopo deste cálculo (valor extraído do processo, fluxo já existente).

## [2.0.0] - 2026-08-06

Release da versão definitiva V2, construída sobre a build de homologação interna `1.0.0-RC2`.

### Alterado

- **Nome institucional do produto (2026-08-06):** "Extrator de Diárias" passa a se chamar **Automatizador de Diárias** — atualizado no README, documentação, telas, títulos, metadados de empacotamento (nome do produto, atalhos, instalador) e demais textos institucionais. Nenhum namespace, pacote ou estrutura interna foi renomeado (risco de regressão sem benefício visível ao usuário — ver `docs/architecture/`).
- **Central de Conferência — janela do Documento Hábil não bloqueia mais o servidor (2026-08-06):** quando a única pendência do diagnóstico é a janela operacional (RN-06/RN-10) ainda não liberada — cadastro localizado, sem duplicidade —, a tela passa a oferecer "Voltar" ou "Prosseguir mesmo assim" em vez de esconder a Etapa 2. Mudança só de UX (frontend); veredito, checklist e regra de negócio continuam exatamente os mesmos, e a rota de geração do histórico já não dependia do veredito.

### Adicionado

- **Central Analítica** (Sprints 17-19, homologada em 2026-08-04): terceiro módulo do Hub, consultivo por princípio arquitetural (nunca grava). Pesquisa/filtro de diárias (SEI, CPF, servidor, matrícula, origem, destino, trecho, município, motivo, situação do servidor, período, valor) sobre uma Base Local em SQLite sincronizada automaticamente a cada preenchimento bem-sucedido da planilha oficial; Dashboard com indicadores e distribuições do recorte filtrado (com refinamento do filtro a partir de um gráfico); geração de Relatórios (PDF, Excel ou CSV, em 6 tipos — executivo, detalhado, financeiro, por servidor, por município, por situação); Análise Rápida (Diagnóstico), que classifica cada diária do recorte (esperado/atenção/inconsistência, nunca vermelho para um achado de negócio) — rótulo do botão ajustado (Sprint 20) para nomear o destino "Diagnóstico" de forma explícita na interface, sem mudança de comportamento. Fluxo único orientado por tarefa (filtrar → revisar recorte → agir) — redefinição funcional v2 sobre o desenho original de 3 abas, pedida pelo DIMCAC antes de Dashboard/Relatórios chegarem a ser implementados. Ver [`docs/central-analitica/`](docs/central-analitica/README.md).
- **Configuração Inicial da Planilha Oficial** (Sprint 15): na primeira execução, o app exige a seleção da planilha oficial (diálogo nativo, validada em 5 critérios — existência, extensão, abertura, aba e cabeçalhos esperados) antes de liberar qualquer funcionalidade. O caminho é persistido localmente (`configuracao.json`, na pasta de dados do usuário) e passa a ser usado automaticamente em todo preenchimento — o backend é a única autoridade sobre esse caminho, que deixou de ser escolhido a cada execução.
- Detecção de substituição estrutural da planilha configurada (fingerprint de cabeçalho + abas), sem bloquear o uso — apenas solicita revalidação.
- Ação "Alterar Planilha Oficial", acessível a qualquer momento por um novo ícone de Configurações no cabeçalho ou pelo próprio painel de preenchimento quando a planilha estiver inacessível.
- **Fontes Secundárias de Evidência** (2026-08-05): nova arquitetura reutilizável (`app/extraction/enriquecimento/fontes_secundarias/`, Strategy + Registry) para documentos auxiliares do processo SEI complementarem campos que a Solicitação de Diária (fonte primária) deixou indefinidos, sem nunca sobrescrevê-la. Primeira fonte: "CMFC - Validação de Diária - Servidores", que comprova o estado de destino (coluna LOCAL) quando a modalidade "Dentro do Estado" está preenchida — sem depender de heurística ou probabilidade. Ver [`docs/architecture/README.md`](docs/architecture/README.md).
- Vocabulário de evidência de transporte (`transporte.py`) ampliado para reconhecer anexos "Requisição de Veículo" e menções a conduzir o veículo, sem depender da palavra genérica "motorista" (que também é cargo de servidor).
- **Classificação MEMBRO x SERVIDOR** (Sprint 20, 2026-08-05): `categoria_funcional`, calculada deterministicamente sobre o cargo cadastrado (nunca por inferência de nome), distingue membros do MP (Promotor/Procurador de Justiça, Lei 8.625/1993) de servidores para fins de filtro e indicadores da Central Analítica — cobertura de 99,94% sobre a base real.
- **Documentos Hábeis Pendentes** (2026-08-06): tela dedicada, saída da antiga "Análise Rápida (Diagnóstico)", exclusiva para diárias com DH vazio — classifica cada uma em "aguardando liberação" (janela RN-06/RN-10 ainda não aberta) ou "revisão manual necessária" (janela já aberta e DH continua ausente), reaproveitando a mesma fórmula de data de liberação já homologada. O Diagnóstico geral permanece disponível a partir do Modo Executivo.
- **Modo Executivo** (Sprint 21): 5ª visualização da Central Analítica — KPIs, gráficos e insights automáticos do recorte filtrado, painel lateral de navegação e um modo de apresentação, para leitura executiva rápida sem passar pelo fluxo padrão de filtrar → Dashboard/Relatório/Diagnóstico.

### Corrigido

- **Central de Conferência — duplicidade (2026-08-05):** a checagem de duplicidade não exige mais que período inicial e final coincidam simultaneamente com uma diária existente do mesmo CPF; basta que qualquer uma das duas datas informadas já conste (como inicial ou final) em um registro existente para o resultado deixar de ser "Apto para Processamento".
- **Central de Conferência — Histórico do e-Fisco (2026-08-05):** a Etapa 2 (Geração do Histórico) deixou de pedir Origem — passa a pedir apenas SEI e Destino, já que o histórico usa apenas o destino. O texto final gerado agora é sempre devolvido integralmente em CAIXA ALTA (exigência do e-Fisco), preservando acentuação.
- **Extração de SEI — citação alheia em anexo posterior (2026-08-05, Programa de Validação Evolutiva):** um anexo "Confirmação de Serviço assinada via gov.br" que reproduz o cabeçalho da própria Solicitação podia, em processos reais, arrastar para dentro do segmento de extração o texto de um documento bem posterior (ex.: um Diário Oficial anexado) que cita, em prosa, o número de um processo totalmente diferente — a extração do SEI passa a preferir o padrão de rodapé "SEI \<NUP\> / pg. \<N\>" (que só o próprio sistema SEI grava), imune a esse tipo de citação avulsa; layouts antigos sem esse rodapé continuam usando o padrão solto original.
- **Reconhecimento de município com prefixo institucional (2026-08-05):** "Promotoria"/"Procuradoria" sem o complemento "de Justiça" (ex.: "PROMOTORIA PALMARES") agora são removidos como prefixo institucional antes da busca de município — mesma regra já existente para "PJ"/"Procuradoria de Justiça"/"Promotoria de Justiça", só que também aceitando a forma abreviada por extenso.
- **Central Analítica — Diagnóstico de Documento Hábil (2026-08-05):** o Diagnóstico não assume mais que todo DH vazio significa "aguardando liberação" — passa a checar a janela RN-06/RN-10 (já homologada) como evidência objetiva antes de escolher a explicação: "Documento Hábil ainda não disponível. Aguardar a data de liberação." quando a janela ainda não abriu; "Documento Hábil ausente. Motivo não identificado automaticamente. Recomenda-se investigação." quando não há evidência disponível.
- **Central Analítica — Relatórios PDF e Excel (2026-08-05, Bloco de Refinamento):** reescrita completa da apresentação (nenhum dado/cálculo alterado). PDF: tabelas com largura de coluna calculada para nunca ultrapassar a página A4 (causa raiz confirmada do conteúdo cortado — ausência total de `colWidths`, com texto de até ~990pt de largura natural contra ~482pt úteis), texto longo agora quebra dentro da célula, indicadores em cartões de destaque, rodapé com "Página N de M" em todas as páginas, resumo do recorte no cabeçalho. Excel: uma aba por seção (Resumo, uma por distribuição, Tabela do recorte — nunca mais tudo empilhado numa aba só), cabeçalhos estilizados, congelamento do cabeçalho e autofiltro (tabela estruturada do Excel) em cada aba de dados, larguras de coluna calculadas com teto de 60 caracteres e quebra automática de texto acima disso, datas e valores monetários em formato nativo brasileiro (não mais texto pré-formatado).

## [1.0.0] - 2026-07-20

Primeira versão pública do Extrator de Diárias.

### Adicionado

- Extração automática de dados de processos de diárias do SEI (PDF): número SEI, CPF, unidade de origem, período, cidades de origem/destino e finalidade.
- Enriquecimento automático: Documento Hábil, meio de transporte (com fallback por regra operacional), estado/município de destino (com correspondência aproximada para erros de digitação e desambiguação por contexto), e suporte ao tipo de processo "Diária de Membro" (com valor total autorizado).
- Robustez contra padrões documentais reais de processos SEI: múltiplos documentos do mesmo tipo anexados ao processo (sempre o mais recente prevalece), campos partidos por quebra de página, e prefixos institucionais no nome do município.
- Preenchimento automático da planilha oficial existente, com detecção de duplicidade (mesmo SEI já presente na planilha ou repetido no lote) e uso do histórico da própria planilha (por CPF) como primeira fonte da unidade de origem.
- Geração de relatório HTML autossuficiente por execução, com resumo executivo e destaque do que precisa de revisão manual.
- Interface desktop (Electron + React) com fluxo único de seleção → processamento → revisão → preenchimento, barra de progresso em tempo real, cancelamento seguro de processamento em andamento, e identidade visual própria.
- Empacotamento como instalador Windows autônomo (não exige Python instalado na máquina do usuário).
- **Política de dados sintéticos**: toda a suíte de testes automatizados usa exclusivamente fixtures fictícias — nenhum documento, processo, CPF ou nome real é distribuído com o projeto. Veja [`CONTRIBUTING.md`](CONTRIBUTING.md#dados-sintéticos).

### Segurança

- Auditoria completa de privacidade antes da primeira publicação pública: todas as fixtures de teste que continham dados reais de processos administrativos foram substituídas por equivalentes sintéticos que preservam o mesmo comportamento de extração, sem expor nenhuma informação real.
