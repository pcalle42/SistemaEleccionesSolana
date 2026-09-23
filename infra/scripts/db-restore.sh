#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

init_infra_context "${1:-}"
shift
if [[ "${1:-}" == '--' ]]; then
  shift
fi

[[ "$#" -eq 2 && "$1" == '--force' ]] ||
  fail 'restore replaces the database; usage: db-restore.sh <local|devnet> --force <archive.dump>'
archive_path="$2"
[[ -f "${archive_path}" && -s "${archive_path}" ]] || fail "invalid backup archive: ${archive_path}"

require_docker
compose_cmd config --quiet
print_context
compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}"
compose_cmd exec --no-TTY postgres pg_restore --list <"${archive_path}" >/dev/null ||
  fail 'pg_restore rejected the archive'

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

compose_cmd exec --no-TTY postgres sh -ceu '
  pg_restore \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --exit-on-error \
    --no-owner
' <"${archive_path}"

compose_cmd exec --no-TTY postgres sh -ceu '
  PGPASSWORD="$POSTGRES_RUNTIME_PASSWORD" psql \
    --host 127.0.0.1 \
    --username "$POSTGRES_RUNTIME_USER" \
    --dbname "$POSTGRES_DB" \
    --no-align \
    --tuples-only \
    --set ON_ERROR_STOP=1 \
    --command "SELECT 1"
' | grep -qx '1' || fail 'runtime smoke check failed after restore'

printf 'Database restored and runtime smoke check passed for %s.\n' "${VOTACIONES_ENVIRONMENT}"
