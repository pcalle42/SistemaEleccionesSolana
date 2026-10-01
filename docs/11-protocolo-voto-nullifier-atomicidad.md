# 11 — Protocolo de Voto, Nullifier y Atomicidad

## Propósito
Define el flujo de aceptación de voto de **Votaciones**, integrando `Election` (08), elegibilidad (09) y ZK (10).

Regla central:

```text
proof válido
+ configuración exacta
+ elección OPEN dentro de [opensAt, closesAt)
+ nullifier no consumido
+ INSERT atómico PostgreSQL
= voto aceptado
```

`snarkjs.verify() == true` nunca es autorización suficiente.

## Boundary
Crear módulo `voting`. No administra padrón, identidad civil ni configuración electoral.

Caso de uso principal:

```text
CastVote
```

Input conceptual:

```text
electionId
protocolVersion
proof
publicSignals
```

Nunca recibe `eligibleVoterId`, `credentialId`, `identityCommitment`, `leafIndex`, `voterSecret` o identidad civil.

Endpoint:

```text
POST /api/v1/elections/:electionId/votes
```

No requiere sesión administrativa ni civil identificada. La elegibilidad la demuestra el proof.

## Payload y validación barata
Payload conceptual:

```json
{
  "protocolVersion": "anonymous-single-choice-v1",
  "proof": {},
  "publicSignals": []
}
```

Antes de criptografía:
- Content-Type y body limit;
- schema estricto;
- protocolVersion allowlisted;
- proof shape;
- cantidad exacta de public signals;
- field elements canónicos;
- electionId válido.

Nunca aceptar verification key, zkey, wasm, circuit, Merkle path o secreto.

## Public signals
Definir mapper tipado:

```text
VotePublicSignalsV1
- merkleRoot
- nullifier
- electionContext
- voteEncoding
```

El orden viene del manifest de etapa 10. Prohibidos índices mágicos dispersos.

## Selección anónima V1
V1 adopta:

```text
voteEncoding = índice de opción anónimo visible para backend
```

El circuito prueba que es válido. El backend conoce la selección al recibirla, pero no debe poder ligarla a identidad administrativa.

Esto **no ofrece ballot secrecy frente a un servidor comprometido** ni elimina correlación de red/timing. Una versión con papeleta cifrada será otro protocolo.

## Persistencia
Tabla principal conceptual:

```text
accepted_votes
- id
- election_id
- configuration_version
- protocol_version
- circuit_version
- nullifier
- vote_encoding
- accepted_at
- submission_fingerprint
- receipt_commitment
- proof_digest?
- public_signals_digest?
```

No incluir FK hacia:

```text
eligible_voters
electoral_credentials
eligibility_snapshot_members
admin_account
```

`VoteId` es opaco y no codifica nullifier, IP, timestamp ni identidad.

## Nullifier
El nullifier es public signal constrained por el circuito. El backend valida encoding, verifica proof y lo persiste con unicidad.

Preferencia V1:

```text
UNIQUE(election_id, protocol_version, nullifier)
```

Aunque `electionContext` ya tenga domain separation, `election_id` explícito aporta defensa en profundidad.

## PostgreSQL es el árbitro
Nunca usar como garantía primaria:

```text
if (!exists(nullifier)) insert(...)
```

Dos requests pueden superar ese check.

La garantía es `INSERT` protegido por UNIQUE. Ante dos requests simultáneos con el mismo nullifier:

```text
A -> INSERT succeeds
B -> UNIQUE violation
```

Solo uno gana.

Valkey nunca es autoridad de doble voto.

## Verificación y transacción corta
No mantener transacción DB abierta durante proof verification.

Flujo:

```text
1. validar request
2. cargar contexto electoral esperado
3. prevalidar estado/ventana
4. validar root/context/protocol preliminarmente
5. verificar proof fuera de transacción larga
6. BEGIN
7. lock/reload configuración electoral
8. obtener acceptedAt autoritativo
9. revalidar estado/ventana/configuración/root/context/protocol
10. INSERT accepted_vote
11. INSERT evidencia obligatoria/registro transaccional
12. COMMIT
13. devolver receipt
```

La segunda validación dentro de la transacción es obligatoria.

## TOCTOU
Entre proof verification e INSERT la elección puede cerrar/cancelarse.

En commit debe cumplirse:

```text
status == OPEN
acceptedAt >= opensAt
acceptedAt < closesAt
configurationVersion == expected
merkleRoot == expected
electionContext == expected
protocolVersion == expected
```

No confiar en timestamp del cliente.

Para aceptación final preferir tiempo obtenido de PostgreSQL o estrategia documentada consistente con DB.

## Vote vs close/cancel
`CastVote`, `CloseElection` y `CancelElection` deben coordinarse con PostgreSQL mediante row lock/conditional state/versioning o estrategia equivalente.

Debe existir orden observable:

```text
vote commit -> cierre
```

o:

```text
cierre commit -> vote rejected
```

Nunca aceptar un voto después de que cierre/cancelación haya ganado el orden transaccional.

No mantener el lock durante ZK verification.

## Root/context/protocol
`merkleRoot` debe coincidir exactamente con snapshot FROZEN asociado a election/configuration/protocol.

`electionContext` debe coincidir con la derivación canónica de etapa 10.

La elección declara la protocol/circuit version congelada. El cliente no elige libremente otra versión globalmente soportada.

`voteEncoding` se mapea a una opción válida de la misma configurationVersion. No confiar en labels enviados por cliente.

## Proof verification
Ejecutar `VoteProofVerifier.verify()` solo después de validaciones baratas.

Verification artifacts se resuelven internamente. Si faltan/corrompen:

```text
ZK_VERIFIER_UNAVAILABLE
```

Fail closed. V1 no acepta votos “para verificar después”.

## Evidencia
No es obligatorio inflar la row principal con proof completo.

Si la verificabilidad posterior exige conservarlo, usar conceptualmente:

```text
vote_proof_evidence
- vote_id
- proof
- public_signals
- proof_digest
- created_at
```

sin identidad.

Si la evidencia es obligatoria, voto + evidencia deben hacer commit atómico.

Los digests usan serialización canónica/versionada; nunca JSON arbitrario.

## Receipt
Después del commit devolver receipt anónimo:

```text
receiptVersion
electionId
nullifier
receiptCommitment
acceptedAt
```

El nullifier puede servir como handle anónimo.

V1 puede derivar:

```text
receiptCommitment =
  SHA-256(
    canonical(
      receiptVersion,
      electionId,
      configurationVersion,
      protocolVersion,
      nullifier,
      voteEncoding,
      acceptedAt
    )
  )
```

La serialización debe ser inequívoca/versionada.

No inventar firma digital sin key management. Un hash devuelto por el mismo servidor **no prueba por sí solo inclusión final**; cobra valor al contrastarse con un registro verificable posterior.

Los datos para reconstruir receipt quedan en el mismo commit.

## Idempotencia y retries
Caso crítico:

```text
DB commit
respuesta HTTP se pierde
cliente reintenta
```

No crear segundo voto.

Persistir:

```text
submissionFingerprint
```

No depender de bytes del proof: Groth16 puede producir proofs diferentes para el mismo witness/voto.

Recomendación V1:

```text
submissionFingerprint =
  SHA-256(
    canonical(
      protocolVersion,
      electionContext,
      merkleRoot,
      nullifier,
      voteEncoding
    )
  )
```

### Same nullifier + same logical vote
Si UNIQUE falla y fingerprint coincide, devolver el receipt existente. El retry es idempotente y conserva `acceptedAt`.

### Same nullifier + different vote
Si fingerprint difiere:

```text
NULLIFIER_ALREADY_USED
```

No revelar la selección previa. No reemplazar el voto. El primer commit gana.

`Idempotency-Key` HTTP puede añadirse como ayuda, pero nunca reemplaza UNIQUE nullifier.

## Duplicate handling
Ante UNIQUE violation:

```text
1. rollback/savepoint según adapter
2. lookup por election+protocol+nullifier
3. comparar submissionFingerprint
4. coincide -> receipt existente
5. difiere -> NULLIFIER_ALREADY_USED
```

No devolver `voteEncoding` almacenado.

## Respuesta
Éxito conceptual:

```json
{
  "status": "accepted",
  "receipt": {
    "receiptVersion": "...",
    "electionId": "...",
    "nullifier": "...",
    "receiptCommitment": "...",
    "acceptedAt": "..."
  }
}
```

Un retry equivalente devuelve el mismo receipt lógico.

## Errores
Códigos conceptuales:

```text
ELECTION_NOT_FOUND
ELECTION_NOT_OPEN
ELECTION_NOT_STARTED
ELECTION_CLOSED
UNSUPPORTED_PROTOCOL_VERSION
PROOF_ROOT_MISMATCH
PROOF_ELECTION_CONTEXT_MISMATCH
PROOF_VERIFICATION_FAILED
INVALID_VOTE_ENCODING
NULLIFIER_ALREADY_USED
VOTE_SUBMISSION_CONFLICT
ZK_VERIFIER_UNAVAILABLE
VOTE_ACCEPTANCE_UNAVAILABLE
```

Mapear conforme documento 06. No exponer SQL/snarkjs internals.

## Pre-check de nullifier
Puede existir internamente para ahorrar CPU, pero es solo optimización. Nunca reemplaza UNIQUE INSERT.

No crear automáticamente un endpoint público `GET /nullifiers/:value`; puede facilitar enumeración. La publicación verificable se diseña en etapa 12.

## DoS y rate limiting
Aplicar payload limits, rate limiting y límites de concurrencia de proof verification.

Estas defensas son operacionales, no determinan elegibilidad ni doble voto.

No usar IP como mecanismo electoral ni bloquear injustamente NATs como garantía de unicidad.

## Valkey
Puede ayudar en rate limiting/cache/semaphore, pero nunca decide:
- nullifier consumido;
- voto aceptado;
- estado electoral;
- receipt definitivo.

PostgreSQL es autoridad.

## Atomicidad
Pseudoflujo final:

```text
validateRequest()
loadExpectedElectionContext()
precheckElection()
validatePublicSignals()
verifyProof()

BEGIN
  lock/reload election
  acceptedAt = authoritativeNow()
  assert OPEN
  assert opensAt <= acceptedAt < closesAt
  assert frozen config/root/context/protocol unchanged
  assert voteEncoding valid
  INSERT accepted_vote(...)
  INSERT required proof evidence(...)
  INSERT required transactional audit/outbox(...)
COMMIT

return receipt
```

No publicar eventos externos antes del commit. Si posteriormente existe mensajería, usar outbox transaccional cuando corresponda.

## Auditoría y privacidad
Eventos técnicos posibles:

```text
vote_accepted
vote_rejected_invalid_proof
vote_rejected_duplicate_nullifier
```

No asociar `EligibleVoterId` como actor. Usar actor anónimo/ausente.

No incluir identidad, commitment, leaf index, IP completa ni selección en auditoría salvo necesidad explícita.

Audit log interno y registro público verificable son conceptos distintos.

## Logging
Nunca registrar:
- request body completo del voto;
- proof/public signals completos por defecto;
- selección junto con IP/request fingerprint;
- voterSecret;
- Merkle path;
- identityCommitment;
- cookies de provisioning.

Request IDs operacionales no se reutilizan desde provisioning.

IP puede usarse temporalmente para seguridad/rate limiting, pero no se guarda en `accepted_votes`, receipt, fingerprint o nullifier.

## acceptedAt y correlación
`acceptedAt` puede requerir precisión interna para cierre, pero publicar timestamps demasiado precisos puede facilitar correlación.

La política pública debe minimizar granularidad cuando no sea necesaria.

El orden de inserción/timestamp no tiene significado electoral.

## Reglas temporales
Incluso si status sigue OPEN:

```text
acceptedAt >= closesAt -> reject
```

Si status sigue READY aunque `opensAt` haya pasado:

```text
reject
```

Se mantiene `[opensAt, closesAt)` y apertura explícita.

## Inmutabilidad
No existe operación normal:

```text
UPDATE accepted_votes SET vote_encoding = ...
```

No permitir “cambiar voto” en V1.

No borrar votos individualmente por API administrativa.

## Fallos
### Antes del commit
No hay voto aceptado ni receipt exitoso.

### Después del commit, antes de response
Retry recupera receipt por nullifier/fingerprint.

### PostgreSQL caído
Fail closed. Nunca guardar temporalmente en Valkey/memoria/filesystem para sincronizar luego.

### Verifier caído
Fail closed.

### Election repository/authority no disponible
Fail closed. Cache no es autoridad.

## Conteo V1
Como `voteEncoding` es selección anónima en claro, el conteo posterior puede agregar `accepted_votes`.

Solo cuentan votos committed de la configuration/protocol correctos.

La publicación de resultados se define después.

## Schema conceptual
```text
accepted_votes
vote_proof_evidence
```

Constraints principales:

```text
PK(id)
FK(election_id)
NOT NULL configuration_version
NOT NULL protocol_version
NOT NULL circuit_version
NOT NULL nullifier
NOT NULL vote_encoding
NOT NULL accepted_at
NOT NULL submission_fingerprint
NOT NULL receipt_commitment
UNIQUE(election_id, protocol_version, nullifier)
```

Elegir representación canónica única para field elements, por ejemplo decimal validado o bytes fixed-length. No mezclar formatos.

`vote_encoding` almacena índice canónico, no label.

Proof JSONB, si se usa, tiene schema/version explícito y se trata como evidencia opaca, no como fuente de lógica electoral.

## Ports
```text
VoteRepository
- accept(...)
- findByNullifier(...)
- findReceipt(...)
```

No CRUD genérico.

Si existe `ProofEvidenceRepository`, debe compartir la misma unidad transaccional cuando evidencia sea obligatoria.

Crear función/servicio puro para reconstrucción determinista de `VoteReceipt`.

## Testing
### Unit
- public signals mapper;
- root/context/protocol mismatch;
- vote encoding;
- receipt canonicalization;
- fingerprint;
- duplicate same vote;
- duplicate different vote;
- error mapping.

### PostgreSQL integration
- insert válido;
- UNIQUE nullifier;
- rollback;
- evidence atomicity;
- receipt reconstruction;
- canonical field storage;
- immutable vote;
- lookup por nullifier.

### Concurrency
Obligatorios:

```text
same nullifier + same vote:
  1 row
  same logical receipt for equivalent retries

same nullifier + different vote:
  1 winner
  conflicts for rest
  no previous choice disclosure

vote vs close:
  test both commit orders

vote vs cancel:
  test both commit orders

acceptedAt == closesAt:
  reject
```

### ZK integration
- valid proof;
- altered proof;
- wrong root;
- wrong context;
- wrong protocol;
- invalid option;
- cross-election replay;
- regenerated proof for same logical vote.

### E2E
1. configurar elección;
2. registrar commitment;
3. freeze snapshot;
4. READY;
5. OPEN;
6. generar proof;
7. cast vote;
8. obtener receipt;
9. retry mismo voto -> mismo receipt;
10. misma credential/otra selección -> conflicto;
11. CLOSED;
12. nuevo voto -> rechazo.

### Timeout-after-commit
Simular commit exitoso y corte antes del response. Retry recupera receipt sin segundo voto.

### Failure tests
DB/verifier indisponibles no producen aceptación parcial.

### Security
Oversized proof, malformed field, extra properties, unknown protocol, duplicate race, flood control y logs redacted.

## OpenAPI
Documentar endpoint, protocolVersion, schemas versionados, receipt, errores y límites. Nunca documentar secretos como inputs.

## Estructura conceptual
```text
apps/api/src/modules/voting/
├── domain/
│   ├── accepted-vote.ts
│   ├── vote-receipt.ts
│   └── voting-errors.ts
├── application/
│   └── cast-vote/
├── infrastructure/
│   └── persistence/
└── http/
    └── public-voting.controller.ts
```

El ZK verifier permanece detrás del boundary de etapa 10.

## Orden para Codex
1. Value objects de voto/nullifier/receipt.
2. Mapper public signals V1.
3. `VoteRepository`.
4. Migraciones `accepted_votes`.
5. Proof evidence schema si aplica.
6. UNIQUE nullifier.
7. Canonical field encoding.
8. `submissionFingerprint`.
9. Receipt V1.
10. Adapter PostgreSQL transaccional.
11. Integrar `VoteProofVerifier`.
12. Prevalidaciones.
13. Fase transaccional corta.
14. Coordinar vote/close/cancel.
15. Retry/duplicate semantics.
16. Controller público.
17. Payload limits/rate limiting.
18. Logging redaction.
19. Unit tests.
20. Integration tests.
21. Concurrency tests.
22. ZK integration.
23. E2E + timeout-after-commit.
24. OpenAPI/README.
25. lint/typecheck/test/build.

## Criterios de aceptación
- `CastVote` no recibe identidad;
- proof contra protocol/root/context congelados;
- elección revalidada dentro de transacción;
- `[opensAt, closesAt)` con tiempo autoritativo;
- UNIQUE nullifier en PostgreSQL;
- carreras aceptan un solo voto;
- close/cancel coordinados;
- sin locks largos durante ZK;
- voto inmutable;
- retry exacto recupera receipt;
- retry conflictivo no reemplaza voto;
- DB/verifier fail closed;
- sin FK voto→identidad/credential/member;
- logs sin correlación identidad-selección;
- receipt reproducible;
- concurrency/timeout tests pasan.

## Definition of Done
```text
[ ] CastVote
[ ] public vote endpoint
[ ] strict DTO/schema + payload limits
[ ] VotePublicSignalsV1 mapper
[ ] root/context/protocol validation
[ ] voteEncoding validation
[ ] VoteProofVerifier integration
[ ] accepted_votes migration
[ ] proof evidence strategy
[ ] canonical nullifier storage
[ ] UNIQUE nullifier
[ ] submissionFingerprint
[ ] receipt V1
[ ] canonical receipt digest
[ ] short DB transaction
[ ] revalidation in transaction
[ ] authoritative acceptedAt
[ ] vote/close coordination
[ ] vote/cancel coordination
[ ] same-vote retry
[ ] different-vote conflict
[ ] immutable votes
[ ] no identity FK
[ ] DB/verifier fail closed
[ ] operational rate limiting
[ ] sensitive logs redacted
[ ] unit/integration/concurrency/ZK tests
[ ] timeout-after-commit E2E
[ ] OpenAPI/README
[ ] lint/typecheck/test/build
```

## Prohibiciones
Codex no debe:
- aceptar solo porque snarkjs verify=true;
- usar `exists(nullifier)` como garantía primaria;
- usar Valkey para unicidad;
- mantener DB transaction/row lock durante proof verification;
- confiar en cache al commit;
- aceptar root/context/protocol no congelados;
- aceptar voto en `closesAt`;
- guardar voter/credential/member IDs o IP en voto;
- loguear body completo;
- modificar/borrar voto aceptado por flujo normal;
- permitir segundo voto con mismo nullifier;
- reemplazar primer voto por retry conflictivo;
- revelar selección previa ante duplicate;
- aceptar offline en memoria/Valkey si DB falla;
- aceptar proof para verificar después;
- generar receipt antes del commit;
- afirmar que receipt hash aislado prueba inclusión;
- confundir rate limiting con elegibilidad.

## Siguiente etapa
El siguiente documento debe definir:

```text
12-auditoria-transparencia-verificabilidad.md
```

Incluyendo audit log administrativo append-only, integridad, registro público verificable, manifests, receipts/nullifiers, evidencia de inclusión, redacción de PII, retención y exportación para auditoría.

## Instrucción final
La aceptación de voto es una operación transaccional:

```text
valid proof
+ exact frozen context
+ OPEN dentro de [opensAt, closesAt)
+ UNIQUE nullifier INSERT
+ atomic commit
= one accepted anonymous vote
```

Ningún cache, distributed lock o pre-check sustituye esta propiedad.
