# ADR-000 — Selección de plataforma productiva

- Estado: propuesto
- Fecha:
- Decisores:
- Contexto electoral/regulatorio:

## Requisitos y alternativas

Comparar al menos dos alternativas para edge/DNS, compute, PostgreSQL, Valkey,
artifact/backup storage, secret manager, observabilidad e IaC. Registrar región,
SLA, límites, cifrado, IAM, mantenimiento, portabilidad y costo peak/HA.

## Evidencia

- red privada y trust boundaries;
- TLS/renovación/DDoS;
- RPO/RTO, PITR y restore probado;
- failover/clock/capacidad/game day;
- durability/immutability de artifacts;
- secret delivery, MFA, audit y break-glass;
- estimación de costo y riesgos de lock-in.

## Decisión y consecuencias

Documentar opción elegida, opciones rechazadas, riesgos residuales, plan de salida,
IaC seleccionado y condiciones que obligan a revisar este ADR. No incluir secretos.
