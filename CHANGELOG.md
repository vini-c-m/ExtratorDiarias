# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/), e este projeto segue [Versionamento Semântico](https://semver.org/lang/pt-BR/).

Para o histórico de desenvolvimento sprint a sprint, veja [`docs/roadmap/`](docs/roadmap/).

## [Não lançado]

Build de homologação interna `1.0.0-RC2` — não publicada, só para teste em outra máquina.

### Adicionado

- **Configuração Inicial da Planilha Oficial** (Sprint 15): na primeira execução, o app exige a seleção da planilha oficial (diálogo nativo, validada em 5 critérios — existência, extensão, abertura, aba e cabeçalhos esperados) antes de liberar qualquer funcionalidade. O caminho é persistido localmente (`configuracao.json`, na pasta de dados do usuário) e passa a ser usado automaticamente em todo preenchimento — o backend é a única autoridade sobre esse caminho, que deixou de ser escolhido a cada execução.
- Detecção de substituição estrutural da planilha configurada (fingerprint de cabeçalho + abas), sem bloquear o uso — apenas solicita revalidação.
- Ação "Alterar Planilha Oficial", acessível a qualquer momento por um novo ícone de Configurações no cabeçalho ou pelo próprio painel de preenchimento quando a planilha estiver inacessível.

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
