# Producción e infraestructura

La etapa 20 define una arquitectura desplegable sin seleccionar proveedor:

- [Topología y trust boundaries](architecture-and-trust.md)
- [Perfiles de runtime y datos](runtime-profiles.md)
- [Red, IAM y secretos](network-iam-secrets.md)
- [Capacidad, costo y selección de proveedor](capacity-cost-provider.md)
- [Gates P1–P8 y revisión actual](readiness-gates.md)
- [Runbook de despliegue](deployment-runbook.md)
- [Comportamiento ante fallos](failure-behavior.md)

El contrato ejecutable está en [`deploy/`](../../deploy/README.md). Este repositorio
permanece **NO-GO para una elección real** mientras no exista un perfil aprobado,
artefactos ZK `productionSafe`, RPO/RTO, TLS/DNS y capacidad de staging.
