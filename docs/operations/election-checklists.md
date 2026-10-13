# Checklists de operación electoral

## Pre-OPEN

- release/manifest aprobados; DB/readiness y artefactos ZK verificados;
- snapshot de elegibilidad congelado; reloj y capacidad dentro de política;
- backup reciente y restore drill válido; alertas/runbooks activos;
- operadores, incident commander, RPO/RTO y decisión de continuidad definidos.

## Durante OPEN

Prioridad: correctness, integridad de aceptación, disponibilidad, observabilidad.
Monitorear API, verifier, PostgreSQL, reloj, disco y errores agregados. No live
tally, edits manuales de votos/nullifiers/snapshot, maintenance rutinario ni
desactivación de proof verification. Fallo de integridad: fail closed.

## Post-CLOSED

Confirmar ausencia de nuevos votos, congelar set/digest/count, pasar a COUNTING,
ejecutar tally determinístico, generar/verificar/publicar package, crear
checkpoint y ejecutar backup/archive según política. Una corrección crea nueva
versión; nunca borra publicación histórica.

Mantenimiento, certificados y rotaciones críticas se programan fuera de `OPEN`,
salvo incidente con runbook probado.
