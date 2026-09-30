# 07 — Autenticación Administrativa

## Propósito
Define autenticación/autorización administrativa inicial de **Votaciones**, complementando `00`–`06`.

Decisiones ya aprobadas: un único administrador inicial, autenticación directa en NestJS y una abstracción de identidad que permita migrar posteriormente a OIDC/Keycloak sin modificar el dominio electoral.

## Mecanismo de sesión
Se utilizará **sesión server-side** con identificador opaco y criptográficamente aleatorio. No se usará JWT de larga duración como sesión administrativa principal.

Valkey será el store inicial de sesiones. Perder Valkey puede invalidar sesiones, pero nunca altera elecciones, votos ni permisos persistentes. El administrador puede volver a autenticarse.

El ID de sesión no será secuencial, no contendrá username/PII y se rotará tras autenticación.

## Cookie
Nombre conceptual:

```text
__Host-votaciones_admin_session
```

En producción bajo HTTPS: `HttpOnly`, `Secure`, `SameSite=Strict` preferentemente, `Path=/` y sin `Domain` si se usa `__Host-`.

Local/devnet por HTTP puede desactivar `Secure` únicamente mediante configuración de entorno. Producción debe rechazar esa configuración.

El session ID nunca se devuelve en JSON ni se almacena en localStorage/sessionStorage/IndexedDB.

## Credenciales
La contraseña se almacenará con **Argon2id**, usando salt aleatorio y parámetros explícitos de memory cost, time cost y parallelism medidos en el hardware objetivo.

No se exige pepper inicialmente. Si se añade, será secreto externo a PostgreSQL con estrategia de rotación.

No implementar criptografía propia.

## Cuenta administrativa
La cuenta persistirá en PostgreSQL, conceptualmente:

```text
admin_account
- id
- username
- password_hash
- status
- password_changed_at
- created_at
- updated_at
```

La primera versión soporta exactamente un administrador operativo. No implementar todavía roles múltiples, grupos, invitaciones, registro público, SSO o recuperación por email.

Auditoría y referencias internas usarán `adminId` estable, no username.

## Bootstrap
Crear administrador mediante:

```text
pnpm admin:create
```

El comando verifica entorno, obtiene username/password sin imprimir el secreto, valida política, genera Argon2id y aborta si ya existe administrador salvo procedimiento explícito.

No pasar password como argumento CLI si puede quedar en history/process list. Preferir prompt oculto/stdin seguro.

Devnet puede tener credencial conocida marcada **DEVNET ONLY**. Producción nunca arranca con credenciales default.

## Política de password
Priorizar longitud sobre reglas artificiales. Debe existir mínimo razonable y máximo para controlar consumo. Permitir password managers, espacios y caracteres amplios. No imponer rotación periódica arbitraria.

No truncar passwords que excedan el máximo: rechazarlas.

## Login
Ruta conceptual:

```text
POST /api/v1/admin/auth/login
```

Input: `username`, `password`.

Login válido crea una sesión nueva, la persiste en Valkey, fija TTL, establece cookie y genera auditoría. No reutilizar sesión elegida por cliente.

Usuario inexistente y password incorrecta producen externamente el mismo status/código/mensaje. Puede utilizarse un hash dummy válido para reducir diferencias de timing. No usar sleeps aleatorios como defensa principal.

## Rate limiting
Login tendrá rate limiting respaldado por Valkey, combinando señales de red e identificador derivado del username cuando corresponda.

No almacenar username en claro innecesariamente en keys. Usar digest con domain separation, por ejemplo:

```text
auth:login-rate:user:<digest>
auth:login-rate:network:<digest>
```

No crear bloqueo permanente remoto de la única cuenta: permitiría DoS. Preferir ventanas temporales/backoff.

## Sesión
Datos mínimos conceptuales:

```json
{
  "v": 1,
  "adminId": "...",
  "createdAt": "...",
  "lastSeenAt": "..."
}
```

No almacenar password hash.

Debe existir **idle timeout** y **absolute timeout**. Sliding expiration, si existe, nunca supera el absoluto.

Namespace conceptual:

```text
votaciones:<env>:auth:admin-session:<session-digest>
```

Preferir guardar un digest del session ID como key; el token crudo vive solo en cookie.

## Logout y revocación
Ruta:

```text
POST /api/v1/admin/auth/logout
```

Invalida sesión server-side, expira cookie y audita. Es idempotente para el cliente.

Debe existir capacidad operacional de revocar todas las sesiones.

Una sesión revocada deja de funcionar inmediatamente.

## Cambio/recuperación de password
El cambio autenticado requerirá password actual o mecanismo seguro equivalente, actualizará hash, auditará y revocará sesiones existentes.

No habrá “forgot password” por email inicialmente. La recuperación será un procedimiento operacional/CLI autorizado y documentado.

## Fallo de Valkey
Si Valkey no está disponible:

- endpoints administrativos protegidos **no hacen fail-open**;
- login no afirma éxito si no puede persistir sesión;
- se devuelve indisponibilidad controlada;
- no se filtran stacks.

## Guard y principal
Crear guard administrativo central que extrae cookie, valida formato, resuelve sesión/expiración y carga principal mínimo.

Conceptualmente:

```ts
type AdminPrincipal = {
  adminId: string;
  authSessionId: string;
};
```

No pasar password hash, request HTTP ni sesión completa al dominio.

## Autenticación vs autorización
Aunque inicialmente solo haya un administrador, mantener ambos conceptos separados. La arquitectura debe admitir roles/scopes futuros sin cambiar el dominio electoral.

## Abstracciones
Definir ports equivalentes a:

```text
IdentityProvider
AdminSessionStore
PasswordHasher
```

`IdentityProvider` no depende de Request/Response, cookies ni headers. El adapter HTTP maneja HTTP.

Implementación inicial:

```text
LocalAdminIdentityProvider
ValkeyAdminSessionStore
Argon2PasswordHasher
```

Una futura implementación OIDC podrá sustituir identidad sin reescribir dominio.

## CSRF
Como la autenticación usa cookie, toda mutación administrativa debe protegerse frente a CSRF. SameSite es defensa complementaria, no única.

Usar **CSRF token explícito ligado a sesión**, enviado por el frontend en header personalizado y validado server-side.

El token tendrá alta entropía, no será reutilizable entre sesiones, no derivará de password y no aparecerá en logs.

`GET`, `HEAD`, `OPTIONS` no deben modificar estado.

Puede validarse `Origin` como defensa adicional, nunca como sustituto del token.

## CORS
Si frontend admin/API están en orígenes distintos: allowlist explícita, `credentials: true`, nunca wildcard y coherencia con SameSite/Secure.

## Operaciones críticas
En el futuro pueden exigir reautenticación adicional: cambio de password, cierre electoral, conteo, publicación y recuperación. No imponerla todavía sin definir UX/protocolo.

## Auditoría
Eventos mínimos:
- login exitoso;
- login fallido de forma segura/agregada;
- logout;
- revocación;
- cambio de password;
- recuperación administrativa;
- rate limit relevante.

Nunca auditar password, cookie o session ID crudo.

IP no es identidad. Si se conserva por seguridad, documentar finalidad/retención/precisión. No asociarla con selección electoral. No persistir User-Agent completo por defecto sin necesidad.

## Logging y cache
Redactar `Cookie`, `Set-Cookie`, `Authorization`, passwords y tokens.

Respuestas administrativas sensibles deben impedir cache compartida inapropiada.

## JWT/API keys/MFA
No emitir JWT administrativo por defecto ni crear API key como atajo.

MFA queda diferido; la arquitectura debe permitir añadirlo posteriormente, especialmente antes de producción si el threat model lo exige. No simular MFA con preguntas de seguridad.

## OIDC/Keycloak futuro
OIDC/Keycloak deben poder reemplazar el proveedor local sin modificar dominio, casos de uso electorales, repositories o protocolo de voto.

No añadir ahora contenedor Keycloak, realm, clients ni adapters.

## Sesiones concurrentes
Inicialmente pueden existir múltiples sesiones del único administrador, todas revocables. No imponer una sola sesión sin necesidad operacional.

## Argon2 y DoS
Usar librería mantenida compatible con Node LTS. Fijar versión.

El rate limit debe reducir abuso de hashes costosos. Medir concurrencia y parámetros; no debilitar Argon2 solo para ocultar un problema de DoS.

Debe ser posible rehash después de login válido cuando los parámetros se actualicen.

## Estado de cuenta
Soportar al menos activo/inactivo. Cuenta inactiva no autentica. La eliminación del único administrador no forma parte del API inicial.

## Tests unitarios
Cubrir:
- password válido/inválido;
- usuario inexistente con respuesta equivalente;
- cuenta inactiva;
- creación/expiración/revocación de sesión;
- CSRF válido/inválido;
- guard.

## Integration tests
Con PostgreSQL y Valkey reales:
- crear admin;
- login;
- persistir sesión;
- request autenticada;
- logout;
- sesión revocada;
- TTL;
- pérdida de Valkey invalida sesión;
- nuevo login recupera acceso.

## E2E mínimo
1. protegido sin sesión → `401`;
2. login inválido → error genérico;
3. login válido → cookie;
4. request protegida → éxito;
5. mutación sin CSRF → rechazo;
6. mutación con CSRF → éxito;
7. logout;
8. sesión anterior → `401`.

También probar session fixation, revocación inmediata, Valkey caído, rate limiting y token CSRF de otra sesión.

## OpenAPI
Documentar login/logout y endpoints administrativos sin mostrar session IDs ni secretos.

## Scripts
Como mínimo:

```text
pnpm admin:create
```

Posteriormente, si aporta valor:

```text
pnpm admin:reset-password
pnpm admin:revoke-sessions
```

## Estructura conceptual
```text
apps/api/src/modules/auth/
├── application/
├── domain/
├── infrastructure/
│   ├── local-identity-provider/
│   ├── session-store/
│   └── password-hasher/
├── http/
│   ├── auth.controller.ts
│   ├── admin-auth.guard.ts
│   └── csrf.guard.ts
└── auth.module.ts
```

## Orden para Codex
1. Definir ports de identidad, sesión y hashing.
2. Crear persistencia de cuenta.
3. Integrar Argon2id.
4. Crear `admin:create`.
5. Implementar session store Valkey.
6. Configurar cookie por entorno.
7. Implementar login.
8. Implementar guard.
9. Implementar logout.
10. Implementar CSRF.
11. Implementar rate limiting.
12. Integrar auditoría mínima.
13. Redactar secretos en logs.
14. Crear unit/integration/E2E.
15. Documentar recuperación.
16. Ejecutar lint/typecheck/test/build.

## Criterios de aceptación
- un administrador inicial;
- password Argon2id;
- sin credenciales default productivas;
- login anti-enumeración;
- sesión opaca/server-side;
- cookie HttpOnly;
- producción exige Secure;
- idle + absolute timeout;
- logout/revocación server-side;
- Valkey caído no hace fail-open;
- guard en endpoints protegidos;
- CSRF en mutaciones;
- rate limiting de login;
- auditoría sin secretos;
- dominio independiente de auth concreta;
- boundary preparado para OIDC/Keycloak;
- tests críticos pasan.

## Definition of Done
```text
[ ] admin_account persistente
[ ] Argon2id
[ ] parámetros documentados
[ ] pnpm admin:create
[ ] password no aparece en CLI/logs
[ ] IdentityProvider boundary
[ ] AdminSessionStore boundary
[ ] PasswordHasher boundary
[ ] LocalAdminIdentityProvider
[ ] Valkey session store
[ ] session ID criptográficamente seguro
[ ] cookie HttpOnly
[ ] Secure obligatorio en production
[ ] SameSite definido
[ ] idle timeout
[ ] absolute timeout
[ ] login endpoint
[ ] logout endpoint
[ ] guard administrativo
[ ] CSRF protection
[ ] login rate limiting
[ ] respuesta anti-enumeración
[ ] session fixation test
[ ] revocation test
[ ] Valkey failure test
[ ] CSRF tests
[ ] rate-limit tests
[ ] auditoría auth
[ ] secrets redacted
[ ] OpenAPI/README actualizados
[ ] lint/typecheck/test/build pasan
```

## Prohibiciones
Codex no debe:
- almacenar passwords en claro;
- implementar password hashing casero;
- devolver session ID en JSON;
- guardar session ID en browser storage;
- usar JWT largo como sesión principal sin cambio arquitectónico;
- hacer fail-open de auth;
- revelar existencia de username;
- bloquear permanentemente la única cuenta por intentos remotos;
- crear recuperación ficticia por email;
- añadir Keycloak/OIDC todavía;
- mezclar auth con reglas electorales;
- registrar cookies/tokens/passwords;
- omitir CSRF en mutaciones autenticadas por cookie.

## Decisiones diferidas
MFA, OIDC/Keycloak definitivo, múltiples administradores, RBAC/ABAC, machine identities, reautenticación de operaciones críticas, políticas productivas finales y recuperación externa.

## Instrucción final
La autenticación local es un adapter inicial, no una dependencia estructural del dominio.

```text
dominio electoral
      ↓ no depende de
LocalAdminIdentityProvider / Valkey sessions / cookies
```

El siguiente documento rector será:

`08-dominio-electoral.md`
