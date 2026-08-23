"""Motor de reconciliação entre o Controle de Diárias (DIMCAC) e a Base de
Ordens Bancárias, para a futura geração do Relatório de Diárias — Portal da
Transparência. Funções puras (sem I/O) — quem lê as duas fontes é sempre
`app/consulta/` (`repositorio_diarias.diarias_completas`,
`repositorio_ordens_bancarias.ordens_bancarias_por_dh`).

Micro-sprint 2 (reconciliação mínima): só a granularidade DH/OB é
preservada aqui — nenhuma regra financeira/descritiva (R01, R02, R05, R06,
R07, R09) é aplicada ainda."""
