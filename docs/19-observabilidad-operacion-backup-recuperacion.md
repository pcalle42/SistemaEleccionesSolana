# 19 — Observabilidad, Operación, Backup y Recuperación

## Propósito

Definir cómo operar **Votaciones** de forma observable y recuperable sin convertir telemetría, backups o procedimientos de emergencia en una fuente de correlación identidad→voto.

Regla central:

```text
observabilidad operativa != evidencia electoral
```

La evidencia electoral verificable continúa siendo la definida en `12` y `13`.

## 1. Objetivos

La operación debe poder determinar:

```text
estado y release del sistema
salud de PostgreSQL y Valkey
capacidad y saturación ZK
correctitud del voting path
drift temporal
estado de backups
capacidad real de restore
integridad post-recuperación
```

Nunca se “repara” una elección borrando o reescribiendo votos.

---

# Parte I — Logging

## 2. Logs estructurados

En operación usar logs estructurados con campos conceptuales:

```text
timestamp
level
service
environment
appVersion
releaseManifestDigest
event
requestId
route
status
durationMs
errorCode
```

No registrar bodies de voto.

## 3. Prohibido en logs

```text
voterSecret
credentialId
eligibleVoterId
identityCommitment
private Merkle path
witness
password
session token
CSRF secret
activation token
private keys
toxic waste
vote choice + IP
```

Proofs/public signals completos tampoco se registran rutinariamente.

## 4. HTTP logging

Registrar route template, no URLs innecesariamente detalladas:

```text
POST /api/v1/elections/:id/votes
```

No cookies, Authorization, request/response bodies.

## 5. IP/User-Agent

La aplicación de voto no los persiste por defecto. Si el edge los conserva por seguridad:

- acceso restringido;
- retención explícita;
- almacenamiento separado;
- nunca en `accepted_votes`;
- nunca como identidad electoral.

## 6. Admin

Las acciones sensibles pertenecen al audit log. El log operacional no duplica payload sensible.

## 7. Canary tests

Mantener tests con secretos/PII ficticios únicos y comprobar que no aparecen en logs.

---

# Parte II — Métricas

## 8. Cardinalidad

Nunca usar como label:

```text
voterId
credentialId
nullifier
receipt
IP
sessionId
```

## 9. API

Mínimo:

```text
http_requests_total{service,route,status_class}
http_request_duration_seconds{service,route}
```

## 10. Voting/ZK

Agregadas:

```text
vote_requests_total{result_class}
vote_rejected_total{reason_class}
vote_duplicate_total
vote_proof_verification_duration_seconds
vote_accept_transaction_duration_seconds
proof_verification_inflight
proof_verification_timeout_total
```

Reason classes amplias:

```text
invalid_request
invalid_proof
wrong_context
duplicate
not_open
out_of_window
dependency_failure
internal_error
```

## 11. PostgreSQL

Observar:

```text
connections/saturation
query/transaction latency
locks/deadlocks
disk
WAL
replication lag if applicable
backup status
```

## 12. Valkey

Observar disponibilidad, memoria, conexiones, evictions, errores y latencia. Su caída nunca significa pérdida del estado electoral autoritativo.

## 13. Frontend

`voter-web` no incorpora analytics de terceros. Cualquier telemetría futura debe ser first-party, mínima y pasar threat model.

---

# Parte III — Tracing

## 14. Uso selectivo

Tracing solo donde aporte diagnóstico. No introducir una plataforma compleja por obligación.

## 15. Boundary anónimo

No propagar un trace ID desde provisioning/identidad hacia `CastVote`. El voto anónimo inicia un contexto operacional independiente.

Nunca usar secreto, credential, commitment, nullifier, selección, receipt o proof como span attribute.

---

# Parte IV — Health

## 16. Liveness

```text
GET /health/live
```

Confirma proceso vivo, sin consultar todas las dependencias.

## 17. Readiness

```text
GET /health/ready
```

Valida:

```text
PostgreSQL
schema compatibility
required protocol registry
required verification artifacts
```

Valkey puede marcar `degraded` según feature, pero no convertirse en autoridad.

## 18. Seguridad

Health no expone hosts internos, credentials, filesystem paths ni topología sensible. Checks usan timeouts cortos.

---

# Parte V — Alertas y Dashboards

## 19. Alertas accionables

Modelo sugerido:

```text
SEV1 riesgo crítico de disponibilidad/integridad electoral
SEV2 degradación mayor
SEV3 degradación operativa
SEV4 mantenimiento/información accionable
```

## 20. Críticas

Considerar:

```text
voting API unavailable while OPEN
PostgreSQL unavailable
DB disk exhaustion risk
integrity anomaly
required ZK artifact missing/mismatch
systematic verifier failure
clock drift beyond policy
accepted-vote persistence anomaly
result/package verification failure
backup failure beyond policy
```

Toda SEV1/SEV2 tiene runbook.

## 21. Dashboard sistema

```text
release identity
availability
request rate
latency
error rate
PostgreSQL
Valkey
resource saturation
```

## 22. Dashboard elección

Puede mostrar:

```text
state
opensAt/closesAt
accepted vote count
aggregate request/rejection rate
proof latency
DB latency
```

Durante `OPEN` no muestra live tally ni distribución de opciones, nullifiers, receipts, IPs o timestamps individuales.

---

# Parte VI — SLI/SLO y Capacidad

## 23. SLIs

Definir:

```text
API availability
valid-vote request success
vote acceptance latency
proof verification latency
DB availability
publication/verifier success
backup success
restore success
```

## 24. SLO

No inventar valores. Primero baseline + requisitos electorales; luego SLO explícito.

Correctness prevalece: no aceptar proof sin verificar para cumplir disponibilidad.

## 25. Capacity model

Antes de producción estimar:

```text
eligible voters
expected turnout
peak vote rate
proof verification CPU/RAM
DB write throughput
artifact/package size
storage growth
backup size/duration
```

## 26. Load tests

Solo con elecciones sintéticas. Bajo saturación debe existir bounded concurrency/backpressure, sin OOM, bypass de verification ni pérdida de committed votes.

---

# Parte VII — Tiempo

## 27. UTC

Persistencia y autoridad temporal en UTC. Browser solo presenta.

## 28. Sincronización

Producción usa sincronización confiable del host/plataforma. Containers normalmente heredan reloj del host.

## 29. Drift

Monitorear drift. El threshold se define con infraestructura/requisitos.

Ante anomalía:

```text
alert
preserve evidence
assess election impact
do not rewrite historical timestamps
```

La ventana sigue siendo `[opensAt, closesAt)` y el browser nunca es autoridad.

---

# Parte VIII — Backup

## 30. PostgreSQL

Antes de producción definir:

```text
full/base backup
WAL/PITR if required
retention
encryption
isolated storage
access control
verification
```

## 31. Scope

Respaldar lo necesario para reconstruir configuración, elegibilidad, votos aceptados, audit, tally/results y publication metadata.

## 32. Artifact storage

Verification packages y artifacts inmutables externos a DB también requieren durabilidad/backup. No asumir que un backup PostgreSQL los contiene.

## 33. ZK artifacts

Verification artifacts productivos deben existir en storage/registry duradero. Nunca depender de un filesystem efímero de instancia.

## 34. Secrets

Secret/key backup tiene política separada, cifrada y restringida.

## 35. Retención

Se define según requisitos legales/política, RPO/RTO, privacidad y lifecycle. No inventar duración aquí.

---

# Parte IX — Restore

## 36. Regla

```text
backup no restaurado exitosamente en test
= backup no verificado
```

## 37. Restore test

Periódicamente:

1. entorno aislado;
2. restore;
3. verificar schema;
4. verificar estados;
5. comprobar nullifier uniqueness;
6. verificar audit/checkpoints;
7. comprobar final vote-set/tally/result digests;
8. ejecutar offline verifier;
9. registrar duración y resultado.

Nunca apuntar restore test a producción.

---

# Parte X — PITR, RPO y RTO

## 38. PITR

Evaluarlo antes de producción. Recuperar a un punto anterior puede eliminar votos legítimamente aceptados después.

Por eso PITR productivo es una decisión de incidente crítica, no rollback rutinario.

Preferir restaurar primero a entorno aislado y comparar evidencia.

## 39. Reconciliation

No crear un merge automático de dos historias de `accepted_votes`. Cualquier reconciliación extraordinaria requiere diseño y preservación de evidencia.

## 40. RPO/RTO

Deben fijarse antes de producción según impacto electoral. No usar defaults genéricos.

Para una elección OPEN, incluso una pérdida pequeña puede ser inaceptable y exigir WAL continuo, replicación o recuperación más rápida.

---

# Parte XI — Disaster Recovery

## 41. Escenarios mínimos

```text
API loss
Valkey loss
PostgreSQL primary loss
artifact store loss
site/region outage
bad deployment
credential compromise
clock anomaly
```

## 42. API

Debe ser recuperable desde PostgreSQL + trusted config/artifacts.

## 43. Valkey

Restart/recreate sin reconstruir votos desde él.

## 44. PostgreSQL

Seguir DB recovery runbook. No promover una DB vieja sin evaluar votos posteriores.

## 45. Artifact store

Restaurar por digest. No regenerar artifacts ZK productivos bajo la misma versión.

## 46. Site outage durante OPEN

El runbook debe:

```text
detect
preserve evidence
assess impact
recover
verify time/state
obtain authorized continuation/cancellation decision
```

No extender automáticamente la ventana.

---

# Parte XII — Antes, Durante y Después de OPEN

## 47. Pre-OPEN

Checklist:

```text
approved release verified
DB healthy
Valkey status known
ZK artifacts verified
eligibility snapshot frozen
manifest digest verified
clock healthy
backup successful
restore capability verified per policy
capacity checked
alerts active
runbooks available
operators identified
```

Evitar cambios rutinarios cerca de OPEN.

## 48. Durante OPEN

Prioridad:

```text
correctness
-> acceptance integrity
-> availability
-> observability
-> convenience
```

Monitorear API, verifier, DB, clock, disk/resources y errores agregados.

No live tally. No DB edits manuales de votos/nullifiers/snapshot/state.

Si verifier/artifact integrity falla: `fail closed`.

## 49. Después de CLOSED

```text
confirm no new votes
freeze final set
verify digest/count
COUNTING
deterministic tally
verification package
offline verify
publish
verify public result
checkpoint
backup/archive according to policy
```

---

# Parte XIII — Mantenimiento

## 50. Ventanas

Mantenimiento planificado fuera de `OPEN`.

DB maintenance debe evitar locks críticos durante votación.

## 51. Certificados

Cuando exista TLS productivo, monitorear expiración y rotar antes de la ventana electoral.

## 52. Secrets

No rotar componentes críticos durante OPEN salvo incidente y runbook probado.

---

# Parte XIV — Runbooks

## 53. Mínimos

```text
api-unavailable.md
postgres-unavailable.md
postgres-disk-pressure.md
valkey-unavailable.md
zk-verifier-failure.md
artifact-digest-mismatch.md
clock-drift.md
backup-failure.md
restore.md
pitr.md
high-latency.md
high-error-rate.md
security-incident.md
release-rollback.md
election-open-incident.md
post-election-verification-failure.md
```

## 54. Formato

Cada runbook:

```text
symptoms
impact
alerts
safe checks
containment
recovery
verification
escalation
forbidden actions
evidence to preserve
```

Nunca comenzar con drop DB, borrar votos, reset election o regenerar zkey.

---

# Parte XV — Evidencia de Incidente

## 55. Preservar

```text
release identity
timestamps
alerts
sanitized logs
DB state references
audit checkpoints
artifact digests
backup IDs
operator actions
```

Para elecciones de alta criticidad, formalizar chain-of-custody según política futura.

---

# Parte XVI — Acceso y Retención

## 56. Observabilidad

Acceso separado por necesidad: operator/security/DB/auditor según plataforma.

Dashboards/log storage internos no se exponen públicamente.

## 57. Categorías de retención

Separar:

```text
operational logs
security logs
admin audit
public verification evidence
DB backups
artifact backups
incident evidence
```

No heredar automáticamente retención larga de evidencia electoral a access logs.

---

# Parte XVII — Election Readiness / Game Days

## 58. Capacity rehearsal

Antes de elección real ejecutar carga sintética representativa y registrar:

```text
hardware/profile
release
protocol/circuit
dataset
latency
throughput
errors
resource saturation
```

## 59. Game day staging

Practicar:

```text
API restart
Valkey loss
DB recovery
artifact unavailable
backup restore
clock alert
bad release rollback
```

sin PII real.

---

# Parte XVIII — Verifier en Operación

## 60. Independencia

Offline verifier funciona sin acceso productivo.

Ejecutarlo tras publicación y como parte de restore/DR validation.

Un fallo sobre package oficial es incidente de integridad; no regenerar hasta que “pase” sin investigar.

---

# Parte XIX — Tests Operativos

## 61. Automatizar

Ampliar etapa 15 con:

```text
health/readiness tests
dependency failure
log canaries
metrics cardinality checks where feasible
Valkey restart
PostgreSQL restart
backup/restore
artifact restore
clock boundary tests
offline verification after restore
```

---

# Parte XX — Tooling

## 62. Vendor neutral

No fijar todavía Prometheus/Grafana/OpenTelemetry/Loki/ELK/Datadog/Sentry o cloud stack sin decisión explícita.

Primero interfaces y requisitos. OpenTelemetry puede evaluarse si aporta valor.

---

# Parte XXI — Criterios de Aceptación

## 63. Se aprueba cuando

- logging estructurado/sanitizado existe;
- CastVote body no se loguea;
- métricas no llevan IDs individuales;
- tracing no une identity y vote;
- liveness/readiness están separados;
- alertas críticas tienen runbook;
- dashboards no muestran live tally;
- SLI están definidos;
- SLO dependen de baseline;
- capacity model existe;
- clock drift es observable;
- backup strategy existe;
- artifact/ZK backup está contemplado;
- restore se prueba;
- PITR risk está documentado;
- RPO/RTO son gate preproducción;
- DR tiene runbooks;
- pre-OPEN/OPEN/post-CLOSE checklists existen;
- ningún runbook reescribe votos como reparación;
- verifier valida recovery;
- retention operacional/electoral está separada.

---

# Parte XXII — Definition of Done

## 64. Checklist

```text
[ ] structured logging
[ ] log redaction
[ ] no CastVote bodies
[ ] no secret/witness logs
[ ] IP/User-Agent policy
[ ] metrics/cardinality policy
[ ] API metrics
[ ] voting/ZK metrics
[ ] PostgreSQL metrics
[ ] Valkey metrics
[ ] frontend telemetry policy
[ ] tracing decision
[ ] anonymous trace boundary
[ ] liveness
[ ] readiness
[ ] health timeouts
[ ] alert severity model
[ ] critical alerts
[ ] runbook links
[ ] system dashboard
[ ] election operations dashboard
[ ] no live tally
[ ] SLI
[ ] SLO decision process
[ ] capacity model
[ ] load test
[ ] UTC policy
[ ] clock sync/drift
[ ] PostgreSQL backup strategy
[ ] artifact backup strategy
[ ] ZK artifact durability
[ ] backup encryption/access
[ ] retention categories
[ ] restore test
[ ] post-restore invariants
[ ] PITR decision
[ ] RPO/RTO gate
[ ] DR scenarios
[ ] pre-OPEN checklist
[ ] OPEN checklist
[ ] post-CLOSE checklist
[ ] maintenance policy
[ ] minimum runbooks
[ ] incident evidence policy
[ ] observability access control
[ ] game-day plan
[ ] operational tests
```

---

# Parte XXIII — Prohibiciones

## 65. Codex no debe

- tratar logs como audit electoral;
- registrar body de CastVote;
- registrar voterSecret/witness/path;
- correlacionar identity/vote con trace ID;
- usar nullifier/credential/IP como metric label;
- mostrar live tally durante OPEN;
- crear alertas con PII;
- exponer dashboards internos;
- considerar backup exitoso sin restore test;
- restaurar DB vieja sobre votos nuevos como rollback rutinario;
- mezclar automáticamente historias de accepted_votes;
- regenerar artifacts productivos perdidos bajo misma versión;
- extender ventana automáticamente tras outage;
- reescribir timestamps por drift;
- hacer mantenimiento riesgoso rutinario durante OPEN;
- desactivar proof verification por saturación;
- borrar votos para resolver inconsistencias;
- usar Valkey como recovery source;
- asumir RPO/RTO genéricos;
- copiar PII productivo a staging;
- introducir observability stack complejo sin necesidad.

---

# Parte XXIV — Orden para Codex

## 66. Implementación

1. Leer `00`–`18`.
2. Inventariar logging.
3. Definir schema/redaction.
4. Añadir release identity.
5. Instrumentar HTTP.
6. Instrumentar voting/ZK.
7. Instrumentar PostgreSQL/Valkey.
8. Definir frontend telemetry.
9. Implementar liveness/readiness.
10. Definir métricas/cardinality.
11. Definir alertas.
12. Crear dashboards mínimos.
13. Definir SLI.
14. Ejecutar capacity baseline.
15. Definir time sync/drift.
16. Diseñar backup DB/artifacts.
17. Automatizar restore test donde sea posible.
18. Verificar invariantes post-restore.
19. Documentar PITR/RPO/RTO.
20. Crear DR runbooks.
21. Crear checklists pre-OPEN/OPEN/post-CLOSE.
22. Crear maintenance policy.
23. Crear incident evidence policy.
24. Añadir operational tests.
25. Ejecutar staging game day.
26. Documentar riesgos residuales.

---

# Parte XXV — Siguiente Documento

## 67. Documento siguiente

```text
20-produccion-despliegue-infraestructura.md
```

Debe definir la infraestructura productiva concreta o una especificación desplegable si aún no hay proveedor:

- edge/TLS;
- frontend hosting;
- API topology;
- PostgreSQL;
- Valkey;
- artifact storage;
- secrets;
- network segmentation;
- DNS/certificates;
- scaling/HA;
- backup/PITR implementation;
- observability integration;
- deployment/promotion;
- firewall/IAM;
- capacity/cost;
- production readiness checklist.

---

# Parte XXVI — Regla Final

## 68. Cierre

Una operación válida preserva simultáneamente:

```text
availability
+
electoral correctness
+
privacy
+
recoverability
+
verifiability
```

Una recuperación que deja el dashboard verde pero pierde votos, rompe digests, reescribe evidencia o crea correlación identidad→voto no es recuperación válida.

Antes de producción debe demostrarse:

```text
backup
-> isolated restore
-> invariant validation
-> offline verification
```

con release y dataset representativos.
