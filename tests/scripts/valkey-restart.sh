#!/usr/bin/env bash

set -Eeuo pipefail

REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${VOTACIONES_TEST_ENV_FILE:-${REPOSITORY_ROOT}/infra/test/.env.example}"

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

[[ "${VOTACIONES_ENV:-}" == 'test' ]] || fail 'VOTACIONES_ENV must be exactly test'
[[ "${POSTGRES_DB:-}" =~ _test$ ]] || fail 'POSTGRES_DB must end in _test'
[[ "${COMPOSE_PROJECT_NAME:-}" =~ ^votaciones-test-[a-z0-9_-]+$ ]] ||
  fail 'unsafe test Compose project'

COMPOSE=(
  docker compose
  --project-name "${COMPOSE_PROJECT_NAME}"
  --env-file "${ENV_FILE}"
  --file "${REPOSITORY_ROOT}/infra/docker/compose.test.yml"
)
probe_key="votaciones:test:v1:test:restart-recovery"

cleanup() {
  "${COMPOSE[@]}" exec --no-TTY valkey valkey-cli DEL "${probe_key}" >/dev/null 2>&1 || true
  "${COMPOSE[@]}" exec --no-TTY postgres sh -ceu '
    psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 \
      --command "DROP TABLE IF EXISTS public.valkey_restart_probe"
  ' >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${COMPOSE[@]}" exec --no-TTY postgres sh -ceu '
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 \
    --command "CREATE TABLE public.valkey_restart_probe(value text PRIMARY KEY); INSERT INTO public.valkey_restart_probe VALUES ('"'"'postgres-authoritative'"'"');"
' >/dev/null
"${COMPOSE[@]}" exec --no-TTY valkey valkey-cli SET "${probe_key}" stale-cache EX 60 >/dev/null

"${COMPOSE[@]}" restart valkey >/dev/null
"${COMPOSE[@]}" up --detach --wait --wait-timeout 90 valkey >/dev/null

persisted_value="$("${COMPOSE[@]}" exec --no-TTY postgres sh -ceu '
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-align --tuples-only \
    --set ON_ERROR_STOP=1 --command "SELECT value FROM public.valkey_restart_probe"
')"
[[ "${persisted_value}" == 'postgres-authoritative' ]] ||
  fail 'PostgreSQL authoritative state was not preserved'

cached_value="$("${COMPOSE[@]}" exec --no-TTY valkey valkey-cli GET "${probe_key}")"
[[ -z "${cached_value}" ]] || fail 'Valkey cache unexpectedly survived restart'

"${COMPOSE[@]}" exec --no-TTY valkey valkey-cli SET \
  "${probe_key}" "${persisted_value}" EX 60 >/dev/null
rebuilt_value="$("${COMPOSE[@]}" exec --no-TTY valkey valkey-cli GET "${probe_key}")"
[[ "${rebuilt_value}" == 'postgres-authoritative' ]] ||
  fail 'cache was not rebuilt from PostgreSQL'

printf 'Valkey restart preserved PostgreSQL truth and rebuilt disposable cache.\n'
