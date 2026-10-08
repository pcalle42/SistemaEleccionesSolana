# 15 — Testing, Integración, E2E y Seguridad

## Propósito

Este documento convierte las invariantes de `00`–`14` en contratos ejecutables. La meta no es maximizar coverage, sino detectar regresiones electorales, criptográficas, transaccionales, de privacidad y seguridad.

```text
una propiedad crítica sin prueba reproducible
= una propiedad que puede romperse sin ser detectada
```

## 1. Capas de prueba

La estrategia incluye:

```text
unit
component
contract
integration
ZK
property
concurrency
E2E
adversarial/security
fault-injection
reproducibility
performance
```

Mocks son apropiados para lógica pura. No deben sustituir PostgreSQL, Valkey, Circom/snarkjs, WASM, Web Crypto o navegador real cuando la propiedad depende de ellos.

## 2. Entornos aislados

Definir `test-unit`, `test-integration`, `test-e2e` y `devnet`. Integration/E2E usan Docker y recursos exclusivos.

Antes de cualquier reset destructivo, validar environment, host, nombre de DB y namespace/Compose project. Rechazar targets no identificados como test. Los scripts destructivos fallan por defecto y requieren `--force` cuando corresponda.

## 3. PostgreSQL real

Usar la misma major soportada por el proyecto. Probar migraciones, constraints, transacciones, row locks, UNIQUE, rollback e índices relevantes.

SQLite/in-memory DB no sustituye PostgreSQL para estas propiedades.

## 4. Valkey real

Probar Valkey real cuando una feature lo use. Debe demostrarse que `flush`, restart, stale cache o TTL expiry no destruyen estado electoral autoritativo.

Valkey nunca es la única fuente de voto aceptado, estado electoral o resultado.

## 5. ZK real

Los tests de protocolo ejecutan Circom/snarkjs y artifacts reales de test/devnet. No mockear `verify()` para afirmar que el protocolo funciona.

## 6. Navegador real

Al menos el E2E principal de voter/admin usa navegador real y ejercita Web Crypto, WASM, Worker, cookies, CSRF, CSP y fallos de red.

## 7. Convenciones

Sugerencia:

```text
*.spec.ts
*.integration.spec.ts
*.contract.spec.ts
*.property.spec.ts
*.concurrency.spec.ts
*.e2e.spec.ts
*.security.spec.ts
```

El runner exacto puede fijarse por ADR si aún está abierto.

## 8. Fixtures

Usar fixtures sintéticos, pequeños, explícitos, versionados y sin PII real. Los secretos ZK de test pueden ser públicos si están marcados `TEST ONLY` y jamás se reutilizan fuera de test/devnet.

## 9. Clock

Inyectar clock en lógica de dominio. Probar exactamente:

```text
opensAt - epsilon
opensAt
closesAt - epsilon
closesAt
closesAt + epsilon
```

Semántica obligatoria:

```text
[opensAt, closesAt)
```

# Unit y Contract

## 10. Unit tests críticos

Cubrir state machine electoral, auth/admin, elegibilidad, commitments/Merkle, canonicalización, electionContext, nullifier, vote encoding, receipt, auditoría, tally, digests y frontend state machines.

Toda transición crítica necesita casos positivos y negativos.

## 11. Contract tests

Evitar divergencia frontend/backend/CLI sobre:

```text
ElectionManifestV1
VoterCredentialV1
VotePublicSignalsV1
CastVote request
VoteReceiptV1
PublicAcceptedVoteV1
TallyManifestV1
ElectionResultV1
VerificationPackageManifest
AuditCheckpointV1
```

Probar versiones soportadas/desconocidas y rechazo de propiedades extra donde el schema sea estricto. Nunca hacer fallback silencioso de protocolo.

# PostgreSQL Integration y Concurrencia

## 12. Migraciones y constraints

En DB limpia:

```text
migrate up
validate schema
run integration suite
```

Probar directamente UNIQUE nullifier, FKs válidas, snapshot/tally/result version uniqueness y NOT NULL críticos.

## 13. Rollback

Forzar errores a mitad de:

```text
vote + proof evidence
transition + audit
snapshot + state transition
tally + audit
```

No debe quedar estado parcial.

## 14. Concurrencia real

Usar conexiones realmente concurrentes y barriers/latches controlados. No simular carreras con dos `await` secuenciales ni depender únicamente de sleeps.

## 15. Same nullifier + same vote

Lanzar N requests concurrentes.

Esperado:

```text
exactly 1 accepted_votes row
same logical receipt for equivalent retries
no duplicate vote
```

## 16. Same nullifier + different vote

Esperado:

```text
one winner
one accepted row
others conflict
no previous selection disclosure
```

## 17. Vote vs CloseElection

Forzar ambos órdenes:

```text
vote commit -> close commit
close commit -> vote attempt
```

Primer orden incluye el voto; segundo lo rechaza. Nunca estado ambiguo.

## 18. Vote vs CancelElection

Misma prueba: si cancel commit gana, no entra voto posterior.

## 19. Freeze races

Probar que configuración/elegibilidad congelada no puede mutarse mediante carreras.

## 20. Counting/publication concurrency

Dos workers intentan `EnterCounting`, `ComputeTally` o `PublishResults`. Debe existir una sola versión lógica o conflicto/idempotencia controlada.

## 21. Audit concurrency

Probar sequence/hash chain/checkpoints bajo concurrencia. No perder eventos obligatorios.

# Valkey Integration

## 22. Casos

```text
Valkey unavailable
Valkey flushed
Valkey restarted
stale cache
TTL expiry
```

El sistema conserva las invariantes en PostgreSQL. Si hay locks auxiliares en Valkey, perderlos no puede permitir doble voto.

# ZK

## 23. Golden vectors

Mantener vectors versionados con secretos ficticios:

```text
voterSecret
identityCommitment
Merkle tree/path
electionContext
voteEncoding
nullifier
expected public signals
```

Los mismos vectors deben coincidir en Circom, shared crypto TS, voter-web, backend verifier y offline verifier.

## 24. Positive proof

Por cada circuitVersion soportada:

```text
generate witness
generate proof
verify proof
```

## 25. Negative proofs

Debe fallar al alterar proof, secret, path, root, leaf, electionContext, voteEncoding, public signal o version.

## 26. Membership y rango

Credential fuera de root congelada falla. `voteEncoding` fuera del rango de opciones falla en circuito/backend.

## 27. Cross-election replay

Proof de elección A presentado en B:

```text
reject
```

## 28. Cross-root replay

Proof contra una root anterior/diferente:

```text
reject
```

## 29. Nullifier determinism

Misma credential + mismo election context produce el mismo nullifier según protocolo; context distinto produce el comportamiento definido por domain separation.

## 30. Regenerated proof

Dos proofs distintos del mismo voto lógico deben conservar nullifier/fingerprint lógico. Esto prueba la idempotencia de etapa 11.

## 31. Artifact tampering

Alterar verification key, WASM, zkey, R1CS o manifest digest debe detectarse.

Cada bug de circuito corregido añade un test negativo permanente.

# Property Testing

## 32. Tally

Para conjuntos válidos:

```text
sum(totals) == numberOfVotes
permutation(input) does not change tally
all counts >= 0
all configured options represented
```

## 33. State machine

Generar secuencias de comandos y demostrar que estados prohibidos no son alcanzables. `RESULTS_PUBLISHED` solo surge del flujo permitido.

## 34. Canonicalization

Objetos semánticamente iguales producen bytes/digests iguales; cambios en campos comprometidos cambian digest.

## 35. Merkle

Probar múltiples tamaños: root determinista, path válido, y fallo al alterar leaf/sibling/index.

## 36. Receipt

Mismo voto committed produce receipt reproducible; cambiar un campo comprometido cambia commitment.

# E2E Electoral

## 37. Happy path completo

Ejecutar:

```text
bootstrap limpio
admin login
crear/configurar elección
registrar votantes ficticios
generar commitments
freeze eligibility
verificar root
READY -> OPEN
voter-web genera proof
CastVote
receipt
múltiples votantes
CLOSED
freeze final vote set
COUNTING
tally
verification package
offline verify
publish
RESULTS_PUBLISHED
receipt inclusion
recompute result
```

Al menos un camino usa frontend real; otros escenarios pueden usar helpers/API para velocidad.

## 38. Zero votes

Si la política permite publicación:

```text
recordCount = 0
all option totals = 0
```

## 39. Duplicados

Misma credential dos veces: un accepted vote. Con distinta selección: primer commit gana y no se revela la selección previa.

## 40. Closed/boundary

Proof válido enviado después de CLOSED o exactamente en `closesAt` debe rechazarse.

## 41. Wrong election/root

Proof válido para otra elección o snapshot debe rechazarse.

## 42. Unknown outcome

Simular:

```text
DB commit
HTTP response lost
```

El frontend reintenta y obtiene el mismo receipt sin segundo voto.

## 43. Restarts

Reiniciar API: estado crítico se recupera desde PostgreSQL/artifacts.

Reiniciar/flush Valkey: no se pierde voto, elección, snapshot o resultado.

## 44. PostgreSQL failure

Fallo antes del commit: no hay voto aceptado. Fallo después del commit: voto persiste. Nunca fallback a Valkey/memoria/filesystem.

## 45. Verifier unavailable

Fail closed. No aceptar “pendiente de verificar”.

## 46. Artifact mismatch

Frontend/backend deben detenerse ante digest inesperado.

## 47. Cancelled election

No acepta votos posteriores ni publica resultado oficial normal.

# Privacy Tests

## 48. CastVote payload

Capturar request real y afirmar ausencia de:

```text
eligibleVoterId
credentialId
externalReference
voterSecret
civil identity
admin cookie
private Merkle path
```

## 49. accepted_votes schema

Test/migration guard contra aparición accidental de:

```text
eligible_voter_id
credential_id
identity_commitment
ip_address
user_agent
```

sin ADR explícito.

## 50. Public export

Allowlist test que falle si aparecen identificadores administrativos, session IDs, IP o user-agent.

## 51. Canary leak test

Ejecutar el flujo con valores canary únicos para secretos/PII ficticia y buscarlos en logs/exports. No deben aparecer donde estén prohibidos.

## 52. Browser storage

Inspeccionar localStorage, sessionStorage, IndexedDB, Cache Storage y cookies después del flujo y validar la política de etapa 14.

## 53. URLs y terceros

Secretos/proofs/tokens no aparecen en URL/history. El voter E2E falla si contacta orígenes terceros no allowlisted.

Los tests no pueden demostrar anonimato frente a un observador global; documentar esa limitación.

# Security / Adversarial

## 54. Malformed input

Probar invalid JSON, oversized body, extra properties, wrong types, huge arrays, malformed fields, protocol desconocido e IDs inválidos.

## 55. Auth/authorization

Probar password incorrecto, sesión expirada, CSRF ausente/inválido, mutación admin sin auth y rate limiting.

Cada endpoint administrativo sensible necesita test negativo de autorización; ocultar un botón no cuenta.

## 56. Injection/XSS

Probar queries parametrizadas y payloads XSS en title/description/options/audit display. El navegador renderiza texto seguro.

## 57. CORS/headers

Validar allowlists, CSP, frame protection, nosniff, Referrer-Policy y Permissions-Policy.

## 58. Replay

Repetir same request, same proof, regenerated proof y cross-election proof y verificar la semántica esperada.

## 59. DoS controls

Sin convertir CI en load test destructivo, comprobar body limits, proof concurrency limits, rate limits, timeouts y graceful rejection.

## 60. Supply chain

CI puede ejecutar dependency/security/secret scans aprobados. Un scanner no reemplaza threat model ni pruebas. Definir política de severidades para evitar ruido permanente.

# Verification / Tamper

## 61. Package válido

```text
pnpm verify:election --package <path>
```

retorna exit code 0.

## 62. Tampering

Debe fallar al:

- modificar manifest;
- omitir voto;
- duplicar voto/nullifier;
- cambiar voteEncoding;
- alterar tally;
- alterar verification key/artifact;
- alterar checkpoint;
- romper previousResultDigest.

# Fault Injection

## 63. CastVote fault points

Inyectar fallo:

```text
before verify
after verify / before transaction
after lock
before insert
after vote insert / before evidence
before commit
after commit / before response
```

Comprobar exactamente el estado esperado.

## 64. Counting faults

Fallar durante canonical export, después de artifact antes de snapshot metadata, después de snapshot, durante tally y antes de audit. Retry debe converger.

## 65. Publication faults

Fallar en staging, upload parcial, digest verification, DB update, crash después de artifact almacenado y antes de `RESULTS_PUBLISHED`.

Nunca exponer package parcial como oficial.

## 66. Audit faults

Si el audit event es obligatorio y transaccional, fallo de append aborta la operación. Para outbox/eventos secundarios, probar la semántica documentada.

# Reproducibilidad

## 67. Clean checkout

Debe funcionar:

```text
fresh checkout
pnpm install --frozen-lockfile
Docker build
migrate
test
devnet E2E
```

sin pasos manuales ocultos.

## 68. Digests reproducibles

Mismo estado final produce:

```text
same acceptedVoteSetDigest
same tallyDigest
same resultContentDigest
```

No deben variar por hostname, container ID, timezone, locale, path absoluto o timestamps excluidos del contenido comprometido.

# Performance

## 69. ZK baseline

Medir por circuitVersion:

```text
witness time
proof time
verify time
peak memory
artifact size
```

## 70. API/tally baseline

Medir validation, proof verification, DB commit, proof concurrency, canonical export, SHA-256 streaming, tally, package build y offline verify.

No inventar SLOs antes de requisitos/baselines reales.

# Coverage

## 71. Política

Coverage es señal secundaria. Priorizar domain invariants, security branches, error paths, transactions, protocol mappings y canonicalization.

Toda corrección de bug crítico añade test de regresión. Toda nueva invariancia electoral debe incluir una prueba que falle si se elimina.

# CI Gates

## 72. Pull Request

Mínimo:

```text
install frozen
format check
lint
typecheck
unit
contract
build
```

Cambios en `zk`, voting, eligibility, auth, migrations, canonicalization, results o verification ejecutan suites relevantes completas.

## 73. Main

Debe incluir:

```text
PostgreSQL integration
Valkey integration
ZK
concurrency
core E2E
privacy/security
verification tamper
```

## 74. Release

Antes de release candidata:

```text
clean build
all migrations
full suite
full devnet E2E
offline verification
approved security scans
artifact digests
reproducibility checks
```

Ningún test crítico puede ser `allowed to fail`.

## 75. Flakiness

No mantener tests críticos permanentemente skipped/quarantined. No ocultar races con retries indiscriminados o bajando todo el parallelism.

## 76. CI artifacts

En fallos, conservar reportes, screenshots/traces sanitizados, logs sanitizados y packages de fixtures cuando sea seguro. Nunca secretos/witnesses reales.

# Seeds y estructura

## 77. Golden vectors

```text
test-vectors/
└── protocol-v1/
    ├── identity.json
    ├── merkle.json
    ├── vote.json
    ├── receipt.json
    └── result.json
```

Cambiar un golden vector que afecta protocolo requiere explicación/versionado.

## 78. Estructura conceptual

```text
tests/
├── contract/
├── integration/
│   ├── postgres/
│   └── valkey/
├── concurrency/
├── e2e/
│   ├── admin/
│   ├── voter/
│   ├── election/
│   ├── privacy/
│   └── verification/
├── security/
├── fault-injection/
├── performance/
├── fixtures/
└── test-vectors/

zk/tests/
apps/*/tests/
```

## 79. Scripts raíz

```text
pnpm test
pnpm test:unit
pnpm test:contract
pnpm test:integration
pnpm test:zk
pnpm test:concurrency
pnpm test:e2e
pnpm test:security
pnpm test:verification
pnpm test:all
```

Infra:

```text
pnpm test:infra:up
pnpm test:infra:down
pnpm test:infra:reset --force
```

No crear scripts que siempre devuelvan éxito.

# Matriz mínima de invariantes

## 80. Matriz

| Invariante | Suite mínima |
|---|---|
| solo OPEN acepta voto | integration + E2E |
| `[opensAt, closesAt)` | unit + integration |
| una credential deriva nullifier esperado | ZK |
| un nullifier aceptado una vez | concurrency |
| retry post-commit no duplica | fault-injection + E2E |
| vote vs close tiene orden único | concurrency |
| voto no contiene identidad | schema + privacy E2E |
| proof ligado a electionContext | ZK + E2E |
| proof ligado a root congelada | ZK + E2E |
| Valkey no es autoridad | integration + E2E |
| accepted vote inmutable | DB integration |
| tally deriva del set final | integration + verifier |
| sum totals = accepted count | unit + property + E2E |
| package tampering detectable | tamper E2E |
| results no se sobrescriben | integration |
| audit obligatorio no se pierde | transaction integration |
| frontend no filtra secreto | privacy/security E2E |

Mantener esta matriz al añadir invariantes.

# Orden para Codex

## 81. Implementación

1. Leer `00`–`14`.
2. Inventariar invariantes.
3. Crear matriz invariante→test.
4. ADR de runners si falta.
5. Infra Docker aislada de test.
6. Guard destructivo PostgreSQL.
7. Fixtures sintéticos.
8. Golden ZK vectors.
9. Unit tests.
10. Contract tests.
11. PostgreSQL integration.
12. Valkey integration.
13. ZK positive/negative.
14. Property tests.
15. Concurrency harness.
16. Nullifier races.
17. Vote/close/cancel races.
18. Counting/publication races.
19. Full election E2E.
20. Browser E2E.
21. Privacy suite.
22. Security/adversarial suite.
23. Tamper suite.
24. Fault injection.
25. Reproducibility.
26. Performance baseline.
27. Root scripts.
28. CI gates.
29. Troubleshooting docs.
30. Full run desde checkout limpio.

# Criterios de aceptación

## 82. Acceptance

- tests destructivos solo operan en entorno aislado;
- PostgreSQL/Valkey reales;
- Circom/snarkjs reales en protocolo;
- matriz de invariantes;
- carrera real de nullifier;
- vote vs close/cancel;
- timeout-after-commit;
- cross-election/root replay falla;
- proof alterado falla;
- Valkey reset no pierde estado autoritativo;
- CastVote E2E no contiene identidad;
- logs/exports pasan no-leak tests;
- tally se recomputa;
- tampering se detecta;
- crash/retry converge;
- checkout limpio reproduce suite;
- gates críticos no son optional/allowed-to-fail.

# Definition of Done

## 83. DoD

```text
[ ] invariant matrix
[ ] isolated test Docker environment
[ ] destructive DB guard
[ ] synthetic fixtures
[ ] golden vectors
[ ] unit suite
[ ] contract suite
[ ] PostgreSQL integration
[ ] Valkey integration
[ ] ZK positive/negative
[ ] cross-election replay
[ ] cross-root replay
[ ] property tests
[ ] concurrency harness
[ ] duplicate nullifier race
[ ] conflicting vote race
[ ] vote vs close
[ ] vote vs cancel
[ ] counting/publication concurrency
[ ] full election E2E
[ ] browser voter/admin E2E
[ ] privacy E2E
[ ] security/adversarial suite
[ ] XSS/CSRF/CORS/header tests
[ ] verification tamper suite
[ ] fault injection
[ ] timeout-after-commit
[ ] PostgreSQL failure cases
[ ] Valkey restart/flush
[ ] verifier unavailable
[ ] reproducibility tests
[ ] performance baseline
[ ] root test scripts
[ ] PR/main/release gates
[ ] sanitized CI artifacts
[ ] clean-checkout full run
```

# Prohibiciones

## 84. Codex no debe

- usar SQLite para afirmar comportamiento PostgreSQL;
- mockear snarkjs en la suite de protocolo;
- simular concurrencia secuencialmente;
- usar sleeps como única sincronización de races;
- resetear sin verificar target;
- usar PII real;
- depender del orden global de tests;
- esconder races reduciendo parallelism;
- dejar suites críticas skipped;
- permitir tests críticos `allowed to fail`;
- perseguir 100% coverage con tests vacíos;
- probar autorización solo ocultando UI;
- omitir negative ZK tests;
- aceptar flakiness permanente;
- subir secretos como CI artifacts;
- tratar scanners como sustituto de security tests;
- inventar SLOs sin baseline.

# Siguiente documento

## 85. Etapa siguiente

```text
16-seguridad-hardening-threat-model.md
```

Debe consolidar assets, trust boundaries, attacker capabilities, abuse cases/STRIDE donde aporte valor, auth/web/API/DB/Valkey/container hardening, secrets, ZK threats, supply chain, DoS, privacidad/correlación, incident response y pre-production security gate.

# Instrucción final

## 86. Contratos ejecutables

La etapa no está completa sin demostrar automáticamente:

```text
1 nullifier -> <= 1 accepted vote

CLOSED wins race -> later vote rejected

vote commit wins race -> vote included

same logical retry -> same logical receipt

election A proof -> cannot vote in election B

accepted vote -> no identity relation

final vote set -> deterministic tally

tampered evidence -> verification failure
```

La suite debe fallar cuando una regresión peligrosa rompa una de estas propiedades.
