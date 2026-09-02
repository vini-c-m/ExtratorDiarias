# -*- mode: python ; coding: utf-8 -*-
# Sprint 08 — empacota o backend FastAPI/uvicorn num executável standalone
# (--onedir), para a máquina de destino não precisar de Python instalado.
# `hiddenimports`/`collect_all` cobrem os casos conhecidos de import
# dinâmico do uvicorn (escolhe implementação de loop/protocolo em runtime,
# por string) e as dependências binárias de extração de PDF.
from PyInstaller.utils.hooks import collect_all

datas = [
    # Base de municípios/UF carregada em `app/extraction/enriquecimento/
    # local_destino.py` via caminho relativo a `__file__` — o PyInstaller
    # só empacota código Python por padrão, então esse dado precisa ser
    # copiado manualmente para o mesmo caminho relativo dentro do bundle.
    ("app/extraction/dados", "app/extraction/dados"),
]
binaries = []
hiddenimports = [
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
]

for pacote in ("fitz", "pymupdf", "pypdfium2", "pdfplumber", "openpyxl", "odf", "defusedxml", "filelock"):
    # "odf" (não "odfpy") é o nome do pacote importável do pip odfpy==1.4.1 —
    # `collect_all("odfpy")` não coleta nada (avisa "not a package") e é inócuo,
    # mas usar o nome certo evita depender de um comportamento não garantido.
    # "filelock" (correção cross-process) — puro Python, usa `ctypes`/`msvcrt`
    # (stdlib) no Windows, nenhum binário/DLL próprio a coletar.
    d, b, h = collect_all(pacote)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(
    ["entrypoint.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "tkinter"],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="extrator_diarias_backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="extrator_diarias_backend",
)
