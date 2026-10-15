#!/usr/bin/env bash

set -Eeuo pipefail

[[ "$#" -eq 4 ]] || {
  printf 'usage: verify-images.sh <api-ref@digest> <admin-ref@digest> <voter-ref@digest> <devnet|production>\n' >&2
  exit 1
}

API_IMAGE="$1"
ADMIN_IMAGE="$2"
VOTER_IMAGE="$3"
CLASSIFICATION="$4"
[[ "${CLASSIFICATION}" == 'devnet' || "${CLASSIFICATION}" == 'production' ]] || {
  printf 'error: classification must be devnet or production\n' >&2
  exit 1
}

for image in "${API_IMAGE}" "${ADMIN_IMAGE}" "${VOTER_IMAGE}"; do
  [[ "${image}" =~ @sha256:[a-f0-9]{64}$ ]] || {
    printf 'error: image is not digest-pinned: %s\n' "${image}" >&2
    exit 1
  }
  [[ "${image}" != *':latest'* ]] || {
    printf 'error: latest is forbidden: %s\n' "${image}" >&2
    exit 1
  }
  docker pull "${image}" >/dev/null
  user="$(docker image inspect --format '{{.Config.User}}' "${image}")"
  [[ -n "${user}" && "${user}" != '0' && "${user}" != 'root' && "${user}" != '0:0' ]] || {
    printf 'error: image does not declare a non-root user: %s\n' "${image}" >&2
    exit 1
  }
  if docker image inspect --format '{{json .Config.Env}}' "${image}" |
    grep -Eiq '(PASSWORD=.+|TOKEN=.+|SECRET=.+|PRIVATE_KEY=.+|DATABASE_URL=.+@)'; then
    printf 'error: possible secret embedded in image environment: %s\n' "${image}" >&2
    exit 1
  fi
done

if [[ "${CLASSIFICATION}" == 'production' ]]; then
  docker run --rm --entrypoint sh "${API_IMAGE}" -ceu \
    'test ! -e /app/fixtures/devnet && test ! -e /app/scripts/devnet'
fi

printf 'Digest pinning, non-root users, image environment, and classification checks passed.\n'
