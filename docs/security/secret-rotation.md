# Rotación de secretos

Los valores productivos viven en un secret manager con cifrado, ACL y audit; nunca en Git, layers,
outputs CI o `.env.example`. Registrar dueño, uso, fecha, consumidores y próxima rotación.

| Secreto | Rotación | Efecto/validación |
|---|---|---|
| Sesiones admin | revocar todas, rotar material de derivación/config y reiniciar controladamente | todas las sesiones fallan y login nuevo funciona |
| Password admin | comando administrativo autenticado o recuperación controlada | Argon2id nuevo, sesiones revocadas, audit event |
| PostgreSQL runtime | crear/actualizar credencial, desplegar consumidores, revocar anterior | health/migrate separados; runtime sigue sin owner/superuser |
| PostgreSQL migration | ventana de mantenimiento, rotar fuera del runtime | migración de prueba; API no conoce la credencial |
| Valkey | actualizar ACL/secret, desplegar, revocar anterior | auth funciona; restart/flush no afecta verdad electoral |
| Clave de firma futura | procedimiento multioperador y versionado | verificabilidad histórica conserva claves públicas anteriores |

`voterSecret` no es un secreto operacional rotatable por el servidor. Una credential comprometida se
revoca/reemite mediante el flujo electoral permitido antes del freeze; nunca se recopila su secreto.

Ante incidente: revocar/rotar, delimitar ventana, preservar evidencia, inspeccionar logs/audit,
verificar invariantes y comunicar impacto. La rotación nunca elimina packages/VK históricos.
