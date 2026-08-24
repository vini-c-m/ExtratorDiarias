"""Motor de reconciliação entre o Controle de Diárias (DIMCAC) e a Base de
Ordens Bancárias, para a futura geração do Relatório de Diárias — Portal da
Transparência. Funções puras (sem I/O) — quem lê as duas fontes é sempre
`app/consulta/` (`repositorio_controle_dimcac.controle_dimcac_por_dh`,
`repositorio_ordens_bancarias.ordens_bancarias_por_dh`).

Micro-sprint 2 (reconciliação mínima): só a granularidade DH/OB é
preservada — nenhuma regra financeira/descritiva (R01, R02, R05, R06, R07,
R09) é aplicada ainda.

Micro-sprint 3A (projeção própria do Controle): o lado "controle" deixou de
vir de `repositorio_diarias.diarias_completas` (indexado por SEI, que
descartava silenciosamente linhas com SEI repetido — achado real, 16 DHs
perdidos) e passou a vir de `repositorio_controle_dimcac.
controle_dimcac_por_dh`, leitura isolada que nunca deduplica por SEI.

Micro-sprint 3B (`motor_decisao.classificar`): aplica RN01-RN07 sobre o
resultado já reconciliado, classificando cada OB paga em candidata normal
(publicável automaticamente) ou revisão necessária (decisão humana, ainda
não implementada — Micro-sprint 3C). Ver `docs/relatorio-transparencia/
README.md` para a especificação completa (regras de negócio, invariantes,
guardrails, evidências)."""
