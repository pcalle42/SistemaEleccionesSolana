# Evidencia y acceso de incidentes

Preservar: identidad de release, timestamps, alertas, logs sanitizados, referencias
del estado DB, audit checkpoints, digests de artefactos/packages, backup IDs y
acciones del operador. Registrar actor, hora UTC, comando/cambio, motivo,
aprobación y resultado. Nunca copiar secretos o PII al ticket.

Operator, seguridad, DBA y auditor reciben acceso separado por necesidad. Para
alta criticidad se definirá chain-of-custody con almacenamiento inmutable,
hashes, custodios y transferencia documentada. La evidencia operacional no se
publica ni se convierte en vínculo identidad→voto.
