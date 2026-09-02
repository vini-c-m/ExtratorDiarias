"""Utilitários compartilhados para os testes de concorrência CROSS-PROCESS
(QA Codex, correção definitiva com `filelock.FileLock`) — usados por
`test_persistencia_decisoes.py`, `test_configuracao_fontes_relatorio_
transparencia.py`, `test_configuracao_template_relatorio_transparencia.py`,
`test_configuracao_app.py`, `test_base_local.py` e `test_escritor_dados.py`.

Não é um arquivo de teste (nenhum `test_*` aqui, `pytest` não o coleta) —
só as funções auxiliares PICKLABLE exigidas por `multiprocessing.Process`
no método `spawn` (padrão no Windows: cada processo filho reimporta o
módulo do zero via referência qualificada `modulo.funcao`, nunca aceita
uma closure local como alvo)."""

from __future__ import annotations

import time
from multiprocessing import Queue
from typing import Any, Callable


def executar_e_reportar(
    fila: Queue, funcao: Callable[..., Any], args: tuple, kwargs: dict
) -> None:
    """Roda `funcao(*args, **kwargs)` dentro do processo filho e reporta
    `("ok", resultado)` ou `("erro", repr(excecao))` na fila — um
    `multiprocessing.Process` comum NÃO propaga exceções do filho para o
    pai sozinho; sem isso, uma falha no filho desapareceria silenciosamente
    em vez de derrubar o teste."""
    try:
        resultado = funcao(*args, **kwargs)
        fila.put(("ok", resultado))
    except BaseException as erro:  # noqa: BLE001 — captura tudo para reportar ao pai, nunca deixa o processo morrer em silêncio
        fila.put(("erro", repr(erro)))


def segurar_trava_ate_ser_morto(
    fila: Queue, construir_trava: Callable[..., Any], args_construir_trava: tuple
) -> None:
    """Adquire a trava devolvida por `construir_trava(*args_construir_trava)`
    (uma função de nível de módulo que devolve um `filelock.FileLock`),
    avisa o pai pela fila assim que a trava é obtida, e então dorme por um
    tempo bem maior que qualquer timeout de teste. O processo é sempre
    morto pelo PAI via `Process.kill()` (nunca sai sozinho, nunca roda
    `finally`/cleanup Python) — é exatamente esse "morrer sem chance de
    limpar nada" que prova que a trava do SO (não uma convenção em código)
    é liberada automaticamente pelo kernel."""
    trava = construir_trava(*args_construir_trava)
    trava.acquire()
    fila.put("trava_obtida")
    time.sleep(120)
