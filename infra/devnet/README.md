# Devnet reproducible

> **DEVNET · NO USAR EN ELECCIONES REALES.** Las credenciales y el trusted
> setup Groth16 son públicos, sintéticos y deliberadamente inseguros para
> producción. Devnet usa HTTP; producción requiere HTTPS y artefactos ZK de una
> ceremonia productiva aprobada.

Este perfil ensambla PostgreSQL, Valkey, API, `admin-web` y `voter-web` con el
project name aislado `votaciones-devnet`. PostgreSQL se publica solo en
`127.0.0.1:55432`; Valkey permanece privado. Los datos persistentes y paquetes
de verificación viven en volúmenes etiquetados del proyecto. El estado electoral
durable siempre está en PostgreSQL.

## Requisitos y arranque desde cero

- Docker con Compose v2 y Git.
- Node 22 y pnpm 10 para invocar la superficie raíz y Playwright. PostgreSQL,
  Valkey, Circom y snarkjs no se instalan globalmente.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm devnet:reset -- --force
pnpm devnet:bootstrap
pnpm devnet:e2e
pnpm devnet:verify
```

`bootstrap` ejecuta migraciones con el rol owner, verifica los artefactos ZK
versionados por digest, crea un único admin devnet, carga cinco identidades
sintéticas y deja `Devnet Election` en `READY`. Puede ejecutarse dos veces: la
segunda conserva y valida el escenario existente. El E2E crea otra elección
aislada y nunca reutiliza la demo.

Las URLs predeterminadas son API `http://localhost:3000`, administración
`http://localhost:3101` y votante `http://localhost:3102`. Ambas interfaces
muestran un banner devnet cuando se construyen con este perfil.

## Comandos canónicos

```bash
pnpm devnet:up          # levanta servicios; no siembra ni migra
pnpm devnet:bootstrap   # prepara desde un volumen vacío o valida el existente
pnpm devnet:status      # servicios, migraciones, readiness y elección demo
pnpm devnet:logs        # últimas líneas; acepta un nombre de servicio
pnpm devnet:smoke       # health de DB/cache/API/frontends y red
pnpm devnet:e2e         # navegador + elección completa + fallos + reinicios
pnpm devnet:verify      # verifica offline el último package
pnpm devnet:verify -- --package /app/.artifacts/verification-packages/...
pnpm devnet:down        # detiene y conserva volúmenes
pnpm devnet:reset -- --force # destruye solo recursos devnet y queda detenido
```

El E2E emite proofs Groth16 reales, comprueba retry idempotente, doble voto
conflictivo, proof alterado, voto tardío, tally, package, tampering, publicación,
receipts y recuperación tras reinicios de API, Valkey y PostgreSQL. Su manifest
sin secretos queda en el volumen como `.artifacts/devnet-runs/latest.json`.
`devnet:verify` solo usa el package y el código del verificador; no consulta DB
ni API como autoridad.

La configuración por defecto está en `.env.example`. Para puertos propios,
copiarla a `.env`; los scripts nunca sobrescriben ese archivo. Todos los valores
son `DEVNET ONLY`. Los fixtures públicos están en `fixtures/devnet/manifest.json`
y ningún `voterSecret` se persiste en la aplicación.

## Reset seguro

El reset exige `--force` y comprueba entorno `devnet`, nombre de base
`votaciones_devnet`, prefijo exacto del proyecto y labels de cada volumen.
`--force` no omite esos guards. Elimina únicamente containers, redes y volúmenes
del namespace autorizado; no borra fuentes, `.env` ni artefactos ZK versionados.
La eliminación del volumen no es recuperable salvo backup.

## Diagnóstico

- **Docker no disponible:** `docker info` y `docker compose version` deben pasar.
- **Puerto ocupado:** copiar `.env.example` a `.env` y cambiar
  `API_HOST_PORT`, `ADMIN_WEB_HOST_PORT`, `VOTER_WEB_HOST_PORT` o
  `POSTGRES_HOST_PORT`.
- **PostgreSQL unhealthy:** `pnpm devnet:logs -- postgres`; revisar espacio y no
  cambiar el major sobre un volumen existente.
- **Migración pendiente:** `pnpm devnet:status`; ejecutar
  `pnpm devnet:bootstrap`, no auto-sync de schema.
- **Valkey no disponible:** `pnpm devnet:logs -- valkey`; puede reiniciarse o
  vaciarse sin perder elecciones, votos o resultados.
- **Digest ZK incorrecto o WASM/zkey ausente:** ejecutar
  `pnpm zk:verify-artifacts`. No regenerar claves como reparación automática.
- **Proof falla en navegador:** confirmar que API y voter-web usan el mismo
  protocol manifest, revisar la consola sin publicar credential/witness y volver
  a ejecutar `pnpm devnet:smoke`.
- **Volumen obsoleto:** diagnosticar con `pnpm devnet:status`; solo entonces usar
  el reset explícito y volver a bootstrap.
- **Reset rechazado:** no cambie labels ni guards. Verifique `.env`, project name
  y DB; un target distinto de devnet debe permanecer rechazado.
- **Login limitado tras muchas pruebas:** esperar la ventana configurada o, solo
  en este devnet desechable, reiniciar Valkey; nunca aplicar esa práctica a
  producción.

No existen endpoints de debug para omitir proofs, alterar estados o inyectar
votos. Los logs estructurados y los artefactos CI omiten secrets, witnesses,
traces, videos y screenshots.
