#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

init_infra_context "${1:-}"
require_docker
print_context

compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}"
compose_cmd exec --no-TTY postgres sh -ceu '
  psql \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --set ON_ERROR_STOP=1 \
    --command "CREATE TABLE IF NOT EXISTS infra_persistence_probe(value integer PRIMARY KEY); TRUNCATE infra_persistence_probe; INSERT INTO infra_persistence_probe VALUES (1);"
' >/dev/null

compose_cmd down --remove-orphans
compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}"

persisted_value="$(compose_cmd exec --no-TTY postgres sh -ceu '
  psql \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --no-align \
    --tuples-only \
    --set ON_ERROR_STOP=1 \
    --command "SELECT value FROM infra_persistence_probe;"
')"
[[ "${persisted_value}" == '1' ]] || fail 'PostgreSQL data did not survive down/up'

compose_cmd exec --no-TTY postgres sh -ceu '
  psql \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --set ON_ERROR_STOP=1 \
    --command "DROP TABLE infra_persistence_probe;"
' >/dev/null

printf 'PostgreSQL data survived a normal down/up cycle.\n'
