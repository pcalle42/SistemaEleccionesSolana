# 17 — Devnet E2E Reproducible

## Propósito

Este documento define el entorno **local/devnet reproducible** de Votaciones.

Su objetivo es demostrar que todos los componentes construidos en `00`–`16` pueden ensamblarse desde un checkout limpio y completar un ciclo electoral realista sin pasos manuales ocultos.

El devnet debe permitir:

```text
checkout limpio
-> bootstrap
-> Docker
-> PostgreSQL + Valkey
-> migrations
-> ZK artifacts devnet
-> fixtures
-> admin login
-> crear/configurar elección
-> elegibilidad + snapshot
-> READY
-> OPEN
-> votar con proofs reales
-> CLOSED
-> integrity verification
-> COUNTING
-> tally
-> verification package
-> publish
-> RESULTS_PUBLISHED
-> offline verification
-> reset seguro
```

Regla central:

```text
si el sistema no puede reproducir una elección completa desde cero,
la integración todavía no está terminada.
```

---

# 1. Alcance

Esta etapa define:

- topología Docker local/devnet;
- comandos raíz;
- bootstrap;
- health/readiness;
- migrations;
- seeds;
- fixtures sintéticos;
- artifacts ZK devnet;
- configuración de admin;
- creación automática de elección de demostración;
- generación de credenciales ficticias;
- voter flow real;
- cierre;
- conteo;
- publicación;
- verification package;
- verifier offline;
- smoke tests;
- reset;
- protección contra destrucción accidental;
- diagnóstico;
- reproducibilidad.

No define infraestructura de producción.

---

# 2. Principios

El devnet debe ser:

```text
self-contained
repeatable
observable
disposable
safe to reset
close to real architecture
```

No debe esconder dependencias mediante servicios instalados manualmente en el host.

---

# 3. Docker como baseline

Según decisiones previas:

```text
local + devnet = Docker
```

El host necesita como mínimo:

```text
Docker / Docker Compose compatible
Git
```

El proyecto puede requerir `pnpm`/Node en host para desarrollo interactivo, pero el flujo canónico de devnet no debe depender de instalaciones globales ocultas.

---

# 4. Servicios

Topología conceptual:

```text
postgres
valkey
api
admin-web
voter-web
```

y jobs/comandos efímeros:

```text
migrate
seed
zk-build
devnet-bootstrap
e2e
verifier
```

No mantener containers permanentes para tareas batch si no aportan valor.

---

# 5. Servicios no autorizados

No añadir automáticamente:

```text
Redis
Keycloak
Kafka
RabbitMQ
MongoDB
Elasticsearch
Kubernetes
```

El devnet debe representar la arquitectura acordada, no inventar otra.

---

# 6. Compose project aislado

Usar un project name estable y específico, por ejemplo:

```text
votaciones-devnet
```

Los recursos deben quedar claramente etiquetados:

```text
containers
networks
volumes
```

No reutilizar volúmenes genéricos.

---

# 7. Volúmenes

Como mínimo:

```text
devnet-postgres-data
devnet-valkey-data (si se usa persistencia local)
devnet-artifacts (si corresponde)
```

El reset destructivo solo puede actuar sobre recursos con namespace/labels esperados.

---

# 8. Redes

Conceptualmente:

```text
public/dev network
private data network
```

En local puede simplificarse si Compose mantiene aislamiento suficiente.

PostgreSQL y Valkey no necesitan estar expuestos a todas las interfaces si el host no los usa directamente.

---

# 9. Puertos

Centralizar en `.env.example` o configuración devnet:

```text
API_PORT
ADMIN_WEB_PORT
VOTER_WEB_PORT
POSTGRES_PORT optional
VALKEY_PORT optional
```

Evitar números hardcoded dispersos.

---

# 10. Secrets devnet

Usar únicamente secretos explícitamente marcados:

```text
DEVNET ONLY
NOT FOR PRODUCTION
```

Pueden ser deterministas cuando mejore reproducibilidad.

Nunca reutilizarlos en producción.

---

# 11. Archivo de entorno

Proveer:

```text
.env.example
.env.devnet.example
```

o equivalente coherente con el repo.

El bootstrap puede crear `.env.devnet` local si no existe.

Nunca sobrescribir un archivo existente sin confirmación/flag explícito.

---

# 12. Guard de entorno

Todo comando destructivo debe comprobar:

```text
APP_ENV == devnet/test
compose project esperado
DB name esperado
resource labels esperados
```

Si cualquiera falla:

```text
abort
```

---

# Parte I — Comandos Canónicos

## 13. Scripts raíz

Objetivo:

```text
pnpm devnet:up
pnpm devnet:down
pnpm devnet:bootstrap
pnpm devnet:status
pnpm devnet:logs
pnpm devnet:smoke
pnpm devnet:e2e
pnpm devnet:verify
pnpm devnet:reset
```

Los nombres pueden ajustarse ligeramente a la convención final, pero debe existir una superficie simple y documentada.

---

## 14. devnet:up

Debe:

1. validar configuración;
2. crear networks/volumes;
3. levantar PostgreSQL;
4. levantar Valkey;
5. esperar health;
6. levantar API;
7. levantar frontends;
8. mostrar estado final.

No debe ejecutar seeds destructivos automáticamente en cada arranque.

---

## 15. devnet:bootstrap

Desde entorno vacío:

1. validar target;
2. levantar infra;
3. esperar readiness;
4. ejecutar migrations;
5. preparar ZK artifacts devnet;
6. verificar artifact digests;
7. crear admin devnet;
8. cargar fixtures sintéticos;
9. crear elección demo;
10. construir elegibilidad;
11. generar snapshot/root;
12. dejar elección en estado documentado;
13. ejecutar smoke checks.

Debe ser idempotente o fallar con explicación clara cuando ya existe estado incompatible.

---

## 16. Estado inicial recomendado

Después de bootstrap, la elección demo puede quedar:

```text
READY
```

Esto permite probar manualmente:

```text
OPEN -> vote -> CLOSE
```

sin que bootstrap consuma automáticamente el escenario.

Para E2E automático se crea su propia elección aislada.

---

## 17. devnet:status

Mostrar de forma concisa:

```text
service
health
port
version
```

y datos no sensibles:

```text
DB migration status
supported protocolVersion
ZK artifact status
demo election ID/status
```

No imprimir secrets.

---

## 18. devnet:logs

Agrupar logs de servicios con filtros opcionales.

Debe preservar redaction.

No habilitar un modo que imprima `voterSecret`/witness por comodidad.

---

## 19. devnet:smoke

Smoke tests rápidos:

```text
API health
API readiness
PostgreSQL connectivity
Valkey connectivity
admin-web serving
voter-web serving
protocol manifest available
verification artifacts readable
```

No sustituye E2E.

---

## 20. devnet:e2e

Ejecuta ciclo electoral aislado completo.

Debe devolver exit code != 0 ante cualquier invariancia rota.

---

## 21. devnet:verify

Ejecuta verifier independiente sobre el package generado por el último escenario E2E o sobre path explícito.

No consulta DB como fuente de verdad durante la verificación offline.

---

## 22. devnet:down

Detiene servicios.

Por defecto:

```text
preserve volumes
```

No equivale a reset.

---

## 23. devnet:reset

Destructivo únicamente para devnet.

Debe:

1. validar guard;
2. mostrar/registrar recursos objetivo;
3. detener containers;
4. eliminar únicamente volumes/networks devnet autorizados;
5. limpiar artifacts temporales devnet autorizados;
6. preservar source code;
7. no tocar `.env` arbitrariamente.

Requerir:

```text
--force
```

en ejecución no interactiva.

---

# Parte II — Health y Readiness

## 24. PostgreSQL

Health real:

```text
pg_isready
```

Readiness de API no debe pasar si migrations requeridas faltan.

---

## 25. Valkey

Health:

```text
PING
```

Pero caída de Valkey no debe reinterpretarse como pérdida de estado electoral.

---

## 26. API liveness

Endpoint conceptual:

```text
GET /health/live
```

Solo confirma proceso vivo.

---

## 27. API readiness

Endpoint conceptual:

```text
GET /health/ready
```

Comprueba dependencias críticas:

```text
PostgreSQL
migration/schema compatibility
required protocol/artifact registry
```

Valkey puede ser critical/degraded según feature; documentar.

---

## 28. Frontend health

Comprobar que el servidor entrega app shell.

No afirmar que todo el sistema está listo solo porque HTML responde.

---

# Parte III — Migrations

## 29. Migración canónica

Usar Drizzle según decisión vigente.

Comando:

```text
pnpm db:migrate
```

o equivalente.

No usar schema auto-sync destructivo.

---

## 30. Migration job

En devnet puede ejecutarse como job/container efímero.

Debe usar credenciales apropiadas de migración.

No mantener API runtime con permisos de schema owner por conveniencia.

---

## 31. Estado de migraciones

`devnet:status` debe poder indicar:

```text
up to date
pending
incompatible
```

sin exponer credenciales.

---

# Parte IV — ZK Devnet

## 32. Toolchain

Todo ZK local/devnet debe poder ejecutarse en Docker o entorno reproducible pinneado:

```text
Circom 2.x
snarkjs
circomlib/circomlibjs
```

---

## 33. Artifacts

Generar/usar:

```text
.r1cs
.wasm
.zkey
verification_key.json
protocol manifest
digests
```

según etapa 10.

---

## 34. Setup devnet

La ceremony/setup devnet es:

```text
INSECURE FOR PRODUCTION
```

Debe estar etiquetada claramente.

Nunca copiar automáticamente zkey devnet a configuración productiva.

---

## 35. Rebuild

Comando conceptual:

```text
pnpm zk:devnet:build
```

Debe ser reproducible en cuanto a versiones y verificar digests/manifest esperados.

Si algún artifact no es bit-reproducible por naturaleza del setup, documentar exactamente la fuente y digest aprobados.

---

## 36. Artifact registry

Después de build:

```text
protocolVersion
circuitVersion
artifact paths
digests
verification key
```

se registran en configuración devnet confiable.

API nunca acepta paths/keys desde request.

---

# Parte V — Fixtures

## 37. Datos sintéticos

Crear únicamente identidades ficticias.

Ejemplo conceptual:

```text
DEV-VOTER-001
DEV-VOTER-002
...
```

No nombres/documentos reales.

---

## 38. Tamaño

Seed base pequeño:

```text
5–20 voters
3–5 options
```

suficiente para desarrollo.

Escenarios de performance generan datasets separados.

---

## 39. Determinismo

Cuando sea útil, fixtures usan:

```text
fixed IDs
fixed election config
fixed voter test secrets
fixed expected commitments
```

Todos marcados `TEST/DEVNET ONLY`.

---

## 40. Voter secrets de fixture

Pueden existir en fixture de test para automatización.

No se cargan en DB de aplicación como `voterSecret`.

El runner E2E los usa del lado cliente/test.

---

## 41. Fixture manifest

Mantener:

```text
fixtures/devnet/manifest.json
```

con versiones y expected values relevantes.

No incluir secretos productivos.

---

# Parte VI — Elección Demo

## 42. Configuración

Crear una elección sintética estable:

```text
title: Devnet Election
method: SINGLE_CHOICE
protocol: anonymous-single-choice-v1
```

Opciones ficticias y sin significado político real.

---

## 43. Ventana

No usar fechas históricas hardcoded que expiren.

El bootstrap debe crear ventana relativa/controlada apropiada para devnet.

Para tests deterministas, usar clock/config del escenario.

---

## 44. Eligibility

Pipeline:

```text
synthetic voters
-> credentials/commitments
-> eligibility records
-> deterministic leaf order
-> Merkle tree
-> FROZEN snapshot
-> root
```

---

## 45. Root assertion

Comparar root producida contra cálculo independiente/helper/test vector cuando el fixture sea determinista.

---

## 46. READY

Antes de READY comprobar:

```text
configuration valid
eligibility snapshot frozen
protocol compatible
artifacts available
manifest generated
```

---

# Parte VII — E2E Automático

## 47. Aislamiento

Cada ejecución E2E crea:

```text
unique election ID
isolated fixtures
```

No reutiliza la elección demo manual.

---

## 48. Flujo completo

Escenario obligatorio:

```text
create
configure
eligibility
freeze
READY
OPEN
cast N valid votes
retry one accepted vote
attempt conflicting duplicate
attempt invalid proof
CLOSE
attempt late vote
integrity check
COUNTING
tally
verification package
offline verify
publish
verify public result
verify receipt inclusion
```

---

## 49. Proofs reales

Cada voto E2E usa:

```text
real witness
real Groth16 proof
real snarkjs verification
```

No mock.

---

## 50. Voto por frontend

Al menos un votante del escenario debe recorrer `voter-web` en navegador real:

```text
load manifest
select option
worker proof generation
CastVote
receipt
```

Los demás pueden usar helpers de protocolo para acelerar suite.

---

## 51. Admin frontend

Al menos un escenario recorre operaciones administrativas clave mediante `admin-web`.

El resto puede usar API para velocidad.

---

## 52. Expected tally

El runner conoce únicamente las selecciones sintéticas que emitió.

Después de conteo:

```text
actual tally == expected tally
```

Además ejecuta verifier independiente.

---

## 53. Duplicate retry

Enviar el mismo voto lógico tras respuesta perdida/simulada.

Esperado:

```text
same logical receipt
one accepted row
```

---

## 54. Conflicting duplicate

Mismo nullifier con opción diferente:

```text
reject
```

No modificar voto anterior.

---

## 55. Invalid proof

Alterar proof/public signal.

Esperado:

```text
reject
no accepted row
```

---

## 56. Late vote

Después de CLOSED o exactamente fuera de ventana:

```text
reject
```

---

# Parte VIII — Verification Package

## 57. Generación

El E2E debe generar package con la estructura definida en etapas 12/13.

Incluir solo datos autorizados.

---

## 58. Verifier independiente

Ejecutar en proceso/container separado.

No usar:

```text
application DB
admin API
internal service state
```

como autoridad.

Inputs:

```text
verification package
trusted verifier code
```

---

## 59. Exit codes

Convención:

```text
0 = verified
non-zero = verification failure/tool failure
```

Distinguir errores de integridad de errores de ejecución cuando sea útil.

---

## 60. Tamper smoke

Como parte de suite extendida:

1. copiar package;
2. alterar un artifact/record;
3. ejecutar verifier;
4. exigir fallo.

---

# Parte IX — Reproducibilidad

## 61. Clean checkout test

En CI o procedimiento reproducible:

```text
git checkout
Docker available
copy/create devnet env
pnpm devnet:bootstrap
pnpm devnet:e2e
pnpm devnet:verify
```

Debe completar sin edición manual.

---

## 62. No hidden host dependencies

Documentar y detectar dependencias necesarias.

No depender accidentalmente de:

```text
host PostgreSQL
host Valkey
globally installed Circom
globally installed snarkjs
previous node_modules
previous Docker volume
```

---

## 63. Clean volumes

El test de reproducibilidad debe ejecutarse con volumes nuevos.

No aceptar éxito que dependa de DB anterior.

---

## 64. Second run

Probar comportamiento de:

```text
bootstrap twice
up twice
down twice
```

Debe ser idempotente o devolver mensaje controlado.

---

## 65. Timezone

Containers deben usar una política temporal explícita.

Persistencia electoral en UTC.

No depender de timezone del host para digests o reglas.

---

## 66. Locale

Canonicalization no depende de locale del host.

Sorting criptográfico usa reglas explícitas, no `localeCompare()` implícito.

---

# Parte X — Reset Seguro

## 67. Threat

`reset` es un comando peligroso.

Un bug podría borrar DB/volumes equivocados.

---

## 68. Preconditions

Antes de borrar:

```text
APP_ENV == devnet
DB name matches devnet allowlist
compose project matches
volume labels match
working directory/repo marker matches
```

---

## 69. Production refusal

Si detecta:

```text
production
staging
unknown
```

debe abortar incluso con `--force`.

`--force` solo evita confirmación interactiva; no salta guards.

---

## 70. Database reset

Preferir eliminar/recrear volumen devnet completo en lugar de SQL genérico apuntando a host desconocido.

---

## 71. Artifacts

Solo borrar artifacts generados en directorios explícitos:

```text
.tmp/devnet
artifacts/devnet/generated
```

Nunca borrar artifacts productivos/versionados.

---

# Parte XI — Observabilidad Devnet

## 72. Logs

Logs estructurados suficientes para debugging.

No incluir secretos.

---

## 73. Correlation

Puede usarse request ID por operación.

No correlacionar activation identificada con anonymous CastVote mediante ID compartido.

---

## 74. Metrics

Devnet puede exponer métricas mínimas si ya existe soporte.

No introducir stack completo de observabilidad solo para esta etapa.

---

## 75. Debug endpoints

No crear endpoints que permitan:

```text
dump DB
dump secrets
skip proof verification
force election state
consume nullifier manually
```

Los helpers de test viven fuera de la API productiva o están compilados/configurados de forma inequívocamente no productiva.

---

# Parte XII — Fallos y Recuperación

## 76. API restart

Durante elección devnet:

```text
restart api
```

y continuar.

Estado electoral permanece.

---

## 77. Valkey restart

```text
restart/flush valkey
```

No pierde:

```text
election
accepted votes
nullifier authority
results
```

---

## 78. Frontend restart

No altera estado backend.

Credenciales locales de test se reimportan si es necesario.

---

## 79. PostgreSQL restart

Después de commit, voto persiste.

El API debe recuperar readiness.

---

## 80. Verifier failure

Si artifacts faltan/corruptos:

```text
readiness/dependent operation fails closed
```

No desactivar verificación.

---

# Parte XIII — Make/Task Runner

## 81. Una superficie principal

Preferir scripts `pnpm` como interfaz canónica del repo.

Puede existir Makefile/task runner como wrapper, pero no duplicar lógica.

La lógica compleja debe residir en scripts TypeScript/shell mantenibles.

---

## 82. Cross-platform

Docker reduce diferencias de host.

Scripts shell críticos deben considerar compatibilidad del entorno objetivo o ejecutarse dentro de container.

No asumir utilidades GNU no documentadas.

---

# Parte XIV — Directorios

## 83. Estructura sugerida

```text
infra/
├── docker/
│   └── devnet/
│       ├── compose.yml
│       ├── api/
│       ├── postgres/
│       └── valkey/
└── scripts/

scripts/
├── devnet/
│   ├── bootstrap.ts
│   ├── status.ts
│   ├── reset.ts
│   └── verify-target.ts
└── e2e/

fixtures/
└── devnet/

artifacts/
└── devnet/

tests/
└── e2e/
```

Adaptar a estructura real sin duplicar carpetas existentes.

---

# Parte XV — Seguridad

## 84. Devnet banners

UI/logs pueden mostrar:

```text
DEVNET
NOT FOR REAL ELECTIONS
```

para evitar confusión.

---

## 85. Unsafe ZK artifacts

Manifest devnet debe marcar:

```text
environment = devnet
productionSafe = false
```

o mecanismo equivalente.

Producción debe rechazar artifacts marcados devnet.

---

## 86. Default admin

Si devnet usa credencial conocida, debe:

- estar documentada como devnet;
- no ser aceptable en producción;
- existir guard que impida iniciar producción con ella.

---

## 87. CORS/TLS differences

Documentar diferencias:

```text
devnet may use HTTP
production requires HTTPS
```

No desactivar otras defensas innecesariamente.

CSRF/CORS/state validation deben probarse también en devnet.

---

# Parte XVI — CI

## 88. Devnet smoke CI

CI puede ejecutar:

```text
devnet bootstrap
smoke
core E2E
verify
down
```

en job dedicado.

---

## 89. Clean-room job

Al menos en main/release:

```text
fresh runner
no cached volumes
full bootstrap
full election
offline verify
```

---

## 90. Caching CI

Puede cachearse:

```text
pnpm store
Docker layers
immutable ZK artifacts verified by digest
```

No cachear DB state como requisito para éxito.

---

## 91. Failure artifacts

Conservar sanitizados:

```text
service logs
test reports
browser screenshots/traces
verification package fixture
compose status
```

No voterSecret/witness real fuera de fixtures públicos de test.

---

# Parte XVII — Troubleshooting

## 92. Diagnóstico

README devnet debe cubrir:

```text
port conflict
Docker unavailable
PostgreSQL unhealthy
pending migration
Valkey unavailable
artifact digest mismatch
WASM/zkey missing
browser proof failure
stale volumes
reset refusal
```

---

## 93. No magic repair

No crear script que automáticamente:

```text
drops DB
regenerates ZK keys
changes election state
deletes votes
```

ante cualquier error.

Diagnóstico primero; acciones destructivas explícitas.

---

# Parte XVIII — Performance Devnet

## 94. Baseline

Registrar opcionalmente:

```text
bootstrap duration
proof generation time
verification time
full E2E duration
```

para detectar regresiones.

No convertir laptop devnet en SLO productivo.

---

## 95. Fast profile

Puede existir:

```text
devnet:e2e:fast
```

con pocos votantes.

No puede mockear proof verification.

---

## 96. Extended profile

Puede existir:

```text
devnet:e2e:full
```

con:

- más votantes;
- races;
- tamper;
- restart scenarios.

---

# Parte XIX — Manifest de Ejecución

## 97. Run manifest

Cada E2E puede producir:

```text
DevnetRunManifestV1
```

con:

```text
runId
git commit
container image identifiers
protocolVersion
circuitVersion
artifact digests
electionId
fixture version
startedAt
finishedAt
verification result
```

No incluir secretos.

---

## 98. Utilidad

Permite responder:

```text
qué código
qué artifacts
qué protocolo
qué fixture
qué resultado
```

produjo una ejecución.

No es evidencia productiva firmada.

---

# Parte XX — Criterios de Aceptación

## 99. La etapa se aprueba cuando

- un checkout limpio levanta devnet;
- no requiere PostgreSQL/Valkey/Circom global;
- migrations se ejecutan;
- ZK artifacts devnet están verificados;
- fixtures son sintéticos;
- demo election llega a READY;
- E2E crea elección aislada;
- proofs son reales;
- al menos un voto usa navegador real;
- retry idempotente funciona;
- conflicting duplicate falla;
- invalid proof falla;
- late vote falla;
- tally coincide;
- verification package se genera;
- verifier offline pasa;
- tamper básico falla;
- API/Valkey/PostgreSQL restart se comportan según diseño;
- reset no puede apuntar a producción;
- segunda ejecución es controlada;
- CI puede ejecutar clean-room.

---

# Parte XXI — Definition of Done

## 100. Checklist

```text
[ ] compose devnet
[ ] isolated project name
[ ] isolated volumes
[ ] environment guards
[ ] .env devnet example
[ ] devnet:up
[ ] devnet:down
[ ] devnet:bootstrap
[ ] devnet:status
[ ] devnet:logs
[ ] devnet:smoke
[ ] devnet:e2e
[ ] devnet:verify
[ ] devnet:reset
[ ] PostgreSQL health
[ ] Valkey health
[ ] API liveness/readiness
[ ] frontend health
[ ] Drizzle migrations job
[ ] migration status
[ ] Dockerized/pinned ZK toolchain
[ ] devnet ZK setup marked unsafe
[ ] artifact registry/digests
[ ] synthetic fixtures
[ ] deterministic commitments/root where applicable
[ ] demo election
[ ] READY bootstrap state
[ ] isolated E2E election
[ ] real proofs
[ ] browser voter path
[ ] admin path
[ ] duplicate retry
[ ] conflicting duplicate
[ ] invalid proof
[ ] late vote
[ ] integrity check
[ ] tally assertion
[ ] verification package
[ ] offline verifier
[ ] tamper smoke
[ ] API restart test
[ ] Valkey restart/flush test
[ ] PostgreSQL restart test
[ ] safe reset guards
[ ] production refusal
[ ] devnet banners
[ ] no debug bypass endpoints
[ ] clean checkout run
[ ] clean volumes run
[ ] second-run behavior
[ ] CI clean-room job
[ ] sanitized failure artifacts
[ ] troubleshooting guide
[ ] run manifest
```

---

# Parte XXII — Prohibiciones

## 101. Codex no debe

- depender de PostgreSQL instalado en host;
- depender de Valkey instalado en host;
- depender de Circom global no pinneado;
- reutilizar DB productiva;
- usar nombres de DB ambiguos;
- ejecutar reset sin guards;
- permitir que `--force` salte guard de producción;
- usar PII real;
- almacenar voterSecret en DB para facilitar E2E;
- mockear proofs en el E2E canónico;
- desactivar verification en modo devnet;
- crear endpoint debug para aceptar votos sin proof;
- crear endpoint debug para cambiar estado arbitrariamente;
- regenerar artifacts productivos desde devnet;
- considerar artifacts devnet aptos para producción;
- sembrar resultados directamente;
- introducir votos directamente en DB en el happy path;
- depender de volumes previos;
- usar Valkey como autoridad;
- ocultar fallos con retries infinitos;
- borrar artifacts fuera de directorios devnet;
- imprimir secrets en status/logs;
- convertir devnet en arquitectura distinta a producción sin documentarlo.

---

# Parte XXIII — Orden para Codex

## 102. Implementación

1. Leer `00`–`16`.
2. Inspeccionar Compose/scripts existentes.
3. Definir namespace devnet.
4. Crear guards.
5. Consolidar Compose.
6. PostgreSQL/Valkey health.
7. API/frontend services.
8. Migration job.
9. ZK build/setup job.
10. Artifact verification/registry.
11. Fixtures sintéticos.
12. Bootstrap admin.
13. Bootstrap demo election.
14. Eligibility snapshot.
15. READY state.
16. `devnet:status`.
17. smoke suite.
18. isolated E2E election.
19. real proof generation.
20. browser voter path.
21. admin path.
22. duplicate/retry/invalid/late scenarios.
23. close/integrity/count.
24. package generation.
25. offline verifier.
26. tamper smoke.
27. restart scenarios.
28. safe reset.
29. second-run/idempotency.
30. clean-room CI.
31. troubleshooting.
32. run manifest.
33. ejecutar desde checkout limpio.

---

# Parte XXIV — Siguiente Documento

## 103. Documento siguiente

```text
18-ci-cd-calidad-release.md
```

Debe definir:

- pipeline de PR;
- pipeline main;
- release candidate;
- build reproducible;
- container images;
- artifact digests;
- ZK artifact handling;
- migrations;
- security gates;
- provenance;
- versioning;
- release manifests;
- rollback;
- promoción entre ambientes;
- separación estricta entre devnet y producción.

---

# Parte XXV — Instrucción Final

## 104. Regla de cierre

La evidencia mínima de esta etapa es poder ejecutar conceptualmente:

```text
pnpm devnet:reset --force
pnpm devnet:bootstrap
pnpm devnet:e2e
pnpm devnet:verify
```

y obtener:

```text
clean environment
+
real protocol artifacts
+
real anonymous proofs
+
atomic accepted votes
+
deterministic tally
+
verifiable publication package
+
successful independent verification
```

sin modificar manualmente PostgreSQL, sin desactivar seguridad y sin depender de estado previo.

Cuando esto funcione desde un checkout limpio, el sistema tendrá una base reproducible adecuada para avanzar hacia CI/CD y preparación productiva.
