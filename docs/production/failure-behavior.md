# Comportamiento ante fallos productivos

| Fallo | Respuesta segura |
| --- | --- |
| instancia API | edge retira readiness fallida; reemplazo o rollback compatible |
| migración | detener promoción, preservar DB/evidencia y ejecutar plan aprobado |
| ZK mismatch | readiness/protocolo falla cerrado; no sustituir VK/artifact |
| Valkey | degradar auxiliar; PostgreSQL conserva votos y unicidad |
| PostgreSQL | no aceptar/bufferizar en RAM, Valkey o filesystem |
| artifact store | bloquear counting/publicación dependiente; no generar evidencia parcial |
| edge/DNS/TLS | contener, usar recovery auditado y no extender ventana automáticamente |
| clock | alertar/preservar; no reescribir timestamps históricos |
| bad release | detener tráfico nuevo y aplicar rollback compatible/forward-fix |

Los procedimientos detallados de API, DB, artifact, reloj, backup, PITR,
seguridad y elección `OPEN` están en [`operations/runbooks`](../operations/runbooks/README.md).
