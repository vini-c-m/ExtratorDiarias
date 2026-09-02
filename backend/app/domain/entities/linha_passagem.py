"""Sprint 3 (HOMO-RT-06, plano "Valor da Passagem no XLSX Oficial + Não
Publicadas") — entidades puras de domínio para uma linha da Planilha de
Passagens já classificada.

Movidas de `app/consulta/repositorio_planilha_passagens.py` (Sprint 1, que
continua reexportando os dois nomes por retrocompatibilidade) para aqui,
seguindo o MESMO padrão arquitetural já usado por `OrdemBancaria`
(`app/domain/entities/ordem_bancaria.py`) e `RegistroControle`
(`app/domain/entities/registro_controle.py`): a entidade pura fica em
`app/domain/entities/`, sem nenhuma dependência de I/O; a leitura/parsing
(que precisa de `odfpy`) fica isolada em `app/consulta/`.

Esta separação passou a ser NECESSÁRIA (não só estética) na Sprint 3: código
de domínio puro sem I/O (`app/domain/relatorio_transparencia/
linha_publicavel.py`, usado por `decisao.py` e por
`escritor_relatorio_transparencia.py`) precisa depender do TIPO
`LinhaPassagem`/`EstadoPassagem` sem herdar `odfpy` como dependência de
import da camada de domínio — exatamente o motivo pelo qual `OrdemBancaria`
nunca importa `openpyxl`."""

from dataclasses import dataclass
from enum import Enum

__all__ = ["EstadoPassagem", "LinhaPassagem"]


class EstadoPassagem(str, Enum):
    """Os 4 estados que a leitura da Planilha de Passagens consegue
    determinar sozinha (Sprint 1) — o 5º estado do modelo do plano ("OB sem
    correspondência") só existe no cruzamento com a Base OB (Sprint 2,
    `cruzamento_passagens.py`), nunca aqui: ausência de `LinhaPassagem`
    (`None`) É esse 5º estado, em vez de mais um valor deste enum."""

    NUMERICO = "numerico"
    AUSENTE = "ausente"
    NAO_SE_APLICA = "nao_se_aplica"
    INVALIDO = "invalido"


@dataclass(frozen=True)
class LinhaPassagem:
    """`linha` é só diagnóstico (aproximação de posição física na planilha)
    — nunca chave. A chave de negócio é `ob`. `bruto` preserva o texto
    original só quando relevante para diagnóstico (estado `NAO_SE_APLICA`/
    `INVALIDO`, ou `"-"` literal) — `None` quando o valor já é NUMERICO (o
    `valor` float já é a representação canônica) ou verdadeiramente uma
    célula vazia."""

    linha: int
    ob: str
    transporte: str | None
    estado: EstadoPassagem
    valor: float | None
    bruto: str | None
