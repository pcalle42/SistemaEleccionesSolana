#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

if [[ "${1:-}" == '--' ]]; then
  shift
fi
archive_path="${1:-}"
verification_package="${2:-}"
[[ -f "${archive_path}" && -s "${archive_path}" ]] ||
  fail 'usage: restore-drill.sh <archive.dump> [verification-package-directory]'
if [[ -n "${verification_package}" && ! -d "${verification_package}" ]]; then
  fail "verification package directory does not exist: ${verification_package}"
fi

require_docker
require_command node
project="votaciones-test-restore-$$"
env_file="${INFRA_ROOT}/test/.env.example"
compose=(
  docker compose
  --project-name "${project}"
  --env-file "${env_file}"
  --file "${INFRA_ROOT}/docker/compose.restore.yml"
)
cleanup() {
  COMPOSE_PROJECT_NAME="${project}" "${compose[@]}" down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

node "${REPOSITORY_ROOT}/scripts/operations/verify-backup.mjs" \
  --archive "${archive_path}" --kind postgresql
COMPOSE_PROJECT_NAME="${project}" "${compose[@]}" up --detach --wait --wait-timeout 90 postgres
COMPOSE_PROJECT_NAME="${project}" "${compose[@]}" exec --no-TTY postgres \
  pg_restore --username "$(awk -F= '$1 == "POSTGRES_USER" { print $2 }' "${env_file}")" \
  --dbname "$(awk -F= '$1 == "POSTGRES_DB" { print $2 }' "${env_file}")" \
  --exit-on-error --no-owner <"${archive_path}"

postgres_user="$(awk -F= '$1 == "POSTGRES_USER" { print $2 }' "${env_file}")"
postgres_db="$(awk -F= '$1 == "POSTGRES_DB" { print $2 }' "${env_file}")"
COMPOSE_PROJECT_NAME="${project}" "${compose[@]}" exec --no-TTY postgres psql \
  --username "${postgres_user}" --dbname "${postgres_db}" --set ON_ERROR_STOP=1 \
  --file /dev/stdin <"${INFRA_ROOT}/postgres/post-restore-invariants.sql"
restored_evidence="$(COMPOSE_PROJECT_NAME="${project}" "${compose[@]}" exec --no-TTY postgres psql \
  --username "${postgres_user}" --dbname "${postgres_db}" --no-align --tuples-only \
  --set ON_ERROR_STOP=1 --file /dev/stdin <"${INFRA_ROOT}/postgres/operational-evidence.sql")"
node "${REPOSITORY_ROOT}/scripts/operations/verify-backup.mjs" \
  --archive "${archive_path}" --kind postgresql --restored-evidence "${restored_evidence}"

if [[ -n "${verification_package}" ]]; then
  pnpm --dir "${REPOSITORY_ROOT}" --filter @votaciones/verification-protocol build
  node "${REPOSITORY_ROOT}/packages/verification-protocol/dist/src/cli.js" \
    --package "${verification_package}"
fi

printf 'Isolated restore drill passed: schema, votes, audit, results and backup evidence verified.\n'
