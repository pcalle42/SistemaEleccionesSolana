# Persistencia PostgreSQL

La API usa Drizzle ORM con el driver `pg`. PostgreSQL es la fuente de verdad y
Valkey no participa en esta capa.

## Organización

- `config/`: carga de entorno y validación de URLs, pool y timeouts;
- `schema/`: un módulo por contexto y sin tablas electorales prematuras;
- `seeds/`: registro explícito de seeds reproducibles;
- `client.ts` y `pool.ts`: integración central de Drizzle y node-postgres;
- `transaction.ts`: contexto transaccional compartible;
- `health.ts`: readiness mediante `SELECT 1`;
- `cli.ts`: migración, estado, seed y health sin imprimir credenciales.

Los repositories semánticos se añadirán junto a las entidades de dominio. No se
introduce un CRUD genérico ni queries electorales antes de definir el modelo.

## Credenciales

Las plantillas `infra/<perfil>/.env.example` separan:

- `DATABASE_MIGRATION_URL`: rol administrador con DDL;
- `DATABASE_URL`: rol runtime no-superuser con DML sobre schemas migrados;
- `TEST_DATABASE_MIGRATION_URL` y `TEST_DATABASE_URL`: base separada de tests.

Los `.env` reales no se versionan. Producción debe suministrar secretos y roles
propios; las credenciales de ejemplo son solo para local/devnet.

La migración bootstrap concede únicamente acceso a los schemas. Cada migración
de tabla futura deberá otorgar al runtime solo las operaciones DML que ese flujo
necesite; no existen privilegios DML genéricos por defecto.

## Comandos

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm db:seed
pnpm db:health
pnpm test:integration
```

`db:generate` produce SQL revisable; no sincroniza automáticamente la base.
`db:migrate` nunca ejecuta seeds. Las pruebas de integración migran la base de
test y comprueban conexión, escritura/lectura Drizzle, commit, rollback y los
privilegios limitados del rol runtime contra PostgreSQL real.

## Operaciones destructivas y recuperación

```bash
pnpm db:reset -- --force
pnpm db:backup
pnpm db:restore -- --force infra/postgres/backups/<archivo>.dump
```

`db:reset` opera únicamente en el perfil local configurado, reemplaza su base y
reaplica migraciones. Backup y restore operan por defecto en devnet. Restore
valida el archivo custom antes de reemplazar la base y termina con un smoke check
usando el rol runtime.
