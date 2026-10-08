# PostgreSQL

PostgreSQL 17.11 es la persistencia principal de local/devnet. El volumen se
monta en `/var/lib/postgresql/data`, ubicación soportada por la imagen oficial
para PostgreSQL 17.

`init/` crea únicamente el rol runtime sin privilegios y la base separada de
tests cuando se inicializa un volumen vacío. Los schemas se crean exclusivamente
mediante migraciones versionadas en `apps/api/drizzle/`.

`backups/` contiene archivos custom de `pg_dump` y está ignorado por Git. Use
`pnpm db:backup` y `pnpm db:restore -- --force <archivo>`; un dump solo se
considera válido después de restaurarlo y verificar sus datos.

Producción mantiene PostgreSQL en red privada, separa credenciales migration/runtime mediante secret
management y exige TLS si la conexión cruza un boundary no confiable. Antes de abrir una elección se
documentan RPO/RTO, retención, cifrado/ACL del backup y la evidencia de un restore drill. WAL/PITR se
decide con esos requisitos; no se presume configurado por los entornos locales.
