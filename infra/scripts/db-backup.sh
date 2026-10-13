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
[[ ! -e "${output_path}.metadata.json" && ! -e "${output_path}.sha256" ]] ||
  fail "backup metadata already exists: ${output_path}"

temporary_file="$(mktemp "${output_directory}/.backup.XXXXXX")"
backup_complete=false
cleanup() {
  rm -f -- "${temporary_file}"
  if [[ "${backup_complete}" != true ]]; then
    rm -f -- "${output_path}" "${output_path}.metadata.json" "${output_path}.sha256"
  fi
}
trap cleanup EXIT
umask 077

read_evidence() {
  compose_cmd exec --no-TTY postgres psql \
    --username "$(env_value POSTGRES_USER)" \
    --dbname "$(env_value POSTGRES_DB)" \
    --no-align --tuples-only --set ON_ERROR_STOP=1 \
    --file /dev/stdin <"${INFRA_ROOT}/postgres/operational-evidence.sql"
}

evidence_before="$(read_evidence)"
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

evidence="$(read_evidence)"
[[ "${evidence}" == "${evidence_before}" ]] ||
  fail 'electoral evidence changed during backup; retry from a stable or quiesced state'
node "${REPOSITORY_ROOT}/scripts/operations/backup-metadata.mjs" \
  --archive "${output_path}" \
  --environment "${VOTACIONES_ENVIRONMENT}" \
  --kind postgresql \
  --evidence "${evidence}"

backup_complete=true
trap - EXIT
printf 'Backup created with digest and logical evidence: %s\n' "${output_path}"
