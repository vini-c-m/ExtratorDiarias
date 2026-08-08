# Identidade Visual

Identidade visual própria do Automatizador de Diárias (Design System "Neon Tech UI", v2.0+), desenhada para uma interface desktop escura, técnica e discreta — sem qualquer referência a uma instituição específica.

Fonte única de verdade: [`frontend/src/theme/`](../../frontend/src/theme/) (`cores.ts`, `tipografia.ts`, `theme.css`). Este documento é a leitura humana desses tokens — para alterar a identidade visual do app, edite os arquivos em `theme/`, nunca hardcode um valor num componente.

## Logo

Monograma "ED" — um "D" arredondado com um "E" (tronco + 3 braços) revelado em espaço negativo dentro do bojo, preenchido pelo gradiente de marca.

<p align="center">
  <img src="../../frontend/public/brand/logo-color.svg" width="120" alt="Logo do Automatizador de Diárias" />
</p>

| Arquivo | Uso |
| --- | --- |
| `frontend/public/brand/logo-color.svg` | Versão colorida (gradiente completo) — uso padrão, fundo escuro |
| `frontend/public/brand/logo-mono-dark.svg` | Monocromática, para fundos claros |
| `frontend/public/brand/logo-mono-light.svg` | Monocromática, para fundos escuros |
| `frontend/public/brand/favicon.svg` | Favicon / ícone pequeno |
| `frontend/build/icon.ico` | Ícone do executável Windows (gerado do SVG por `frontend/scripts/gerar-icone.mjs`, via `npm run build:icon`) |

## Paleta de cores

### Gradiente de marca

Três paradas, usadas em elementos de destaque (barra de progresso, divisor do cabeçalho, glow de fundo, logo):

| Parada | Hex | Tailwind |
| --- | --- | --- |
| 0% | `#2563EB` | `blue-600` |
| 50% | `#06B6D4` | `cyan-500` |
| 100% | `#8B5CF6` | `violet-500` |

### Fundo (degradê de 4 paradas)

| Token | Hex |
| --- | --- |
| `--color-bg-1` | `#060818` |
| `--color-bg-2` | `#0b1120` |
| `--color-bg-3` | `#111827` |
| `--color-bg-4` | `#141b2d` |

### Cores semânticas de status

Convenção fixa em todo o app — nenhum componente escolhe uma cor "no olho", todos leem de [`cores.ts`](../../frontend/src/theme/cores.ts):

| Significado | Cor | Uso |
| --- | --- | --- |
| Sucesso | verde-esmeralda (`emerald-400/500`) | processo extraído com sucesso |
| Aviso | âmbar (`amber-400/500`) | duplicidade, revisão recomendada |
| Erro | vermelho (`red-400/500`) | falha de extração |
| Informativo | ciano (`cyan-400/500`) — cor de marca | neutro, informativo |
| Neutro estrutural | slate/branco translúcido | texto e bordas secundárias |

## Tipografia

Família única: **Inter** (auto-hospedada via `@fontsource/inter`, funciona offline no Electron), com Source Sans 3 e a pilha padrão do sistema como fallback.

| Nível | Estilo |
| --- | --- |
| Título do app | 30px, ExtraBold, `slate-50` |
| Tagline | 13px, Medium, caixa alta, `slate-400` |
| Título de seção | 20px (`xl`), Semibold, `slate-50` |
| Subtítulo | 14px (`sm`), Semibold, `slate-100` |
| Texto de corpo | 14px (`sm`), Regular, `slate-300` |
| Texto com ênfase | 14px (`sm`), Medium, `slate-200` |
| Legenda | 12px (`xs`), caixa alta, `slate-500` |

## Superfícies, raio e sombra

- **Cards/painéis:** efeito "vidro" — fundo translúcido sobre o degradê base, nunca cor sólida opaca.
- **Raio de borda:** `14px` para controles (botões, inputs, badges); `20px` para cards/painéis/modal.
- **Sombra:** escala de 4 degraus (`sm` → `card` → `floating` → `dialog`), mais 6 tokens de "glow neon" coloridos por grupo funcional (Processamento = roxo, PDFs = azul petróleo, Estatísticas = ciano/verde/âmbar/laranja conforme o status).
- **Transição padrão:** 220ms, `cubic-bezier(0.4, 0, 0.2, 1)`.
- **Micro-animações:** discretas por design — fade + leve deslocamento na entrada de conteúdo, "respiração" de glow na barra de progresso, ripple de 200ms ao clicar.

## Fundo decorativo (`FundoDecorativo.tsx`)

**✅ Decisão oficial (Sprint 14, 2026-07-23).** Os monogramas "ED" que compõem
a marca d'água do fundo deixam de ser um detalhe descartável e passam a
fazer parte **permanente** da identidade visual do app — não devem ser
removidos em nenhuma evolução futura, só redesenhados dentro da direção
abaixo.

O fundo é composto por **três camadas integradas**, pensadas como uma única
cena (mesma família de cor — ciano/violeta da marca —, mesma composição
"orgânica" de posição/rotação/opacidade), nunca como três efeitos
independentes:

| Camada | Papel | Tratamento |
| --- | --- | --- |
| **Logos holográficos** | Marca d'água — a peça de maior presença das três | Contorno nítido (traço, não preenchimento), efeito neon/holográfico (glow suave em duas camadas, mesma fórmula de intensidade dos 6 tokens `--shadow-glow-*`), sem blur no próprio traço — só no brilho ao redor |
| **Partículas luminosas** | Camada intermediária de atmosfera/profundidade | Poucas, suaves, glow difuso maior que uma estrela — nunca competem com os logos |
| **Campo estrelado** | Textura de fundo mais discreta (Sprint 09.3, mantida) | Estrelas pequenas, algumas cintilantes, nunca sem nenhum brilho — nenhuma "parece pixel apagado" |

**Hierarquia visual obrigatória** (da maior para a menor prioridade —
nenhuma camada do fundo pode competir com o conteúdo real da tela):

1. Conteúdo da tela (cards, formulários, resultado)
2. Logo principal (cabeçalho / tela de Boas-vindas)
3. Logos holográficos do fundo
4. Partículas luminosas / campo estrelado

**Variação para profundidade:** cada logo de fundo varia levemente em
tamanho, opacidade, rotação e intensidade do próprio glow — nunca duas
peças idênticas lado a lado — mas sempre dentro de uma faixa estreita
("nada exagerado", item já registrado na Sprint 09.1). O objetivo é uma
composição desenhada, não um efeito genérico de partículas.

**Estilo:** tecnologia, sofisticação, organização — nunca estética "gamer",
nunca excesso de neon ou de brilho. O fundo precisa continuar lendo como um
sistema institucional moderno feito sob medida para o DIMCAC, não como uma
tela de entretenimento.

## Decisões de identidade

- **Sem referência institucional.** A identidade v1 (pré-Sprint 07) usava cores/tom de uma instituição específica; a v2.0 é inteiramente própria do produto, para que o software possa ser usado e distribuído por qualquer equipe, não apenas a original.
- **Tema único (escuro).** Não há tema claro — a interface foi desenhada para uso prolongado em ambiente de escritório, priorizando contraste e conforto visual sobre familiaridade com apps "brancos" tradicionais.
- **"Neon Tech UI" é deliberado, não decorativo.** Os glows e o gradiente de marca comunicam "ferramenta técnica/automação", reforçando a proposta do produto (processamento inteligente) — não são um tema genérico de UI escura.
