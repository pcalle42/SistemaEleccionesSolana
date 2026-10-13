# Protección de repositorio y releases

Estas opciones se configuran en GitHub y no pueden garantizarse solo con archivos
versionados.

## `main`

- bloquear force push y eliminación;
- exigir pull request y al menos una aprobación;
- exigir CODEOWNER review para paths críticos;
- exigir conversación resuelta y branch actualizado;
- exigir checks: `pull-request / quality`, `security-gates / dependency-and-secret-scan`
  y los tres jobs de `security-gates / container-scan`;
- restringir direct push.

## Environments

- crear `staging` y `production`;
- `production` exige required reviewers y no permite bypass administrativo;
- secretos de cada environment son independientes;
- PRs/forks no reciben environments ni secretos privilegiados.

## Tags y Actions

- aplicar ruleset a `v*` que impida actualizar/eliminar tags de release;
- permitir únicamente actions aprobadas;
- exigir SHA completo para actions externas;
- revisar semanalmente los PRs de Dependabot para actualizar esos SHA;
- mantener el token por defecto en read-only; `packages:write` existe solo en el
  job que publica imágenes RC.
