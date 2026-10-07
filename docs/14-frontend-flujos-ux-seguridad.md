# 14 — Frontend, Flujos, UX y Seguridad Web

## Propósito
Define las dos superficies web de Votaciones:

```text
admin-web
voter-web
```

Deben permanecer separadas para no mezclar identidad, sesión administrativa o padrón con `voterSecret`, proof, nullifier, selección y receipt.

Regla central:

```text
voterSecret local
+ manifest/artifacts verificados
+ proof generado en cliente
+ CastVote sin identidad
+ retry idempotente
+ receipt anónimo
= flujo web compatible con el protocolo
```

## 1. Decisión de arquitectura
Crear dos aplicaciones independientes:

```text
apps/admin-web/
apps/voter-web/
```

No construir una única SPA con rutas admin/votante compartiendo runtime, cookies, storage o state.

Producción debe poder desplegarlas en orígenes distintos. Local/devnet también debe mantener endpoints/puertos distinguibles.

El framework, bundler y test runner siguen abiertos. Codex debe evaluarlos contra TypeScript, WASM, Web Workers, `snarkjs`, CSP, testing y Docker reproducible, y registrar la elección en un ADR. No modificar el protocolo para acomodar el framework.

## 2. Código compartido
Solo compartir paquetes neutrales cuando exista reutilización real:

```text
shared-types
shared-validation
shared-crypto
verification-protocol
ui-primitives (solo si se justifica)
```

No compartir stores de sesión, interceptors de autenticación ni almacenamiento de secretos.

## 3. Flujo del votante
Fases:

```text
activation
credential setup
election readiness
ballot
proof generation
submission
receipt
verification
results
```

Activación y emisión del voto no deben convertirse en una única request identificada.

## 4. Generación de credencial
El navegador genera localmente:

```text
voterSecret
identityCommitment
```

Usar `crypto.getRandomValues()` y helpers criptográficos versionados.

Prohibido derivar secretos de `Math.random()`, timestamp, email, documento o contraseña.

El backend puede recibir el `identityCommitment` y material de provisioning definido en etapa 09, pero nunca `voterSecret`.

## 5. Credential format
Definir formato versionado:

```text
VoterCredentialV1
- formatVersion
- electionId
- protocolVersion
- voterSecret
- identityCommitment
```

Import/export debe validar schema estrictamente.

Una credencial privada equivale a capacidad de votar. No subirla automáticamente a nube, no loguearla y no copiarla automáticamente al clipboard.

No generar QR con `voterSecret` por defecto.

## 6. Custodia local
No asumir que `localStorage` es almacenamiento seguro.

Preferir secreto en memoria durante uso y una estrategia deliberada de persistencia/export cuando sea necesaria.

IndexedDB no debe almacenar `voterSecret` solo por conveniencia. Cualquier persistencia cifrada requiere threat model, KDF/clave y ADR; nunca una clave hardcoded.

V1 no promete recuperación server-side del secreto.

## 7. Desacoplamiento de activación
La UX debe permitir completar activación y votar posteriormente.

No forzar:

```text
identified activation -> immediate anonymous cast
```

como único camino.

Esto reduce correlación temporal, aunque no garantiza anonimato frente a todos los observadores.

## 8. Estado electoral
`voter-web` consume metadata pública:

```text
electionId
status
opensAt
closesAt
manifest
protocolVersion
merkleRoot
options
```

El reloj del navegador es informativo. El backend decide autoritativamente si el voto entra en `[opensAt, closesAt)`.

## 9. Manifest y artifacts
Antes de generar proof validar:

- schema;
- electionId;
- manifest digest;
- protocol/circuit version;
- root/context;
- verification/artifact digests.

Cargar WASM/zkey únicamente desde ubicaciones permitidas y con versionado/content addressing.

Un artifact con digest inesperado provoca fail closed.

## 10. Cache
Artifacts públicos grandes pueden cachearse agresivamente si son content-addressed e inmutables.

Nunca reutilizar un WASM/zkey de otra `circuitVersion`.

No introducir Service Worker automáticamente; requiere ADR por su complejidad de actualización y persistencia.

## 11. Material de elegibilidad
El frontend obtiene el material definido en etapas 09/10 para construir witness, por ejemplo:

```text
Merkle root
Merkle siblings/path
leaf index o equivalente
protocol metadata
```

Si obtenerlo exige identificarse justo antes del voto, existe riesgo de correlación temporal. Preferir preobtención/provisioning compatible con el protocolo.

El Merkle path privado no se adjunta a `CastVote` si ya está incorporado privadamente al witness.

## 12. Ballot
Mostrar únicamente opciones de la `configurationVersion` congelada.

V1 es `SINGLE_CHOICE`: exactamente una selección.

La UI valida para UX; circuito/backend vuelven a validar.

Antes de generar proof, mostrar confirmación clara de la selección. Mientras no exista commit, el usuario puede volver y cambiarla. Después de aceptación V1 no existe “cambiar voto”.

## 13. Proof en cliente
El witness/proof se genera en `voter-web`, nunca en backend usando el secreto del votante.

Inputs privados incluyen los definidos por protocolo, como:

```text
voterSecret
Merkle path
```

y los inputs públicos/versionados correspondientes.

## 14. Web Worker
Ejecutar proof generation en Web Worker cuando sea compatible para evitar bloquear UI.

Mensajes tipados:

```text
INIT
GENERATE_PROOF
PROGRESS
PROOF_READY
ERROR
CANCEL
```

No loguear witness ni secreto.

El Worker no es un boundary de seguridad contra XSS del mismo origen.

JavaScript no permite garantizar zeroization física del secreto; no afirmar borrado seguro de memoria.

## 15. Progreso
No inventar porcentajes si `snarkjs` no proporciona progreso fiable.

Usar estados reales:

```text
preparing
generating
verifying locally
ready
```

Puede verificarse el proof localmente antes de enviar. El backend siempre vuelve a verificarlo.

## 16. CastVote
Enviar exactamente el contrato de etapa 11:

```text
protocolVersion
proof
publicSignals
```

No adjuntar activation token, credential ID, identidad o datos “de ayuda”.

`voter-web` no envía cookies administrativas al endpoint de voto.

## 17. State machine de envío
Estados conceptuales:

```text
READY
GENERATING_PROOF
PROOF_READY
SUBMITTING
UNKNOWN_OUTCOME
ACCEPTED
REJECTED
```

Un timeout HTTP no significa voto rechazado: el commit pudo ocurrir.

En `UNKNOWN_OUTCOME`, ofrecer retry seguro del mismo voto lógico.

## 18. Retry
Conservar:

```text
same electionContext
same nullifier
same voteEncoding
```

El proof puede regenerarse si el protocolo lo permite, pero el fingerprint lógico de etapa 11 debe coincidir.

Si backend devuelve receipt existente para el mismo voto, mostrar `ACCEPTED`.

Si devuelve `NULLIFIER_ALREADY_USED` por voto conflictivo, no intentar descubrir la selección previamente aceptada.

## 19. Receipt
Mostrar:

```text
electionId
receiptVersion
nullifier / public verification handle
receiptCommitment
accepted status
```

No incluir `voterSecret`.

Permitir guardar/copiar el receipt público.

Explicar con precisión: el receipt permite comprobar posteriormente inclusión en el registro publicado; por sí solo no demuestra la corrección completa de la elección.

No diseñarlo como prueba de selección para terceros sin threat model de coerción.

## 20. Verification UX
Después de publicación, permitir:

- importar/introducir receipt;
- comprobar inclusión;
- consultar manifest/resultVersion;
- ver digests;
- acceder al verification package;
- ejecutar verificación avanzada cuando se implemente.

No requiere identidad/login.

Nunca enviar `voterSecret` para verificar receipt.

## 21. Results UX
Mostrar:

```text
resultVersion
totalAcceptedVotes
counts por opción
porcentajes derivados opcionales
manifest/protocol version
verification package/reference
```

No declarar ganador ni desempate si la regla normativa no existe.

## 22. Admin Web
`admin-web` gestiona:

```text
login
elections
configuration
eligibility
snapshot/freeze
lifecycle
audit
counting
publication
results metadata
```

Nunca accede a `voterSecret`.

## 23. Auth admin
Usar exclusivamente etapa 07.

El frontend no es autoridad de autorización.

Si se usan cookies seguras, no duplicar tokens en `localStorage`.

Mantener `HttpOnly`, `Secure` en producción, `SameSite` y CSRF según la arquitectura definida.

No desactivar CSRF para simplificar requests.

## 24. Navegación admin
Secciones conceptuales:

```text
Dashboard
Elections
Configuration
Eligibility
Protocol / artifacts
Lifecycle
Audit
Counting
Publication
Results
```

Durante `OPEN` no mostrar tally parcial por defecto.

## 25. State machine en UI
La UI solo ofrece acciones permitidas por estado, pero backend vuelve a comprobar.

Configuración congelada aparece read-only.

Acciones críticas:

```text
freeze eligibility
open
close
cancel
publish results
```

requieren confirmación explícita mostrando elección, estado actual, destino y consecuencias relevantes.

## 26. Concurrencia admin
Deshabilitar double-submit por UX, pero constraints/backend son autoridad.

Ante state/version conflict:

- refrescar;
- no sobrescribir;
- informar que el estado cambió.

No usar optimistic update para transiciones críticas antes de confirmación del servidor.

## 27. Eligibility UI
Puede mostrar datos administrativos necesarios dentro del origen admin.

No cargar proof-generation/voting modules en esta superficie.

Nunca mostrar `voterSecret`.

Después de freeze, mostrar root/digest/version como inmutables.

## 28. Protocol UI
Mostrar:

```text
protocolVersion
circuitVersion
verificationKeyDigest
artifactDigests
```

No permitir reemplazar artifacts de una elección OPEN desde una UI genérica.

## 29. Audit UI
Read-only.

Filtros por tipo, aggregate, tiempo, actor y sequence.

No editar/eliminar eventos.

Renderizar payload como datos escapados, nunca HTML arbitrario.

## 30. Counting/publication UI
Mostrar:

```text
snapshot status
recordCount
voteSetDigest
tally status
package status
verification status
```

El administrador no introduce counts manualmente.

Antes de publicar, mostrar checklist de snapshot/tally/package/verificación. Backend valida todo igualmente.

No ofrecer “editar resultado”.

## 31. XSS
XSS en `voter-web` puede exponer secreto y selección; es amenaza crítica.

No usar `innerHTML` con contenido no confiable.

Titles/descriptions/options administrados también son input no confiable para navegador.

Preferir texto plano; HTML enriquecido V1 no es necesario.

## 32. CSP
Objetivo base:

```text
default-src 'self'
script-src 'self'
object-src 'none'
base-uri 'none'
frame-ancestors 'none'
```

Añadir directivas mínimas para WASM/Workers tras probar el toolchain.

No usar `'unsafe-inline'` o `'unsafe-eval'` por comodidad.

Si WASM requiere `wasm-unsafe-eval`, documentar compatibilidad e impacto en ADR.

Definir `worker-src` explícitamente.

## 33. Terceros
`voter-web` no incluye por defecto:

```text
analytics
tag managers
session replay
chat widgets
ad networks
social pixels
third-party runtime scripts
```

Preferir fonts/assets self-hosted.

No cargar paquetes desde CDN en runtime.

## 34. Headers
Configurar, según compatibilidad:

```text
Content-Security-Policy
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy
```

y protección contra framing mediante CSP.

Deshabilitar capacidades no usadas como cámara, micrófono y geolocalización.

## 35. TLS
Local/devnet puede seguir sin certificados reales según decisiones previas.

Producción requiere HTTPS/TLS.

Probar las APIs que requieren secure context pensando en producción.

## 36. CORS
Admin con credenciales usa allowlist estricta.

Nunca `Access-Control-Allow-Origin: *` con credenciales administrativas.

Endpoints públicos/artifacts pueden tener una política deliberadamente diferente.

## 37. Cache-Control
- app shell: actualización controlada;
- content-addressed artifacts: cache largo/inmutable;
- admin responses: no shared cache sensible;
- receipt: evitar cache compartido accidental.

## 38. Browser history
No colocar secretos, proofs, activation tokens ni material sensible en query string/URL fragment.

## 39. Error reporting
No enviar errores del voter frontend automáticamente a SaaS de terceros.

Si se añade reporting futuro, debe aplicar scrub estricto y jamás capturar secreto, proof, selection o credential.

## 40. Console
Build productivo no imprime:

```text
voterSecret
witness
Merkle path
proof
selection
activation token
admin token
```

## 41. Client secrets
Nunca empaquetar:

```text
DB passwords
admin credentials
private signing keys
API master secrets
trusted setup secrets
```

Toda variable frontend debe considerarse pública.

## 42. State management
No introducir Redux/Zustand/etc. automáticamente.

Usar solución mínima del framework.

El secreto no debe entrar en state persistido/devtools si puede evitarse.

Prohibidos plugins de session replay o persistencia global del estado del voter.

## 43. Multiple tabs
Dos tabs pueden intentar usar la misma credencial.

La UI puede advertir, pero el `UNIQUE nullifier` de PostgreSQL sigue siendo la garantía.

Browser locks nunca son autoridad electoral.

## 44. Compatibilidad
Definir matriz mínima a partir de:

```text
Web Crypto
WASM
Web Workers
required JS features
```

Medir proof generation en dispositivos modestos.

Registrar duración, memoria y tamaño de artifacts sin PII.

## 45. Cancelación
Permitir cancelar proof generation antes del envío cuando sea posible.

Cancelar generación no consume nullifier en servidor.

## 46. Offline
V1 no acepta votos offline para sincronizarlos después.

Puede generarse proof localmente, pero aceptación requiere backend/PostgreSQL.

No crear cola de votos en Service Worker/localStorage.

## 47. Limpieza local
Después de aceptación puede ofrecerse limpiar material sensible, explicando qué se conservará para verificación.

No borrar automáticamente la única copia útil del usuario sin una política explícita.

## 48. Privacy messaging
Explicar:

- qué usa activación;
- que `voterSecret` permanece local;
- qué recibe `CastVote`;
- qué representa el receipt;
- limitaciones de correlación/timing.

Prohibidos claims como:

```text
100% anonymous
unhackable
impossible to manipulate
```

## 49. Accesibilidad
Objetivo de diseño: WCAG 2.2 AA en lo aplicable.

Cubrir:

- teclado;
- foco visible;
- labels;
- errores asociados;
- contraste;
- no depender de color;
- status announcements;
- zoom;
- `prefers-reduced-motion`.

Proof/submission/accepted/error deben anunciarse apropiadamente a tecnologías asistivas.

## 50. API clients separados
Crear:

```text
AdminApiClient
PublicElectionApiClient
VotingApiClient
VerificationApiClient
```

No un mega-client con cookies/interceptors compartidos.

No usar `credentials: include` globalmente.

## 51. DTO validation
Validar respuestas críticas en cliente:

```text
manifest
protocol metadata
receipt
results
verification metadata
```

La lógica no debe parsear mensajes humanos de error; usar códigos tipados.

## 52. Testing voter
Unit tests:

- credential schema;
- CSPRNG wrapper;
- commitment vectors;
- manifest validation;
- option mapping;
- worker messages;
- retry state machine;
- receipt/result parsing.

Component tests:

- keyboard ballot;
- single selection;
- confirmation;
- proof states;
- unknown outcome;
- receipt;
- protocol mismatch;
- election closed;
- accessibility semantics.

## 53. Worker/ZK tests
Con artifacts devnet:

```text
witness
-> proof
-> local verify
-> expected public signals
```

Los mismos test vectors deben coincidir entre:

```text
Circom
shared crypto TypeScript
voter-web
backend verifier
offline verifier
```

## 54. E2E voter
1. abrir voter-web;
2. activar credential;
3. conservar secreto local;
4. cargar elección;
5. validar manifest/artifacts;
6. seleccionar;
7. generar proof en Worker;
8. verificar localmente;
9. enviar;
10. recibir receipt;
11. simular retry;
12. obtener mismo receipt;
13. publicar elección;
14. verificar inclusión/resultados.

## 55. E2E privacy
Inspeccionar requests y comprobar que `CastVote` no contiene:

```text
eligibleVoterId
credentialId
externalReference
voterSecret
identityCommitment identificativo
Merkle path privado
admin cookie
```

## 56. E2E security
Validar:

```text
CSP
frame-ancestors
nosniff
Referrer-Policy
Permissions-Policy
CORS
cookie flags
```

Simular XSS payloads en contenido electoral y comprobar escaping.

## 57. E2E unknown outcome
Simular:

```text
server commits
response lost
```

UI entra en `UNKNOWN_OUTCOME`, reintenta y obtiene receipt existente sin segundo voto.

## 58. E2E multi-tab
Dos tabs usan misma credential.

Resultado:

```text
one accepted logical vote
```

sin revelar selección previa.

## 59. E2E stale admin
Dos tabs admin intentan transiciones incompatibles.

Backend rechaza la segunda y UI refresca.

## 60. Performance
Medir:

```text
initial JS bytes
WASM/zkey bytes
artifact download/cache
proof duration
peak memory
UI responsiveness
```

Definir budgets después de mediciones, no inventarlos.

## 61. Docker
Local/devnet ejecuta ambos frontends en Docker.

Usar multi-stage builds, lockfile frozen y runtime non-root cuando sea compatible.

No copiar secretos a layers.

El servidor estático/runtime configura headers de seguridad; no depender solo de `<meta>`.

## 62. Config frontend
Solo configuración pública:

```text
API base URL
artifact base URL
environment name
supported protocol versions
```

No secretos.

## 63. Estructura voter
```text
apps/voter-web/
├── src/
│   ├── app/
│   ├── election/
│   ├── credential/
│   ├── ballot/
│   ├── proof/
│   │   ├── worker/
│   │   └── protocol/
│   ├── voting/
│   ├── receipt/
│   ├── verification/
│   ├── results/
│   ├── api/
│   └── security/
├── tests/
└── Dockerfile
```

## 64. Estructura admin
```text
apps/admin-web/
├── src/
│   ├── app/
│   ├── auth/
│   ├── elections/
│   ├── eligibility/
│   ├── lifecycle/
│   ├── audit/
│   ├── counting/
│   ├── publication/
│   ├── results/
│   ├── api/
│   └── security/
├── tests/
└── Dockerfile
```

## 65. Orden para Codex
1. Leer 00–13.
2. ADR de framework/bundler/test runner.
3. Scaffold admin/voter separados.
4. TypeScript/lint/build.
5. Docker.
6. Headers/CSP.
7. API clients separados.
8. Admin auth/CSRF.
9. Admin election/configuration.
10. Eligibility/snapshot.
11. Lifecycle/audit/counting/publication/results.
12. Credential generation/import/export.
13. Shared crypto vectors.
14. Manifest/artifact validation.
15. Ballot.
16. Proof Web Worker.
17. snarkjs/WASM/zkey.
18. Local proof verification.
19. CastVote state machine.
20. Unknown-outcome retry.
21. Receipt.
22. Verification/results.
23. Privacy controls.
24. Accessibility.
25. Unit/component/worker tests.
26. E2E voter/admin/privacy/security.
27. Performance measurements.
28. README.
29. lint/typecheck/test/build.

## 66. Criterios de aceptación
- admin y voter son apps separadas;
- no comparten sesión/state sensible;
- `voterSecret` se genera localmente;
- backend nunca recibe `voterSecret`;
- CSPRNG correcto;
- credential versionada;
- persistencia local deliberada;
- manifest/artifacts validados;
- proof generado en cliente;
- Worker evita bloquear UI;
- backend vuelve a verificar;
- CastVote no envía identidad;
- timeout post-commit es recuperable;
- receipt no contiene secreto;
- verificación/resultados no requieren login;
- admin no introduce tally;
- CSP/headers configurados;
- voter sin trackers terceros;
- bundle sin secretos;
- E2E verifica privacidad;
- accesibilidad cubierta;
- local/devnet completamente Docker.

## 67. Definition of Done
```text
[ ] frontend ADR
[ ] admin-web
[ ] voter-web
[ ] origins/config separados
[ ] Dockerfiles
[ ] strict TypeScript
[ ] API clients separados
[ ] admin auth + CSRF
[ ] admin election/config views
[ ] eligibility/snapshot views
[ ] lifecycle/audit/counting/publication
[ ] credential V1
[ ] CSPRNG
[ ] credential import/export
[ ] manifest validation
[ ] artifact digest validation
[ ] ballot + confirmation
[ ] proof Web Worker
[ ] snarkjs integration
[ ] local proof verify
[ ] CastVote
[ ] UNKNOWN_OUTCOME
[ ] safe retry
[ ] receipt
[ ] verification/results
[ ] CSP/security headers
[ ] restrictive CORS
[ ] no third-party trackers
[ ] sensitive logging prohibited
[ ] accessibility
[ ] unit/component/worker tests
[ ] E2E voter/admin/privacy/security/retry
[ ] performance measurements
[ ] README
[ ] lint/typecheck/test/build
```

## 68. Prohibiciones
Codex no debe:

- unir admin/voter en una SPA;
- guardar `voterSecret` en backend;
- usar `Math.random()` para secretos;
- guardar secretos automáticamente en localStorage;
- incluir secretos en URLs;
- generar proof en backend con witness del votante;
- enviar identidad junto al voto;
- enviar cookies admin a CastVote;
- usar `credentials: include` global;
- confiar en reloj del navegador;
- ignorar manifest/artifact mismatch;
- usar artifacts sin versionado;
- introducir Service Worker sin ADR;
- añadir trackers/session replay;
- cargar JS runtime desde CDN;
- relajar CSP por comodidad;
- renderizar HTML no confiable;
- confiar en frontend para autorización;
- permitir tally manual;
- mostrar resultados parciales durante OPEN;
- almacenar votos offline para sincronizar;
- declarar fallo definitivo ante timeout incierto;
- afirmar zeroization garantizada;
- afirmar anonimato absoluto;
- crear receipts de selección para terceros sin threat model.

## 69. Decisiones diferidas
- framework/bundler;
- component library;
- state manager;
- browser test runner;
- backup final de credential;
- persistencia cifrada;
- Service Worker;
- source maps;
- error reporting;
- dominios;
- CDN;
- i18n completo;
- verifier UI avanzado;
- mecanismos anti-coerción.

## 70. Siguiente documento
```text
15-testing-integracion-e2e-seguridad.md
```

Debe consolidar unit/integration/E2E, PostgreSQL/Valkey reales, ZK vectors, concurrencia, property testing, adversarial/security tests, reproducibilidad, coverage útil y CI gates.

## 71. Instrucción final
La UX nunca puede debilitar el protocolo:

```text
comodidad < secreto local + separación de identidad + integridad transaccional
```

Si una decisión frontend exige enviar el secreto, correlacionar identidad con voto o saltarse una validación criptográfica, esa decisión debe rechazarse.
