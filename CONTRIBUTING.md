# Contribuindo

Obrigado por considerar contribuir com o Extrator de Diárias. Este documento cobre o que você precisa saber antes de abrir um PR.

## Política de dados sintéticos (leitura obrigatória)

**Este é um repositório público.** Por isso, existe uma regra absoluta, sem exceção, que vale para qualquer contribuição:

> Nenhum documento real, processo administrativo real, planilha real ou dado pessoal real pode ser adicionado a este repositório — nem mesmo para fins de teste ou depuração.

Isso inclui, sem se limitar a: PDFs reais do SEI, CPFs, RGs, nomes de pessoas reais, assinaturas, matrículas, contas bancárias/agências, endereços, telefones, e-mails, QR Codes, códigos de barra, carimbos institucionais, planilhas reais (ou cópias delas) e qualquer relatório gerado em ambiente de produção.

**Contribuições (issues, PRs, comentários) contendo qualquer um desses dados serão recusadas.** Se você notar que um dado real foi commitado por engano em qualquer momento da história do projeto, abra uma issue privada ou contate o mantenedor diretamente em vez de discutir os detalhes publicamente — veja [`SECURITY.md`](SECURITY.md).

### Dados sintéticos

Toda fixture de teste deste projeto é gerada artificialmente e mantém o mesmo formato que o parser espera, mas com dados 100% inventados:

- Backend (PDFs de processo SEI): [`backend/tests/fixtures/gerar_fixtures_sinteticas.py`](backend/tests/fixtures/gerar_fixtures_sinteticas.py) — regenera as 19 fixtures usadas pela suíte de testes.
- Screenshots/demonstração: [`scripts/demo/gerar_demo.py`](scripts/demo/gerar_demo.py) — gera os PDFs e a planilha usados só para capturar as imagens do README.

Se você está adicionando um teste para um caso novo (um padrão documental do SEI que o parser ainda não trata corretamente, por exemplo), **não anexe o PDF real que revelou o problema**. Em vez disso:

1. Descreva o padrão estrutural do problema (qual campo, que tipo de artefato de extração de texto, etc.) na issue/PR.
2. Reproduza esse padrão com dados fictícios, do mesmo jeito que as fixtures existentes fazem — adicionando um novo caso ao gerador (`gerar_fixtures_sinteticas.py`) ou, quando possível, como uma reprodução mínima inline no próprio teste (sem precisar de um PDF).

Se um caso realmente não puder ser reproduzido sinteticamente, não abra o PR com o dado real anexado — descreva o problema e a estratégia de reprodução sugerida, e discuta com os mantenedores antes.

## Regras de negócio

Antes de mexer em qualquer coisa dentro de `backend/app/extraction/`, `backend/app/domain/rules/`, ou nos parsers — leia os comentários existentes. Praticamente toda regra de extração aqui existe por causa de um caso real de homologação (documentado nos comentários, agora com dados fictícios equivalentes nas fixtures) — mudanças que parecem "simplificações" costumam reintroduzir um bug já corrigido. Se não tiver certeza do porquê de uma regra existir, pergunte antes de remover.

## Como rodar o projeto localmente

Veja o [README](README.md#como-executar) para o passo a passo completo de configuração do ambiente (backend Python + frontend Node).

## Testes

```bash
# Backend
cd backend
.venv\Scripts\python.exe -m pytest tests/ -q

# Frontend
cd frontend
npm run typecheck
npm run test
npm run build
```

Um PR só é aceito com a suíte de testes passando. Se você adicionar uma regra de extração nova, adicione também um teste cobrindo o caso (com dados sintéticos, ver acima).

## Estilo de código

- **Português para nomes de domínio** (funções, variáveis, entidades que representam conceitos do negócio — `extrair_documento_habil`, `cidade_destino`), **inglês para termos técnicos genéricos** de infraestrutura quando fizer sentido. Siga o que já existe no arquivo que você está editando.
- Comentários explicam o **porquê**, não o **o quê** — o código já diz o que faz. Um comentário que só descreve a linha abaixo dele deve ser removido, não copiado para código novo.
- Sem abstrações especulativas: resolva o problema que existe agora, não o que pode vir a existir.

## Pull Requests

1. Abra uma issue descrevendo o problema/proposta antes de um PR grande — evita retrabalho.
2. PRs pequenos e focados são revisados mais rápido que um PR que mistura várias mudanças não relacionadas.
3. Descreva o "porquê" da mudança na descrição do PR, não só o "o quê" (o diff já mostra isso).
