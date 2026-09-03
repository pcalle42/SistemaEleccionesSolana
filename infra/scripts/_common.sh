#!/usr/bin/env bash

set -Eeuo pipefail

INFRA_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
REPOSITORY_ROOT="$(cd -- "${INFRA_ROOT}/.." && pwd)"

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

env_value() {
  local key="$1"
  awk -F= -v key="${key}" '
    $1 == key {
      sub(/^[^=]*=/, "")
      gsub(/\r$/, "")
      print
    }
  ' "${VOTACIONES_ENV_FILE}" | tail -n 1
}

init_infra_context() {
  local requested_environment="${1:-}"

  case "${requested_environment}" in
    local | devnet) ;;
    *) fail 'environment must be local or devnet' ;;
  esac

  VOTACIONES_ENVIRONMENT="${requested_environment}"

  local default_env_file="${INFRA_ROOT}/${VOTACIONES_ENVIRONMENT}/.env"
  if [[ ! -f "${default_env_file}" ]]; then
    default_env_file="${INFRA_ROOT}/${VOTACIONES_ENVIRONMENT}/.env.example"
  fi

  VOTACIONES_ENV_FILE="${VOTACIONES_ENV_FILE:-${default_env_file}}"
  [[ -f "${VOTACIONES_ENV_FILE}" ]] || fail "environment file not found: ${VOTACIONES_ENV_FILE}"

  local configured_environment
  configured_environment="$(env_value VOTACIONES_ENV)"
  [[ "${configured_environment}" == "${VOTACIONES_ENVIRONMENT}" ]] ||
    fail "environment file declares '${configured_environment:-unset}', expected '${VOTACIONES_ENVIRONMENT}'"

  VOTACIONES_PROJECT_NAME="${VOTACIONES_PROJECT_NAME:-votaciones-${VOTACIONES_ENVIRONMENT}}"
  case "${VOTACIONES_PROJECT_NAME}" in
    "votaciones-${VOTACIONES_ENVIRONMENT}" | "votaciones-${VOTACIONES_ENVIRONMENT}-"*) ;;
    *) fail "unsafe project name for ${VOTACIONES_ENVIRONMENT}: ${VOTACIONES_PROJECT_NAME}" ;;
  esac

  [[ "${VOTACIONES_PROJECT_NAME}" =~ ^[a-z0-9][a-z0-9_-]+$ ]] ||
    fail "invalid Compose project name: ${VOTACIONES_PROJECT_NAME}"

  VOTACIONES_HEALTH_TIMEOUT="${VOTACIONES_HEALTH_TIMEOUT:-90}"
  [[ "${VOTACIONES_HEALTH_TIMEOUT}" =~ ^[1-9][0-9]*$ ]] ||
    fail 'VOTACIONES_HEALTH_TIMEOUT must be a positive integer'

  COMPOSE_ARGS=(
    --project-name "${VOTACIONES_PROJECT_NAME}"
    --env-file "${VOTACIONES_ENV_FILE}"
    --file "${INFRA_ROOT}/docker/compose.yml"
    --file "${INFRA_ROOT}/docker/compose.${VOTACIONES_ENVIRONMENT}.yml"
  )
}

require_docker() {
  require_command docker
  docker info >/dev/null 2>&1 || fail 'Docker daemon is not available'
  docker compose version >/dev/null 2>&1 || fail 'Docker Compose plugin is not available'
}

compose_cmd() {
  COMPOSE_PROJECT_NAME="${VOTACIONES_PROJECT_NAME}" docker compose "${COMPOSE_ARGS[@]}" "$@"
}

print_context() {
  printf 'environment=%s project=%s env_file=%s\n' \
    "${VOTACIONES_ENVIRONMENT}" \
    "${VOTACIONES_PROJECT_NAME}" \
    "${VOTACIONES_ENV_FILE}"
}

assert_service_network() {
  local service="$1"
  local container_id network_name ip_address

  container_id="$(compose_cmd ps --quiet "${service}")"
  [[ -n "${container_id}" ]] || fail "service is not running: ${service}"

  network_name="${VOTACIONES_PROJECT_NAME}_internal"
  ip_address="$(docker inspect \
    --format "{{with index .NetworkSettings.Networks \"${network_name}\"}}{{.IPAddress}}{{end}}" \
    "${container_id}")"
  [[ -n "${ip_address}" ]] || fail "${service} is not attached to ${network_name}"
}
