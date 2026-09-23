#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

init_infra_context "${1:-}"
shift
if [[ "${1:-}" == '--' ]]; then
  shift
fi
[[ "$#" -le 1 ]] || fail 'usage: db-backup.sh <local|devnet> [output.dump]'

require_docker
compose_cmd config --quiet
print_context
compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}"

default_name="${VOTACIONES_ENVIRONMENT}-$(date -u +%Y%m%dT%H%M%SZ).dump"
output_path="${1:-${INFRA_ROOT}/postgres/backups/${default_name}}"
output_directory="$(dirname -- "${output_path}")"
mkdir -p "${output_directory}"
[[ ! -e "${output_path}" ]] || fail "backup already exists: ${output_path}"

temporary_file="$(mktemp "${output_directory}/.backup.XXXXXX")"
cleanup() {
  rm -f -- "${temporary_file}"
}
trap cleanup EXIT
umask 077

compose_cmd exec --no-TTY postgres sh -ceu '
  pg_dump \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --format custom \
    --no-owner
' >"${temporary_file}"

[[ -s "${temporary_file}" ]] || fail 'pg_dump produced an empty archive'
compose_cmd exec --no-TTY postgres pg_restore --list <"${temporary_file}" >/dev/null
mv -- "${temporary_file}" "${output_path}"
trap - EXIT

printf 'Backup created and archive-validated: %s\n' "${output_path}"
