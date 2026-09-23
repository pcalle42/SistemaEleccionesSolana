# Evidencia de validación — etapa 03

> Este archivo conserva la evidencia histórica de la etapa 03. Desde la etapa
> 04, PostgreSQL devnet publica un puerto exclusivamente en loopback para las
> migraciones y pruebas; consulte `apps/api/PERSISTENCE_VALIDATION.md`.

Fecha: 2026-09-03

Host de validación: macOS arm64, Docker Engine 29.5.3, Docker Compose 5.1.4

## Configuración

- `pnpm infra:config`: aprobado.
- `pnpm devnet:config`: aprobado.
- `bash -n infra/scripts/*.sh`: aprobado.
- tags y digests comprobados para `arm64` y `amd64`.

## Local

- PostgreSQL y Valkey alcanzaron estado `healthy`.
- puertos 5432 y 6379 publicados exclusivamente en `127.0.0.1`.
- ambos servicios se conectaron a la red interna explícita.
- smoke PostgreSQL de conexión, escritura y lectura: aprobado.
- smoke Valkey de `PING`, escritura, lectura y TTL: aprobado.
- PostgreSQL conservó el marcador después de `down/up`.

## Reset

- reset sin `--force`: rechazado.
- reset con entorno y proyecto validados: aprobado.
- el volumen fue eliminado y el marcador previo dejó de existir.
- se utilizó el proyecto aislado `votaciones-local-stage03-reset` con puertos
  alternativos; todos sus recursos se eliminaron después de la prueba.

## Devnet

- PostgreSQL y Valkey alcanzaron estado `healthy`.
- smoke tests PostgreSQL, Valkey, TTL y red: aprobados.
- ningún servicio publicó puertos al host.

## Estado final

Los contenedores local y devnet quedaron detenidos mediante sus comandos
documentados. Los volúmenes normales de PostgreSQL se conservaron para demostrar
la semántica no destructiva de `down`.

La ejecución en Linux/amd64 no se realizó en esta estación; ambas imágenes
publican manifiestos para esa arquitectura y la configuración evita dependencias
específicas de macOS.
