# Capacidad, costo y selección de proveedor

El modelo se completa con datos sintéticos de staging:

| Dimensión | Evidencia requerida |
| --- | --- |
| API/ZK | vCPU/RAM por verifier, concurrencia acotada, p95/p99 y rate pico |
| PostgreSQL | writes/s, conexiones, IO/WAL, crecimiento, backup/restore |
| Valkey | conexiones, memoria, latencia y comportamiento ante pérdida |
| artifacts/CDN | bytes por elección/package, durabilidad y egress |
| operación | logs/métricas, retención, on-call y game days |
| resiliencia | premium de HA, RPO/RTO y recuperación probada |

Dimensionar peak más headroom aprobado, nunca promedio. No se fija número hasta
conocer electores, turnout, ventana y plataforma.

La evaluación compara PostgreSQL, compute, artifact storage, secrets y edge por
durabilidad, red privada, TLS, backup/PITR, health, resource guarantees,
observabilidad, IAM, mantenimiento y costo total. La decisión usa la
[plantilla ADR](../adr/000-template-provider-selection.md). IaC solo se elige
después; requiere PR/review, state protegido, drift detection y reconciliación.
