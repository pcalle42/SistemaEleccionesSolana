# Autenticación administrativa

Autenticación local inicial para un único administrador. Es un adapter aislado:
los módulos electorales dependerán de un principal mínimo y no de passwords,
cookies, Valkey ni de la implementación local de identidad.

## Crear la cuenta inicial

Primero aplique migraciones y levante Valkey:

```bash
pnpm infra:up
pnpm db:migrate
pnpm admin:create
```

El comando solicita username y password. En una terminal el password y su
confirmación no se muestran. Para automatización controlada, defina
`ADMIN_CREATE_USERNAME` y entregue exactamente una línea por stdin; el password
nunca se acepta como argumento CLI. El comando aborta si ya existe una cuenta.

El username se normaliza a minúsculas y admite entre 3 y 64 caracteres
alfanuméricos, `.`, `_` y `-`. El password admite espacios y Unicode, exige entre
16 y 256 caracteres y nunca se trunca.

## Password hashing

Se utiliza `argon2` 0.45.1 con Argon2id, salt aleatorio de la librería y estos
valores iniciales explícitos:

```text
memoryCost = 19456 KiB
timeCost = 2
parallelism = 1
```

Son el mínimo Argon2id adoptado para esta etapa. Deben medirse en el hardware de
producción antes del despliegue. Un login válido detecta hashes con parámetros
anteriores y los actualiza. No existe pepper en esta versión.

## Login y sesión

```text
POST /api/v1/admin/auth/login
GET  /api/v1/admin/auth/session
POST /api/v1/admin/auth/logout
POST /api/v1/admin/auth/change-password
```

Login devuelve `adminId` y un token CSRF; nunca devuelve el session ID. La sesión
usa 256 bits aleatorios y su valor crudo solo se envía en una cookie `HttpOnly`,
`SameSite=Strict`, `Path=/`, sin `Domain`. En producción la cookie se llama
`__Host-votaciones_admin_session` y `Secure` es obligatorio. En HTTP local/devnet
se usa `votaciones_admin_session` para que los navegadores no rechacen una cookie
`__Host-` sin `Secure`.

Valkey solo recibe el digest SHA-256 con separación de dominio del session ID.
La sesión aplica timeout idle de 15 minutos y absoluto de 8 horas por defecto;
el sliding TTL nunca supera el absoluto. Perder Valkey invalida sesiones, pero no
afecta la cuenta ni datos persistentes.

## CSRF y CORS

Toda mutación autenticada valida `x-csrf-token`. El token tiene alta entropía,
está ligado criptográficamente a una sola sesión y se compara en tiempo
constante. `Origin`, cuando existe, también debe pertenecer a la allowlist CORS;
no sustituye al token CSRF.

El frontend puede recuperar su principal y token CSRF mediante el `GET` de
sesión. Ese endpoint no rota ni modifica credenciales. Todas las respuestas del
módulo llevan `Cache-Control: no-store`.

## Rate limiting y fallos

Login consume ventanas temporales por digest de username y señal de red, sin
guardar el username o IP en las keys. Los defaults son 5 intentos por username y
20 por red cada 5 minutos. La limitación ocurre antes de Argon2 para reducir DoS.

Valkey es obligatorio para login y endpoints protegidos. Si no está disponible,
la autenticación responde `503` y nunca hace fail-open. Usuario inexistente,
password incorrecto y cuenta inactiva comparten el mismo `401`, código y mensaje.

## Revocación y recuperación operacional

```bash
pnpm admin:revoke-sessions
pnpm admin:reset-password
```

`admin:revoke-sessions` incrementa la generación server-side y deja inválidas de
inmediato todas las sesiones. `admin:reset-password` solicita el secreto sin eco,
actualiza Argon2id y revoca todas las sesiones. Requiere acceso operacional al
entorno, PostgreSQL y Valkey; no existe recuperación por email.

El cambio HTTP autenticado requiere password actual y CSRF, y también revoca
todas las sesiones.

## Auditoría y privacidad

`audit.admin_auth_event` registra creación, login exitoso/fallido, logout,
rate limit, revocación y cambios/recuperación de password. Guarda el request ID,
pero no persiste IP ni User-Agent. Los digests de red usados por rate limiting
solo viven en Valkey durante la ventana configurada. Nunca se auditan password,
cookie, session ID, token CSRF ni URL de conexión.

## Configuración

Las variables `ADMIN_*` están documentadas en `infra/<entorno>/.env.example`.
Producción rechaza `ADMIN_COOKIE_SECURE=false`. Los timeouts y límites están
acotados por la configuración central validada.

## Tests

```bash
pnpm --filter @votaciones/api test:unit
pnpm test:e2e
pnpm infra:up
pnpm test:integration
```

Las pruebas cubren Argon2id, anti-enumeración, cuenta inactiva, expiración y
revocación, session fixation, CSRF cruzado, guards, rate limiting, pérdida de
Valkey, persistencia real y nuevo login después de perder una sesión.
