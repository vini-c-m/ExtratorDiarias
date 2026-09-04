"""QA Codex (revalidação cross-process) — reproduz o cenário EXATO do
contraexemplo que refutou a correção anterior (`threading.Lock`): sobe um
servidor Uvicorn REAL, via subprocesso (`uvicorn app.main:app --workers N`,
não `TestClient` — que roda tudo num único processo em memória e nunca
exercitaria multi-processo de verdade), e dispara requisições HTTP
concorrentes contra ele. Mais lento que o resto da suíte (sobe um servidor
de verdade) — mantido isolado neste arquivo, mesma convenção de sufixo
`_p0` já usada em `test_sincronizacao_concorrencia_p0.py` para os testes de
concorrência mais pesados/críticos.

Nota sobre determinismo: ao contrário dos testes unitários de
`tests/unit/test_persistencia_decisoes.py` (que alargam a janela vulnerável
via `monkeypatch` + `time.sleep`, tornando a reprodução do bug quase
100% confiável), aqui não há como injetar um atraso dentro do processo do
servidor a partir do processo de teste — a corrida real depende de dois
workers de fato processarem requisições sobrepostas no tempo, o que overhead
de rede/ASGI pode ocasionalmente evitar mesmo sem a correção. Por isso os
testes abaixo disparam um volume maior de decisões concorrentes (não só
2) — verificado manualmente (revertendo `_trava_decisoes` para um lock só
em memória) que ISSO reproduz o `PermissionError`/decisão perdida de forma
confiável; a prova formal/determinística do bug e da correção continua
sendo os testes unitários com `multiprocessing.Process` + atraso injetado —
este arquivo é a confirmação de que a mesma proteção se sustenta passando
pela pilha HTTP inteira, com um servidor Uvicorn multi-worker real."""

import json
import socket
import subprocess
import sys
import threading
import time
from datetime import date
from pathlib import Path

import httpx
import pytest
from openpyxl import Workbook

_RAIZ_BACKEND = Path(__file__).resolve().parents[2]
_BASE_URL_PREFIXO = "/api/v1/relatorio-transparencia"

_CABECALHO_BASE_OB = [
    "DH", "OB", "SITUAÇÃO", "DATA OB", "SEI", "CPF", "NOME", "CARGO",
    "PERÍODO INICIAL", "PERÍODO FINAL", "TRECHO", "TRANSPORTE", "MOTIVO",
    "VALOR DA DIÁRIA", "RESTITUIÇÃO", "DUPLICIDADE", "ITEM DE GASTO",
]


def _linha_ob(*, dh, ob, cpf, periodo_inicial, periodo_final, trecho, valor):
    return [
        dh, ob, "Paga", "31/05/2026 09:00:00", "19.20.0001.0000001/2026-01", cpf, "FULANO DE TAL",
        "Cargo de Teste", periodo_inicial, periodo_final, trecho, "CARRO", "Motivo de teste",
        valor, None, "Único", "33901401",
    ]


# Plano de Migração E-Fisco, Sprint C — índices espelham `_CABECALHO_BASE_OB`.
_IDX_DH, _IDX_OB, _IDX_SITUACAO, _IDX_DATA_OB, _IDX_SEI, _IDX_CPF, _IDX_NOME = range(7)
_IDX_CARGO, _IDX_PERIODO_INICIAL, _IDX_PERIODO_FINAL, _IDX_TRECHO = range(7, 11)
_IDX_TRANSPORTE, _IDX_MOTIVO, _IDX_VALOR = range(11, 14)

_CABECALHO_EFISCO = [
    "Ordem Bancária", "Número do DH", "Situação", "Data da OB", "Data Pagto./Devol.",
    "Valor Bruto", "Observação", "Código da Natureza de Despesa",
    "Razão Social do Credor", "Número do documento do Credor",
]


def _criar_base_ob(caminho, linhas):
    """Escreve a Base E-Fisco derivada — nome preservado (histórico). Ver
    mesma função em `test_relatorio_transparencia_service.py`."""
    wb = Workbook()
    ws = wb.active
    ws.title = "OB"
    ws.append(_CABECALHO_EFISCO)
    for linha in linhas:
        data_ob_texto = str(linha[_IDX_DATA_OB]).split(" ")[0]
        cpf_digitos = "".join(ch for ch in str(linha[_IDX_CPF]) if ch.isdigit())
        ws.append([
            linha[_IDX_OB], linha[_IDX_DH], linha[_IDX_SITUACAO], data_ob_texto, linha[_IDX_DATA_OB],
            linha[_IDX_VALOR], "PAGTO TESTE ; UMA DIARIA PARCIAL", "33901400",
            linha[_IDX_NOME], cpf_digitos,
        ])
    wb.save(caminho)


def _criar_controle_vazio(caminho):
    wb = Workbook()
    ws = wb.active
    ws.title = "Controle de Diárias"
    wb.save(caminho)


def _criar_controle_das_linhas(caminho, linhas):
    """Deriva o Controle DIMCAC das mesmas especificações — necessário
    porque TRECHO/PERÍODO (chave do RN07 testado aqui) só existem na
    `OrdemBancaria` via este arquivo no pipeline produtivo atual (Sprint
    C). Ver mesma função em `test_relatorio_transparencia_service.py`."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Controle de Diárias"
    ws.append([
        "DH", "SEI", "DOC ORIGEM", "CPF", "", "", "CARGO", "PERÍODO INICIAL",
        "PERÍODO FINAL", "TRECHO", "TRANSPORTE", "MOTIVO", "",
        "QUANT. DIÁRIA INTEGRAL", "QUANT. DIÁRIA PARCIAL", "VALOR DA DIÁRIA",
    ])
    for linha in linhas:
        ws.append([
            linha[_IDX_DH], linha[_IDX_SEI], "PJTESTE", linha[_IDX_CPF], None, None, linha[_IDX_CARGO],
            linha[_IDX_PERIODO_INICIAL], linha[_IDX_PERIODO_FINAL], linha[_IDX_TRECHO], linha[_IDX_TRANSPORTE],
            linha[_IDX_MOTIVO], None, None, None, linha[_IDX_VALOR],
        ])
    wb.save(caminho)


def _grupo_rn07(indice: int) -> tuple[list, str, str]:
    """Duas linhas com mesmo CPF/período/valor/trecho normalizado — dispara
    RN07 (suspeita de duplicidade). `indice` garante OBs/CPFs únicos entre
    grupos diferentes no mesmo arquivo de Base OB."""
    cpf = 20000000000 + indice
    ob1, ob2 = f"2026OB0{indice:03d}1", f"2026OB0{indice:03d}2"
    dh1, dh2 = f"2026DH0{indice:03d}1", f"2026DH0{indice:03d}2"
    linhas = [
        _linha_ob(
            dh=dh1, ob=ob1, cpf=cpf, periodo_inicial=date(2026, 5, 10), periodo_final=date(2026, 5, 10),
            trecho=f"RECIFE - CIDADE{indice}", valor=100.0 + indice,
        ),
        _linha_ob(
            dh=dh2, ob=ob2, cpf=cpf, periodo_inicial=date(2026, 5, 10), periodo_final=date(2026, 5, 10),
            trecho=f"RECIFE - CIDADE{indice}", valor=100.0 + indice,
        ),
    ]
    return linhas, ob1, ob2


def _preparar_grupos(tmp_path: Path, quantidade: int, base_url: str, cliente: httpx.Client):
    """Cria `quantidade` grupos RN07 independentes numa Base OB só, chama
    `/preparar` e devolve `(payload_base, identidades, obs_a)` prontos para
    decidir cada grupo concorrentemente."""
    caminho_base_ob = tmp_path / "base_ob.xlsx"
    caminho_controle = tmp_path / "controle.xlsx"
    grupos = [_grupo_rn07(indice) for indice in range(quantidade)]
    todas_linhas = [linha for linhas, _, _ in grupos for linha in linhas]
    _criar_base_ob(caminho_base_ob, todas_linhas)
    _criar_controle_das_linhas(caminho_controle, todas_linhas)
    caminho_decisoes = tmp_path / "decisoes.json"

    payload_base = {
        "caminho_base_efisco": str(caminho_base_ob),
        "caminho_controle_dimcac": str(caminho_controle),
        "ano_exercicio": 2026,
        "mes_referencia": 5,
        "caminho_decisoes": str(caminho_decisoes),
    }

    resposta = cliente.post(f"{base_url}/preparar", json=payload_base)
    assert resposta.status_code == 200, resposta.text
    corpo_preparar = resposta.json()
    assert corpo_preparar["total_revisoes"] == quantidade

    def _revisao_do_grupo(obs_esperadas):
        return next(r for r in corpo_preparar["revisoes"] if {oc["ob"] for oc in r["ocorrencias"]} == obs_esperadas)

    identidades = []
    obs_a = []
    for _linhas, ob_a, ob_b in grupos:
        identidades.append(_revisao_do_grupo({ob_a, ob_b})["identidade_grupo"])
        obs_a.append(ob_a)

    return payload_base, identidades, obs_a, caminho_decisoes


def _decidir_concorrentemente(cliente, base_url, payload_base, identidades, obs_a):
    """Dispara uma decisão HTTP para CADA grupo ao mesmo tempo
    (`threading.Barrier` sincroniza o início) — devolve o dict de
    respostas, indexado por posição."""
    quantidade = len(identidades)
    respostas: dict[int, httpx.Response] = {}
    barreira = threading.Barrier(quantidade, timeout=30)

    def _chamar(indice):
        payload = dict(payload_base, acao="publicar", autor=f"servidor.{indice}", obs_selecionadas=[obs_a[indice]])
        barreira.wait()
        respostas[indice] = cliente.post(f"{base_url}/revisoes/{identidades[indice]}/decisao", json=payload)

    threads = [threading.Thread(target=_chamar, args=(i,)) for i in range(quantidade)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)

    return respostas


def _porta_livre() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class _ServidorUvicornReal:
    """Sobe `uvicorn app.main:app --workers N` como um subprocesso real
    (não `TestClient`) — cada worker é um PROCESSO Python distinto, exatamente
    o cenário que o QA usou para refutar a correção `threading.Lock`."""

    def __init__(self, workers: int):
        self.porta = _porta_livre()
        self.base_url = f"http://127.0.0.1:{self.porta}{_BASE_URL_PREFIXO}"
        self._processo = subprocess.Popen(
            [
                sys.executable, "-m", "uvicorn", "app.main:app",
                "--host", "127.0.0.1", "--port", str(self.porta),
                "--workers", str(workers), "--log-level", "warning",
            ],
            cwd=str(_RAIZ_BACKEND),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def aguardar_pronto(self, timeout_s: float = 30.0) -> None:
        prazo = time.monotonic() + timeout_s
        ultimo_erro = None
        while time.monotonic() < prazo:
            try:
                resposta = httpx.get(f"http://127.0.0.1:{self.porta}/docs", timeout=2.0)
                if resposta.status_code == 200:
                    return
            except httpx.HTTPError as erro:
                ultimo_erro = erro
            if self._processo.poll() is not None:
                raise RuntimeError(f"Servidor Uvicorn encerrou prematuramente (código {self._processo.returncode})")
            time.sleep(0.2)
        raise TimeoutError(f"Servidor Uvicorn não respondeu em {timeout_s}s (último erro: {ultimo_erro})")

    def encerrar(self) -> None:
        """Idempotente (seguro chamar mais de uma vez, ou sem o processo
        nunca ter chegado a subir). No Windows, `Popen.terminate()` chama
        `TerminateProcess` no supervisor Uvicorn — não é um sinal que o
        Uvicorn possa interceptar para encerrar os workers antes de
        morrer, então os processos-worker (filhos reais do supervisor)
        ficam órfãos mesmo em encerramento NORMAL, não só num kill
        abrupto do processo de teste. `taskkill /T` mata a árvore
        inteira (supervisor + workers) pelo PID; se falhar (ex.: já
        morto), cai para `terminate`/`kill` no processo supervisor."""
        if self._processo is None or self._processo.poll() is not None:
            return
        try:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(self._processo.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=15,
            )
        except (subprocess.TimeoutExpired, OSError):
            pass
        try:
            self._processo.wait(timeout=10)
        except subprocess.TimeoutExpired:
            try:
                self._processo.kill()
                self._processo.wait(timeout=10)
            except OSError:
                pass


@pytest.fixture
def servidor_dois_workers():
    servidor = None
    try:
        servidor = _ServidorUvicornReal(workers=2)
        servidor.aguardar_pronto()
        yield servidor
    finally:
        if servidor is not None:
            servidor.encerrar()


@pytest.fixture
def servidor_cinco_workers():
    servidor = None
    try:
        servidor = _ServidorUvicornReal(workers=5)
        servidor.aguardar_pronto()
        yield servidor
    finally:
        if servidor is not None:
            servidor.encerrar()


def test_decisoes_concorrentes_via_http_dois_workers_sobrevivem(tmp_path, servidor_dois_workers):
    """`--workers 2` real: 12 grupos de revisão distintos, decididos por 12
    requisições HTTP disparadas ao mesmo tempo — volume alto de propósito
    (não só 2) para dar múltiplas chances reais de dois WORKERS distintos
    estarem processando decisões diferentes simultaneamente; nenhuma pode
    ser perdida, nenhum HTTP 500."""
    base_url = servidor_dois_workers.base_url

    with httpx.Client(timeout=60.0) as cliente:
        payload_base, identidades, obs_a, caminho_decisoes = _preparar_grupos(tmp_path, 12, base_url, cliente)
        respostas = _decidir_concorrentemente(cliente, base_url, payload_base, identidades, obs_a)

        for indice, identidade in enumerate(identidades):
            assert respostas[indice].status_code == 200, (identidade, respostas[indice].text)

        corpo_final = cliente.get(f"{base_url}/revisoes", params=payload_base).json()
        estados = {r["identidade_grupo"]: r["estado"] for r in corpo_final["revisoes"]}
        assert all(estados[identidade] == "decidida" for identidade in identidades)  # nenhuma decisão perdida

        json.loads(caminho_decisoes.read_text(encoding="utf-8"))  # nunca corrompe


def test_fontes_concorrentes_via_http_dois_workers_mesclam(tmp_path, servidor_dois_workers):
    """`--workers 2` real: duas requisições `POST /fontes` concorrentes
    (campos diferentes) — antes da correção cross-process, isto reproduzia
    lost update na config de fontes (comprovado pelo QA)."""
    base_url = servidor_dois_workers.base_url
    caminho_configuracao_fontes = str(tmp_path / "fontes_configuracao.json")
    caminho_ob_fake = tmp_path / "ob_fake.xlsx"
    caminho_dimcac_fake = tmp_path / "dimcac_fake.xlsx"
    caminho_ob_fake.write_bytes(b"")
    caminho_dimcac_fake.write_bytes(b"")

    with httpx.Client(timeout=30.0) as cliente:
        respostas: dict[str, httpx.Response] = {}
        barreira = threading.Barrier(2, timeout=15)

        def _chamar(chave, payload):
            barreira.wait()
            respostas[chave] = cliente.post(f"{base_url}/fontes", json=payload)

        t1 = threading.Thread(
            target=_chamar,
            args=(
                "a",
                {
                    "caminho_configuracao_fontes": caminho_configuracao_fontes,
                    "caminho_base_efisco": str(caminho_ob_fake),
                },
            ),
        )
        t2 = threading.Thread(
            target=_chamar,
            args=(
                "b",
                {
                    "caminho_configuracao_fontes": caminho_configuracao_fontes,
                    "caminho_controle_dimcac": str(caminho_dimcac_fake),
                },
            ),
        )
        t1.start()
        t2.start()
        t1.join(timeout=30)
        t2.join(timeout=30)

        assert respostas["a"].status_code == 200, respostas["a"].text
        assert respostas["b"].status_code == 200, respostas["b"].text

        corpo_final = cliente.get(
            f"{base_url}/fontes", params={"caminho_configuracao_fontes": caminho_configuracao_fontes}
        ).json()
        assert corpo_final["base_efisco"]["caminho"] == str(caminho_ob_fake)
        assert corpo_final["controle_dimcac"]["caminho"] == str(caminho_dimcac_fake)


def test_decisoes_concorrentes_via_http_cinco_workers_sobrevivem(tmp_path, servidor_cinco_workers):
    """`--workers 5` real: 15 grupos de revisão distintos, decididos por 15
    requisições HTTP disparadas ao mesmo tempo — nenhuma pode ser perdida."""
    base_url = servidor_cinco_workers.base_url

    with httpx.Client(timeout=60.0) as cliente:
        payload_base, identidades, obs_a, caminho_decisoes = _preparar_grupos(tmp_path, 15, base_url, cliente)
        respostas = _decidir_concorrentemente(cliente, base_url, payload_base, identidades, obs_a)

        for indice, identidade in enumerate(identidades):
            assert respostas[indice].status_code == 200, (identidade, respostas[indice].text)

        corpo_final = cliente.get(f"{base_url}/revisoes", params=payload_base).json()
        estados = {r["identidade_grupo"]: r["estado"] for r in corpo_final["revisoes"]}
        assert all(estados[identidade] == "decidida" for identidade in identidades)  # nenhuma decisão perdida

        json.loads(caminho_decisoes.read_text(encoding="utf-8"))  # nunca corrompe
