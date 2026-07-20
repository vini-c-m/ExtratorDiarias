from .base_parser import ParserSei
from .sei_parser_v1 import SeiParserV1

_PARSERS: dict[str, type[ParserSei]] = {
    "v1": SeiParserV1,
}


def obter_parser(versao: str = "v1") -> ParserSei:
    try:
        return _PARSERS[versao]()
    except KeyError:
        raise ValueError(f"Parser de layout do SEI desconhecido: {versao!r}") from None
