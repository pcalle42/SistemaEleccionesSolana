#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

init_infra_context "${1:-}"
require_docker
print_context

compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}"
probe_key="votaciones:${VOTACIONES_ENVIRONMENT}:v1:test:loss-recovery"

cleanup() {
  compose_cmd exec --no-TTY valkey valkey-cli DEL "${probe_key}" >/dev/null 2>&1 || true
  compose_cmd exec --no-TTY postgres sh -ceu '
    psql \
      --username "$POSTGRES_USER" \
      --dbname "$POSTGRES_DB" \
      --set ON_ERROR_STOP=1 \
      --command "DROP TABLE IF EXISTS public.valkey_loss_probe"
  ' >/dev/null 2>&1 || true
}
trap cleanup EXIT

compose_cmd exec --no-TTY postgres sh -ceu '
  psql \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --set ON_ERROR_STOP=1 \
    --command "CREATE TABLE IF NOT EXISTS public.valkey_loss_probe(value text PRIMARY KEY); TRUNCATE public.valkey_loss_probe; INSERT INTO public.valkey_loss_probe VALUES ('"'"'postgres-truth'"'"');"
' >/dev/null
compose_cmd exec --no-TTY valkey valkey-cli SET "${probe_key}" cached-copy EX 60 >/dev/null

compose_cmd restart valkey >/dev/null
compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}" >/dev/null

persisted_value="$(compose_cmd exec --no-TTY postgres sh -ceu '
  psql \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --no-align \
    --tuples-only \
    --set ON_ERROR_STOP=1 \
    --command "SELECT value FROM public.valkey_loss_probe"
')"
[[ "${persisted_value}" == 'postgres-truth' ]] || fail 'PostgreSQL truth was not preserved'

cached_value="$(compose_cmd exec --no-TTY valkey valkey-cli GET "${probe_key}")"
[[ -z "${cached_value}" ]] || fail 'Valkey cache unexpectedly survived a full restart'

compose_cmd exec --no-TTY valkey valkey-cli SET "${probe_key}" "${persisted_value}" EX 60 >/dev/null
rebuilt_value="$(compose_cmd exec --no-TTY valkey valkey-cli GET "${probe_key}")"
[[ "${rebuilt_value}" == 'postgres-truth' ]] || fail 'cache was not rebuilt from PostgreSQL'

printf 'Valkey loss preserved PostgreSQL truth and the cache was rebuilt.\n'
