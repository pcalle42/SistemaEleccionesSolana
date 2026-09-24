# 06 — Backend NestJS Base

## Propósito
Define la arquitectura base del backend NestJS de **Votaciones**. Complementa `00`–`05`. Esta etapa crea la plataforma técnica; no implementa todavía el protocolo electoral.

## Stack
- Node.js LTS fijado por el repositorio.
- TypeScript estricto.
- NestJS.
- PostgreSQL + Drizzle ORM + `pg`.
- Valkey + `ioredis`.

No añadir frameworks HTTP, ORM o clientes Valkey paralelos.

## Arquitectura y dependencias
NestJS será composition root y framework de entrega, no el dominio. Separar conceptualmente:

```text
transport → application → domain
                 ↑
        infrastructure adapters
```

El dominio no depende de NestJS, HTTP adapter, Drizzle, `pg`, ioredis, DTOs HTTP ni variables de entorno. PostgreSQL, Valkey y futuros adaptadores criptográficos implementan ports/boundaries controlados.

## Estructura conceptual
```text
apps/api/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   ├── common/
│   │   ├── errors/
│   │   ├── filters/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── pipes/
│   │   └── logging/
│   ├── health/
│   ├── database/
│   ├── valkey/
│   └── modules/
├── test/
└── README.md
```

Módulos futuros: `auth`, `elections`, `eligibility`, `voting`, `zk`, `audit`, `counting`, `results`. No crear módulos vacíos masivos anticipadamente.

## Bootstrap
`AppModule` debe ser pequeño: composición, configuración e infraestructura global necesaria. `main.ts` solo configura bootstrap HTTP, validation, filtros, logging, seguridad HTTP, shutdown, OpenAPI y puerto.

Se utilizará inicialmente el adapter HTTP por defecto soportado por NestJS salvo incompatibilidad demostrada.

## API
Prefijo objetivo:

```text
/api/v1
```

Health puede quedar fuera del versionado. La primera API será `v1`; no crear versiones anticipadamente.

## Configuración
Todo runtime config pasa por una capa central validada. No dispersar `process.env`.

Separar al menos: app, HTTP, database, Valkey, logging y posteriormente auth/ZK.

Entornos reconocidos:

```text
local
test
devnet
production
```

Un entorno desconocido o configuración obligatoria inválida debe abortar startup. No imprimir secretos.

## DTOs y validación runtime
Toda entrada HTTP estructurada usa DTO/schema explícito para body, params, query y headers relevantes.

TypeScript no sustituye validación runtime. Preferencia inicial compatible con NestJS:

- `class-validator`;
- `class-transformer`.

Configurar globalmente equivalente a:

```text
whitelist: true
forbidNonWhitelisted: true
transform: true
```

Revisar coerciones automáticas. Validar UUIDs antes del dominio. Identificadores criptográficos tendrán validadores específicos.

Establecer límites razonables de body; no aumentar globalmente para acomodar proofs futuras.

## Controllers
Controllers delgados:

1. reciben HTTP;
2. validan;
3. obtienen principal cuando corresponda;
4. invocan caso de uso;
5. mapean respuesta.

No ejecutan SQL, no acceden directamente a Valkey, no verifican proofs y no contienen transiciones complejas.

## Application/use cases
Los casos de uso coordinan dominio, repositories, transacciones, servicios criptográficos y auditoría.

Ejemplos futuros:

```text
CreateElection
OpenElection
RegisterEligibility
CastVote
CloseElection
PublishResult
```

Evitar services gigantes.

## Domain
Contiene invariantes, estados, value objects, reglas y errores de dominio. Debe poder probarse sin iniciar NestJS.

## Infrastructure
Implementa PostgreSQL, Valkey, crypto adapters, filesystem y proveedores futuros. No decide reglas electorales.

## Dependency Injection
Usar DI de NestJS en boundaries de aplicación/infraestructura. Para ports relevantes usar tokens explícitos cuando eviten acoplamiento.

No crear service locator global. `forwardRef()` no debe utilizarse como parche habitual; una dependencia circular obliga primero a revisar boundaries.

## `common/`
Solo infraestructura transversal genuina. No convertirla en carpeta de código huérfano ni colocar reglas electorales allí.

## Contratos de respuesta
No devolver entidades Drizzle directamente ni objetos internos del dominio sin mapping. Las respuestas HTTP tienen contratos explícitos.

## Errores
Taxonomía conceptual:

- validation;
- authentication;
- authorization;
- not found;
- conflict;
- domain rule violation;
- rate limit;
- dependency unavailable;
- internal.

Formato estable conceptual:

```json
{
  "error": {
    "code": "ELECTION_NOT_OPEN",
    "message": "The election is not open.",
    "requestId": "..."
  }
}
```

No devolver stack, SQL, queries, rutas internas, secretos ni detalles criptográficos privados.

Los códigos son contrato machine-readable; el texto no.

## Exception filter
Crear filtro global que convierta errores conocidos, proteja detalles internos, asigne status HTTP, incluya request ID y registre de forma segura.

Errores inesperados responden genéricamente `500`. Violaciones PostgreSQL se traducen a errores semánticos; nunca exponer mensajes del motor directamente.

## HTTP status
Convención:
- `200/201/204`: éxito según operación;
- `400`: request inválida;
- `401`: no autenticado;
- `403`: no autorizado;
- `404`: no encontrado/no visible según política;
- `409`: conflicto de estado;
- `429`: rate limit;
- `500`: error inesperado;
- `503`: dependencia necesaria indisponible.

`422` solo si se adopta consistentemente.

## Logging
Logging estructurado. Preferencia: **Pino con integración NestJS**, si es compatible con la versión fijada.

Campos útiles:

```text
timestamp
level
service
environment
requestId
event
durationMs
statusCode
```

Local puede renderizar más legible; devnet/production deben preservar estructura.

## Request ID
Cada request recibe correlation ID. Un ID aportado por cliente solo se acepta bajo formato/política segura; en otro caso se genera.

Nunca usar voter ID como request ID.

## HTTP logging
Registrar método, route template, status, duración y request ID. No registrar bodies completos por defecto.

Nunca registrar deliberadamente:
- passwords;
- auth tokens/cookies;
- private keys;
- witnesses;
- private ZK inputs;
- selección de voto ligada a identidad;
- `DATABASE_URL`;
- `VALKEY_URL` con credenciales.

Minimizar PII.

Logs técnicos no sustituyen auditoría.

## Seguridad HTTP
Incorporar headers estándar; `helmet` puede utilizarse si es compatible.

CORS será explícito por entorno. Nunca wildcard con credenciales. Producción tendrá allowlist.

Si posteriormente se usan cookies: `HttpOnly`, `Secure` bajo TLS, `SameSite` apropiado y scope mínimo.

CSRF se decide en etapa 07 según mecanismo de sesión; no instalar protección genérica prematuramente.

## OpenAPI
Usar integración oficial NestJS para OpenAPI. Debe reflejar endpoints, DTOs, status, errores y autenticación cuando exista.

Swagger UI puede exponerse en local/devnet. Producción no lo expone automáticamente y debe ser configurable.

OpenAPI no sustituye validation runtime.

## Health
Endpoints mínimos:

```text
GET /health/live
GET /health/ready
```

`live`: proceso vivo, sin depender de PostgreSQL/Valkey salvo motivo excepcional.

`ready`: dependencias necesarias. PostgreSQL es obligatorio. Valkey debe poder reflejar `healthy`, `degraded` o `unavailable` según la semántica del documento 05.

Health nunca expone secretos, hostnames internos innecesarios, queries ni stacks.

## Graceful shutdown
Habilitar shutdown hooks. Ante `SIGTERM`, dejar de aceptar trabajo, cerrar pool PostgreSQL y conexiones Valkey y permitir finalizar trabajo en curso dentro de límites.

## Timeouts
Definir política HTTP razonable. No usar timeouts gigantes globales para ocultar operaciones costosas. Los tiempos de proof verification se ajustarán cuando existan mediciones.

## ZK boundary
Verificación/generación ZK nunca vive en controllers. Se integrará mediante port/service dedicado en etapa 10/11.

No introducir queues por anticipación.

## Idempotencia y rate limiting
La infraestructura debe permitir idempotency keys en endpoints seleccionados, pero su semántica de voto se define en etapa 11.

Debe permitir rate limiting respaldado por Valkey. No fijar límites electorales todavía. Login administrativo se define en etapa 07.

## Authentication y authorization boundaries
Preparar guards/decorators, pero no implementar aún el mecanismo final.

Autenticación y autorización son distintas. El actor autenticado se representa mediante un principal interno mínimo; nunca pasar el request HTTP completo al dominio.

## Separación de superficies
Distinguir claramente:
- endpoints administrativos;
- endpoints del votante;
- endpoints públicos;
- health.

No exponer detalles de implementación en rutas. Mutaciones nunca serán `GET`.

## Enumeración
Errores de autenticación y otros endpoints sensibles deben diseñarse para no facilitar enumeración. La política concreta corresponde a etapa 07.

## Pagination/filtering
Listados potencialmente grandes usarán paginación. Sorting/filtering solo aceptará campos allowlisted; nunca transformar parámetros del cliente directamente en nombres de columna SQL.

## Serialization
Fechas HTTP usarán ISO 8601. BigInt, bytes, hashes y artefactos criptográficos tendrán representación explícita cuando aparezcan.

## Testing
### Unit
Dominio/casos de uso sin servidor HTTP.

### Integration
PostgreSQL y Valkey reales conforme documentos 04/05.

### E2E
Arrancar API y hacer requests reales. En esta etapa basta con endpoints técnicos/base.

Los tests deben ser deterministas y no depender de red externa ni estado mutable compartido.

Mocks deben sustituir boundaries, no cada detalle interno.

## Tests mínimos de validación
Comprobar:
- propiedad desconocida rechazada;
- UUID inválido rechazado;
- body mal formado rechazado;
- payload excesivo rechazado según límites.

## Tests mínimos de errores
Comprobar que un error inesperado no filtra stack ni SQL.

## Tests mínimos de health
Comprobar:
- liveness sano;
- readiness con PostgreSQL sano;
- readiness con PostgreSQL caído;
- Valkey sano;
- comportamiento definido con Valkey caído.

## Shutdown test
Debe existir test/procedimiento reproducible que demuestre liberación de conexiones durante shutdown.

## OpenAPI test
La generación debe completarse sin errores y sin incluir secretos/configuración interna.

## Build
El build no debe requerir conexión PostgreSQL/Valkey. Startup sí valida configuración y dependencias según entorno.

Debe pasar:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Dependencias
Cada dependencia runtime requiere propósito claro. Evitar librerías para tareas triviales ya cubiertas por Node/NestJS.

Debe poder ejecutarse auditoría de dependencias desde tooling/CI; advisories se analizan por aplicabilidad, no se ignoran ni se tratan todos mecánicamente como equivalentes.

## Transactions
Los casos de uso controlan boundaries transaccionales. Controllers no abren transacciones. Repositories no deben crear transacciones independientes cuando una operación requiere atomicidad entre varios.

## Valkey
Casos de uso no usarán Valkey como verdad persistente. Un cache miss o caída seguirá la política del documento 05.

## Eventos y jobs
No introducir event bus, queue o background job system en esta etapa. Si posteriormente se necesita, su diseño debe definir persistencia, retry, idempotencia, observabilidad y fallos.

## Feature flags
No introducir plataforma de feature flags. Configuración simple por entorno es suficiente por ahora.

## Endpoints debug
Prohibido crear endpoints que permitan ejecutar SQL, vaciar Valkey, cambiar estados, generar tokens, omitir auth o inspeccionar secretos. Herramientas dev serán scripts controlados.

## README
`apps/api/README.md` debe explicar:
- requisitos;
- configuración;
- ejecución;
- build;
- tests;
- health;
- OpenAPI;
- PostgreSQL;
- Valkey;
- troubleshooting básico.

## Orden para Codex
1. Crear/scaffoldear NestJS.
2. Integrar TypeScript/ESLint del monorepo.
3. Crear configuración runtime validada.
4. Integrar database del documento 04.
5. Integrar Valkey del documento 05.
6. Configurar ValidationPipe.
7. Crear taxonomía/filtro de errores.
8. Configurar request IDs.
9. Configurar logging estructurado.
10. Configurar headers HTTP.
11. Configurar CORS.
12. Crear liveness/readiness.
13. Habilitar graceful shutdown.
14. Configurar `/api/v1`.
15. Configurar OpenAPI local/devnet.
16. Crear tests unit/integration/E2E base.
17. Ejecutar lint/typecheck/test/build.
18. Documentar.

## Criterios de aceptación
La etapa se aprueba cuando:
- NestJS arranca en local/devnet;
- configuración inválida aborta startup;
- PostgreSQL y Valkey están integrados;
- validation runtime es estricta;
- propiedades desconocidas se rechazan;
- controllers base son delgados;
- errores públicos tienen contrato estable;
- errores internos no filtran detalles;
- request IDs funcionan;
- logging estructurado funciona;
- secretos no aparecen en logs;
- CORS y security headers están configurados;
- liveness/readiness funcionan;
- degradación Valkey es visible;
- shutdown cierra recursos;
- OpenAPI funciona solo donde está permitido;
- lint/typecheck/test/build pasan.

## Definition of Done
```text
[ ] NestJS base creado
[ ] TypeScript strict
[ ] configuración runtime validada
[ ] process.env centralizado
[ ] PostgreSQL integrado
[ ] Valkey integrado
[ ] ValidationPipe global
[ ] whitelist activa
[ ] forbidNonWhitelisted activo
[ ] formato de error estable
[ ] exception filter global
[ ] request ID
[ ] logging estructurado
[ ] secretos excluidos de logs
[ ] security headers
[ ] CORS explícito
[ ] /health/live
[ ] /health/ready
[ ] graceful shutdown
[ ] /api/v1
[ ] OpenAPI local/devnet
[ ] tests de validación
[ ] tests de errores
[ ] tests de health
[ ] integration tests
[ ] E2E base
[ ] pnpm lint pasa
[ ] pnpm typecheck pasa
[ ] pnpm test pasa
[ ] pnpm build pasa
[ ] README actualizado
```

## Prohibiciones
Codex no debe:
- implementar lógica electoral en controllers;
- acceder a Drizzle/ioredis directamente desde controllers;
- hacer depender dominio de NestJS;
- devolver entidades DB directamente;
- exponer stacks;
- registrar bodies sensibles indiscriminadamente;
- usar CORS wildcard con credenciales;
- crear endpoints debug inseguros;
- introducir queues/event buses sin necesidad;
- implementar autenticación final antes del documento 07;
- implementar ZK/votación antes de sus etapas.

## Decisiones diferidas
Se definirán posteriormente:
- autenticación y sesiones/tokens;
- CSRF y permisos;
- modelo electoral;
- elegibilidad;
- ZK;
- rate limits concretos;
- idempotencia de voto;
- auditoría;
- conteo/resultados;
- observabilidad productiva.

## Instrucción final
Esta etapa entrega una **plataforma backend limpia y segura**, no una aplicación electoral improvisada. Las siguientes etapas deben poder añadir comportamiento mediante módulos y casos de uso delimitados sin romper estos boundaries.

El siguiente documento rector será:

`07-autenticacion-administrativa.md`
