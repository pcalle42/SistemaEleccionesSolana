# Evidencia de validación — etapa 04

Fecha: 2026-09-23

Host de validación: macOS arm64, Docker Engine 29.5.3, PostgreSQL 17.11 y pnpm
10.9.0.

## Migraciones y configuración

- instalación reproducible con `pnpm install --frozen-lockfile`: aprobada;
- `pnpm db:generate`: sin cambios pendientes después del bootstrap;
- migración desde bases local, devnet y test vacías: aprobada;
- segunda ejecución de `pnpm db:migrate`: aprobada, una migración aplicada;
- `pnpm db:status`: `1 applied, 1 files`;
- schemas técnicos creados sin tablas electorales;
- rol runtime comprobado como `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE` y sin
  privilegio `CREATE` en el schema `app`;
- health `SELECT 1` con credencial runtime: aprobado;
- reset sin `--force`: rechazado; reset protegido con `--force`: aprobado.

Antes de reemplazar los volúmenes heredados de la etapa 03 se inspeccionaron
ambas bases y se comprobó que no contenían tablas de usuario. Los volúmenes local
y devnet se recrearon para aplicar la separación de roles desde un cluster vacío.

## Pruebas

- suite completa `pnpm check`: aprobada;
- integración contra PostgreSQL real: 3 pruebas aprobadas;
- escritura y lectura mediante Drizzle: aprobadas;
- commit explícito: aprobado;
- rollback forzado y ausencia posterior del dato: aprobado;
- smoke de PostgreSQL, Valkey, TTL y red para local y devnet: aprobado.

## Backup y restore

Se ejecutó el flujo obligatorio en devnet:

1. migrar;
2. crear un marcador técnico con permiso `SELECT` explícito para runtime;
3. generar y validar un dump custom mediante `pg_dump`/`pg_restore`;
4. resetear y migrar una base nueva;
5. restaurar el dump;
6. leer `stage04-ok` usando el rol runtime;
7. eliminar el marcador técnico.

El archivo de prueba se retiró del workspace después de validar la restauración;
los dumps operativos permanecen ignorados por Git.
