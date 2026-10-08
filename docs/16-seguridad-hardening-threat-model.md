# 16 — Seguridad, Hardening y Threat Model

## Propósito

Consolida el modelo de amenazas de **Votaciones** y convierte las decisiones de `00`–`15` en controles verificables sobre identidad, administración, elegibilidad, ZK, voto, persistencia, conteo, publicación, frontend, infraestructura y supply chain.

Regla principal:

```text
threat -> control -> verification -> residual risk
```

Ningún control individual convierte al sistema en “seguro”.

## 1. Objetivos de seguridad

Proteger:

- integridad de configuración y padrón congelado;
- confidencialidad de credenciales privadas;
- separación identidad ↔ voto;
- unicidad mediante nullifier;
- integridad e inmutabilidad de votos aceptados;
- verificación ZK correcta;
- ventana temporal electoral;
- conteo reproducible;
- resultados/versiones/publicación;
- auditoría administrativa;
- disponibilidad razonable;
- reproducibilidad del protocolo/software.

## 2. Límites explícitos de V1

V1 no debe prometer por sí sola:

```text
anonimato absoluto frente a observador global
resistencia completa a coerción
secreto frente a backend si recibe selección en claro
seguridad de dispositivo completamente comprometido
seguridad física de operadores
eliminación de insiders
autenticidad institucional sin firmas/key management
resistencia ilimitada a DDoS
```

## 3. Assets críticos

### Secretos

```text
admin credentials/session secrets
voterSecret
activation/provisioning secrets
DB/Valkey credentials
private signing keys futuras
toxic waste de ceremonies
```

### Integridad

```text
ElectionConfigurationVersion
eligibility snapshot / Merkle root
protocol manifest
circuit artifacts / verification keys
accepted_votes / nullifiers
audit chain
final vote-set snapshot
tally / results
verification package
artifact digests
```

Ser público no elimina la necesidad de integridad.

## 4. Trust boundaries

```text
[Admin Browser] --auth+CSRF--> [Admin API]
                                |
[Voter Browser] --proof------> [Voting API / ZK verifier]
                                |
                                v
                           [NestJS]
                           /      \
                    [PostgreSQL] [Valkey auxiliary]
                           \
                       [Immutable artifacts]
```

El `voterSecret` permanece en el navegador del votante.

Cada boundary valida sus inputs; “interno” no equivale a confiable.

## 5. Actores/adversarios

Considerar:

- votante legítimo/malicioso;
- atacante externo;
- dispositivo del votante comprometido;
- cuenta admin comprometida;
- insider/DB operator;
- operador de infraestructura;
- supply-chain attacker;
- observador de red;
- DDoS attacker;
- error operacional accidental.

## 6. Atacante externo

Puede enviar payloads arbitrarios, automatizar, repetir proofs, alterar versiones/public signals, provocar concurrencia, medir timing, intentar XSS/CSRF/parser abuse y consumir recursos.

No asumir acceso directo a DB.

## 7. Atacante con credential válida

Puede generar múltiples proofs y selecciones con su propio secreto. La defensa de doble voto sigue siendo:

```text
same secret + same electionContext
 -> same nullifier
 -> PostgreSQL UNIQUE
```

Compartir voluntariamente una credential queda fuera de la protección completa de V1.

## 8. Admin comprometido

Puede intentar manipular configuración/padrón/transiciones/publicación. State machine, freeze, autorización y audit reducen el riesgo.

Con un único admin no existe separación humana de funciones completa; documentarlo como riesgo residual.

## 9. DB/infrastructure operator

Un operador privilegiado puede superar controles de aplicación. Mitigaciones:

```text
least privilege
roles separados
immutable/versioned evidence
checkpoints
offline verifier
backups
external anchoring futuro
```

Sin evidencia externa independiente no afirmar detección absoluta de una reescritura coherente de DB y auditoría.

## 10. Dispositivo comprometido

Malware/XSS puede robar `voterSecret`, observar/cambiar selección o sustituir artifacts. CSP, supply-chain controls y digest verification reducen riesgo, pero no resuelven un host totalmente comprometido.

## 11. Observador de red

TLS protege contenido en producción; metadata como IP/timing/volumen permanece observable. No conservar metadata innecesaria y no afirmar que ZK elimina correlación de red.

## 12. STRIDE

Usar como checklist, no como burocracia:

```text
Spoofing
Tampering
Repudiation
Information Disclosure
Denial of Service
Elevation of Privilege
```

Cada amenaza relevante termina en control, prueba y riesgo residual.

# Spoofing

## 13. Admin

Controles:

- password hashing moderno y calibrado;
- rate limiting;
- sesiones de alta entropía;
- expiración/invalidación;
- `HttpOnly`;
- `Secure` en producción;
- `SameSite` apropiado;
- CSRF;
- no tokens en localStorage.

## 14. Votante

CastVote no usa identidad/login tradicional. La autoridad es:

```text
knowledge of voterSecret + membership proof
```

No sustituir por `voterId`.

## 15. Receipt

Un string con formato válido no demuestra aceptación. Receipt/commitment debe verificarse conforme al protocolo.

# Tampering

## 16. Configuración

Mitigar con configurationVersion, state machine, freeze, DB constraints, audit y manifest digest. Después de OPEN no se modifica configuración criptográficamente relevante.

## 17. Elegibilidad

Snapshot congelado, root determinista, binding al proof y ausencia de mutación posterior.

## 18. Proof

- schema estricto;
- protocol registry;
- trusted verification key;
- snarkjs verification;
- root/context checks;
- negative tests.

Nunca aceptar VK del cliente.

## 19. Voto

`accepted_vote` es inmutable. No existe endpoint normal de update/delete. Reducir permisos DB sobre datos inmutables cuando sea viable.

## 20. Resultados/artifacts

Usar snapshot final, canonical digests, tally determinista, versiones inmutables, verification package, content addressing y offline verifier.

# Repudiation

## 21. Admin actions

Acciones sensibles producen audit events sin secretos, con actor, acción, aggregate, timestamp y chain/checkpoint correspondiente.

## 22. Voter actions

No crear “no repudio” identificando al votante. La evidencia electoral permanece anónima/criptográfica.

## 23. Publicación

Correcciones crean una nueva versión; nunca overwrite silencioso.

# Information Disclosure

## 24. PII minimization

No duplicar PII en:

```text
accepted_votes
proof evidence
receipts
public audit
verification packages
logs
metrics
```

## 25. voterSecret

Nunca debe aparecer en backend, DB, Valkey, logs, analytics, URLs, audit o error reporting.

## 26. Nullifier

Es pseudónimo/público según protocolo, pero correlacionable. No usarlo como label de métricas/logs rutinarios.

## 27. Ballot secrecy

Si V1 transmite `voteEncoding` en claro/public signal, documentar que el backend conoce la selección anónima. No afirmar secreto criptográfico del ballot frente al servidor.

## 28. Logs/errores

Nunca registrar password, session token, voterSecret, activation token, witness, private Merkle path, toxic waste o private keys.

No devolver SQL, stack traces, paths, env vars o topología interna.

# Denial of Service

## 29. Orden de validación ZK

Antes del trabajo costoso:

```text
body limit
schema
protocol/version
public signal shape/range
election cheap checks
bounded concurrency/rate controls
proof verification
final DB transaction
```

## 30. Bounded verification

Limitar verificaciones simultáneas por instancia según benchmark. No fijar capacidad arbitraria.

No introducir broker solo por esto; un semaphore/bounded executor local es suficiente inicialmente.

## 31. Rate limiting

Valkey puede ayudar, pero no es autoridad electoral. IP no es identidad y puede agrupar NAT/proxies.

Login admin requiere política más estricta sin permitir lockout trivial explotable.

## 32. Payload limits

Límites explícitos para JSON, proof, publicSignals, imports y uploads. Rechazar temprano.

# Elevation of Privilege

## 33. Authorization

Todo use case admin verifica autorización server-side. La UI nunca es control de seguridad.

## 34. DB roles

Separar conceptualmente:

```text
migration role
application runtime role
read-only verifier role futuro
backup role futuro
```

Runtime no usa superuser/schema owner.

## 35. Valkey

Red privada, credenciales/ACL cuando corresponda, comandos mínimos y ningún secreto electoral privado.

# NestJS/API Hardening

## 36. Validation

Configurar validación global equivalente a:

```text
whitelist
forbid unknown donde sea crítico
runtime schemas
body limits
```

No confiar en tipos TypeScript en runtime.

## 37. Inputs criptográficos

Field elements/proofs/public signals tienen parsers específicos y representación canónica. Evitar `any`/JSON arbitrario.

## 38. HTTP semantics

GET no muta. Transiciones usan comandos explícitos. Prohibido un `PATCH status` genérico que salte state machine.

## 39. CORS/headers

Allowlists explícitas. Admin credentials nunca con wildcard.

Aplicar CSP donde corresponda, `nosniff`, frame restrictions y referrer policy. HSTS solo en producción cuando TLS/dominio estén listos.

## 40. Request IDs

IDs operativos aleatorios. No propagar un ID identificativo de provisioning hasta CastVote.

## 41. Proxy trust

Configurar `trust proxy` solo para proxies realmente confiables. No confiar en `X-Forwarded-*` arbitrario de Internet.

# Authentication Hardening

## 42. Passwords

Algoritmo moderno, salt y parámetros calibrados. Prohibido SHA-256 directo, MD5 o cifrado reversible.

## 43. Bootstrap admin

Sin credencial hardcoded/default. Provisionamiento por secret/env seguro. No imprimir password en logs productivos.

## 44. Sessions/CSRF

Alta entropía, expiración, invalidación/logout, flags correctos y defensa CSRF en mutaciones con cookie auth. CORS no sustituye CSRF.

## 45. Identity provider future

Conservar abstraction para OIDC/Keycloak, sin introducirlo ahora.

# PostgreSQL Hardening

## 46. Red

No exponer públicamente PostgreSQL. Local/devnet solo publica puerto si desarrollo lo necesita.

## 47. Credenciales/TLS

Sin defaults. Producción usa secret management. TLS obligatorio si DB cruza una red no confiable.

## 48. Backups

Antes de producción deben existir y probarse:

```text
backup
restore
retention
encryption/access control
```

Un backup no restaurado en prueba no cuenta como estrategia de recuperación.

## 49. PITR

Evaluar WAL/PITR según RPO/RTO productivos; no introducirlo localmente sin necesidad.

## 50. Datos inmutables

Considerar permisos/triggers/roles que dificulten UPDATE/DELETE accidental de votos/resultados/evidencia.

## 51. SQL

Queries parametrizadas vía Drizzle/driver. SQL raw recibe revisión especial.

# Valkey Hardening

## 52. No autoridad

Nunca es única copia de votos, nullifier consumption, election state, results o audit evidence.

## 53. Red/secretos

No exposición pública. No almacenar voterSecret ni credenciales privadas. Restart/flush no afecta correctness electoral.

# Docker Hardening

## 54. Images

- versiones base fijadas;
- multi-stage;
- runtime mínimo;
- scan de vulnerabilidades;
- lockfile frozen.

## 55. Runtime

Ejecutar non-root cuando sea compatible. Filesystem read-only cuando sea viable. Eliminar capabilities innecesarias.

Prohibido:

```text
--privileged
Docker socket mount
secrets en layers
```

## 56. Health/resources

Healthchecks sin secretos. Readiness refleja dependencias críticas. Límites CPU/memoria productivos se basan en benchmarks.

# Frontend Hardening

## 57. voter-web

Prioridades:

```text
XSS prevention
strict CSP
no third-party runtime scripts
artifact verification
minimal secret lifetime
no automatic persistent global state
```

## 58. admin-web

Prioridades: session protection, CSRF, XSS, authorization-aware UX y no sensitive shared caching.

## 59. Dependencies

No runtime CDN packages. Revisar especialmente dependencias con DOM/storage/network access en voter-web.

# ZK Hardening

## 60. Circuit review

Antes de producción:

- constraints review;
- underconstraint analysis;
- negative tests;
- range checks;
- path bits boolean;
- public/private signal review;
- domain separation review.

## 61. Trusted setup

Devnet setup no se usa en producción. Groth16 productivo requiere procedimiento/ceremonia separado.

Toxic waste nunca se commitea ni conserva intencionalmente.

## 62. Registry

Backend acepta solo artifacts registrados por `protocolVersion/circuitVersion`. Cliente no elige VK.

## 63. Field parsing/domain separation

Field elements canónicos y en rango. Mantener dominios distintos para commitment, nullifier, election context y vote encoding/commitment.

## 64. Upgrades

Nunca reemplazar artifacts bajo la misma versión. Nueva semántica = nueva versión.

# Supply Chain

## 65. Lock/registry

`pnpm-lock.yaml` committed y frozen installs. Registry configuration controlada. Evitar dependency confusion si aparecen paquetes privados.

## 66. Install scripts

Revisar install/postinstall scripts sensibles. No deshabilitarlos indiscriminadamente si son necesarios; usar política/allowlist documentada.

## 67. Provenance

Registrar cuando sea posible:

```text
source commit
build version
protocol version
artifact digest
container image digest
```

## 68. CI credentials

Least privilege. PRs no confiables no reciben production secrets.

## 69. Repository protection

Para release productivo: required checks/reviews, protección de branches y restricción de force push. Firmas de tags/commits pueden añadirse según política.

# Secrets Management

## 70. Local/devnet

`.env` puede usarse localmente, nunca commit. `.env.example` solo contiene valores no secretos.

## 71. Producción

El secret manager concreto se define después. Requisitos: encryption at rest, ACL, rotación, auditoría cuando sea posible y ausencia de plaintext en repo/images.

## 72. Rotation

Runbooks para session secret, DB/Valkey credentials y futuras signing keys. Rotar una clave operacional no debe destruir verificabilidad histórica.

## 73. Secret incident

Identificar, revocar/rotar, evaluar ventana, preservar evidencia, revisar logs/audit y documentar impacto. No borrar evidencia para “limpiar”.

# Privacy / Correlation

## 74. Separation

APIs/storage de identity/provisioning y anonymous voting permanecen separados.

No añadir:

```text
eligible_voters.has_voted
```

## 75. Access logs

Definir en producción qué metadata se registra, precisión temporal, retención y acceso. Minimizar IP/user-agent/timing cuando no sean necesarios.

## 76. Tracing/metrics

No propagar trace IDs de provisioning a CastVote. No labels con voterId, credentialId, nullifier, receipt o IP.

## 77. Timing

Separar activación y votación ayuda, pero no elimina correlación. Mitigaciones de red avanzadas quedan fuera de V1.

# Abuse Cases

## 78. Double vote

Múltiples proofs con misma credential -> mismo nullifier -> máximo un accepted vote por UNIQUE DB.

## 79. Change vote

Segundo proof con opción distinta no reemplaza el primer commit.

## 80. Cross-election/root replay

Binding a electionContext/root/protocol provoca rechazo.

## 81. Fake VK

No existe input API para suministrar verification key.

## 82. Reopen election

CLOSED -> OPEN está prohibido por state machine.

## 83. Fake totals

Admin no suministra totals autoritativos. `PublishResults` deriva del snapshot/tally.

## 84. Delete vote

No endpoint normal y permisos DB minimizados.

## 85. Protocol downgrade

Election manifest fija protocolVersion. No negociación “latest” ni fallback silencioso.

# Operational Hardening

## 86. Environments

Separar local, devnet, test, staging/preprod y production. No compartir DB/secrets.

## 87. Production mode

```text
NODE_ENV=production
no debug endpoints
no verbose stack traces
no sensitive logging
```

No exponer herramientas DB/Valkey/debug junto al producto.

## 88. Network segmentation

Conceptualmente:

```text
public edge -> API/frontends -> private data network -> PostgreSQL/Valkey
```

Detalles en producción.

## 89. Time synchronization

La ventana electoral depende del tiempo. Producción necesita sincronización confiable y monitoreo de drift.

No corregir timestamps históricos silenciosamente tras un incidente de reloj.

# Incident Response

## 90. Clases

```text
credential compromise
admin compromise
DB integrity anomaly
ZK vulnerability
artifact mismatch
privacy leak
availability outage
time synchronization issue
result verification failure
supply-chain compromise
```

## 91. Principios

```text
preserve evidence
contain
do not silently mutate electoral records
assess scope
rotate where appropriate
verify invariants
document decisions
```

## 92. Kill switch

No crear kill switch oculto. Usar transiciones legítimas como cancelación/cierre, autorizadas y auditadas.

## 93. Emergency DB edits

No son flujo normal. Si fueran inevitables: backup, autorización, script versionado, razón, before/after digests, evidencia y nueva versión cuando corresponda.

## 94. Circuit vulnerability

Antes de OPEN: invalidar artifacts, nueva versión y regenerar lo requerido. Después de OPEN: incidente formal; nunca parche silencioso.

# Security Verification

## 95. Automated

Reusar etapa 15:

```text
auth negatives
CSRF/CORS/XSS/headers
malformed inputs
ZK negatives
replay
concurrency
privacy canaries
tamper tests
dependency/secret/container scans
```

## 96. Manual

Antes de producción revisar trust boundaries, permissions, secrets, CORS/CSP, cookies, proxy config, DB/Valkey exposure, container capabilities, manifests, ceremony, backup/restore y logging/privacy.

## 97. Independent review

Para elecciones reales de alto impacto se recomienda revisión independiente del protocolo/circuitos, aplicación, infraestructura y procedimientos. No es garantía absoluta.

# Security Gates

## 98. S1 Architecture

Threat model, assets, trust boundaries y limitaciones documentadas.

## 99. S2 Identity/Admin

Sin defaults, auth/session/CSRF/rate limiting/authorization/audit verificados.

## 100. S3 Voting

`voterSecret` local, proof real, trusted VK, nullifier UNIQUE, atomic commit, races/replay testeados y ausencia de identity FK.

## 101. S4 ZK

Circuitos versionados, negative tests, artifact digests, procedimiento de setup productivo y no toxic waste.

## 102. S5 Data

PostgreSQL privado/least privilege, backups+restore, immutable data policy y Valkey no autoritativo.

## 103. S6 Web

CSP, no third-party voter scripts, XSS/CORS/cookies/headers y storage policy verificados.

## 104. S7 Supply Chain

Frozen lockfile, dependency/secret/container scans, artifacts controlados y release protegido.

## 105. S8 Verification

Final vote set/tally reproducibles, package verifier, tamper tests y result versions inmutables.

## 106. S9 Operations

Monitoring, time sync, incident response, backup/restore, recovery y secret rotation.

## 107. S10 Release

Bloquear producción ante:

```text
known critical vulnerability
critical security test failing
unverified production ZK artifacts
restore capability unknown
default credentials
public DB/Valkey exposure
result verifier failure
```

# Security Matrix

## 108. Amenaza -> control -> evidencia

| Amenaza | Control | Evidencia |
|---|---|---|
| brute force admin | rate limit + password hashing | auth tests |
| CSRF admin | CSRF defense | browser E2E |
| XSS voter | CSP + safe rendering | XSS E2E |
| secret leakage | logging allowlist | canary tests |
| double vote | nullifier + UNIQUE | concurrency |
| cross-election replay | context binding | ZK/E2E |
| invalid proof | trusted verifier | negative tests |
| fake VK | server registry | integration |
| vote after close | state/time transaction | race tests |
| config mutation | freeze/state machine | domain/integration |
| partial write | transaction | fault injection |
| Valkey loss | non-authoritative design | restart tests |
| result manipulation | deterministic verifier | tamper tests |
| artifact replacement | digest/version registry | artifact tests |
| identity-vote linkage | schema/API separation | privacy E2E |
| proof DoS | size/concurrency limits | adversarial tests |
| supply-chain change | locks/digests/scans | CI gates |

Mantener la matriz viva.

# Documentación de seguridad

## 109. Archivos sugeridos

```text
docs/security/
├── threat-model.md
├── trust-boundaries.md
├── security-controls.md
├── known-limitations.md
├── incident-response.md
├── secret-rotation.md
└── preproduction-checklist.md
```

Este documento es la fuente inicial; puede dividirse sin cambiar decisiones.

# Orden para Codex

## 110. Implementación

1. Leer `00`–`15`.
2. Crear threat model vivo.
3. Documentar trust boundaries/assets.
4. Mapear amenazas a controles/tests.
5. Revisar auth/session/CSRF.
6. Revisar DTO/global validation.
7. Aplicar body/request limits.
8. Implementar bounded proof verification.
9. Revisar CORS/proxy config/headers.
10. Separar PostgreSQL roles.
11. Revisar Valkey network/ACL.
12. Hardening Docker.
13. Revisar voter CSP/storage/dependencies.
14. Revisar ZK registry/artifact validation.
15. Documentar production trusted setup.
16. Revisar logging/privacy.
17. Añadir canary leak tests.
18. Añadir supply-chain scans.
19. Crear incident-response runbook.
20. Crear secret-rotation runbook.
21. Crear preproduction checklist.
22. Ejecutar S1–S10.
23. Documentar riesgos residuales.
24. Ejecutar full test/build/security suite.

# Criterios de aceptación

## 111. La etapa se aprueba cuando

- threat model/trust boundaries/assets están documentados;
- riesgos residuales son explícitos;
- auth/session/CSRF están endurecidos;
- inputs tienen schemas y límites;
- ZK verification tiene bounded concurrency;
- VK/artifacts vienen de registry confiable;
- runtime DB no es superuser;
- migration/runtime credentials se separan en producción;
- Valkey no es autoridad ni público;
- containers no son privileged ni montan Docker socket;
- voter mantiene CSP y no third-party scripts;
- secretos no aparecen en logs;
- privacy canary tests pasan;
- replay/double-vote/close-race pasan;
- supply-chain gates existen;
- incident response existe;
- backup/restore es requisito previo a producción;
- S1–S10 son verificables.

# Definition of Done

## 112. Checklist

```text
[ ] threat model
[ ] asset classification
[ ] trust boundaries
[ ] attacker capabilities
[ ] known limitations
[ ] abuse cases
[ ] admin auth hardening
[ ] session hardening
[ ] CSRF verified
[ ] authorization verified
[ ] strict DTO validation
[ ] request/body limits
[ ] proof concurrency limit
[ ] rate limiting policy
[ ] CORS/proxy policy
[ ] security headers
[ ] PostgreSQL runtime role
[ ] migration role
[ ] DB network isolation
[ ] Valkey isolation/ACL evaluation
[ ] Docker non-root
[ ] no privileged containers/socket
[ ] voter CSP
[ ] no voter third-party runtime scripts
[ ] ZK artifact registry
[ ] canonical field parsing
[ ] circuit negative tests
[ ] production trusted setup procedure
[ ] logging allowlist
[ ] privacy canary tests
[ ] dependency scan
[ ] secret scan
[ ] container scan
[ ] CI secret isolation
[ ] incident-response runbook
[ ] secret-rotation runbook
[ ] backup/restore requirement
[ ] time-sync requirement
[ ] preproduction checklist
[ ] residual risks documented
[ ] S1-S10 gate
[ ] full tests passing
```

# Prohibiciones

## 113. Codex no debe

- afirmar seguridad/anonimato absolutos;
- almacenar `voterSecret` server-side;
- añadir `eligible_voters.has_voted`;
- usar IP como identidad electoral;
- aceptar VK/protocols arbitrarios del cliente;
- aceptar proof pendiente de verificar;
- usar Valkey como defensa primaria de doble voto;
- usar runtime DB superuser;
- exponer PostgreSQL/Valkey públicamente;
- montar Docker socket o usar privileged;
- guardar secretos en images;
- incluir trackers en voter-web;
- desactivar CSRF;
- usar CORS como sustituto de CSRF;
- wildcard CORS con credentials;
- loguear secrets/witnesses;
- parchear votos/resultados silenciosamente;
- reemplazar artifacts bajo misma versión;
- reutilizar trusted setup devnet en producción;
- ocultar riesgos residuales;
- crear backdoors/kill switches secretos.

# Riesgos residuales V1

## 114. Permanecen

1. dispositivo comprometido puede robar credential/cambiar selección;
2. timing/IP pueden correlacionar actividad;
3. admin único no aporta separación humana completa;
4. si selección viaja en claro, backend puede conocer ballot anónimo;
5. superuser de infraestructura puede atacar evidencia interna;
6. V1 no es un protocolo completo coercion-resistant;
7. disponibilidad no es ilimitada frente a DDoS;
8. Groth16 productivo depende de ceremonia correcta.

No ocultar estos riesgos con lenguaje comercial.

# Siguiente documento

## 115. Documento siguiente

```text
17-devnet-e2e-reproducible.md
```

Debe convertir el sistema en un entorno local/devnet reproducible de un solo comando, cubriendo bootstrap, migrations, fixtures, admin, election, eligibility, ZK artifacts, voter flow, counting, verification, publication y reset desde instalación limpia.

# Instrucción final para Codex

## 116. Regla

No añadir controles cosméticos sin amenaza concreta.

Cada control importante debe responder:

```text
¿qué asset protege?
¿contra qué atacante?
¿en qué trust boundary?
¿qué limitación conserva?
¿cómo se prueba?
```

La etapa solo está completa cuando las propiedades críticas pueden trazarse como:

```text
threat -> control -> verification -> residual risk
```
