# Contrato de observabilidad

La telemetría operacional diagnostica servicios; no es evidencia electoral. Los
logs JSON incluyen `service`, `environment`, `appVersion`,
`releaseManifestDigest`, `event`, `requestId`, route template, estado y duración.
No incluyen bodies, cookies, Authorization, IP/User-Agent, proof, public signals,
identidad, nullifier, receipt, selección ni secretos. El request de voto inicia
su propio `requestId`; ningún trace de provisioning se propaga a `CastVote`.

## Métricas y acceso

`GET /api/v1/internal/metrics` exporta OpenMetrics solo cuando
`METRICS_ENABLED=true` y exige `x-observability-token`. El token tiene al menos
32 caracteres, se inyecta en runtime y se redacta. El endpoint no se publica en
OpenAPI ni debe exponerse en el edge. Las dimensiones permitidas son route
template, status/result/reason class y estado agregado; están prohibidos IDs,
IP, session, credential, nullifier y receipt.

Se exportan HTTP rate/latency, resultados de voto, rechazos amplios, duplicados,
latencias e inflight ZK/transacción, salud/pool PostgreSQL y salud/latencia
Valkey. Disco, WAL, locks, deadlocks, replica lag, memoria/evictions Valkey y
recursos del host pertenecen al collector de infraestructura futuro.

## Tracing

No se adopta tracing distribuido todavía: los límites actuales se diagnostican
con request IDs aleatorios, métricas y audit separado. Si se adopta OpenTelemetry,
`CastVote` crea un trace nuevo y ningún atributo contiene identity, credential,
commitment, proof, nullifier, choice o receipt.

## Retención y acceso

| Categoría | Acceso | Retención |
| --- | --- | --- |
| logs operacionales | operadores/SRE | política operativa explícita |
| logs de seguridad | seguridad | política de incidente |
| audit administrativo | auditor/seguridad | política electoral/legal |
| evidencia pública | público | lifecycle de publicación |
| backups DB/artefactos | DB/DR operators | RPO/RTO/legal |
| evidencia de incidente | incident commander/auditor | chain-of-custody futura |

No se fija duración hasta conocer requisitos legales, plataforma y threat model.
Nunca se hereda la retención larga electoral a access logs.
