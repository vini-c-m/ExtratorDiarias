import re
from typing import Literal

from pydantic import BaseModel, model_validator

from app.schemas.conferencia import ServidorResposta

EstadoCadastroResposta = Literal["duplicado", "nao_salvo", "salvo_sync_pendente", "concluido"]


class RequisicaoCadastroServidor(BaseModel):
    # Ajuste Funcional + UX (item 2) — CPF deixou de ser bloqueado no
    # modal: o valor consultado só pré-preenche, o usuário pode corrigi-lo
    # antes de salvar (o CPF pesquisado pode estar digitado errado). Este é
    # sempre o CPF FINAL — a checagem de duplicidade e a reconsulta pós-
    # cadastro (`cadastro_dados_service.py`) usam exatamente este valor,
    # nunca um CPF "original" guardado à parte.
    cpf: str
    nome: str
    matricula: str
    cargo: str
    previdencia: str | None = None
    orgao_origem: str | None = None
    regime_previdencia: str | None = None
    situacao: str | None = None

    @model_validator(mode="after")
    def _campos_obrigatorios(self) -> "RequisicaoCadastroServidor":
        if not self.cpf.strip():
            raise ValueError("CPF é obrigatório.")
        # Mesma regra já usada em todo o projeto (frontend `cpfValido` e o
        # rigor de `_cpf_normalizado`): 11 dígitos após remover pontuação,
        # nunca dígito verificador — nenhuma parte do projeto valida isso
        # hoje, então esta checagem não inventa uma regra nova, só passa a
        # aplicá-la também no backend (defesa em profundidade, já que o
        # CPF agora chega editável pelo usuário).
        if len(re.sub(r"\D", "", self.cpf)) != 11:
            raise ValueError("CPF deve ter 11 dígitos.")
        if not self.nome.strip():
            raise ValueError("Nome é obrigatório.")
        if not self.matricula.strip():
            raise ValueError("Matrícula é obrigatória.")
        if not self.cargo.strip():
            raise ValueError("Cargo é obrigatório.")
        return self


class RespostaCadastroServidor(BaseModel):
    estado: EstadoCadastroResposta
    mensagem: str | None = None
    servidor: ServidorResposta | None = None


class OpcoesCadastroServidorResposta(BaseModel):
    cargos: list[str]
    orgaos_origem: list[str]
    previdencias: list[str]
    regimes_previdencia: list[str]
    situacoes: list[str]
