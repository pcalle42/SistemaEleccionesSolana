# Alertas y dashboards vendor-neutral

Las definiciones portables están versionadas en
`ops/observability/alerts.v1.json` y `ops/observability/dashboards.v1.json`.
Son el contrato de entrada para el adaptador de la plataforma productiva; no
seleccionan proveedor ni publican endpoints internos.

## Severidad

- SEV1: riesgo inmediato para disponibilidad o integridad durante `OPEN`.
- SEV2: degradación mayor con riesgo electoral.
- SEV3: degradación operativa sin impacto confirmado.
- SEV4: mantenimiento o señal accionable.

Cada alerta apunta a `docs/operations/runbooks/`. Son SEV1/SEV2: voting API o
PostgreSQL indisponible durante `OPEN`, disco DB crítico, anomalía de persistencia,
artefacto ZK inválido, fallos sistemáticos del verifier, drift fuera de política,
package/result inválido y backup/restore fuera de política.

## Dashboard de sistema

Muestra release/digest, liveness/readiness, rate, latencia, errores agregados,
pool/latencia PostgreSQL, salud Valkey, CPU/RAM/disco/WAL/locks y estado de
backup/restore/clock. No muestra payloads ni IDs.

## Dashboard de elección

Muestra estado, `opensAt`/`closesAt`, total agregado de votos aceptados, rate de
requests/rechazos, proof/DB latency y saturación. Mientras `OPEN` queda prohibido
mostrar tally, distribución de opciones, nullifiers, receipts, IPs o timestamps
individuales. El dashboard nunca sustituye audit ni packages verificables.
