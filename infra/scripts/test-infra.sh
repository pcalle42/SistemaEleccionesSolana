#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INFRA_ROOT="$(cd -- "${SCRIPT_ROOT}/.." && pwd)"
ENV_FILE="${VOTACIONES_TEST_ENV_FILE:-${INFRA_ROOT}/test/.env.example}"
ACTION="${1:-}"
shift || true

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

value() {
  local key="$1"
  awk -F= -v key="${key}" '$1 == key { sub(/^[^=]*=/, ""); print }' "${ENV_FILE}" | tail -n 1
}

[[ -f "${ENV_FILE}" ]] || fail "test environment file not found: ${ENV_FILE}"
[[ "$(value VOTACIONES_ENV)" == 'test' ]] || fail 'VOTACIONES_ENV must be exactly test'
[[ "$(value POSTGRES_DB)" =~ _test$ ]] || fail 'POSTGRES_DB must end in _test'
[[ "$(value DATABASE_URL)" =~ @127\.0\.0\.1:[0-9]+/[^/?]*_test$ ]] ||
  fail 'DATABASE_URL must target a loopback _test database'
[[ "$(value TEST_DATABASE_URL)" =~ @127\.0\.0\.1:[0-9]+/[^/?]*_test$ ]] ||
  fail 'TEST_DATABASE_URL must target a loopback _test database'

PROJECT="${VOTACIONES_TEST_PROJECT:-$(value COMPOSE_PROJECT_NAME)}"
[[ "${PROJECT}" =~ ^votaciones-test-[a-z0-9_-]+$ ]] ||
  fail "unsafe test Compose project: ${PROJECT}"

command -v docker >/dev/null 2>&1 || fail 'docker is required'
docker info >/dev/null 2>&1 || fail 'Docker daemon is unavailable'

COMPOSE=(
  docker compose
  --project-name "${PROJECT}"
  --env-file "${ENV_FILE}"
  --file "${INFRA_ROOT}/docker/compose.test.yml"
)

case "${ACTION}" in
  config)
    COMPOSE_PROJECT_NAME="${PROJECT}" "${COMPOSE[@]}" config --quiet
    ;;
  up)
    COMPOSE_PROJECT_NAME="${PROJECT}" "${COMPOSE[@]}" up --detach --wait --wait-timeout 90
    ;;
  down)
    COMPOSE_PROJECT_NAME="${PROJECT}" "${COMPOSE[@]}" down --remove-orphans
    ;;
  reset)
    [[ "$#" -eq 1 && "$1" == '--force' ]] ||
      fail 'test reset is destructive; rerun with --force'
    COMPOSE_PROJECT_NAME="${PROJECT}" "${COMPOSE[@]}" down --volumes --remove-orphans
    COMPOSE_PROJECT_NAME="${PROJECT}" "${COMPOSE[@]}" up --detach --wait --wait-timeout 90
    ;;
  *) fail 'usage: test-infra.sh {config|up|down|reset [--force]}' ;;
esac
