# 20 — Producción, Despliegue e Infraestructura

## Propósito

Convertir `00`–`19` en una especificación productiva desplegable sin elegir prematuramente AWS, GCP, Azure, bare metal, Kubernetes, Terraform u otro proveedor.

Regla:

```text
production = correctness + privacy + availability + recoverability + verifiability
```

La infraestructura nunca puede debilitar el protocolo electoral para facilitar operación.

## 1. Decisiones pendientes

Todavía no están seleccionados:

```text
cloud/provider
orchestrator
managed PostgreSQL
managed Valkey
object storage
observability vendor
secret manager
DNS/certificate provider
IaC tool
```

Codex debe implementar límites, configuración, interfaces y documentación vendor-neutral. La selección concreta requiere ADR.

---

# Parte I — Topología

## 2. Flujo lógico

```text
Internet
  |
DNS / DDoS / Edge
  |
TLS / reverse proxy / load balancer
  |
  +----------+-----------+
  |                      |
admin-web             voter-web
  |                      |
  +--------- API --------+
              |
       private app/data plane
         |            |
    PostgreSQL      Valkey
         |
    backup/PITR

API/publication jobs
         |
immutable artifact storage
         |
public verification artifacts
```

## 3. Componentes

Mínimo:

```text
admin-web
voter-web
api
PostgreSQL
Valkey
immutable artifact storage
backup storage
secret management
edge/TLS
DNS
observability
```

Jobs efímeros:

```text
migrations
verification package generation
release verification
operational verification
```

No añadir brokers, service mesh u otros componentes sin necesidad demostrada.

---

# Parte II — DNS, Edge y TLS

## 4. Dominios

Separar conceptualmente:

```text
admin.<domain>
vote.<domain>
api.<domain>
verify/results.<domain> optional
```

No ampliar el scope de cookies innecesariamente.

## 5. DNS

Requiere:

```text
controlled access
MFA
auditable changes
recovery procedure
planned TTLs
```

## 6. Edge

Debe soportar:

```text
TLS
request-size limits
timeouts
abuse controls
rate limiting where justified
security headers
```

No modificar payloads criptográficos de manera incompatible con canonicalization.

## 7. DDoS

Evaluar protección antes de elección real. No depender de identificar votantes para mitigar DDoS.

## 8. TLS

Producción:

```text
HTTPS mandatory
HTTP -> HTTPS
```

Como aún no existen certificados reales, no inventarlos. Producción requiere CA confiable, protección de private key, renovación y alertas de expiración.

Usar baseline TLS moderno al momento del despliegue. HSTS se activa cuando dominios/HTTPS estén estabilizados; evaluar `includeSubDomains`/preload antes de hacerlo irreversible.

---

# Parte III — Frontends

## 9. voter-web

Requisitos:

```text
HTTPS
CSP
no third-party analytics
no secrets
immutable/versioned static assets
safe caching
protocol/artifact version awareness
```

Puede usar hosting estático/CDN.

## 10. admin-web

Requisitos:

```text
HTTPS
strict session/auth
CSRF
CSP
restricted exposure where practical
```

## 11. Cache

Assets hashados pueden usar cache largo. HTML/config/protocol metadata no debe quedar obsoleto de forma que use artifacts incorrectos.

## 12. Service Worker

No introducir offline voting/service worker automáticamente. Puede servir código/ZK artifacts obsoletos y requiere diseño explícito.

---

# Parte IV — API

## 13. Runtime

NestJS se despliega desde el artifact aprobado:

```text
non-root
minimal image
no embedded secrets
ephemeral local disk
read-only filesystem where practical
resource limits
health/readiness
graceful shutdown
```

## 14. Stateless

Memoria local no es autoridad para:

```text
election state
accepted votes
nullifiers
audit
results
```

Caches efímeros sí, sin autoridad.

## 15. Horizontal scaling

Debe ser posible sin process-local mutex para unicidad electoral. PostgreSQL mantiene invariantes.

## 16. Graceful shutdown

```text
stop new traffic
finish bounded in-flight requests
rollback incomplete transactions
exit
```

Nunca confirmar voto antes del commit.

## 17. ZK resources

Proof verification usa bounded concurrency y límites derivados de benchmarks.

---

# Parte V — PostgreSQL

## 18. Autoridad

PostgreSQL es autoridad para:

```text
election state
eligibility metadata
accepted votes
nullifier uniqueness
audit metadata
tally/results
publication state
```

## 19. Perfil productivo

Preferir servicio/operación con:

```text
durable storage
encryption at rest
backup
PITR where required
monitoring
HA/failover according to RPO/RTO
```

## 20. Red

```text
private only
no public Internet exposure
```

## 21. Roles

Separar:

```text
runtime role
migration role
backup/replication role if needed
operator/read-only role if needed
```

Runtime sin DDL.

## 22. DB TLS

Usar TLS cuando cruza trust boundaries o la plataforma lo requiera.

## 23. HA

No declarar HA sin probar failover, reconnect, transaction behavior y RPO/RTO.

## 24. Pooling

Debe preservar las semantics de transacción/locks usadas por Drizzle/PostgreSQL.

## 25. Monitor

```text
connections
latency
locks/deadlocks
disk/IO
WAL
autovacuum
replication lag
```

---

# Parte VI — Valkey

## 26. Rol auxiliar

Permitido:

```text
rate limiting
ephemeral cache
non-authoritative coordination
```

Prohibido como autoridad para voto/nullifier/state.

## 27. Red

Privada y autenticada según plataforma.

## 28. Pérdida

Perder Valkey no pierde votos ni unicidad. Puede degradar funciones auxiliares.

HA/persistence solo si esas funciones lo justifican.

---

# Parte VII — Artifact Storage

## 29. Contenido

Durable/inmutable:

```text
protocol manifests
verification keys
artifact digests
election manifests
public accepted-vote artifacts
verification packages
result publications
exported checkpoints
```

## 30. Addressing

Preferir paths/versiones con:

```text
electionId
resultVersion
protocolVersion
digest
```

Nunca sobrescribir una publicación.

## 31. Separación

```text
public verification
internal/staging
sensitive operational
```

No hacer público todo el bucket/container.

## 32. Integridad

Toda lectura crítica verifica digest.

Versioning/immutability/replication se habilitan según plataforma/threat model.

CDN puede servir artifacts públicos; el digest sigue siendo autoridad.

---

# Parte VIII — Secrets

## 33. Regla

No secrets committed, en images ni frontend.

Usar secret injection productivo.

## 34. Secret manager

Debe ofrecer:

```text
access control
audit
rotation
versioning where useful
secure runtime delivery
```

## 35. Categorías

Separar:

```text
DB credentials
admin/session/CSRF secrets
infrastructure credentials
backup credentials
future signing keys
```

Rotación con runbook y sin invalidar evidencia histórica.

---

# Parte IX — Network e IAM

## 36. Zonas

```text
edge/public
application
data
management
```

## 37. Ingress

Exponer solo lo necesario, normalmente 443. PostgreSQL/Valkey/internal artifacts no son públicos.

## 38. Egress

Restringir cuando sea viable. CastVote no requiere Internet irrestricto.

## 39. Admin

Evaluar hostname separado y controles adicionales como allowlist/VPN si son operacionalmente viables; no inventar dependencia de una red inexistente.

## 40. Human IAM

```text
named accounts
MFA
no shared cloud users
auditable actions
least privilege
```

## 41. Break-glass

Acceso de emergencia protegido, auditado, no rutinario y revisado/rotado tras uso.

## 42. CI identity

Deploy automation usa identidad propia con permisos mínimos, no credencial humana compartida.

---

# Parte X — Deployment

## 43. Artifact identity

Desplegar por:

```text
ReleaseManifestV1
image digests
protocol/ZK artifact digests
```

No `latest`.

## 44. Preflight

Verificar:

```text
target environment
approved release
digests
DB/schema/migrations
ZK registry
secrets
backup status
clock
capacity
alerts
```

## 45. Migrations

Job controlado + migration role. No migrations destructivas al startup de API.

## 46. Traffic

Readiness antes de recibir tráfico.

## 47. Rollback

Solo según compatibilidad de etapa 18. Nunca borra/revierte votos aceptados.

---

# Parte XI — HA

## 48. API/frontends

Múltiples instancias/CDN según carga y RPO/RTO.

## 49. PostgreSQL

HA se deriva de requisitos y se prueba.

## 50. Valkey

HA solo según impacto de sus funciones auxiliares.

## 51. Artifact storage

Evitar single point of failure cuando requisitos de evidencia/publicación lo exijan.

## 52. Multi-region

No introducir active-active automáticamente. Requiere ADR por complejidad de consistency, routing, clock, failover y costo.

Dos API con una DB sin recovery probado no constituyen HA electoral real.

---

# Parte XII — Backup/PITR

## 53. Requisitos

La plataforma seleccionada debe implementar etapa 19:

```text
scheduled backup
encryption
isolated retention
PITR if required
restore testing
monitoring
```

## 54. Restore aislado

Debe poder restaurarse sin sobrescribir producción.

## 55. DB + artifacts

Las estrategias deben cubrir ambos planos.

Post-restore:

```text
DB invariants
audit/checkpoints
digests
verification package
offline verifier
```

---

# Parte XIII — Observabilidad

## 56. Integración

Exportar señales de etapa 19:

```text
logs
metrics
health
alerts
```

Tracing solo si se aprueba.

## 57. Privacy

Edge logs con IP tienen acceso/retención separados y no se correlacionan automáticamente con votos.

## 58. Release identity

Debe ser posible identificar:

```text
appVersion
releaseManifestDigest
image digest
environment
```

---

# Parte XIV — Front Door Security

## 59. Limits

Limitar payload antes de NestJS. CastVote acepta solo tamaño razonable de proof/signals.

## 60. Timeouts

Alineados con proof verification sin conexiones ilimitadas.

## 61. Rate limiting

Útil para:

```text
admin login
activation/provisioning
expensive proof verification
```

Nunca sustituye nullifier uniqueness.

## 62. WAF

Opcional; nunca sustituye auth/authz/protocol verification.

---

# Parte XV — Production Configuration

## 63. Typed/fail-fast

Toda config:

```text
typed
runtime validated
fail-fast
```

## 64. Production guard

Rechazar:

```text
devnet ZK artifacts
default devnet admin credential
mock verifier
test fixtures
unsafe debug flags
HTTP-only production mode
```

## 65. Feature flags

No cambiar propiedades electorales de una elección OPEN mediante flags. Flags críticos versionados/auditables con defaults seguros.

---

# Parte XVI — Perfiles

## 66. Perfil mínimo seguro

Conceptualmente:

```text
reliable/managed PostgreSQL
API workload(s)
auxiliary Valkey
static/CDN frontends
durable artifact storage
TLS edge
secret manager
backup/PITR
observability
```

Cantidad exacta depende de benchmarks/RPO/RTO.

## 67. Perfil HA

Puede añadir:

```text
multi-zone API
DB HA
redundant edge
redundant artifact storage
Valkey HA if justified
```

---

# Parte XVII — Cost/Capacity

## 68. Estimar

```text
API CPU/RAM
ZK verification CPU
DB IO/storage
Valkey
artifact storage
egress/CDN
backup
observability
HA premium
```

Dimensionar por peak + headroom, no promedio.

Validar mediante load test sintético.

---

# Parte XVIII — IaC

## 69. Requisito futuro

Una vez elegido proveedor, declarar infraestructura como código cuando sea práctico.

No elegir Terraform/Pulumi/etc. aquí.

## 70. Controles

IaC:

```text
PR/review
protected state
drift detection
no permanent manual changes without reconciliation
```

---

# Parte XIX — Data Safety

## 71. Producción

No cargar fixtures devnet.

La consola SQL no es workflow normal.

Preferir acceso read-only para diagnóstico.

Exports siguen allowlists; no distribuir `pg_dump` informalmente.

## 72. Election isolation

No se requiere DB por elección inicialmente. Binding criptográfico/lógico permanece obligatorio.

Aislamiento físico adicional requiere ADR/regulación.

---

# Parte XX — Production Readiness Gates

## 73. P1 Architecture

```text
provider selected/documented
topology
data flows
trust boundaries
```

## 74. P2 TLS/DNS

```text
controlled DNS
valid certs
renewal tested
expiry alert
HTTPS enforced
```

## 75. P3 Data

```text
production PostgreSQL
roles
encryption
backup
restore test
PITR decision
RPO/RTO
```

## 76. P4 Crypto

```text
productionSafe artifacts
digests verified
trusted VK registry
no devnet setup
offline verifier passes
```

## 77. P5 Security

```text
stage 16 gates
secret management
MFA
least privilege
network restrictions
no debug bypass
```

## 78. P6 Operations

```text
observability
alerts
runbooks
capacity
clock monitoring
operators/on-call
```

## 79. P7 Release

```text
approved ReleaseManifestV1
same staging/prod digests
migration rehearsal
rollback/forward-fix
post-deploy verification
```

## 80. P8 Election

```text
frozen eligibility snapshot
manifest verified
window confirmed
protocol/config frozen
pre-OPEN checklist complete
```

Una elección real no abre con un gate crítico incompleto.

---

# Parte XXI — Deployment Runbook

## 81. Flujo

```text
1 approve release
2 verify ReleaseManifestV1
3 verify target
4 verify backup/restore readiness
5 verify clock
6 verify ZK registry
7 apply approved migrations
8 deploy exact image digests
9 wait readiness
10 non-destructive smoke
11 verify release identity
12 confirm traffic
13 monitor
14 record deployment
```

No deploy rutinario durante OPEN. Emergency deploy sigue incident runbook.

---

# Parte XXII — Failure Behavior

## 82. API failure

No tráfico a unhealthy instances; rollback app solo si compatible.

## 83. Migration failure

Detener promoción, preservar DB/evidence y ejecutar recovery plan.

## 84. ZK mismatch

Fail readiness/bloquear protocolo afectado. Nunca sustituir artifact/VK silenciosamente.

## 85. Valkey failure

Degradar funciones auxiliares; PostgreSQL mantiene autoridad.

## 86. DB failure

No aceptar votos en RAM/Valkey/filesystem mientras PostgreSQL está indisponible.

## 87. Artifact-store failure

Operaciones que dependan del store fallan de forma segura. No improvisar publicación/counting incompleto.

---

# Parte XXIII — Selección de Proveedor

## 88. PostgreSQL

Evaluar:

```text
supported version
HA
PITR
backup/restore
encryption
private networking
monitoring
maintenance controls
cost
```

## 89. Compute

```text
container support
private networking
health/readiness
graceful deploy
resource guarantees
scaling
observability
```

## 90. Artifact storage

```text
durability
versioning/immutability
private/public separation
CDN
access control
cost
```

## 91. Secrets

```text
IAM
audit
rotation
versioning
runtime delivery
```

## 92. Edge

```text
TLS
DDoS
limits
availability
logs
cost
```

No elegir solo por precio.

---

# Parte XXIV — Criterios de Aceptación

## 93. Se aprueba cuando

- topología productiva está definida;
- servicios de datos críticos son privados;
- TLS es obligatorio;
- no se falsifican certificados;
- frontend no contiene secrets;
- API es stateless electoralmente;
- PostgreSQL es autoridad;
- Valkey es auxiliar;
- artifact storage es durable/inmutable;
- secrets son runtime;
- IAM/network siguen least privilege;
- deploy usa digests;
- migrations tienen rol separado;
- readiness controla tráfico;
- HA deriva de RPO/RTO;
- backup/PITR satisfacen etapa 19;
- observabilidad respeta privacidad;
- production guards rechazan devnet;
- capacity/cost model existe;
- IaC queda condicionado al proveedor;
- P1–P8 están definidos;
- deployment runbook existe;
- fallos críticos son fail-closed.

---

# Parte XXV — Definition of Done

## 94. Checklist

```text
[ ] production topology
[ ] trust boundaries
[ ] DNS requirements
[ ] edge requirements
[ ] mandatory TLS
[ ] certificate lifecycle
[ ] voter-web profile
[ ] admin-web profile
[ ] API profile
[ ] stateless API
[ ] graceful shutdown
[ ] resource limits
[ ] private PostgreSQL
[ ] DB roles
[ ] DB TLS policy
[ ] HA evaluation
[ ] pooling policy
[ ] auxiliary/private Valkey
[ ] artifact storage
[ ] immutable publication
[ ] artifact access separation
[ ] secret injection
[ ] network zones
[ ] ingress/egress
[ ] IAM/MFA
[ ] break-glass
[ ] CI deploy identity
[ ] digest deploy
[ ] preflight
[ ] migration job
[ ] readiness gate
[ ] rollback constraints
[ ] backup/PITR requirements
[ ] observability integration
[ ] edge limits/timeouts
[ ] typed config
[ ] production guards
[ ] cost/capacity
[ ] IaC boundary
[ ] production data safeguards
[ ] election isolation
[ ] P1-P8
[ ] deployment runbook
[ ] failure behavior
[ ] provider selection criteria
```

---

# Parte XXVI — Prohibiciones

## 95. Codex no debe

- elegir cloud/proveedor sin decisión;
- introducir Kubernetes automáticamente;
- introducir Terraform/Pulumi automáticamente;
- exponer PostgreSQL/Valkey a Internet;
- guardar secrets en images/frontend;
- usar HTTP en producción;
- inventar certificados autofirmados productivos;
- usar `latest` para deploy;
- recompilar staging→production;
- ejecutar migration destructiva al startup;
- dar DDL a API runtime;
- convertir Valkey en autoridad;
- aceptar/bufferizar votos sin PostgreSQL;
- usar process mutex para unicidad;
- reemplazar ZK artifacts bajo misma versión;
- promover artifacts devnet;
- habilitar mock/debug verifier;
- añadir analytics de terceros a voter-web;
- introducir offline voting/service worker sin diseño;
- mostrar live tally durante OPEN;
- extender ventana automáticamente;
- declarar HA sin probarla;
- introducir active-active multi-region sin ADR;
- operar elecciones mediante SQL manual;
- cargar fixtures devnet en producción;
- abrir elección real con P1–P8 críticos incompletos.

---

# Parte XXVII — Orden para Codex

## 96. Implementación

1. Leer `00`–`19`.
2. Crear diagrama/trust boundaries.
3. Definir config productiva tipada.
4. Añadir production guards.
5. Definir DNS/edge/TLS.
6. Preparar production builds de frontends.
7. Hardening API + graceful shutdown.
8. Definir PostgreSQL profile/roles.
9. Definir Valkey profile.
10. Definir artifact-store abstraction.
11. Definir secret-injection abstraction.
12. Definir network/IAM.
13. Integrar digest-based deploy.
14. Definir migration job/preflight.
15. Mapear backup/PITR.
16. Mapear observability.
17. Crear capacity/cost spec.
18. Definir IaC boundary.
19. Crear data safeguards.
20. Implementar P1–P8 checklist.
21. Crear deployment/failure runbooks.
22. Crear provider-selection ADR template.
23. Ejecutar production-readiness review.

---

# Parte XXVIII — Siguiente Documento

## 97. Documento siguiente

```text
21-checklist-final-produccion-auditoria.md
```

Cerrará el plan con:

- matriz requisito→implementación→test→evidencia;
- invariantes finales;
- checklist ZK;
- privacidad;
- infraestructura;
- operación;
- auditoría independiente;
- pentest;
- revisión de circuitos;
- ceremony/setup productivo;
- simulacro electoral completo;
- GO/NO-GO;
- riesgos residuales;
- handoff;
- condiciones para declarar V1 apta para producción.

---

# Parte XXIX — Regla Final

## 98. Cierre

Producción debe demostrar:

```text
approved immutable release
+
trusted production ZK artifacts
+
private authoritative data plane
+
TLS public plane
+
least-privilege identities
+
tested backup/restore
+
observable operation
+
measured peak capacity
+
fail-closed behavior
```

Que los containers arranquen no significa que el sistema esté listo para una elección real.

La infraestructura solo está lista cuando seguridad, recuperación, capacidad y verificación electoral han sido probadas conjuntamente.
