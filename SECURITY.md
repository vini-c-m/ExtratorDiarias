# Política de Segurança

## Reportando uma vulnerabilidade

Se você encontrar uma vulnerabilidade de segurança neste projeto, por favor **não abra uma issue pública**. Em vez disso, entre em contato diretamente em:

**vcm5@cesar.school**

Inclua o máximo de detalhes possível: passos para reproduzir, impacto potencial e, se possível, uma sugestão de correção. Você pode esperar uma resposta inicial em até 5 dias úteis.

## Exposição de dados reais (real ou suspeita)

Este projeto tem uma política absoluta de nunca versionar dados reais/pessoais/institucionais — veja [`CONTRIBUTING.md`](CONTRIBUTING.md#política-de-dados-sintéticos-leitura-obrigatória). Se você notar, em qualquer commit, PR, issue, comentário ou release deste repositório (incluindo o histórico de Git), algo que pareça:

- um documento real de um processo administrativo (SEI ou qualquer outro);
- um CPF, RG, nome, assinatura, conta bancária, endereço, telefone ou e-mail de uma pessoa real;
- uma planilha ou relatório real gerado em ambiente de produção;

**reporte imediatamente para vcm5@cesar.school, em vez de comentar publicamente na issue/PR onde encontrou.** Isso é tratado com a mesma prioridade de uma vulnerabilidade de segurança: o dado será removido do histórico e a fonte do vazamento, corrigida, o mais rápido possível.

## Escopo

Este projeto é um aplicativo desktop local — o backend roda exclusivamente em `127.0.0.1` e não expõe nenhuma porta para a rede. O principal risco de segurança prático é de manuseio de arquivo local (PDFs e planilhas fornecidos pelo próprio usuário), não de rede.

## Versões suportadas

Apenas a última versão publicada (`main`/última release) recebe correções de segurança.
