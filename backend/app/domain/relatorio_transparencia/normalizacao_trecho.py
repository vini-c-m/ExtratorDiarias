"""Normalização determinística de TRECHO — regra técnica do detector de
suspeita de duplicidade financeira (RN07,
`docs/relatorio-transparencia/README.md` § 3), não uma regra de negócio:
não decide o que é publicado, só decide quando dois textos de trecho são a
mesma escrita da mesma rota.

Validada contra o universo real da Base de Ordens Bancárias 2026 (675
trechos brutos distintos → 544 normalizados, 93 colisões, todas
classificadas como equivalência legítima de escrita — zero colisões
perigosas observadas). Deliberadamente conservadora: nunca usa fuzzy
matching/Levenshtein/similaridade percentual, nunca inverte a ordem das
localidades (A-B ≠ B-A — achado real: par de OBs 732/2388, ida e volta
legítimas do mesmo evento, mesmo CPF/período, trechos invertidos), nunca
expande abreviações (STA/STO — raras, 3 ocorrências em 1828 linhas reais,
nenhuma delas parte de um grupo suspeito, sem evidência de necessidade) e
nunca corrige ortografia por inferência."""

import re
import unicodedata

__all__ = ["normalizar_trecho"]

_HIFENS_COM_ESPACO = re.compile(r"\s*-+\s*")
_ESPACOS_MULTIPLOS = re.compile(r"\s+")


def normalizar_trecho(bruto: str | None) -> str | None:
    """`bruto` nunca é alterado por quem chama — esta função só devolve uma
    representação derivada para comparação (`trecho_original` +
    `trecho_normalizado` convivem sempre, nunca um substitui o outro)."""
    if bruto in (None, ""):
        return None
    texto = str(bruto).upper().strip()
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = _HIFENS_COM_ESPACO.sub("-", texto)
    texto = _ESPACOS_MULTIPLOS.sub(" ", texto)
    texto = texto.strip()
    return texto or None
