# 12 — Auditoría, Transparencia y Verificabilidad

## Propósito

Define el subsistema de auditoría, transparencia e integridad verificable de **Votaciones**, complementando `00`–`11`.

Esta etapa separa tres conceptos que no deben confundirse:

```text
1. audit log interno
2. evidencia electoral verificable
3. publicación pública de transparencia
```

El objetivo es poder responder, con evidencia:

```text
¿Qué configuración estaba vigente?
¿Qué transiciones administrativas ocurrieron?
¿Qué protocolo/artefactos ZK se usaron?
¿Qué votos anónimos fueron aceptados?
¿Mi receipt aparece en el conjunto publicado?
¿Los resultados provienen del conjunto de votos aceptados?
¿La evidencia publicada fue alterada?
```

sin crear una relación:

```text
identidad -> voto
```

Este documento no convierte el sistema en una blockchain ni afirma inmutabilidad absoluta de una base controlada por el mismo operador.

---

## 1. Principios

La verificabilidad debe cumplir:

- append-only donde corresponda;
- versionado explícito;
- serialización canónica;
- hashes/digests reproducibles;
- separación de PII y evidencia pública;
- no depender de secretos del circuito;
- no alterar artefactos históricos en sitio;
- poder exportar evidencia para verificación independiente;
- no prometer propiedades más fuertes que las realmente implementadas.

---

## 2. Tres registros distintos

### 2.1 Audit log interno

Registra operaciones administrativas y eventos técnicos relevantes.

Puede contener identificadores internos necesarios para investigación, pero debe minimizar PII.

### 2.2 Registro electoral verificable

Contiene evidencia necesaria para demostrar integridad del proceso:

```text
election manifest
configuration versions
eligibility root
protocol/circuit versions
accepted anonymous vote records/digests
receipts/nullifiers
tally inputs/results
```

No contiene identidad civil.

### 2.3 Publicación pública

Es una vista/export sanitizado del registro verificable.

No es un dump directo de tablas internas.

---

## 3. No mezclar auditoría con logging

Los application logs son operacionales y pueden rotar.

El audit log es una estructura persistente con schema/version y reglas de integridad.

No implementar auditoría únicamente con:

```text
logger.info(...)
```

---

## 4. AuditEvent

Modelo conceptual:

```text
AuditEvent
- id
- sequence
- eventType
- eventVersion
- occurredAt
- actorType
- actorId?
- aggregateType
- aggregateId?
- payload
- previousHash
- eventHash
```

No todos los eventos requieren `actorId`.

Para voto anónimo:

```text
actorType = ANONYMOUS
actorId = null
```

---

## 5. Secuencia

Cada stream de auditoría debe tener orden inequívoco.

No depender exclusivamente de timestamps.

Puede utilizarse:

```text
sequence BIGINT
```

gestionado por PostgreSQL.

La estrategia concreta debe evitar ambigüedad bajo concurrencia.

---

## 6. Hash chain

Para detección de manipulación interna, V1 puede mantener una cadena hash:

```text
eventHash =
  SHA-256(
    canonical(
      auditChainVersion,
      sequence,
      eventType,
      eventVersion,
      occurredAt,
      actorType,
      actorId,
      aggregateType,
      aggregateId,
      payloadDigest,
      previousHash
    )
  )
```

Cada evento referencia el hash anterior.

---

## 7. Limitación de hash chain

Una cadena hash almacenada únicamente en la misma DB no impide que un operador con control total:

- reescriba eventos;
- regenere toda la cadena;
- restaure un snapshot antiguo.

Sirve para detectar modificaciones accidentales y manipulaciones que no reescriban coherentemente toda la historia.

Para evidencia fuerte contra el operador se necesita **anclaje externo** o publicación periódica de checkpoints.

---

## 8. Checkpoints

Definir checkpoints periódicos/con eventos importantes:

```text
AuditCheckpoint
- id
- fromSequence
- toSequence
- headHash
- createdAt
- checkpointVersion
```

Un checkpoint puede publicarse/exportarse fuera del sistema.

Una vez difundido externamente, reescribir historia anterior cambia el `headHash`.

---

## 9. External anchoring

No introducir blockchain por defecto.

Opciones futuras:

- publicación en sitio público estático;
- repositorio de releases;
- almacenamiento WORM;
- timestamping service;
- firma y publicación por una autoridad independiente;
- múltiples mirrors.

La primera implementación debe soportar export/checkpoint aunque el mecanismo externo se elija después.

---

## 10. Firmas digitales

Una firma puede autenticar manifests/checkpoints, pero requiere:

- algoritmo;
- generación de clave;
- custodia;
- rotación;
- revocación;
- backup;
- publicación de public keys;
- key identifiers.

No generar una clave de firma “temporal” en código productivo.

Si key management aún no está aprobado, V1 puede producir hashes/checkpoints sin afirmar autenticidad criptográfica offline.

---

## 11. Event schema versioning

Cada `eventType` debe tener `eventVersion`.

No mutar el significado de un payload manteniendo la misma versión.

Consumers/exporters deben conocer versiones soportadas.

---

## 12. Canonicalización

Todo hash verificable debe usar serialización canónica.

No usar `JSON.stringify()` de objetos arbitrarios como definición criptográfica.

Definir un helper compartido:

```text
canonicalizeForAuditV1(...)
```

con reglas para:

- UTF-8;
- field ordering;
- null;
- arrays;
- integers;
- timestamps;
- binary/digest values.

---

## 13. Timestamps

Usar UTC y formato canónico.

La precisión interna puede ser alta.

La publicación pública puede reducir precisión cuando sea necesario para privacidad.

Nunca usar timestamp del cliente como autoridad.

---

## 14. Actor types

Conceptualmente:

```text
ADMIN
SYSTEM
ANONYMOUS
```

No usar el mismo actor para operaciones administrativas y voto anónimo.

---

## 15. Admin actor

Los eventos administrativos pueden registrar `adminUserId`.

No copiar innecesariamente email/nombre en cada evento.

Si se necesita display posterior, resolverlo separadamente o persistir un snapshot mínimo justificado.

---

## 16. Anonymous actor

Eventos derivados de votos no contienen:

```text
eligibleVoterId
credentialId
identityCommitment
leafIndex
IP
civil identity
```

No introducir esos datos indirectamente en `payload`.

---

## 17. System actor

Jobs/procesos internos usan `SYSTEM` y un identificador de componente/job cuando aporte trazabilidad.

No inventar usuarios administrativos ficticios.

---

## 18. Eventos administrativos mínimos

Registrar, entre otros:

```text
admin_login_succeeded
admin_login_failed (sanitizado/agregado según seguridad)
election_created
election_configuration_changed
election_transitioned
election_cancelled
eligible_voter_registered
eligible_voter_deactivated
credential_registered
credential_revoked
eligibility_snapshot_built
eligibility_snapshot_frozen
protocol_version_assigned
results_published
```

No incluir secretos.

---

## 19. Eventos de voto

El audit log no necesita una copia completa de cada proof.

Evento conceptual:

```text
vote_accepted
- electionId
- configurationVersion
- protocolVersion
- receiptCommitment
```

El nullifier puede estar en el registro verificable, pero no es obligatorio duplicarlo en todos los logs internos.

---

## 20. Rechazos

No registrar un evento persistente por cada request inválido si eso permite DoS de almacenamiento.

Rechazos de proof/rate-limit pueden ir a métricas/logs agregados.

Solo persistir eventos de seguridad cuando exista una razón clara.

---

## 21. Atomicidad de auditoría

Cuando un evento de auditoría sea obligatorio para una operación de dominio, debe persistirse en la misma transacción PostgreSQL o mediante outbox transaccional con garantías equivalentes.

No hacer:

```text
commit dominio
logger/audit insert después
```

si perder ese evento rompe requisitos de auditoría.

---

## 22. Audit repository

Port conceptual:

```text
AuditRepository
- append(event)
- readStream(...)
- createCheckpoint(...)
```

No exponer UPDATE/DELETE normales.

---

## 23. Append-only lógico

La application layer no ofrece edición/eliminación de eventos.

DB permissions deben reforzarlo cuando sea práctico.

No afirmar que una tabla PostgreSQL es físicamente inmutable.

---

## 24. Correcciones

Si un evento contiene un dato erróneo que necesita corrección:

```text
append correction event
```

No editar silenciosamente el evento histórico.

---

## 25. Election Manifest

Cada elección debe tener un manifest verificable que describa exactamente qué se está ejecutando.

Conceptualmente:

```text
ElectionManifestV1
- manifestVersion
- electionId
- electionConfigurationVersion
- title/public metadata
- votingMethod
- opensAt
- closesAt
- options[]
- optionEncoding
- eligibilitySnapshotVersion
- merkleRoot
- leafCount
- treeDepth
- protocolVersion
- circuitVersion
- commitmentSchemeVersion
- nullifierSchemeVersion
- voteEncodingVersion
- verificationKeyDigest
- circuitArtifactDigests
- createdAt
```

---

## 26. Manifest inmutable

El manifest asociado a una elección OPEN es inmutable.

Cambiar un campo criptográficamente/electoralmente relevante requiere nueva configuration/manifest version antes de OPEN.

Nunca reemplazar un manifest publicado manteniendo el mismo digest/version.

---

## 27. Manifest digest

Calcular:

```text
manifestDigest = SHA-256(canonical(ElectionManifestV1))
```

El digest puede publicarse antes de abrir la elección.

---

## 28. Binding con electionContext

La derivación `electionContext` de etapa 10 debe poder verificarse a partir de campos definidos del manifest.

No mantener dos fuentes de verdad contradictorias.

El manifest debe indicar qué campos participan en la derivación.

---

## 29. ZK artifacts públicos

La evidencia de una elección debe identificar:

```text
protocol manifest
circuit source/version
verification_key.json
WASM digest
zkey digest
R1CS digest
Powers of Tau reference/hash cuando aplique
trusted setup transcript/reference
```

No es obligatorio publicar toxic waste ni material secreto — nunca debe existir.

---

## 30. Artifact digest registry

Mantener registry versionado:

```text
ArtifactDigest
- artifactType
- protocolVersion
- circuitVersion
- digestAlgorithm
- digest
```

El backend verifica artifacts locales contra este registry.

---

## 31. Public verification package

Debe poder generarse un paquete/export por elección.

Conceptualmente:

```text
verification-package/
├── election-manifest.json
├── protocol-manifest.json
├── verification_key.json
├── artifact-digests.json
├── eligibility.json
├── accepted-votes.jsonl
├── receipts.jsonl
├── tally.json
├── checkpoints.json
└── README.md
```

El contenido exacto depende de la fase electoral.

---

## 32. No PII en export público

Antes de publicar, validar que no aparezcan:

```text
eligibleVoterId
credentialId
externalReference
admin session IDs
IP
user-agent
request ID correlacionable
leaf index ligado a persona
persona -> commitment
```

---

## 33. Accepted vote public record

Para V1, un registro público verificable puede contener conceptualmente:

```text
protocolVersion
electionContext
merkleRoot
nullifier
voteEncoding
receiptCommitment
proof / proofReference / proofDigest
```

La decisión de publicar proof completo depende de tamaño/estrategia, pero debe ser posible verificar que cada registro publicado corresponde a un proof válido o evidencia preservada.

---

## 34. Riesgo de publicar timestamps

No publicar `acceptedAt` con precisión fina por defecto.

Puede facilitar correlación entre tráfico y voto.

Si se requiere orden/inclusión, usar secuencias o batches sin exponer tiempo exacto.

---

## 35. Public vote sequence

Un `publicSequence` puede asignarse para export verificable.

No debe ser el mismo que un identificador interno correlacionable con logs de red.

Si se usa, definirlo dentro del pipeline de publicación.

---

## 36. Nullifiers públicos

Publicar nullifiers permite:

- comprobar unicidad;
- buscar el propio receipt/nullifier;
- verificar conjunto contado.

Pero también revela el número de votos y timing si se publica en tiempo real.

V1 debe preferir publicación controlada por batch/fase, no streaming inmediato, salvo requerimiento explícito.

---

## 37. Receipt verification

El votante debe poder comprobar posteriormente:

```text
mi nullifier/receiptCommitment aparece en el conjunto publicado
```

Esto demuestra inclusión en el registro publicado, no por sí solo que la elección completa sea correcta.

---

## 38. Receipt lookup

Puede existir una herramienta/endpoint de verificación después de la fase apropiada.

No necesita identidad.

Input conceptual:

```text
electionId
nullifier or receiptCommitment
```

Debe evitar convertirse en un canal de publicación prematura si la política exige batch.

---

## 39. Receipt no contiene selección por defecto

Aunque el digest interno pueda comprometer `voteEncoding`, la representación entregada al votante no necesita mostrar la selección si ello crea riesgos de coerción/venta de voto.

Este punto debe revisarse explícitamente antes de diseñar receipts “demostrables” a terceros.

---

## 40. Receipt-freeness

V1 **no afirma receipt-freeness ni coercion resistance**.

Un sistema donde el votante puede demostrar a un tercero cómo votó puede facilitar coerción/venta.

Por ello no diseñar pruebas de selección para terceros sin threat model específico.

---

## 41. Registro de elegibilidad público

Como mínimo publicar:

```text
eligibilitySnapshotVersion
merkleRoot
leafCount
treeDepth
commitmentSchemeVersion
```

Publicar lista completa de commitments es una decisión separada por privacidad/verificabilidad.

No publicar persona→commitment.

---

## 42. Freeze evidence

Al congelar snapshot generar evidencia:

```text
snapshot manifest digest
merkleRoot
configurationVersion
frozenAt
audit checkpoint/reference
```

Debe poder demostrarse que la root usada por proofs es la misma fijada antes de OPEN.

---

## 43. Pre-election publication

Idealmente, antes de OPEN publicar/checkpoint de:

- election manifest digest;
- eligibility root;
- protocol/circuit version;
- verification key digest;
- artifact digests;
- opensAt/closesAt.

Así los cambios posteriores son detectables si existe copia externa.

---

## 44. Election lifecycle checkpoints

Generar checkpoints relevantes en:

```text
READY
OPEN
CLOSED
RESULTS_PUBLISHED
CANCELLED
```

No necesariamente uno por request.

---

## 45. CLOSED checkpoint

Al cerrar, fijar evidencia de:

- manifest/configuration;
- número de votos aceptados;
- head/hash del registro verificable;
- rango/batch de registros;
- audit checkpoint relevante.

No publicar resultados si todavía existe fase COUNTING separada.

---

## 46. Conteo verificable

Para V1 de selección anónima en claro, el tally debe derivarse exclusivamente del conjunto final de `accepted_votes` incluido en el registro verificable.

No contar:
- requests rechazados;
- proofs inválidos;
- duplicados rechazados;
- votos fuera de ventana;
- votos de otra configurationVersion.

---

## 47. Tally manifest

Conceptualmente:

```text
TallyManifestV1
- electionId
- configurationVersion
- protocolVersion
- acceptedVoteSetDigest
- acceptedVoteCount
- totalsByOption
- invalidAcceptedVoteCount
- computedAt
- tallyVersion
```

Para una implementación correcta:

```text
invalidAcceptedVoteCount = 0
```

porque un voto inválido no debió ser aceptado.

---

## 48. Accepted vote set digest

Necesitamos comprometer el conjunto contado.

No usar concatenación ambigua.

Opciones V1:

- archivo JSONL canónico + SHA-256;
- Merkle tree de records públicos;
- ambos.

La implementación inicial puede usar JSONL canónico + SHA-256 y dejar Merkle inclusion proofs para una mejora posterior.

---

## 49. Orden canónico de votos publicados

Para obtener digest reproducible, ordenar por una clave pública canónica, por ejemplo:

```text
nullifier canonical bytes
```

No por `acceptedAt`.

Esto reduce correlación temporal y produce export determinista.

---

## 50. Canonical vote record

Definir:

```text
PublicAcceptedVoteV1
```

con campos exactos y serialización fija.

No incluir datos no necesarios para verificación.

---

## 51. JSONL

Si se usa JSONL:

- una línea por record;
- UTF-8;
- newline convention definida;
- keys en orden canónico;
- field elements canónicos;
- sin whitespace variable;
- archivo ordenado determinísticamente.

El digest debe poder reproducirse en otra implementación.

---

## 52. Proof verification offline

Debe existir un script/tool que pueda:

1. cargar verification package;
2. verificar manifest digests;
3. verificar artifact digests;
4. verificar electionContext/root;
5. verificar proofs/evidencia disponible;
6. verificar nullifiers únicos;
7. recomputar vote-set digest;
8. recomputar tally;
9. comparar resultados publicados.

No requiere acceso a la DB productiva.

---

## 53. Verifier CLI

Crear conceptualmente:

```text
pnpm verify:election --package <path>
```

Debe funcionar sobre archivos exportados.

No necesita secretos ni credenciales administrativas.

---

## 54. Independent implementation

Los formatos deben estar suficientemente documentados para que un tercero pueda implementar un verifier independiente.

No hacer del CLI oficial la única definición del protocolo.

---

## 55. Public API

Endpoints conceptuales, según fase:

```text
GET /api/v1/elections/:id/manifest
GET /api/v1/elections/:id/verification
GET /api/v1/elections/:id/results
```

La publicación de votes/receipts puede ser mediante archivos estáticos/export en vez de endpoint dinámico.

---

## 56. Cacheability

Manifests/versiones históricas inmutables pueden servirse con caching fuerte y digest/ETag.

No cachear respuestas mutables como si fueran finales.

---

## 57. Content addressing

Cuando aporte valor, nombrar artefactos por digest/version:

```text
election-manifest.<digest>.json
accepted-votes.<digest>.jsonl
```

Evita reemplazos silenciosos.

---

## 58. Publication state

Modelar estado de publicación:

```text
DRAFT
PUBLISHED
SUPERSEDED
```

para artefactos que puedan tener versiones antes de OPEN.

Una vez una versión es parte de una elección OPEN, no se sobrescribe.

---

## 59. Publicación atómica

No exponer un verification package parcialmente actualizado.

Construir en staging, verificar hashes, y publicar/promover el conjunto completo de forma atómica cuando la infraestructura lo permita.

---

## 60. Result publication

`RESULTS_PUBLISHED` requiere:

- elección cerrada;
- conjunto final de votos fijado;
- tally recomputado;
- verification package válido;
- digests/checkpoints generados;
- publicación completada según política.

No cambiar resultados en sitio después.

---

## 61. Corrección de resultados

Si se detecta un error después de publicación, no reemplazar silenciosamente.

Crear:

```text
results publication version 2
```

con referencia a versión anterior, razón y nuevo checkpoint.

La política electoral puede determinar si esa corrección está permitida; técnicamente debe ser trazable.

---

## 62. Cancelled election

Una elección cancelada puede publicar manifest/checkpoint de cancelación.

No publicar tally como resultado válido.

Los votos ya aceptados, si existieron antes de cancelación, no se borran silenciosamente; su tratamiento debe quedar documentado.

---

## 63. Auditoría de accesos

No registrar cada lectura pública como evento de auditoría persistente.

Accesos administrativos sensibles sí pueden auditarse cuando aporte valor.

Evitar generar un sistema de vigilancia innecesario.

---

## 64. Admin audit viewer

Puede existir UI/API administrativa para consultar audit events.

Debe requerir auth.

No permitir edición.

Aplicar paginación y filtros seguros.

---

## 65. Export administrativo

Un export para auditor interno puede contener más metadata que el público, pero debe seguir minimización.

Diferenciar claramente:

```text
public verification export
internal audit export
```

No mezclar permisos.

---

## 66. PII redaction

Crear una política central de redacción.

Antes de export público, usar allowlist de campos, no blacklist.

Es más seguro construir el DTO público desde cero que serializar entidades internas y borrar campos.

---

## 67. Secrets

Nunca aparecen en audit/public exports:

```text
voterSecret
activation tokens
password hashes
session secrets
CSRF secrets
private signing keys
trusted setup toxic waste
raw recovery material
```

---

## 68. Commitments

`identityCommitment` requiere tratamiento cuidadoso.

No incluirlo en audit events de voto.

Si se publica lista de commitments de elegibilidad en el futuro, será un artefacto separado y deliberado.

---

## 69. Request metadata

No incluir en evidencia pública:

```text
IP
user-agent
request-id
trace-id
connection metadata
```

Esto no ayuda a verificar el voto y aumenta correlación.

---

## 70. Observability separation

Metrics/traces/logs operacionales deben tener retention/access distintos del registro electoral verificable.

No usar tracing como audit ledger.

---

## 71. Retención

Definir categorías:

```text
operational logs
security logs
internal audit events
vote proof evidence
public verification artifacts
```

Cada una necesita política distinta.

No borrar evidencia necesaria para verificar resultados mientras la política electoral exija auditabilidad.

---

## 72. Data lifecycle

La eliminación de PII administrativa futura no debe romper la capacidad de verificar votos anónimos.

Esto refuerza la separación entre identidad y registro electoral.

---

## 73. Backups

Backups de PostgreSQL deben incluir audit/electoral records necesarios.

Los backups también contienen datos sensibles administrativos y requieren protección.

No confundir backup con publicación verificable.

---

## 74. Restore

Después de restore, verificar:

- audit chain;
- checkpoints;
- election manifests;
- vote-set digests;
- artifact registry.

No asumir integridad solo porque PostgreSQL restauró sin error.

---

## 75. Database permissions

Cuando sea viable:

- rol de aplicación sin DELETE/UPDATE sobre audit events;
- procedimientos/queries específicas para append;
- acceso restringido a tablas sensibles.

No sacrificar mantenibilidad sin documentar la estrategia.

---

## 76. Audit chain concurrency

La cadena hash global puede crear contención.

No implementar ingenuamente:

```text
SELECT last event
INSERT next
```

sin protección.

Opciones:
- lock de head row;
- sequence + serialized append;
- streams por aggregate;
- batch/checkpoint architecture.

V1 puede usar un `audit_chain_head` bloqueado en transacciones cortas si el volumen esperado es moderado.

---

## 77. No bloquear voto innecesariamente

Si cada voto requiere audit chain global y eso serializa todo el throughput, rediseñar.

La aceptación del voto no debe depender de una cadena administrativa global costosa.

Preferencia:

- `accepted_votes` es el registro electoral autoritativo;
- audit técnico de voto puede usar outbox/batch;
- checkpoints comprometen conjuntos posteriormente.

La unicidad/atomicidad de voto sigue en PostgreSQL.

---

## 78. Registro verificable de votos

La evidencia de votos debe derivarse directamente de `accepted_votes` committed.

No depender de un audit event secundario para saber qué votos cuentan.

---

## 79. Snapshot de conjunto final

Al pasar `CLOSED -> COUNTING`, crear/fijar una representación del conjunto final aceptado:

```text
AcceptedVoteSetSnapshot
- electionId
- configurationVersion
- recordCount
- canonicalDigest
- snapshotVersion
- createdAt
```

Una vez fijado, no se modifica.

---

## 80. Conteo desde snapshot

COUNTING usa ese conjunto fijado.

No contar directamente una tabla mutable sin comprobar que no pueden entrar nuevos votos.

El cierre + invariantes de etapa 11 garantizan que `accepted_votes` ya no crece para esa elección.

---

## 81. Reproducibilidad de tally

Dado:

```text
ElectionManifest
AcceptedVoteSetSnapshot
PublicAcceptedVote records
```

un tercero debe poder recomputar exactamente `totalsByOption`.

---

## 82. Resultados

Resultado conceptual:

```text
ElectionResultV1
- electionId
- resultVersion
- acceptedVoteSetDigest
- totalAcceptedVotes
- totalsByOption
- publishedAt
- resultDigest
```

No añadir porcentajes como fuente de verdad; pueden derivarse.

---

## 83. Sum invariant

Debe cumplirse:

```text
sum(totalsByOption) == totalAcceptedVotes
```

para `SINGLE_CHOICE` V1.

Si no se cumple, no publicar.

---

## 84. Option mapping

Los resultados referencian option IDs/encodings de la configuración congelada.

No reconstruir mapping desde labels actuales.

---

## 85. Proof count invariant

Cuando se conserve proof por voto:

```text
verified evidence count == accepted vote count
```

o debe existir explicación formal de cualquier estrategia de digest/batch que sustituya proof individual publicado.

---

## 86. Nullifier invariant

Dentro del conjunto final:

```text
all nullifiers unique
```

El verifier offline debe comprobarlo incluso si PostgreSQL ya lo garantizó.

---

## 87. Manifest/root invariant

Todos los votos publicados deben corresponder al mismo:

```text
electionId
configurationVersion
protocolVersion
merkleRoot
electionContext
```

esperados por el manifest.

---

## 88. Verification report

El CLI puede producir:

```text
VerificationReport
- packageDigest
- manifestValid
- artifactsValid
- voteSetDigestValid
- proofsValid
- nullifiersUnique
- tallyValid
- checkpointsValid
- errors[]
```

No producir un “score” de seguridad.

---

## 89. Machine-readable + human-readable

El package debe tener schemas machine-readable y README humano.

No depender solo de documentación narrativa.

---

## 90. Schemas

Versionar JSON Schema/Zod equivalents para:

```text
ElectionManifestV1
PublicAcceptedVoteV1
TallyManifestV1
AuditCheckpointV1
VerificationReportV1
```

El formato público debe poder validarse fuera de NestJS.

---

## 91. Determinismo

Dos exports del mismo estado final deben producir los mismos records/digests, salvo metadata explícitamente excluida del digest.

No incluir `generatedAt` dentro del contenido comprometido si impide reproducibilidad sin aportar valor.

---

## 92. generatedAt

Puede existir metadata de packaging fuera del digest principal.

Separar:

```text
content identity
```

de:

```text
momento en que se generó el archivo
```

---

## 93. Storage

No introducir S3/MinIO automáticamente si no está aprobado.

V1 puede generar artifacts en filesystem devnet y definir un `VerificationArtifactStore` port para sustituirlo después.

Producción deberá elegir almacenamiento durable apropiado.

---

## 94. VerificationArtifactStore

Port conceptual:

```text
VerificationArtifactStore
- putImmutable(...)
- get(...)
- exists(...)
```

Semántica inmutable/content-addressed.

No ofrecer overwrite silencioso.

---

## 95. Devnet

En local/devnet:

- generar manifests;
- export JSON/JSONL;
- calcular digests;
- guardar package en volumen Docker;
- ejecutar verifier CLI contra el package.

Debe ser reproducible con comandos documentados.

---

## 96. Seguridad del exporter

El exporter procesa datos sensibles internos.

Debe usar DTOs públicos allowlisted y tests que garanticen ausencia de PII.

No hacer:

```text
JSON.stringify(databaseRow)
```

para publicación.

---

## 97. Tests de fuga

Crear tests que fallen si aparecen claves prohibidas:

```text
eligibleVoterId
credentialId
externalReference
ip
userAgent
sessionId
identityCommitment
```

en exports donde no estén expresamente autorizadas.

---

## 98. Tests de tampering

Modificar deliberadamente:

- un audit event;
- previousHash;
- manifest;
- vote record;
- nullifier;
- voteEncoding;
- tally;
- verification key;
- artifact digest.

El verifier debe detectar el cambio correspondiente.

---

## 99. Tests de reordenamiento

Reordenar public vote records.

Si el formato exige orden canónico, el verifier debe rechazar o recanonicalizar y detectar digest distinto según especificación.

---

## 100. Tests de omisión

Eliminar un vote record del package.

Debe cambiar `recordCount`/digest y fallar verificación.

---

## 101. Tests de duplicación

Duplicar un nullifier/record.

Debe fallar unicidad/count/digest.

---

## 102. Tests de manifest replay

Usar votes de elección A con manifest B.

Debe fallar electionContext/root/configuration/protocol binding.

---

## 103. Tests de resultado

Alterar `totalsByOption` manteniendo vote set intacto.

El tally recomputado debe detectar discrepancia.

---

## 104. Integration tests

Con PostgreSQL real:

- append audit event;
- chain/hash;
- checkpoint;
- transacción con dominio;
- rollback;
- concurrency;
- accepted vote set snapshot;
- result generation.

---

## 105. E2E

Flujo completo devnet:

1. crear elección;
2. configurar;
3. freeze elegibilidad;
4. generar manifest;
5. READY;
6. checkpoint;
7. OPEN;
8. emitir votos;
9. CLOSED;
10. fijar accepted vote set;
11. COUNTING;
12. recomputar tally;
13. generar verification package;
14. ejecutar verifier offline;
15. publicar resultados;
16. generar checkpoint final.

---

## 106. E2E tamper

Copiar package válido, modificar un voto/manifest/result y ejecutar verifier.

Debe fallar con error específico.

---

## 107. E2E receipt

Tomar receipt de un voto aceptado y comprobar su presencia en package final sin utilizar identidad del votante.

---

## 108. E2E privacy

Verificar que el package público no contiene identificadores administrativos ni metadata de red.

---

## 109. Métricas

Puede medirse:

```text
audit append failures
checkpoint failures
verification package generation duration
offline verification duration
published package size
```

No incluir PII.

---

## 110. Alertas

Fallos al generar/verificar checkpoints o package final deben impedir publicación de resultados cuando esos artefactos sean requisito.

Fail closed para `RESULTS_PUBLISHED`.

---

## 111. Administración

Operaciones conceptuales:

```text
GenerateElectionManifest
CreateAuditCheckpoint
FreezeAcceptedVoteSet
ComputeTally
GenerateVerificationPackage
PublishResults
```

No crear endpoints que permitan editar evidencia histórica.

---

## 112. API admin conceptual

```text
POST /api/v1/admin/elections/:id/checkpoints
POST /api/v1/admin/elections/:id/verification-package
POST /api/v1/admin/elections/:id/compute-tally
POST /api/v1/admin/elections/:id/publish-results
```

Las rutas exactas pueden ajustarse.

Todas requieren auth/CSRF y reglas de estado.

---

## 113. State machine integration

### DRAFT -> READY
Requiere manifest/config/snapshot/protocol coherentes.

### READY -> OPEN
Debe fijar/publicar evidencia pre-election según política.

### OPEN -> CLOSED
No acepta más votos.

### CLOSED -> COUNTING
Fija `AcceptedVoteSetSnapshot`.

### COUNTING -> RESULTS_PUBLISHED
Requiere tally + package + validaciones.

---

## 114. No bypass

No permitir `PublishResults` desde OPEN/DRAFT.

No permitir recomputar silenciosamente un snapshot final después de publicar.

---

## 115. Idempotencia de generación

Generar dos veces un package para el mismo snapshot final debe producir el mismo content digest.

Publicar dos veces la misma versión debe ser idempotente.

---

## 116. Idempotencia de checkpoint

No crear checkpoints semánticamente distintos por retries accidentales si apuntan al mismo head/rango.

Definir uniqueness adecuada.

---

## 117. Errores conceptuales

```text
AUDIT_APPEND_FAILED
AUDIT_CHAIN_CONFLICT
AUDIT_CHECKPOINT_FAILED
MANIFEST_NOT_FROZEN
MANIFEST_DIGEST_MISMATCH
ACCEPTED_VOTE_SET_NOT_FROZEN
VOTE_SET_DIGEST_MISMATCH
TALLY_MISMATCH
VERIFICATION_PACKAGE_INVALID
VERIFICATION_ARTIFACT_MISSING
RESULTS_NOT_READY
RESULTS_ALREADY_PUBLISHED
PUBLICATION_FAILED
```

---

## 118. Logging del subsistema

Logs pueden incluir:

```text
electionId
artifact type
digest prefix
version
duration
error code
```

No incluir contenido sensible completo.

---

## 119. Estructura conceptual

```text
apps/api/src/modules/audit/
├── domain/
├── application/
├── infrastructure/
│   └── persistence/
└── http/

apps/api/src/modules/verification/
├── domain/
│   ├── election-manifest.ts
│   ├── accepted-vote-set.ts
│   ├── tally-manifest.ts
│   └── verification-errors.ts
├── application/
│   ├── generate-manifest/
│   ├── freeze-vote-set/
│   ├── compute-tally/
│   ├── generate-package/
│   └── publish-results/
├── infrastructure/
│   ├── persistence/
│   ├── artifact-store/
│   └── exporter/
└── http/

packages/verification-protocol/
├── schemas/
├── canonicalization/
├── verifier/
└── fixtures/
```

---

## 120. Shared verification package

`packages/verification-protocol` debe ser utilizable por:

- backend;
- CLI;
- tests;
- potencial frontend/verifier externo.

No depender de NestJS para lógica de verificación pura.

---

## 121. CLI

Conceptualmente:

```text
pnpm verify:election --package ./verification-package
```

Salida no sensible y exit code:

```text
0 = package válido
non-zero = fallo
```

Debe listar checks concretos, no solo “valid/invalid”.

---

## 122. Orden para Codex

1. Crear schemas/versiones públicas.
2. Implementar canonicalización V1.
3. Crear `AuditEvent`.
4. Crear migraciones audit.
5. Implementar append-only repository.
6. Implementar hash chain/checkpoints.
7. Integrar auditoría obligatoria con transacciones relevantes.
8. Crear `ElectionManifestV1`.
9. Implementar manifest digest.
10. Integrar artifact digest registry.
11. Crear `PublicAcceptedVoteV1`.
12. Implementar export canónico JSONL.
13. Crear `AcceptedVoteSetSnapshot`.
14. Implementar vote-set digest.
15. Crear tally V1.
16. Implementar invariantes de conteo.
17. Crear `VerificationArtifactStore` port.
18. Implementar filesystem adapter devnet.
19. Generar verification package.
20. Crear verifier offline/CLI.
21. Crear endpoints públicos/admin necesarios.
22. Integrar state machine.
23. Crear privacy allowlists.
24. Unit tests.
25. PostgreSQL integration tests.
26. tampering/omission/duplication tests.
27. E2E completo.
28. E2E receipt/privacy.
29. README/spec pública.
30. lint/typecheck/test/build.

---

## 123. Criterios de aceptación

La etapa se aprueba cuando:

- audit log no depende de application logs;
- eventos tienen schema/version;
- auditoría obligatoria es transaccional;
- existe hash chain/checkpoint verificable;
- se documenta su límite frente a operador con control total;
- manifest electoral es inmutable/versionado;
- manifest tiene digest reproducible;
- artifacts ZK tienen digests;
- accepted vote set final puede congelarse;
- export público no contiene PII;
- public vote records son canónicos;
- vote-set digest es reproducible;
- tally se recomputa desde conjunto final;
- nullifiers son únicos en verificación offline;
- receipt puede comprobar inclusión;
- existe verification package;
- existe verifier offline;
- tampering/omission/duplication son detectados;
- `RESULTS_PUBLISHED` falla si package/tally no validan;
- no se afirma receipt-freeness/coercion resistance;
- no se introduce blockchain innecesariamente.

---

## 124. Definition of Done

```text
[ ] AuditEvent
[ ] eventVersion
[ ] sequence
[ ] canonicalization V1
[ ] hash chain
[ ] audit checkpoints
[ ] append-only application API
[ ] audit DB permissions strategy
[ ] transactional audit integration
[ ] ElectionManifestV1
[ ] manifest digest
[ ] electionContext binding documented
[ ] ZK artifact digest registry
[ ] pre-election checkpoint
[ ] CLOSED checkpoint
[ ] PublicAcceptedVoteV1
[ ] canonical JSONL export
[ ] AcceptedVoteSetSnapshot
[ ] vote-set digest
[ ] TallyManifestV1
[ ] sum invariant
[ ] unique nullifier offline check
[ ] VerificationArtifactStore
[ ] devnet filesystem adapter
[ ] verification package
[ ] offline verifier
[ ] CLI
[ ] public DTO allowlists
[ ] PII leak tests
[ ] tampering tests
[ ] omission tests
[ ] duplication tests
[ ] replay tests
[ ] tally alteration tests
[ ] PostgreSQL integration
[ ] full E2E
[ ] receipt inclusion E2E
[ ] privacy E2E
[ ] README/spec
[ ] lint/typecheck/test/build
```

---

## 125. Prohibiciones

Codex no debe:

- usar logs como único audit trail;
- editar/borrar audit events por flujo normal;
- afirmar que hash chain en la misma DB es inmutable frente al operador;
- introducir blockchain sin decisión explícita;
- generar claves productivas improvisadas;
- publicar PII;
- exportar entidades DB directamente;
- publicar persona→commitment;
- incluir IP/user-agent/request IDs en registro público;
- incluir identityCommitment en eventos de voto;
- publicar timestamps finos sin necesidad;
- sobrescribir manifests/results/artifacts históricos;
- contar desde requests/logs en lugar de `accepted_votes`;
- contar votos rechazados/duplicados;
- publicar resultados si tally/package no validan;
- diseñar receipt que pruebe selección a terceros sin threat model;
- afirmar receipt-freeness/coercion resistance;
- confiar solo en el CLI oficial como definición del formato;
- usar JSON no canónico para digests;
- depender de NestJS para el verifier puro;
- borrar evidencia requerida para auditabilidad.

---

## 126. Decisiones diferidas

Quedan para etapas posteriores:

- mecanismo concreto de firma de manifests/checkpoints;
- key management productivo;
- almacenamiento durable productivo de artifacts;
- anclaje externo;
- política exacta de publicación de commitments;
- política de publicación temporal de nullifiers;
- Merkle tree de public vote records/inclusion proofs si se desea;
- retención legal/operacional final;
- protocolo de papeleta cifrada si se requiere ballot secrecy frente al servidor.

---

## 127. Siguiente documento

El siguiente documento rector será:

```text
13-conteo-resultados-publicacion.md
```

Debe profundizar en:

- lifecycle `CLOSED -> COUNTING -> RESULTS_PUBLISHED`;
- algoritmo de tally;
- snapshots finales;
- consistencia y recomputación;
- resultados/versiones;
- publicación;
- manejo de cancelaciones/incidentes;
- APIs públicas;
- pruebas de resultados.

---

## 128. Instrucción final para Codex

La transparencia no consiste en publicar más datos, sino en publicar **la evidencia correcta con el mínimo dato correlacionable**.

La propiedad buscada es:

```text
configuración congelada verificable
        +
protocolo/artifacts identificables
        +
conjunto final de votos anónimos reproducible
        +
nullifiers únicos
        +
tally recomputable
        +
digests/checkpoints externos
        =
proceso auditable sin revelar identidad del votante
```

Nunca mejorar “auditoría” a costa de reconstruir `persona -> voto`.
