from enum import Enum


class ModoProcessamento(str, Enum):
    """Modo do fluxo de Processamento de PDFs / Central de Conferência,
    escolhido explicitamente pelo usuário (botão) — nunca detectado
    automaticamente do conteúdo do PDF (eixo ortogonal a `TipoProcesso`,
    que continua tratando PADRAO/DIARIA_MEMBRO por marcador textual).

    PADRAO é o fluxo já homologado, sem nenhuma mudança de comportamento.
    COMPLEMENTO ativa as regras específicas de "Complemento de Diárias"
    (decisão institucional revisada nesta conversa, substituindo a decisão
    de 2026-07-21 documentada em `docs/central-conferencia/README.md`
    RN-07/RN-08): coluna AVISO recebe "COMPLEMENTO DE DIÁRIAS", coluna O
    (quantidade parcial) pode ser escrita pelo sistema, duplicidade por
    SEI deixa de bloquear a gravação, e a Central de Conferência habilita
    o Histórico de Complemento."""

    PADRAO = "PADRAO"
    COMPLEMENTO = "COMPLEMENTO"
