# 09 — Elegibilidad e Identidad Electoral

## Propósito
Define el subsistema de elegibilidad e identidad electoral de **Votaciones**, complementando `00`–`08`. Fija separación identidad-voto, credenciales electorales, commitments, snapshots por elección, Merkle roots y boundaries con ZK/nullifiers. No implementa aún el circuito Circom final ni la aceptación del voto.

## Objetivo criptográfico
El sistema deberá permitir demostrar posteriormente en ZK:

> Conozco una credencial electoral cuya commitment pertenece al conjunto elegible congelado para esta elección.

sin revelar qué miembro del conjunto es el votante.

## Separación fundamental
Distinguir siempre:

```text
identidad administrativa/civil
        ↓ provisioning
credencial electoral / commitment
        ↓ prueba anónima
voto
```

No crear una relación persistente normal `persona -> voto`.

Guardar solo datos necesarios para administrar elegibilidad, emitir/provisionar credenciales, construir el conjunto y auditar acciones.

## EligibleVoter
Registro administrativo conceptual:

```text
EligibleVoter
- id
- externalReference?
- displayName?
- status
- createdAt
- updatedAt
```

Los atributos reales dependerán de la fuente del padrón. No añadir PII innecesaria.

`EligibleVoterId` es interno y estable. Nunca se usa como secreto, nullifier, commitment, input público del voto ni identificador observable del protocolo.

Estados iniciales:

```text
ACTIVE
INACTIVE
REVOKED
```

Afectan snapshots futuros; no retiran retrospectivamente votos aceptados.

## Credencial electoral
Cada votante puede controlar un secreto criptográfico conceptual:

```text
voterSecret
```

Debe tener alta entropía y jamás derivarse directamente de cédula/documento, email, teléfono, username, nacimiento o password humano.

### Custodia
Preferencia de producción: el secreto termina bajo control del votante y **no se persiste en texto plano en backend**.

Cuando exista frontend, preferir generación client-side mediante CSPRNG y registro únicamente del commitment. Antes de adoptar el flujo final debe existir UX segura de backup/exportación.

Devnet/bootstrap puede generar material server-side excepcionalmente: aleatorio, entrega única, sin logs, sin persistencia en claro y deshabilitable en producción.

## Identity commitment
Persistir un valor seudónimo:

```text
identityCommitment
```

derivado del secreto mediante construcción compatible con el circuito. La fórmula exacta se fija en etapa 10.

No elegir SHA-256 u otro hash arbitrariamente si no es apropiado dentro del circuito.

El commitment puede ser correlacionable y no debe exponerse innecesariamente junto con PII.

## Separación de persistencia
Conceptualmente:

```text
eligible_voters
electoral_credentials
```

Puede existir durante provisioning:

```text
eligible_voter_id -> credential_id -> identity_commitment
```

pero nunca una FK/cadena desde esas tablas hacia un voto.

El protocolo debe demostrar membresía sin revelar qué commitment se utilizó.

## Lifecycle de credencial
Estados conceptuales:

```text
PENDING
ACTIVE
REVOKED
ROTATED
```

Una credencial revocada deja de entrar en snapshots futuros.

Rotar antes del freeze permite sustituir el commitment. Rotar después no modifica snapshots congelados.

La pérdida del secreto no autoriza al backend a reconstruirlo si el diseño prometió no custodiarlo. Recuperación inicial: revocar y emitir nueva credencial para snapshots futuros. El caso de una elección ya congelada debe tratarse explícitamente sin romper anonimato/doble voto.

## EligibilitySnapshot
Cada elección/configuración utiliza un conjunto congelado:

```text
EligibilitySnapshot
- id
- electionId
- configurationVersion
- version
- status
- merkleRoot
- leafCount
- treeDepth
- createdAt
- frozenAt
```

Estados:

```text
BUILDING
FROZEN
SUPERSEDED
```

Una elección `READY`/`OPEN` requiere snapshot `FROZEN` compatible.

Durante `BUILDING` se seleccionan credentials activas conforme a reglas. El proceso debe ser determinista para el mismo conjunto/configuración.

### Freeze
Congelar implica atómicamente:
1. validar conjunto;
2. fijar leaves;
3. calcular/persistir root;
4. fijar `leafCount` y `treeDepth`;
5. registrar versión;
6. asociar `ElectionConfigurationVersion`;
7. registrar auditoría requerida;
8. commit.

Un snapshot `FROZEN` nunca se edita.

Si `READY -> DRAFT` y cambia elegibilidad/configuración, crear una nueva versión/snapshot. Nunca mutar el anterior.

Durante `OPEN`, `merkleRoot` queda definitivamente fijada para esa configuración.

## Merkle tree
Se utilizará árbol de Merkle compatible con Circom/snarkjs. Etapa 10 fija exactamente:

- función hash;
- field;
- leaf encoding;
- depth;
- zero values;
- orden;
- path representation.

Cada leaf representa `identityCommitment` o una transformación canónica/versionada. Nunca PII.

El orden de leaves es determinista y reproducible; nunca depender de `SELECT` sin `ORDER BY`.

No permitir leaves duplicadas para una credencial.

`leafIndex` puede ser necesario para membership proof, pero no se persiste dentro del voto ni se registra innecesariamente.

`merkleRoot` será dato público natural y podrá formar parte del manifest electoral.

## Manifest de elegibilidad
Debe poder exponer metadata verificable:

```text
snapshotVersion
merkleRoot
leafCount
treeDepth
commitmentSchemeVersion
```

sin publicar relación persona→leaf.

No se decide aún publicar la lista completa de commitments: mejora verificabilidad pero puede aumentar correlación. Se resolverá con threat model.

## Obtención del Merkle path
Opciones futuras:

1. cliente obtiene datos públicos y construye path;
2. backend entrega path para un commitment.

La segunda opción puede correlacionar preparación y voto por commitment, IP y timing. Preferir una arquitectura que reduzca esa señal cuando sea viable.

ZK no elimina metadata de red ni correlación temporal.

## Provisioning vs voting
Separar estrictamente:

```text
credential provisioning / eligibility administration
```

de:

```text
anonymous vote submission
```

No reutilizar cookies o contexto identificativo del provisioning en el voto.

El voto final no debe requerir sesión administrativa ni sesión civil identificada salvo rediseño explícito del threat model.

## Nullifier boundary
Etapa 10 derivará un nullifier desde el secreto y contexto electoral.

Debe ser:
- determinista para misma credencial+elección;
- distinto entre elecciones;
- domain-separated/versionado;
- incapaz de revelar `EligibleVoterId`;
- incapaz de revelar `identityCommitment`;
- incapaz de revelar el secreto.

No concatenar strings ambiguamente.

## Revocaciones y altas
Revocar una credencial afecta snapshots futuros; no modifica snapshots congelados ni elimina votos.

Si una revocación de emergencia debe afectar una elección aún no abierta, volver al flujo de configuración y generar snapshot/version nueva.

Un votante añadido tras freeze no entra en esa versión. Para incluirlo antes de apertura: volver a `DRAFT`, nueva versión/root y preparar de nuevo.

## Duplicidad administrativa
El padrón debe evitar que la misma persona reciba accidentalmente múltiples credenciales activas según la fuente disponible.

Esto es distinto de la defensa criptográfica de doble voto, que será nullifier único + constraint PostgreSQL en etapa 11.

## Importación
Debe existir caso de uso administrativo para importar/actualizar padrón.

No aceptar CSV arbitrario sin schema, límites, validación y reporte de errores. Añadir dry-run si aporta valor.

No conservar indefinidamente archivos originales por defecto. Si auditoría lo requiere, definir política explícita.

Normalización de identificadores administrativos debe ser explícita/testeada; no provocar colisiones silenciosas.

## Casos de uso
Conceptualmente:

```text
RegisterEligibleVoter
DeactivateEligibleVoter
RegisterIdentityCommitment
RevokeCredential
BuildEligibilitySnapshot
FreezeEligibilitySnapshot
```

## Repositories
Ports:

```text
EligibleVoterRepository
ElectoralCredentialRepository
EligibilitySnapshotRepository
```

El repository normal nunca ofrece `findVoterSecretById`: el backend no debe custodiar secretos reutilizables en claro.

## Persistencia
Tablas autorizadas:

```text
eligible_voters
electoral_credentials
eligibility_snapshots
eligibility_snapshot_members
```

`electoral_credentials` puede contener:

```text
id
eligible_voter_id
identity_commitment
scheme_version
status
created_at
revoked_at?
```

Nunca `voterSecret`.

Members conceptuales:

```text
snapshot_id
credential_id
leaf_value
leaf_index
```

Son datos administrativamente sensibles y no se exponen públicamente por defecto.

Constraints mínimos:
- FKs;
- commitment único según scope;
- una credencial activa por votante si esa es la política;
- snapshot version única por elección/configuración;
- leaf index único por snapshot;
- leaf value no duplicado;
- flujo normal incapaz de editar snapshot congelado.

PostgreSQL/versionado/locking protege concurrencia de freeze. Valkey no es autoridad.

## Reproducibilidad
Debe poder reconstruirse exactamente la misma root desde members y versiones criptográficas.

Antes de freeze comprobar cantidad, duplicados, capacidad/depth, scheme version, determinismo y root.

La arquitectura permitirá exportar un artefacto verificable de snapshot sin PII por defecto.

## Auditoría
Eventos relevantes:

```text
eligible_voter_registered
eligible_voter_deactivated
credential_registered
credential_revoked
eligibility_snapshot_built
eligibility_snapshot_frozen
eligibility_snapshot_superseded
```

Nunca auditar secretos.

## Logging
Nunca registrar:
- `voterSecret`;
- material de recuperación;
- activation token;
- archivos completos de padrón;
- Merkle path ligado a identidad salvo necesidad estricta;
- PII innecesaria.

Minimizar también commitments en logs.

## Autorización administrativa
Toda gestión usa auth + CSRF del documento 07.

API conceptual:

```text
POST /api/v1/admin/eligible-voters
GET  /api/v1/admin/eligible-voters
POST /api/v1/admin/eligible-voters/import
POST /api/v1/admin/eligible-voters/:id/deactivate

POST /api/v1/admin/electoral-credentials
POST /api/v1/admin/electoral-credentials/:id/revoke

POST /api/v1/admin/elections/:id/eligibility-snapshots
POST /api/v1/admin/elections/:id/eligibility-snapshots/:snapshotId/freeze
```

## Provisioning
No crear todavía un endpoint público abierto que permita asociar commitments arbitrariamente a votantes.

El flujo debe tener autorización explícita: presencial, activation token, proceso administrativo u otro mecanismo de producto.

Si se usan activation tokens: alta entropía, one-time, expiración, digest server-side, rate limiting, sin logs y jamás reutilizados como credencial de voto.

## Threat model
Un administrador puede conocer persona→commitment si el provisioning lo requiere. El ZK protege commitment→voto, no niega quién está registrado.

Un backend que conoce `voterSecret` debilita gravemente anonimato; por ello producción debe preferir generación client-side.

Un frontend comprometido puede robar secretos antes de generar proof. ZK no protege contra exfiltración del cliente.

IP/timing siguen siendo señales correlacionables incluso con ZK.

## Backup/export
La credencial necesita UX de backup segura. No enviar secretos en claro por email ni a analytics/crash telemetry.

Formato futuro versionado:

```text
credentialFormatVersion
secretMaterial
schemeVersion
```

Si se cifra export con passphrase, usar KDF+AEAD estándar, nunca cifrado casero.

## Privacidad de participación
No publicar en tiempo real listas que permitan inferir quién votó.

No crear:

```text
eligible_voters.has_voted
```

como defensa de doble voto.

La defensa es el nullifier anónimo. No almacenar una marca identificada de participación por conveniencia.

## Errores conceptuales
```text
ELIGIBLE_VOTER_NOT_FOUND
ELIGIBLE_VOTER_INACTIVE
CREDENTIAL_ALREADY_REGISTERED
CREDENTIAL_REVOKED
INVALID_IDENTITY_COMMITMENT
ELIGIBILITY_SNAPSHOT_NOT_FOUND
ELIGIBILITY_SNAPSHOT_NOT_BUILDING
ELIGIBILITY_SNAPSHOT_FROZEN
ELIGIBILITY_SNAPSHOT_CAPACITY_EXCEEDED
ELIGIBILITY_SNAPSHOT_DUPLICATE_LEAF
```

## Testing
### Unit
Registro/desactivación, lifecycle de credential, duplicados, snapshot lifecycle/freeze, inmutabilidad, rotación, revocación, altas tardías y root no mutable.

### Integration PostgreSQL
Constraints, política de credential activa, freeze atómico, rollback, leaf-index uniqueness, concurrencia de versiones y bloqueo de modificaciones al snapshot congelado.

### E2E admin
1. registrar votantes;
2. registrar commitments;
3. construir snapshot;
4. detectar duplicado;
5. congelar;
6. intentar modificar → rechazo;
7. preparar elección;
8. volver a draft;
9. cambiar elegibilidad;
10. generar nueva versión/root.

### Privacidad estructural
La tabla de votos futura no puede requerir FK hacia:

```text
eligible_voters
electoral_credentials
eligibility_snapshot_members
```

Etapa 11 debe conservar esta regla.

### Logs
Verificar que secretos/tokens/material exportable no aparecen.

Los tests criptográficos exactos de root/path se completan al fijar primitivas en etapa 10.

## Estructura conceptual
```text
apps/api/src/modules/eligibility/
├── domain/
│   ├── eligible-voter.ts
│   ├── electoral-credential.ts
│   ├── eligibility-snapshot.ts
│   └── eligibility-errors.ts
├── application/
│   ├── register-eligible-voter/
│   ├── register-identity-commitment/
│   ├── revoke-credential/
│   ├── build-snapshot/
│   └── freeze-snapshot/
├── infrastructure/
│   ├── persistence/
│   └── merkle/
└── http/
```

## Orden para Codex
1. IDs/value objects.
2. `EligibleVoter`.
3. `ElectoralCredential`.
4. `EligibilitySnapshot`.
5. Repository ports.
6. Schema/migraciones.
7. Adapters Drizzle.
8. Registro/desactivación/revocación.
9. Builder abstracto/versionado.
10. Preparar adapter Merkle para etapa 10.
11. Freeze atómico.
12. Integrar `ElectionConfigurationVersion`.
13. Admin API.
14. Auth/CSRF/auditoría.
15. Unit tests.
16. Integration/concurrency.
17. E2E.
18. Documentar privacidad/provisioning.
19. lint/typecheck/test/build.

## Criterios de aceptación
- identidad civil/administrativa separada de identidad electoral;
- `voterSecret` nunca persistido en claro;
- `identityCommitment` versionado;
- commitment no identifica el voto;
- snapshot por elección/configuración;
- snapshot congelado inmutable;
- root fijada antes de OPEN;
- revocaciones/altas no mutan snapshots congelados;
- no `has_voted` por persona;
- no relación voto→persona/credential/member;
- freeze atómico;
- concurrencia protegida por PostgreSQL;
- logs sin secretos;
- provisioning separado del voto;
- listo para primitivas Circom/snarkjs.

## Definition of Done
```text
[ ] EligibleVoter / EligibleVoterId
[ ] ElectoralCredential + lifecycle
[ ] identityCommitment + schemeVersion
[ ] no voterSecret persistido
[ ] EligibilitySnapshot
[ ] BUILDING/FROZEN/SUPERSEDED
[ ] configurationVersion association
[ ] merkleRoot / leafCount / treeDepth
[ ] snapshot members
[ ] orden determinista
[ ] duplicate detection
[ ] freeze atómico
[ ] snapshot inmutable
[ ] repository ports
[ ] migraciones PostgreSQL
[ ] adapters Drizzle
[ ] admin API
[ ] auth + CSRF + auditoría
[ ] unit/integration/concurrency/E2E
[ ] privacy structural review
[ ] logs redacted
[ ] README/OpenAPI
[ ] lint/typecheck/test/build
```

## Prohibiciones
Codex no debe:
- derivar secreto de PII/password;
- almacenar `voterSecret` en claro;
- registrar secretos;
- crear `has_voted` por persona;
- guardar `eligible_voter_id`, `credential_id` o `leaf_index` en el voto;
- cambiar una root congelada;
- mutar snapshot FROZEN;
- usar Valkey como autoridad de elegibilidad;
- usar PII como leaf;
- inventar hash incompatible con circuito;
- asumir que ZK elimina IP/timing;
- crear recuperación contradictoria con no-custodia;
- publicar persona→commitment.

## Decisiones que debe cerrar etapa 10
- campo finito;
- hash ZK-friendly;
- fórmula de identity commitment;
- encoding de leaf;
- tree depth;
- zero values;
- Merkle path;
- fórmula de nullifier;
- domain separation;
- public/private inputs;
- circuit/version IDs;
- canonical serialization;
- proving/verifying artifacts;
- Circom + snarkjs.

## Instrucción final
La elegibilidad debe responder:

```text
¿esta credencial anónima pertenece al conjunto autorizado?
```

sin convertirla en:

```text
¿qué persona está enviando este voto?
```

La relación administrativa persona→commitment, cuando sea necesaria, termina antes del boundary del voto anónimo.

El siguiente documento rector será:

`10-zk-circom-snarkjs.md`
