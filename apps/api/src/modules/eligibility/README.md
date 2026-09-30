# Elegibilidad e identidad electoral

Este módulo separa el padrón administrativo, la credencial electoral y el futuro voto anónimo.
Ninguna tabla o respuesta de voto referencia `eligible_voter_id`, `credential_id`, `leaf_index` ni
una marca identificada `has_voted`.

## Custodia y privacidad

- El backend nunca recibe ni persiste `voterSecret`.
- `identityCommitment` es un valor opaco y versionado; no se deriva aquí desde PII ni passwords.
- El padrón conserva únicamente una referencia externa y un nombre de visualización opcionales.
- Los miembros del snapshot son administrativos y no se publican en la API.
- Los logs HTTP no serializan bodies y la redacción incluye secretos, material de recuperación,
  activation tokens, commitments y Merkle paths.
- Provisioning y administración usan sesión administrativa + CSRF. No existe endpoint público de
  provisioning ni se reutiliza esta sesión para votar.

## Snapshots

Un build selecciona solo votantes y credenciales `ACTIVE`, ordenados explícitamente por scheme,
commitment e ID. El snapshot queda ligado a `(electionId, configurationVersion)`, y PostgreSQL
asigna su versión bajo lock de la elección. El build también enlaza atómicamente el snapshot al
draft electoral.

El freeze valida el artefacto mediante `MerkleTreeBuilder`, cambia `BUILDING -> FROZEN` y registra
auditoría en la misma transacción. Grants por columna impiden cambiar root, profundidad, versión o
conteos desde el rol runtime; un trigger impide modificar members fuera de `BUILDING`.

`READY` y `OPEN` consultan PostgreSQL y exigen que la referencia corresponda a un snapshot
`FROZEN` de la elección y configuración correctas.

## Boundary criptográfico

La etapa 09 no elige hash, field, encoding, depth ni zero values. El adapter productivo
`DeferredMerkleTreeBuilder` falla explícitamente con `ELIGIBILITY_CRYPTOGRAPHY_NOT_CONFIGURED`.
La etapa 10 debe sustituirlo por el builder Circom/snarkjs versionado. Los builders deterministas
presentes en tests son fixtures y nunca código productivo.

## API administrativa

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

La importación usa JSON tipado, máximo 1.000 registros, normalización NFKC explícita y dry-run por
defecto. No almacena archivos originales.
