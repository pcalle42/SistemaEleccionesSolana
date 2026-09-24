# Evidencia de validación — etapa 05

Fecha: 2026-09-23

Host de validación: macOS arm64, Docker Engine 29.5.3, Valkey 8.1.10, ioredis
6.0.0 y pnpm 10.9.0.

## Cliente y configuración

- conexión central lazy y ciclo de vida explícito: aprobado;
- health mediante `PING`: aprobado;
- configuración por host o URL, auth opcional y TLS configurable: probado en
  unidad;
- timeouts y reconexiones acotados: probado;
- offline queue y reenvío de comandos pendientes desactivados;
- URLs con contraseña redactadas: probado;
- factories versionadas y aislamiento `local`/`test`: probado;
- subjects sensibles crudos rechazados por la factory de rate limiting.

## Integración real

- conexión, `PING`, set/get y cache-aside contra Valkey real: aprobados;
- valor cacheado inválido descartado mediante validador y reconstruido: aprobado;
- TTL y expiración real: aprobados;
- `SET NX EX` concurrente: un único ganador;
- `GETDEL` concurrente: un único consumo;
- cache indisponible: fallback autoritativo marcado como degradado;
- estado temporal indisponible: error seguro y operación abortada;
- suite conjunta PostgreSQL/Valkey: aprobada.

## Pérdida total

`pnpm valkey:verify:loss` ejecutó el siguiente flujo:

1. escribió verdad persistente en PostgreSQL;
2. escribió una copia con TTL en Valkey;
3. reinició el contenedor Valkey sin persistencia;
4. confirmó que la cache había desaparecido;
5. confirmó que PostgreSQL conservaba el valor;
6. reconstruyó la cache desde PostgreSQL;
7. eliminó el marcador técnico y la key exacta.

La prueba no usa `FLUSHALL`, `FLUSHDB` ni `KEYS *`.
