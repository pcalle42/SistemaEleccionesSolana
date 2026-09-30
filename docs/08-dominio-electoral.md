# 08 — Dominio Electoral

## Propósito
Define el núcleo de dominio electoral de **Votaciones**, complementando `00`–`07`. Fija entidades, estados, máquina de estados, invariantes, configuración, opciones, ventanas temporales y boundaries con elegibilidad, ZK, votación, auditoría, conteo y resultados. No implementa aún el protocolo ZK ni el endpoint final de voto.

## Principio rector
El dominio electoral decide qué transiciones son válidas. Controllers, DTOs, Drizzle, PostgreSQL, Valkey, frontend, schedulers y circuitos ZK no sustituyen estas reglas. PostgreSQL refuerza invariantes persistentes.

El dominio es TypeScript puro y no depende de NestJS, HTTP, Drizzle, Valkey, cookies, autenticación local, Circom/snarkjs ni filesystem.

## Aggregate
El aggregate root principal es `Election`. No crear un `Poll` paralelo.

`ElectionId` será opaco, estable y preferentemente UUID seguro. No codifica fechas, administrador, tipo de elección ni información del votante.

Datos conceptuales mínimos:

```text
id
title
description?
status
votingMethod
opensAt
closesAt
createdAt
updatedAt
configurationVersion
```

## Estados
Estados iniciales:

```text
DRAFT
READY
OPEN
CLOSED
COUNTING
RESULTS_PUBLISHED
CANCELLED
```

### DRAFT
Permite preparar metadata, opciones, ventana temporal y configuración requerida por elegibilidad/ZK. No acepta votos.

### READY
Configuración validada y congelada para apertura. No acepta votos.

### OPEN
Puede aceptar intentos de voto sujetos además a tiempo, elegibilidad, proof/protocolo válido, nullifier no consumido y demás invariantes de etapa 11. `OPEN` por sí solo no autoriza un voto.

### CLOSED
No acepta nuevos votos. No calcula resultados automáticamente.

### COUNTING
Fase de procesamiento/verificación/consolidación posterior al cierre. No acepta votos.

### RESULTS_PUBLISHED
Resultado final autorizado publicado según política. Debe referirse a resultado persistente/verificable, nunca solo cache.

### CANCELLED
Elección cancelada. No acepta votos ni puede reabrirse normalmente. La historia previa no se borra silenciosamente.

## Máquina de estados
Transiciones permitidas:

```text
DRAFT -> READY
DRAFT -> CANCELLED

READY -> DRAFT
READY -> OPEN
READY -> CANCELLED

OPEN -> CLOSED
OPEN -> CANCELLED

CLOSED -> COUNTING
CLOSED -> CANCELLED

COUNTING -> RESULTS_PUBLISHED
COUNTING -> CANCELLED
```

No permitir:

```text
CLOSED -> OPEN
RESULTS_PUBLISHED -> OPEN
CANCELLED -> OPEN
```

`READY -> DRAFT` existe solo antes de apertura para corregir configuración y debe invalidar artefactos derivados incompatibles.

## Congelamiento y versionado
`DRAFT -> READY` congela configuración relevante bajo `configurationVersion`.

Después de `OPEN` quedan bloqueados al menos:
- método electoral;
- opciones;
- reglas de selección;
- encoding del voto;
- parámetros ZK ligados a elección;
- elegibilidad que el protocolo declare congelada;
- versión de circuito/protocolo;
- ventana electoral salvo procedimiento futuro explícito.

Una nueva preparación después de `READY -> DRAFT` y cambios relevantes produce una nueva `configurationVersion`.

Debe poder añadirse posteriormente un fingerprint/hash canónico, coordinado con etapa 10. No inventar canonicalización criptográfica aquí.

## Tiempo
Una elección tiene `opensAt` y `closesAt`, con:

```text
opensAt < closesAt
```

Persistir como `timestamptz`/UTC.

Para aceptar voto:

```text
status == OPEN
AND now >= opensAt
AND now < closesAt
```

La ventana es semiabierta `[opensAt, closesAt)`. Un voto aceptado exactamente en `closesAt` o después se rechaza.

El frontend no es autoridad temporal. Usar `Clock` inyectable/controlable para tests. La estrategia final aplicación/PostgreSQL para aceptación atómica se define en etapa 11.

La apertura es inicialmente administrativa: el reloj no cambia solo `READY` a `OPEN`. Puede impedirse abrir antes de `opensAt`.

Aunque un scheduler tarde en materializar `CLOSED`, `closesAt` debe impedir votos tardíos. Un cierre automático futuro será comodidad operacional, no barrera primaria.

## Cancelación
Cancelar es excepcional, auditado y requiere motivo. Puede ocurrir en estados permitidos incluso si ya hubo votos. Los votos aceptados no se borran automáticamente.

## Método electoral
Crear `VotingMethod`. Inicialmente:

```text
SINGLE_CHOICE
```

Cada voto lógico válido selecciona exactamente una opción de la elección.

No implementar todavía ranked choice, approval, cumulative, weighted ni multi-seat.

## ElectionOption
Conceptualmente:

```text
ElectionOption
- id
- label
- description?
- displayOrder
```

`ElectionOptionId` es estable/opaco. `displayOrder` solo controla presentación y nunca será identidad criptográfica.

Para `SINGLE_CHOICE`, preferencia inicial: mínimo 2 opciones. Una ratificación de una sola opción deberá modelarse explícitamente, no asumirse.

El mapping opción ↔ representación de circuito será canónico/versionado y se define en etapa 10.

## Metadata
Título/descripción tienen límites. No aceptar HTML arbitrario por defecto. IDs de opción son únicos. La política de labels duplicados puede endurecerse por UX, pero labels nunca son identidad.

## Eligibility boundary
`Election` no contiene identidades individuales ni lista de votantes. Referencia la configuración/snapshot de elegibilidad que etapa 09 defina.

Queda prohibido:

```text
election -> voter -> selected_option
```

La selección nunca se enlaza directamente con identidad real.

## ZK boundary
El dominio puede requerir una configuración ZK válida antes de `READY`, mediante referencias conceptuales como `ProtocolVersion`/`CircuitVersion`, pero no ejecuta snarkjs ni carga circuitos.

## Voting/nullifier boundary
`Election` decide si el contexto permite intentar aceptar voto por estado/tiempo/configuración. Etapa 11 implementa proof + nullifier + persistencia atómica.

El aggregate no almacena nullifiers. Los nullifiers consumidos pertenecen al subsistema de votación y deben estar ligados explícitamente a `ElectionId`/contexto.

## Counting/results boundary
`CLOSED -> COUNTING` inicia conteo oficial. No se realiza conteo oficial durante `OPEN`.

`COUNTING -> RESULTS_PUBLISHED` requiere un resultado final persistido/validado y ligado a `electionId`, `configurationVersion`, método/protocolo y evidencia correspondiente.

Resultados publicados no son CRUD editable. Correcciones futuras requieren procedimiento/versionado/auditoría.

## Auditoría y domain events
Toda transición debe aportar información para auditoría:

```text
ElectionStateChanged
- electionId
- previousState
- newState
- actor
- timestamp
- reason?
```

Se permiten domain events simples, pero no event bus distribuido en esta etapa.

La transición persistente debe ser atómica con los efectos obligatorios que correspondan. La estrategia completa de auditoría se cerrará posteriormente.

## Concurrencia
Dos requests administrativos no pueden aplicar transiciones incompatibles simultáneamente.

Usar PostgreSQL mediante condición sobre estado/versionado, row lock o estrategia equivalente. No usar Valkey como garantía primaria.

Patrón conceptual:

```text
UPDATE ...
WHERE id = ?
AND status = expected_status
```

y comprobar filas afectadas.

## Errores de dominio
Códigos conceptuales:

```text
ELECTION_NOT_FOUND
INVALID_ELECTION_TRANSITION
ELECTION_CONFIGURATION_INCOMPLETE
ELECTION_CONFIGURATION_FROZEN
ELECTION_NOT_OPEN
ELECTION_NOT_STARTED
ELECTION_CLOSED
INVALID_VOTING_WINDOW
INVALID_ELECTION_OPTION
```

HTTP los mapea conforme documento 06.

## Creación/edición
Crear una elección produce siempre `DRAFT`.

En `DRAFT` se modifican únicamente campos permitidos mediante casos de uso, no mediante asignación genérica.

No permitir crear directamente `OPEN`, `CLOSED` o `RESULTS_PUBLISHED`.

No permitir cambiar estado con:

```json
{"status":"OPEN"}
```

Las transiciones son comandos/casos de uso explícitos.

## Preparar READY
Debe validar como mínimo:
- título;
- método soportado;
- opciones;
- ventana;
- configuración requerida;
- elegibilidad preparada según etapa 09;
- protocolo/circuito compatible según etapa 10.

Hasta integrar 09/10, modelar precondiciones/ports explícitos; no fingir que ya existen.

## Apertura/cierre
`READY -> OPEN` requiere configuración congelada válida, tiempo permitido y artefactos requeridos.

`OPEN -> CLOSED` no modifica votos y debe coordinarse con la misma garantía persistente que etapa 11 utilice para impedir nuevas aceptaciones.

## Persistencia
Definir `ElectionRepository` semántico, no CRUD universal.

Ejemplos:

```text
findById
create
saveDraftChanges
transitionState
```

El aggregate no es una row Drizzle; debe existir mapping explícito.

Esta etapa autoriza tablas electorales mínimas conceptuales:

```text
elections
election_options
election_configuration_versions
```

No crear todavía tablas definitivas de votos, proofs, nullifiers o resultados.

PostgreSQL reforzará PK/FK, estados válidos, `opens_at < closes_at`, unicidad de opciones/configuration versions y constraints apropiadas.

## API administrativa conceptual
```text
POST   /api/v1/admin/elections
GET    /api/v1/admin/elections
GET    /api/v1/admin/elections/:id
PATCH  /api/v1/admin/elections/:id
POST   /api/v1/admin/elections/:id/ready
POST   /api/v1/admin/elections/:id/reopen-draft
POST   /api/v1/admin/elections/:id/open
POST   /api/v1/admin/elections/:id/close
POST   /api/v1/admin/elections/:id/cancel
```

`reopen-draft` significa `READY -> DRAFT`, nunca reabrir una elección cerrada.

Todos los endpoints mutables administrativos usan auth + CSRF del documento 07.

No implementar aún endpoints finales de counting/publication.

## Vista pública y manifest
La futura vista pública expondrá solo información necesaria. No reutilizar automáticamente DTO admin.

La arquitectura debe permitir un manifest público canónico de elección para configuración verificable; su canonicalización exacta se define con ZK.

## Fechas y múltiples elecciones
API usa ISO 8601 inequívoco con zona/offset. Backend almacena instantes; frontend decide presentación horaria.

El dominio permite múltiples elecciones coexistentes. Un único administrador no significa una única elección.

Todo voto/elegibilidad/proof debe quedar ligado al `ElectionId` y contexto correctos. La etapa criptográfica debe aplicar domain separation para impedir reutilización entre elecciones.

## Borrado
No implementar `DELETE election` físico como operación administrativa normal. Preferir cancelación/retención controlada.

## Testing
### Unit — máquina de estados
Probar cada transición permitida y prohibida mediante matriz completa.

### Configuración
Probar:
- ventana válida/inválida;
- opciones insuficientes;
- IDs duplicados;
- edición en draft;
- congelamiento;
- incremento de configurationVersion.

### Tiempo
Probar con `Clock` controlado:

```text
now < opensAt
now == opensAt
opensAt < now < closesAt
now == closesAt
now > closesAt
```

### Integración PostgreSQL real
Probar draft, opciones, READY, reload, constraints, versionado, rollback y transición concurrente.

### E2E admin
1. crear;
2. configurar;
3. intentar abrir incompleta → rechazo;
4. READY;
5. editar campo congelado → rechazo;
6. OPEN;
7. editar opciones → rechazo;
8. CLOSED;
9. intentar reabrir → rechazo.

## Estructura conceptual
```text
apps/api/src/modules/elections/
├── domain/
│   ├── election.ts
│   ├── election-status.ts
│   ├── election-option.ts
│   ├── voting-method.ts
│   ├── election-errors.ts
│   └── clock.ts
├── application/
│   ├── create-election/
│   ├── update-draft-election/
│   ├── prepare-election/
│   ├── reopen-election-draft/
│   ├── open-election/
│   ├── close-election/
│   └── cancel-election/
├── infrastructure/
│   └── persistence/
└── http/
```

## Orden para Codex
1. Crear IDs/value objects.
2. Crear `ElectionStatus`.
3. Crear `VotingMethod/SINGLE_CHOICE`.
4. Crear `ElectionOption`.
5. Implementar aggregate.
6. Implementar máquina de estados.
7. Implementar `Clock`.
8. Implementar congelamiento/versionado.
9. Crear repository port.
10. Crear migraciones.
11. Implementar adapter Drizzle.
12. Implementar casos de uso.
13. Implementar DTOs/controllers.
14. Integrar auth/CSRF.
15. Preparar punto de auditoría.
16. Unit tests exhaustivos.
17. Integration/concurrency tests.
18. E2E.
19. OpenAPI/README.
20. lint/typecheck/test/build.

## Criterios de aceptación
- `Election` independiente de NestJS;
- estados/transiciones explícitos;
- no cambio libre de status;
- `SINGLE_CHOICE`;
- IDs de opciones estables;
- `[opensAt, closesAt)`;
- READY congela configuración;
- READY→DRAFT reversiona/invalida derivados;
- OPEN bloquea edición crítica;
- `closesAt` impide votos tardíos aunque status tarde en cambiar;
- no CLOSED→OPEN;
- cancelación explícita/auditable;
- constraints PostgreSQL;
- concurrencia protegida;
- dominio no conoce identidad individual;
- boundaries de elegibilidad/ZK/voto/resultados definidos;
- tests de estados/tiempo pasan.

## Definition of Done
```text
[ ] Election aggregate
[ ] ElectionId
[ ] ElectionStatus
[ ] VotingMethod
[ ] SINGLE_CHOICE
[ ] ElectionOption
[ ] máquina de estados completa
[ ] DRAFT -> READY
[ ] READY -> DRAFT
[ ] READY -> OPEN
[ ] OPEN -> CLOSED
[ ] cancelación
[ ] no CLOSED -> OPEN
[ ] opensAt < closesAt
[ ] intervalo [opensAt, closesAt)
[ ] Clock testeable
[ ] configurationVersion
[ ] congelamiento
[ ] ElectionRepository port
[ ] migraciones PostgreSQL
[ ] adapter Drizzle
[ ] constraints DB
[ ] casos de uso admin
[ ] controllers delgados
[ ] auth + CSRF
[ ] state-matrix tests
[ ] time-boundary tests
[ ] integration tests
[ ] concurrency tests
[ ] E2E admin
[ ] OpenAPI/README actualizados
[ ] lint/typecheck/test/build pasan
```

## Prohibiciones
Codex no debe:
- cambiar status mediante PATCH genérico;
- permitir CLOSED/CANCELLED → OPEN;
- editar opciones después de apertura;
- usar Valkey como autoridad del estado;
- meter identidad de votantes en `Election`;
- relacionar votante con opción;
- implementar proof/nullifier definitivo aquí;
- implementar conteo final prematuramente;
- usar `displayOrder` como identidad criptográfica;
- confiar en hora del frontend;
- usar scheduler como única barrera de cierre;
- borrar votos al cancelar;
- crear CRUD genérico que salte invariantes.

## Decisiones diferidas
Estructura exacta de elegibilidad, Merkle root, credential/commitment, circuit IDs/public inputs, encoding criptográfico, nullifier, persistencia/aceptación atómica de votos, auditoría completa, conteo, resultados y retención.

## Instrucción final
La elección es una **máquina de estados con configuración versionada**, no una row CRUD editable. Las etapas posteriores consumen estas invariantes y no deben duplicarlas.

El siguiente documento rector será:

`09-elegibilidad-identidad-electoral.md`
