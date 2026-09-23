#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

init_infra_context "${1:-}"
shift
if [[ "${1:-}" == '--' ]]; then
  shift
fi

[[ "$#" -eq 1 && "$1" == '--force' ]] ||
  fail 'database reset is destructive; rerun with --force'

require_docker
require_command pnpm
compose_cmd config --quiet
print_context
compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}"

compose_cmd exec --no-TTY postgres sh -ceu '
  psql \
    --username "$POSTGRES_USER" \
    --dbname postgres \
    --set ON_ERROR_STOP=1 \
    --set database_name="$POSTGRES_DB" \
    --set admin_user="$POSTGRES_USER" \
    --set runtime_user="$POSTGRES_RUNTIME_USER" <<'"'"'SQL'"'"'
SELECT format('"'"'DROP DATABASE IF EXISTS %I WITH (FORCE)'"'"', :'"'"'database_name'"'"')
\gexec
SELECT format('"'"'CREATE DATABASE %I OWNER %I'"'"', :'"'"'database_name'"'"', :'"'"'admin_user'"'"')
\gexec
SELECT format('"'"'REVOKE CONNECT ON DATABASE %I FROM PUBLIC'"'"', :'"'"'database_name'"'"')
\gexec
SELECT format('"'"'GRANT CONNECT ON DATABASE %I TO %I'"'"', :'"'"'database_name'"'"', :'"'"'runtime_user'"'"')
\gexec
SQL
'

(
  cd "${REPOSITORY_ROOT}"
  VOTACIONES_ENV="${VOTACIONES_ENVIRONMENT}" \
    VOTACIONES_ENV_FILE="${VOTACIONES_ENV_FILE}" \
    pnpm db:migrate
)

printf 'Database reset and migrations completed for %s.\n' "${VOTACIONES_ENVIRONMENT}"
