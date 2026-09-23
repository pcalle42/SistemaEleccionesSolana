# 04 — PostgreSQL y Modelo de Persistencia
## Propósito y decisiones
Este documento define la persistencia PostgreSQL de **Votaciones** y complementa `00-consolidado-arquitectura.md`, `01-plan-maestro-construccion.md`, `02-bootstrap-repositorio.md` y `03-infraestructura-local-devnet.md`.

Se utilizará **PostgreSQL + Drizzle ORM + node-postgres (`pg`) + drizzle-kit**. PostgreSQL será la fuente de verdad persistente; Valkey nunca sustituirá el estado electoral crítico. No se mezclarán Prisma, TypeORM, Sequelize u otros ORM.

La elección de Drizzle busca mantener SQL, constraints y transacciones de PostgreSQL visibles, con tipado TypeScript y migraciones revisables.

## Principios de persistencia
Las invariantes críticas deben protegerse mediante defensa en profundidad: validación de aplicación, invariantes de dominio y constraints de base cuando corresponda.

Debe existir separación conceptual entre administración/autenticación, identidad/elegibilidad, configuración electoral, material de votación, auditoría y resultados.

Queda prohibido modelar un voto como una relación directa entre identidad real y selección electoral, por ejemplo `vote(voter_id, candidate_id)` cuando `voter_id` identifica directamente a la persona.

PostgreSQL debe usar identificadores opacos. Se prefieren UUID seguros para entidades de aplicación. Nullifiers, commitments, hashes y otros identificadores criptográficos tendrán tipos, encoding, longitud y constraints propios definidos por el protocolo.

Los instantes se persistirán preferentemente como `timestamptz` y se manejarán internamente en UTC. No deben añadirse timestamps de alta precisión al material de votación sin evaluar su riesgo de correlación.

## Organización
La integración vive en `apps/api/src/database/`, con módulos, configuración, schemas, repositories y utilidades transaccionales. Las migraciones se mantendrán en una ubicación estable como `apps/api/drizzle/`.

Las definiciones Drizzle se separarán por contexto (`admin`, `election`, `eligibility`, `voting`, `result`, `audit`) y no en un archivo monolítico.

Se recomienda evaluar schemas PostgreSQL separados como `app`, `identity`, `election`, `voting` y `audit`; la lista definitiva se cerrará con el dominio. `public` no debe convertirse indiscriminadamente en contenedor de todo el modelo.

## Convenciones SQL e integridad
Tablas y columnas usarán `snake_case`. Índices: `idx_<table>_<columns>`; uniques: `uq_<table>_<columns>`; foreign keys: `fk_<table>_<referenced_table>`; checks: `chk_<table>_<meaning>`.

Las columnas serán `NOT NULL` salvo que la ausencia tenga significado real de dominio. Defaults solo para valores inequívocos. Las relaciones importantes utilizarán foreign keys y las políticas `ON DELETE`/`ON UPDATE` serán explícitas; no usar `CASCADE` indiscriminadamente.

PostgreSQL reforzará invariantes con `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE`, `NOT NULL`, `CHECK` y, si fueran necesarias, exclusion constraints. La prevención de duplicados, especialmente nullifiers, deberá apoyarse en unicidad de base y no solo en una consulta previa.

No se implementará soft-delete genérico. Datos electorales importantes no se eliminarán físicamente como operación administrativa normal salvo política explícita.

## Transacciones y concurrencia
Operaciones críticas multi-paso usarán transacciones explícitas. La capa de persistencia debe permitir compartir un contexto `tx` entre repositories.

No realizar dentro de transacciones llamadas HTTP externas, generación costosa de proofs, esperas interactivas u operaciones largas de filesystem.

No asumir que el isolation level por defecto elimina carreras. Cada flujo crítico analizará constraints, locks, retries y aislamiento. Se prefieren operaciones atómicas y constraints antes que locks manuales.

Valkey no debe utilizarse como distributed lock para sustituir una constraint PostgreSQL capaz de garantizar correctamente una invariante.

Las invariantes sensibles a concurrencia se probarán con conexiones PostgreSQL reales; el voto duplicado tendrá pruebas concurrentes en la etapa 11.

## Repositories y SQL
La lógica de dominio no dependerá de queries Drizzle dispersas. Se usarán repositories/adapters con operaciones semánticas, no un `BaseRepository<T>` CRUD universal.

Ejemplos conceptuales: `findElectionForUpdate`, `saveElectionStateTransition`, `consumeNullifier`.

SQL explícito está permitido cuando PostgreSQL exprese mejor una operación crítica. Siempre será parametrizado, encapsulado y testeado. Nunca se concatenará input del usuario en SQL.

## Conexiones y privilegios
Se utilizará el pool de `pg` con configuración central validada. La API aceptará `DATABASE_URL` y podrá incorporar límites de pool/timeouts cuando sean necesarios.

La API no se conectará normalmente como superuser. Diseño objetivo: un rol de migración/administración con DDL y un rol runtime con el DML mínimo necesario. Producción separará estas credenciales estrictamente.

Las credenciales de migración no se usarán para requests normales de la API.

## Migraciones
Toda modificación de esquema se realizará mediante migración versionada. Queda prohibida la sincronización automática del esquema como fuente de verdad.

Drizzle puede generar migraciones, pero **toda migración generada debe revisarse** antes de aplicarse. Las migraciones SQL se versionarán en Git.

Migraciones destructivas deberán documentar pérdida potencial y estrategia de recuperación. No se exige `down` automático para toda migración; se priorizan forward fixes, backup/restore y procedimientos explícitos.

Comandos requeridos:
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:status`
- `pnpm db:seed`
- `pnpm db:backup`
- `pnpm db:restore`
- `pnpm db:reset` solo si queda protegido contra producción.

`db:migrate` no ejecutará seeds implícitamente. `db:reset` verificará explícitamente `local` o `devnet`, y requerirá confirmación o `--force`.

## Seeds, fixtures y tests
Seeds son estado inicial reproducible de devnet; fixtures son datos controlados para pruebas. No se usarán datos personales reales.

Los tests de persistencia se ejecutarán contra **PostgreSQL real**, nunca SQLite. Debe existir una base o entorno de test separado y aislamiento mediante rollback, schema/database por suite, truncate controlado o contenedores dedicados.

Debe haber tests explícitos para constraints críticas y pruebas concurrentes reales donde existan carreras.

Smoke test mínimo: conexión, query simple, commit, rollback y estado de migraciones. Integration test mínimo: escribir mediante Drizzle, leer, forzar rollback y comprobar que el dato no persistió.

## Health, errores y logging
La API comprobará PostgreSQL con una operación liviana como `SELECT 1`. Si la DB es indispensable y no está disponible, la API no reportará readiness.

Errores internos de PostgreSQL no se devolverán directamente al cliente. Violaciones unique/FK/check y errores de serialización/deadlock se mapearán a errores seguros de aplicación.

No se habilitará logging indiscriminado de queries si puede revelar datos sensibles. Nunca registrar passwords, tokens, secretos, witnesses privados ni información que permita relacionar identidad con selección electoral.

## Backup y restore devnet
Se usarán herramientas estándar PostgreSQL, preferentemente `pg_dump`/`pg_restore`; el formato custom (`pg_dump -Fc`) es apropiado cuando facilite restauración.

Los backups no se versionarán ni se tratarán como fixtures. `db:backup` verificará entorno y generará un archivo fuera de Git. `db:restore` validará archivo, confirmará operación destructiva, restaurará y ejecutará smoke checks.

Prueba obligatoria: migrar → insertar dato de prueba → backup → reset → preparar base → restore → verificar dato.

Un backup no se considera válido hasta comprobar su restauración.

## Consideraciones para ZK y voto
No se decidirá todavía persistir íntegramente proofs o witnesses. Las etapas 10/11 definirán qué se verifica y conserva. Debe evitarse almacenar material criptográfico innecesario.

La persistencia debe permitir unicidad de nullifiers dentro del dominio correcto; la clave final puede incluir election ID, nullifier y versión de protocolo.

Todo artefacto criptográfico electoral debe quedar ligado al contexto de elección correcto. El esquema debe poder identificar la versión relevante de protocolo/circuito cuando sea necesario verificar datos históricos.

Votos aceptados, auditoría y resultados finales se tratarán como inmutables o append-only cuando el dominio lo defina. No tendrán CRUD genérico.

## Decisiones PostgreSQL adicionales
No habilitar extensiones sin necesidad. Antes de añadir `uuid-ossp` o `pgcrypto`, comprobar capacidades nativas de la versión seleccionada.

`jsonb` se permite para datos genuinamente flexibles, no para evitar modelar entidades importantes. Los enums PostgreSQL se evaluarán con cuidado; estados definitivos se decidirán en la etapa 08.

Triggers y stored procedures no serán la primera opción para lógica de dominio. Si se usan, deberán versionarse, documentarse y probarse.

RLS no es obligatorio en esta etapa y multi-tenancy genérico queda fuera de alcance. Las elecciones son entidades del dominio, no tenants de infraestructura.

Queries paginadas tendrán orden determinista. Se evitarán N+1 evidentes sin caer en optimización prematura.

## Orden de implementación para Codex
1. Instalar Drizzle ORM, drizzle-kit y `pg`.
2. Crear módulo/capa `database`.
3. Crear configuración validada y pool.
4. Integrar Drizzle.
5. Definir estructura de schemas.
6. Configurar drizzle-kit.
7. Crear migración técnica inicial mínima.
8. Crear comandos `db:*`.
9. Preparar rol runtime no-superuser en devnet.
10. Crear smoke/integration tests reales.
11. Implementar health DB.
12. Implementar backup/restore devnet.
13. Probar desde base vacía.
14. Probar migración repetida.
15. Probar reset y nueva migración.
16. Probar backup/restore.
17. Documentar.

La migración inicial no debe inventar tablas electorales. Puede crear schemas/objetos técnicos estrictamente necesarios.

## Criterios de aceptación
La etapa se aprueba cuando:

- Drizzle + `pg` están integrados;
- configuración DB está validada;
- runtime no usa superuser normalmente;
- migraciones están versionadas y revisables;
- DB vacía puede migrarse;
- ejecutar migraciones otra vez es seguro;
- commit y rollback están probados;
- tests usan PostgreSQL real;
- SQL raw, si existe, está parametrizado;
- health DB funciona;
- backup y restore devnet están probados;
- logs no exponen secretos;
- no se ha inventado el modelo electoral definitivo.

## Definition of Done
```text
[ ] Drizzle ORM instalado
[ ] drizzle-kit configurado
[ ] pg instalado
[ ] pool central configurado
[ ] DATABASE_URL validada
[ ] rol runtime no-superuser preparado
[ ] estructura schema creada
[ ] migraciones versionadas
[ ] pnpm db:generate funciona
[ ] pnpm db:migrate funciona
[ ] pnpm db:status funciona
[ ] migración limpia pasa
[ ] migración repetida pasa
[ ] commit probado
[ ] rollback probado
[ ] integration tests usan PostgreSQL real
[ ] health DB funciona
[ ] backup devnet probado
[ ] restore devnet probado
[ ] logs no exponen DATABASE_URL
[ ] documentación actualizada
```

## Prohibiciones
Codex no debe:

- añadir otro ORM;
- utilizar SQLite para tests;
- usar superuser como runtime normal;
- habilitar schema synchronization automática;
- crear tablas electorales no especificadas;
- relacionar identidad con selección electoral;
- persistir proofs/witnesses sin diseño previo;
- introducir triggers complejos sin autorización;
- añadir extensiones PostgreSQL innecesarias;
- ejecutar migraciones destructivas implícitas al arrancar la API.

## Decisiones diferidas
Quedan para documentos posteriores:

- tablas electorales definitivas;
- estados y transiciones;
- elegibilidad;
- estructura exacta de nullifiers;
- persistencia de proofs;
- resultados;
- auditoría final;
- retención;
- RLS;
- cifrado productivo;
- réplicas/HA;
- tuning productivo.

El siguiente documento rector será `05-valkey-cache-coordinacion.md`.
