# Estrategia de backup y recuperación

## PostgreSQL

`pnpm db:backup` genera un dump custom, valida `pg_restore --list` y crea
`BackupManifestV1`, SHA-256 y evidencia lógica agregada de schema, votos, audit y
packages. `pnpm db:restore:drill -- <dump> [package]` restaura en PostgreSQL
aislado/tmpfs, verifica schema, unicidad de nullifier, cadena/checkpoints audit,
conteos/digests y opcionalmente el offline verifier.

Producción debe definir antes de `OPEN`: base/full backup, WAL/PITR si aplica,
cifrado en tránsito/reposo, storage aislado, IAM, retención, monitorización y
prueba periódica. RPO/RTO quedan como gate explícito; no se inventan defaults.

## Artefactos

`pnpm artifacts:backup -- <directorio> <archivo.artifact-backup.tar.gz> <entorno>`
y `pnpm artifacts:restore -- <archivo> <directorio-nuevo>` preservan packages y
artefactos por digest. Producción requiere storage inmutable/durable separado de
discos de instancia. Un zkey productivo perdido se restaura por digest; nunca se
regenera bajo la misma versión.

## PITR

PITR es una decisión crítica de incidente: un punto anterior puede eliminar
votos aceptados. Primero se restaura de forma aislada, se compara evidencia y se
obtiene autorización. No existe merge automático de historias de
`accepted_votes`; restore sobre producción no es rollback rutinario.

Backups de keys/secrets siguen una política cifrada y restringida independiente.
