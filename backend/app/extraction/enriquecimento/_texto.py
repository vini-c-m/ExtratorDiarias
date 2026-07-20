import unicodedata


def normalizar(texto: str) -> str:
    """Maiúsculas, sem acento, sem espaços duplicados — usado só para
    comparar/buscar. O valor final gravado na planilha sempre vem das
    constantes/base de dados (com acento), nunca do texto normalizado."""
    sem_acento = "".join(
        caractere
        for caractere in unicodedata.normalize("NFKD", texto)
        if not unicodedata.combining(caractere)
    )
    return " ".join(sem_acento.upper().split())
