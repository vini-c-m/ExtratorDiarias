from .base import FonteSecundariaDeEvidencia
from .validacao_cmfc import ValidacaoCmfcFonteSecundaria

# Mesmo padrão de registro de `app/extraction/parsers/parser_factory.py`
# (`_PARSERS`) — adicionar uma nova Fonte Secundária é sempre: 1 arquivo
# novo com a classe concreta + 1 linha aqui. Nenhum outro arquivo desta
# arquitetura (`base.py`, `orquestrador.py`) precisa mudar.
#
# Ordem é significativa só no caso (deliberadamente não tratado como erro)
# de duas fontes declararem o mesmo campo: a primeira da lista que tiver
# evidência vence: ver `orquestrador.aplicar_fontes_secundarias`.
FONTES_SECUNDARIAS: tuple[FonteSecundariaDeEvidencia, ...] = (ValidacaoCmfcFonteSecundaria(),)
