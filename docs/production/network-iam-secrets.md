# Red, IAM y secretos

El contrato versionado está en `deploy/contracts/network-policy.v1.json` y parte
de deny-by-default. Excepciones de DNS, NTP, CA, observabilidad o storage se
documentan por destino/puerto/propósito. Nunca se permite Internet→PostgreSQL,
Valkey, artifact interno o métricas.

Human IAM usa cuentas nominales, MFA y least privilege. CI posee identidad de
deploy propia limitada al environment y digests aprobados. Break-glass requiere
custodia, aprobación, logging, revisión y rotación posterior. La consola SQL es
excepcional y preferentemente read-only; no es workflow electoral.

`deploy/contracts/runtime-secrets.v1.json` enumera nombres/consumidores sin
valores. El secret manager futuro debe inyectarlos en runtime, auditar acceso,
versionar/rotar y separar DB runtime, DB migration, Valkey, observabilidad,
artifact y backup. Ningún secreto entra a Git, imagen, frontend, log o evidencia
de release. Rotar durante `OPEN` solo mediante incident runbook probado.
