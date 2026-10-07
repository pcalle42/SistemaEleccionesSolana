# 13 — Conteo, Resultados y Publicación

## Propósito

Define el cierre del ciclo electoral de **Votaciones** después de la aceptación anónima de votos descrita en `11` y apoyándose en la verificabilidad definida en `12`.

Esta etapa fija:

```text
CLOSED
  -> freeze accepted vote set
  -> COUNTING
  -> deterministic tally
  -> verification package
  -> publication validation
  -> RESULTS_PUBLISHED
```

El objetivo es que los resultados publicados sean una función determinista y reproducible del conjunto final de votos aceptados.

Para `SINGLE_CHOICE` V1:

```text
resultado = aggregate(final accepted votes grouped by frozen option encoding)
```

No existe una segunda fuente de votos para el conteo.

## 1. Principio rector

El conteo no decide qué votos son válidos. Esa decisión ya ocurrió atómicamente en `CastVote`.

Consume únicamente `accepted_votes` committed de la elección, configuración y protocolo correctos. Nunca reinterpreta requests rechazados, logs, caches ni eventos de red.

## 2. Estados

```text
CLOSED -> COUNTING -> RESULTS_PUBLISHED
```

No permitir `OPEN -> RESULTS_PUBLISHED`, `DRAFT/READY -> COUNTING` ni `CANCELLED -> RESULTS_PUBLISHED`.

## 3. CLOSED

Una elección CLOSED:
- no acepta nuevos votos;
- conserva configuración, snapshot/root y protocolo congelados;
- conserva todos los `accepted_votes` committed antes del cierre válido.

No borrar ni modificar votos al cerrar.

## 4. AcceptedVoteSetSnapshot

Antes de contar crear:

```text
AcceptedVoteSetSnapshot
- id
- electionId
- configurationVersion
- protocolVersion
- snapshotVersion
- recordCount
- canonicalDigest
- createdAt
```

Representa exactamente el conjunto final de votos aceptados y, una vez fijado, no se modifica.

Un retry recupera el mismo snapshot lógico. No generar silenciosamente otro digest para la misma versión.

## 5. Fuente y filtro

Seleccionar únicamente `accepted_votes` que coincidan exactamente con:

```text
electionId
configurationVersion
protocolVersion
circuitVersion esperado
```

El orden de DB no forma parte del protocolo.

## 6. Orden canónico

Para export/digest ordenar por la representación canónica de `nullifier` o por la clave pública fijada en `PublicAcceptedVoteV1`.

No ordenar por `acceptedAt`, `VoteId` ni orden de inserción.

## 7. PublicAcceptedVoteV1

Cada voto contado se proyecta a la representación pública canónica definida en etapa 12:

```text
protocolVersion
electionContext
merkleRoot
nullifier
voteEncoding
receiptCommitment
proofDigest / proofReference / proof
```

Nunca contiene identidad.

## 8. Digest del conjunto

V1 puede usar JSONL canónico:

```text
acceptedVoteSetDigest = SHA-256(canonicalPublicAcceptedVotes)
```

Encoding, orden de keys, newline, field encoding y orden de records deben estar completamente especificados.

Debe cumplirse:

```text
recordCount == número de PublicAcceptedVoteV1 incluidos
```

## 9. Freeze coherente

La creación del snapshot debe ocurrir después de que `CloseElection` haya committed y bajo lectura transaccional coherente.

La invariancia primaria es:

```text
no accepted_votes nuevos después de CLOSED
```

Si procesos concurrentes intentan iniciar COUNTING, PostgreSQL debe serializar/rechazar apropiadamente.

## 10. EnterCounting

Caso de uso:

```text
EnterCounting
```

Responsabilidades:
1. lock/reload election;
2. exigir `CLOSED`;
3. validar configuración congelada;
4. crear u obtener snapshot final;
5. comprobar digest/count;
6. cambiar estado a `COUNTING`;
7. persistir auditoría/checkpoint;
8. commit.

Debe ser idempotente. Un snapshot incompatible provoca fallo e investigación.

## 11. SINGLE_CHOICE V1

Cada `voteEncoding` corresponde a una opción congelada:

```text
0 .. optionCount - 1
```

según `ElectionConfigurationVersion`.

## 12. TallyEngine

Crear lógica pura compartida:

```text
TallyEngine
```

Input:

```text
ElectionManifestV1
PublicAcceptedVoteV1 stream/list
```

Output:

```text
TallyComputationV1
```

No depende de NestJS, HTTP ni PostgreSQL.

## 13. Algoritmo

Inicializar todas las opciones congeladas en cero y, para cada voto:

```text
totals[vote.voteEncoding] += 1
```

Usar enteros exactos. No floating point para counts.

No omitir opciones con cero votos.

## 14. Invariantes matemáticas

Para `SINGLE_CHOICE`:

```text
totalAcceptedVotes == recordCount
sum(totalsByOption) == totalAcceptedVotes
each total >= 0
number of result options == frozen optionCount
every voteEncoding in [0, optionCount)
```

Si falla una invariancia, no publicar.

## 15. Invalid accepted vote

En un sistema correcto:

```text
invalidAcceptedVoteCount = 0
```

Un `voteEncoding` inválido dentro de `accepted_votes` es una violación de integridad, no un voto nulo normal. No descartarlo silenciosamente.

## 16. Blank/null votes

V1 no inventa blank/null votes. Si se requiere voto en blanco, debe existir como opción/protocolo explícito.

## 17. Option identity

Los resultados referencian IDs/encodings congelados. Los labels se leen del manifest/configuración correspondiente, nunca de estado mutable posterior.

## 18. TallyComputationV1

```text
electionId
configurationVersion
protocolVersion
acceptedVoteSetDigest
totalAcceptedVotes
totalsByOption
tallyVersion
```

Mismo manifest + mismo conjunto canónico = mismo tally.

No depender de locale, timezone, orden DB ni object iteration accidental.

## 19. TallyManifestV1

Conceptualmente:

```text
manifestVersion
tallyVersion
electionId
configurationVersion
protocolVersion
acceptedVoteSetDigest
acceptedVoteCount
totalsByOption[]
tallyDigest
```

Separar metadata como `computedAt` de la identidad criptográfica si impide reproducibilidad.

```text
tallyDigest = SHA-256(canonical(TallyManifestV1 content))
```

## 20. ComputeTally

Precondiciones:
- election `COUNTING`;
- snapshot final existente;
- manifest congelado;
- schemas soportados.

Flujo:
1. cargar snapshot;
2. obtener records canónicos;
3. comprobar vote-set digest;
4. ejecutar `TallyEngine`;
5. validar invariantes;
6. persistir tally version;
7. auditar/checkpoint;
8. commit.

## 21. SQL aggregate

SQL `GROUP BY` puede usarse como optimización/cross-check, pero no como única definición normativa.

Preferencia:

```text
pure tally == SQL aggregate tally
```

Una discrepancia bloquea publicación.

## 22. Persistencia de tally

Tabla conceptual:

```text
election_tallies
- id
- election_id
- configuration_version
- protocol_version
- tally_version
- accepted_vote_set_digest
- accepted_vote_count
- tally_content
- tally_digest
- computed_at
- status
```

Estados conceptuales:

```text
COMPUTED
VALIDATED
PUBLISHED
SUPERSEDED
```

No almacenar porcentajes como fuente de verdad.

## 23. Recompute

Antes de publicación, recomputar sobre el mismo snapshot debe producir el mismo digest. Si no, bloquear publicación.

## 24. Result version

`resultVersion` es distinto de `configurationVersion`.

```text
publicación inicial -> resultVersion 1
corrección futura permitida -> resultVersion 2
```

Nunca borrar V1 para sustituirla por V2.

## 25. ElectionResultV1

Conceptualmente:

```text
resultSchemaVersion
electionId
configurationVersion
protocolVersion
resultVersion
acceptedVoteSetDigest
totalAcceptedVotes
totalsByOption
tallyDigest
verificationPackageDigest
publishedAt
previousResultDigest?
resultContentDigest
publicationDigest
```

## 26. Digests de resultado

Recomendación V1:

```text
resultContentDigest =
  SHA-256(canonical(electoral result content))

publicationDigest =
  SHA-256(canonical(
    resultContentDigest,
    resultVersion,
    publishedAt,
    verificationPackageDigest,
    previousResultDigest
  ))
```

Así el contenido electoral permanece reproducible y la metadata de publicación queda separada.

## 27. Verification package

Antes de `RESULTS_PUBLISHED`, generar package con:

```text
election manifest
protocol manifest
verification key
artifact digests
eligibility metadata/root
accepted vote set
receipts/public records
tally
checkpoints
result
```

Luego ejecutar el verifier offline sobre ese mismo package.

## 28. Package manifest

No hashear ambiguamente un directorio. Crear:

```text
verification-package-manifest.json
```

Conceptualmente:

```text
packageVersion
electionId
resultVersion
files[]
  - logicalPath
  - sha256
  - size
packageContentDigest
```

Ordenar `files` canónicamente y evitar self-reference circular.

## 29. Verify before publish

El verifier debe comprobar:

```text
schemas
file digests
election manifest
artifact digests
root/context/protocol
vote-set digest
record count
nullifier uniqueness
proof/evidence policy
tally recomputation
tally digest
result content digest
checkpoints/package references
```

Cualquier fallo bloquea publicación.

## 30. PublishResults

Precondiciones:
- election `COUNTING`;
- snapshot final fijado;
- tally `VALIDATED`;
- package generado;
- verifier exitoso;
- publication target disponible.

Solo entonces puede alcanzarse:

```text
RESULTS_PUBLISHED
```

## 31. DB vs artifact store

PostgreSQL y artifact store externo no comparten ACID. No fingir atomicidad distribuida.

Usar workflow persistido:

```text
GENERATED
VERIFIED
PUBLISHING
PUBLISHED
FAILED
```

Flujo recomendado:

```text
1. build immutable package
2. verify package
3. putImmutable content-addressed
4. verify stored digests
5. mark publication PUBLISHED
6. transition election RESULTS_PUBLISHED
```

Si falla almacenamiento/verificación, election sigue `COUNTING`.

## 32. Retry de publicación

Debe ser idempotente.

Misma versión + mismos digests:
- verificar;
- reutilizar.

Misma versión + digest diferente:
- conflicto;
- no overwrite.

## 33. Paths inmutables

Preferir:

```text
/elections/<electionId>/results/v1/<digest>/...
```

Un alias `latest` puede existir solo como conveniencia, nunca como única copia autoritativa.

## 34. Public API

Conceptualmente:

```text
GET /api/v1/elections/:id/results
GET /api/v1/elections/:id/results/:resultVersion
GET /api/v1/elections/:id/verification
```

Si no está publicado, no filtrar tally preliminar.

## 35. No resultados live por defecto

V1 no publica conteo en vivo durante `OPEN`, ni siquiera si SQL puede calcularlo.

El número de votos aceptados también puede reservarse hasta la fase de publicación.

Resultados parciales/live requieren diseño separado.

## 36. Porcentajes

Los counts enteros son la fuente oficial.

Los porcentajes son derivados de presentación:

```text
percentage = count / totalAcceptedVotes
```

Definir rounding solo en UI/API. Manejar explícitamente `totalAcceptedVotes == 0`.

## 37. Empates y ganador

El tally reporta counts.

No inventar ganador ni desempate si la regla electoral no está modelada explícitamente en configuración/protocolo.

## 38. Zero-vote election

Puede existir:

```text
totalAcceptedVotes = 0
```

Todas las opciones quedan en cero. No es corrupción técnica.

## 39. CANCELLED

Una elección cancelada:
- no publica resultados normales;
- preserva audit trail;
- preserva votos committed;
- puede publicar evidencia de cancelación.

No convertir cancelación en resultado oficial.

## 40. Inconsistencias

Si se detecta:

```text
duplicate nullifier
invalid voteEncoding
vote-set digest mismatch
proof evidence mismatch
manifest mismatch
```

bloquear conteo/publicación.

No reparar eliminando/modificando rows automáticamente.

## 41. Procedimiento de incidente

1. detener transición;
2. generar audit event técnico;
3. preservar evidencia;
4. no modificar datos automáticamente;
5. requerir investigación;
6. documentar resolución mediante eventos/versiones.

No introducir un estado `DISPUTED`/`SUSPENDED` sin decisión explícita.

## 42. Correcciones

Una corrección no sobrescribe resultados publicados.

Si la política la permite:

```text
resultVersion N+1
previousResultDigest = digest de N
reason/reference auditable
```

El package nuevo referencia el anterior.

Modificar `accepted_votes` después de CLOSED/RESULTS_PUBLISHED no es un flujo normal de corrección.

## 43. Repositories

Conceptuales:

```text
AcceptedVoteSetRepository
- freezeFinalSet(...)
- findFinalSet(...)
- streamCanonicalVotes(...)

TallyRepository
- saveComputed(...)
- markValidated(...)
- findByVersion(...)

ElectionResultRepository
- createResultVersion(...)
- markPublished(...)
- findPublished(...)
- listVersions(...)

PublicationRepository
- createPublication(...)
- markVerified(...)
- markPublishing(...)
- markPublished(...)
- markFailed(...)
```

No CRUD genérico para editar resultados.

## 44. Artifact store

Reutilizar `VerificationArtifactStore` de etapa 12:

```text
putImmutable
get
exists
verifyDigest
```

Local/devnet puede usar volumen Docker:

```text
./data/verification/<electionId>/<resultVersion>/<digest>/
```

No asumir filesystem efímero como storage productivo.

## 45. DTO público

Conceptualmente:

```text
ElectionResultPublicDto
- resultSchemaVersion
- electionId
- resultVersion
- totalAcceptedVotes
- totalsByOption
- resultContentDigest
- publicationDigest
- publishedAt
- verificationPackage
```

Por opción:

```text
optionId / canonical option reference
voteEncoding
frozen label
count
```

## 46. Autenticidad

Sin firma digital/key management, SHA-256 aporta integridad/reproducibilidad, pero no demuestra por sí solo quién publicó el resultado.

Una futura firma de `publicationDigest` puede añadir autenticidad institucional.

## 47. Audit events

Registrar al menos:

```text
accepted_vote_set_frozen
counting_started
tally_computed
tally_validated
verification_package_generated
verification_package_verified
result_publication_started
results_published
result_publication_failed
result_superseded
```

Sin PII.

## 48. Verifier offline

Debe poder empezar en:

```text
verification-package-manifest.json
```

y terminar demostrando:

```text
published result == deterministic tally(final accepted vote set)
```

Orden conceptual:
1. schema validation;
2. file digests;
3. election manifest;
4. protocol/artifacts;
5. eligibility metadata/root;
6. accepted vote records;
7. canonical order;
8. vote-set digest/count;
9. nullifier uniqueness;
10. proof/evidence checks;
11. tally recomputation;
12. tally digest;
13. result digest;
14. publication/checkpoint references.

## 49. Nivel de verificabilidad

Si el package publica proofs completos, el verifier puede verificarlos individualmente.

Si solo publica digests/references, la documentación debe indicar qué evidencia adicional se necesita.

No afirmar “fully independently verifiable” si la evidencia necesaria no es pública.

## 50. Performance y streaming

Medir:

```text
snapshot generation
canonical export
vote-set digest
tally
package generation
package verification
package size
peak memory
```

Para elecciones grandes no cargar todos los votos en RAM.

Streaming conceptual:

```text
for vote in canonicalVoteStream:
    validate(vote)
    hash.update(canonicalLine(vote))
    totals[vote.voteEncoding] += 1
```

SHA-256 puede calcularse incrementalmente.

## 51. External sort / índices

PostgreSQL puede producir orden por nullifier con índices adecuados o external sort.

Índices a evaluar:

```text
election_id
configuration_version
protocol_version
nullifier
```

La optimización no cambia la semántica canónica.

## 52. Snapshot materialization recomendada

Flujo preferido:

```text
CLOSED
 -> stream accepted_votes canonical order
 -> build immutable accepted-votes artifact
 -> compute digest/count
 -> persist AcceptedVoteSetSnapshot
 -> COUNTING
 -> tally from immutable artifact
```

Evita mantener transacciones enormes durante uploads/publicación.

## 53. Fallos y recuperación

### Artifact generation failure
Election permanece CLOSED; retry permitido; staging incompleto no se publica.

### Tally failure
Election permanece COUNTING; snapshot no cambia; retry determinista.

### Publication failure
Election permanece COUNTING; publication `FAILED`; tally/snapshot no cambian.

### Crash
Cada fase se reconstruye desde PostgreSQL + immutable artifacts. No depender de memoria.

## 54. Staging

Artefactos incompletos viven fuera del namespace público.

Solo promover bytes cuyo schema/digest fueron verificados. La promoción no cambia contenido.

## 55. Concurrency/multi-instance

Solo una ejecución lógica de freeze/tally/publication por election/version.

Usar constraints y locks PostgreSQL cortos, no distributed locks como garantía primaria.

Dos instancias NestJS deben converger en una única versión persistida o una recibir conflicto/idempotent result.

## 56. Scheduler

No introducir cron/job queue obligatoriamente en V1.

Admin API/CLI puede iniciar los casos de uso. Una futura automatización reutiliza las mismas invariantes.

## 57. Admin authorization

Solo el administrador autorizado inicia transiciones administrativas. Mantener auth/CSRF definidos previamente.

Recomputar/verificar offline puede ser público; publicar oficialmente es acción administrativa.

## 58. OpenAPI

Documentar:

```text
public result endpoint
public verification metadata
admin counting endpoint
admin publication endpoint
states/errors
result/version schemas
```

No exponer endpoint para enviar/mutar totals.

## 59. Errores

```text
ELECTION_NOT_CLOSED
ELECTION_NOT_COUNTING
FINAL_VOTE_SET_ALREADY_FROZEN
FINAL_VOTE_SET_CONFLICT
VOTE_SET_DIGEST_MISMATCH
INVALID_ACCEPTED_VOTE
DUPLICATE_NULLIFIER_DETECTED
TALLY_COMPUTATION_FAILED
TALLY_INVARIANT_FAILED
TALLY_DIGEST_MISMATCH
TALLY_ALREADY_EXISTS
VERIFICATION_PACKAGE_NOT_READY
VERIFICATION_PACKAGE_INVALID
PUBLICATION_ALREADY_IN_PROGRESS
PUBLICATION_FAILED
RESULTS_ALREADY_PUBLISHED
RESULT_VERSION_CONFLICT
RESULT_DIGEST_MISMATCH
```

No exponer stack traces/SQL.

## 60. Tests unitarios

Cubrir:
- 0 votos;
- una/múltiples opciones;
- opciones con 0;
- gran cantidad;
- invalid encoding;
- duplicate nullifier;
- deterministic order;
- canonical digest;
- tally/result digests;
- edge cases de porcentajes.

## 61. Property tests

Cuando sea práctico:

```text
sum(totals) == recordCount
```

Permutar input no cambia tally ni digest final tras canonicalización.

Duplicar un voto cambia count/digest y debe ser detectado por nullifier uniqueness.

## 62. Integration tests PostgreSQL

- CLOSED freeze;
- snapshot uniqueness;
- EnterCounting idempotente;
- concurrent EnterCounting;
- tally persistence;
- result version uniqueness;
- audit events;
- rollback.

## 63. Artifact/publication tests

- canonical JSONL byte-for-byte;
- digest reproducible;
- package manifest;
- missing/altered file;
- wrong size;
- staging no público;
- immutable store rechaza overwrite;
- retry después de upload parcial;
- misma versión/mismo digest idempotente;
- misma versión/digest distinto conflictivo;
- versiones históricas preservadas.

## 64. E2E happy path

1. OPEN recibe votos;
2. close;
3. no acepta más;
4. freeze final set;
5. COUNTING;
6. tally;
7. validate;
8. package;
9. offline verify;
10. publish;
11. RESULTS_PUBLISHED;
12. public API devuelve resultado;
13. verifier reproduce counts.

## 65. E2E zero votes

Debe producir:

```text
recordCount = 0
totalsByOption = all zero
valid package
```

si la política permite publicar una elección sin votos.

## 66. E2E tamper

Alterar count, option mapping, vote, tally o manifest. El verifier debe fallar y publicación no procede.

## 67. E2E crash/concurrency

Simular crash después de snapshot/tally/durante staging/después de store antes de finalización.

Dos workers concurrentes deben terminar con:

```text
single logical snapshot
single logical tally version
single logical publication version
```

## 68. Security

Nunca aceptar como autoritativos valores enviados por cliente/admin para:

```text
acceptedVoteSetDigest
tally totals
result digest
artifact digest
```

Admin solicita `compute/publish`; el sistema deriva el contenido.

## 69. Logging y métricas

Logs pueden contener:

```text
electionId
snapshotVersion
digest prefix
recordCount
tallyVersion
resultVersion
duration
error code
```

No votos individuales/nullifiers.

Métricas:

```text
counting duration
tally duration
package generation duration
verification duration
publication failures
snapshot record count
package bytes
```

No etiquetar métricas con nullifier.

## 70. UI pública

Mostrar:
- opciones congeladas;
- counts;
- total;
- versión;
- fecha de publicación;
- referencia de verificación.

Vista avanzada puede mostrar manifest/vote-set/tally/package digests y protocol version.

## 71. Package descargable

Debe estar identificado por digest/version y contener README con:
1. schemas;
2. hashes;
3. canonicalización;
4. cómo ejecutar verifier;
5. qué comprueba;
6. qué no comprueba;
7. privacy considerations.

## 72. Propiedades verificables

Con evidencia suficiente puede comprobarse:
- package no alterado respecto a digests;
- configuración/protocolo identificados;
- conjunto publicado reproducible;
- nullifiers únicos;
- proofs válidos cuando estén disponibles;
- tally corresponde al conjunto;
- resultado corresponde al tally.

## 73. Límites

El package por sí solo no demuestra necesariamente:
- que toda persona elegible recibió credential;
- ausencia de coerción;
- dispositivo limpio;
- ausencia de correlación de red;
- secreto de una papeleta visible al backend;
- que el operador no omitió evidencia antes de un checkpoint externo;
- autenticidad institucional sin firma/anchoring.

Documentar estos límites.

## 74. Estructura conceptual

```text
apps/api/src/modules/results/
├── domain/
│   ├── accepted-vote-set-snapshot.ts
│   ├── tally.ts
│   ├── election-result.ts
│   └── result-errors.ts
├── application/
│   ├── enter-counting/
│   ├── compute-tally/
│   ├── generate-verification-package/
│   └── publish-results/
├── infrastructure/
│   ├── persistence/
│   └── publication/
└── http/
    ├── admin-results.controller.ts
    └── public-results.controller.ts

packages/verification-protocol/
├── tally/
├── results/
├── package-manifest/
└── verifier/
```

## 75. Orden para Codex

1. `AcceptedVoteSetSnapshot`.
2. Migraciones/constraints.
3. Canonical vote streaming.
4. JSONL/digest.
5. `EnterCounting`.
6. Freeze concurrency/idempotency.
7. `TallyEngine` puro.
8. `TallyComputationV1`.
9. `TallyManifestV1`.
10. Invariantes.
11. Persistencia tally.
12. Cross-check SQL opcional.
13. Result content schema.
14. Result/publication digests.
15. Package manifest.
16. Package builder.
17. Integrar verifier offline.
18. Publication workflow.
19. Immutable artifact store.
20. `PublishResults`.
21. State machine.
22. Public/admin controllers.
23. Audit events.
24. Unit/property tests.
25. PostgreSQL integration.
26. Artifact/publication tests.
27. E2E happy/zero/tamper/crash/concurrency.
28. OpenAPI/README.
29. Performance measurements.
30. lint/typecheck/test/build.

## 76. Criterios de aceptación

- solo se cuentan `accepted_votes`;
- snapshot final solo después de CLOSED;
- snapshot inmutable/versionado;
- export/digest canónico;
- COUNTING usa snapshot final;
- tally determinista;
- todas las opciones aparecen, incluso cero;
- `sum(totals) == recordCount`;
- invalid accepted vote bloquea publicación;
- duplicate nullifier bloquea publicación;
- mismo snapshot produce mismo tally digest;
- package se verifica antes de publicar;
- publication idempotente;
- no se finge ACID DB/artifact store;
- resultados publicados versionados/inmutables;
- correcciones preservan versiones anteriores;
- API no filtra preliminares;
- verifier offline reproduce tally;
- crash/retry/concurrency no duplica versiones;
- no se inventan reglas de ganador/desempate.

## 77. Definition of Done

```text
[ ] AcceptedVoteSetSnapshot
[ ] snapshot migration/constraints
[ ] canonical vote order
[ ] canonical JSONL
[ ] acceptedVoteSetDigest
[ ] EnterCounting
[ ] freeze idempotency/concurrency
[ ] TallyEngine
[ ] TallyComputationV1
[ ] TallyManifestV1
[ ] integer counts
[ ] zero-vote handling
[ ] all options included
[ ] sum invariant
[ ] invalid encoding detection
[ ] duplicate nullifier detection
[ ] deterministic tally
[ ] tally digest/persistence
[ ] resultVersion
[ ] ElectionResultV1
[ ] resultContentDigest
[ ] publicationDigest
[ ] package manifest/file digests
[ ] package verification
[ ] publication workflow states
[ ] immutable artifact publication
[ ] retry/idempotency
[ ] historical result versions
[ ] public results endpoint
[ ] admin counting/publication endpoints
[ ] audit events
[ ] unit/property tests
[ ] PostgreSQL integration
[ ] artifact/publication tests
[ ] E2E happy/zero/tamper/crash/concurrency
[ ] OpenAPI/README
[ ] performance measurements
[ ] lint/typecheck/test/build
```

## 78. Prohibiciones

Codex no debe:
- contar requests en lugar de `accepted_votes`;
- contar antes de CLOSED;
- exponer tally preliminar durante OPEN;
- modificar votos durante conteo;
- descartar inconsistencias silenciosamente;
- aceptar totals enviados por admin/cliente;
- usar floating point como fuente oficial;
- omitir opciones con cero;
- inventar blank/null votes;
- inventar ganador/desempate;
- ordenar export por timestamp;
- sobrescribir snapshots/tallies/resultados;
- publicar package sin verificar;
- afirmar ACID entre DB y artifact store;
- exponer staging;
- reemplazar contenido bajo mismo digest/version;
- borrar versiones históricas;
- publicar CANCELLED como resultado oficial;
- usar distributed locks como garantía primaria;
- exigir todos los votos en RAM;
- afirmar autenticidad institucional solo por SHA-256;
- afirmar verificabilidad completa si falta evidencia.

## 79. Decisiones diferidas

- firmas institucionales;
- key management;
- anchoring externo;
- object storage/CDN productivo;
- proofs completos vs references;
- recursive/batch proofs;
- reglas normativas de ganador/desempate;
- métodos distintos a SINGLE_CHOICE;
- resultados live/parciales;
- procedimiento formal de disputa/corrección.

## 80. Siguiente documento

```text
14-frontend-flujos-ux-seguridad.md
```

Debe definir:
- separación frontend administrativo/votación;
- provisioning/activación;
- manejo local de `voterSecret`;
- snapshot/path;
- proof en cliente;
- Web Worker;
- envío del voto;
- receipt;
- resultados/verificación;
- CSP/seguridad web;
- errores sin fuga de información;
- accesibilidad y UX por estados.

## 81. Instrucción final para Codex

El resultado oficial no es un número introducido por un administrador.

Debe ser una derivación reproducible:

```text
CLOSED election
    +
immutable final accepted-vote set
    +
canonical public representation
    +
deterministic SINGLE_CHOICE tally
    +
verified package
    +
versioned immutable publication
    =
reproducible published result
```

Si cualquiera de esas relaciones no puede verificarse, `RESULTS_PUBLISHED` no debe alcanzarse.
