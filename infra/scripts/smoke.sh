#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

init_infra_context "${1:-}"
require_docker
print_context

compose_cmd up --detach --wait --wait-timeout "${VOTACIONES_HEALTH_TIMEOUT}"
assert_service_network postgres
assert_service_network valkey

postgres_result="$(compose_cmd exec --no-TTY postgres sh -ceu '
  psql \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --no-align \
    --tuples-only \
    --set ON_ERROR_STOP=1 \
    --command "CREATE TEMP TABLE infra_smoke(value integer NOT NULL); INSERT INTO infra_smoke VALUES (1); SELECT value FROM infra_smoke;"
')"
[[ "${postgres_result##*$'\n'}" == '1' ]] || fail 'PostgreSQL write/read smoke test failed'

valkey_key='votaciones:infra:smoke'
[[ "$(compose_cmd exec --no-TTY valkey valkey-cli SET "${valkey_key}" valkey-ok EX 30)" == 'OK' ]] ||
  fail 'Valkey write smoke test failed'
[[ "$(compose_cmd exec --no-TTY valkey valkey-cli GET "${valkey_key}")" == 'valkey-ok' ]] ||
  fail 'Valkey read smoke test failed'

valkey_ttl="$(compose_cmd exec --no-TTY valkey valkey-cli TTL "${valkey_key}")"
[[ "${valkey_ttl}" =~ ^[1-9][0-9]*$ ]] || fail 'Valkey TTL smoke test failed'
compose_cmd exec --no-TTY valkey valkey-cli DEL "${valkey_key}" >/dev/null

printf 'PostgreSQL, Valkey, TTL, and internal-network smoke tests passed.\n'
