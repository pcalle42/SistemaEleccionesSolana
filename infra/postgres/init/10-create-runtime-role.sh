#!/usr/bin/env bash

set -Eeuo pipefail

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_RUNTIME_USER:?POSTGRES_RUNTIME_USER is required}"
: "${POSTGRES_RUNTIME_PASSWORD:?POSTGRES_RUNTIME_PASSWORD is required}"

test_database="${POSTGRES_DB}_test"

psql \
  --username "${POSTGRES_USER}" \
  --dbname postgres \
  --set ON_ERROR_STOP=1 \
  --set admin_user="${POSTGRES_USER}" \
  --set application_database="${POSTGRES_DB}" \
  --set runtime_password="${POSTGRES_RUNTIME_PASSWORD}" \
  --set runtime_user="${POSTGRES_RUNTIME_USER}" \
  --set test_database="${test_database}" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION',
  :'runtime_user',
  :'runtime_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'runtime_user')
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'test_database', :'admin_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'test_database')
\gexec

SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'application_database')
\gexec
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'test_database')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'application_database', :'runtime_user')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'test_database', :'runtime_user')
\gexec
SQL
