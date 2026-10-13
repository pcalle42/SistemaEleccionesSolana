#!/usr/bin/env bash

set -Eeuo pipefail

REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="${1:?usage: build-images.sh <version> <git-sha> <registry-prefix> <output-dir>}"
GIT_COMMIT="${2:?git commit is required}"
REGISTRY_PREFIX="${3:?registry prefix is required}"
OUTPUT_DIRECTORY="${4:?output directory is required}"

[[ "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || {
  printf 'error: invalid SemVer: %s\n' "${VERSION}" >&2
  exit 1
}
[[ "${GIT_COMMIT}" =~ ^[a-f0-9]{40}$ ]] || {
  printf 'error: git commit must be a full SHA\n' >&2
  exit 1
}
command -v docker >/dev/null || { printf 'error: docker is required\n' >&2; exit 1; }
docker buildx version >/dev/null
mkdir -p "${OUTPUT_DIRECTORY}"

for name in api admin-web voter-web; do
  repository="${REGISTRY_PREFIX}/votaciones-${name}"
  if docker buildx imagetools inspect "${repository}:${VERSION}" >/dev/null 2>&1; then
    printf 'error: immutable release tag already exists: %s:%s\n' "${repository}" "${VERSION}" >&2
    exit 1
  fi
done

build_image() {
  local name="$1" dockerfile="$2" metadata="${OUTPUT_DIRECTORY}/${name}.metadata.json"
  local repository="${REGISTRY_PREFIX}/votaciones-${name}"
  docker buildx build \
    --file "${dockerfile}" \
    --build-arg "APP_VERSION=${VERSION}" \
    --build-arg "GIT_COMMIT=${GIT_COMMIT}" \
    --label "org.opencontainers.image.revision=${GIT_COMMIT}" \
    --label "org.opencontainers.image.version=${VERSION}" \
    --metadata-file "${metadata}" \
    --provenance=true \
    --push \
    --tag "${repository}:${VERSION}" \
    --tag "${repository}:git-${GIT_COMMIT}" \
    "${REPOSITORY_ROOT}"
}

build_image api "${REPOSITORY_ROOT}/apps/api/Dockerfile"
build_image admin-web "${REPOSITORY_ROOT}/apps/admin-web/Dockerfile"
build_image voter-web "${REPOSITORY_ROOT}/apps/voter-web/Dockerfile"
node "${REPOSITORY_ROOT}/scripts/release/images-from-metadata.mjs" \
  --directory "${OUTPUT_DIRECTORY}" \
  --registry "${REGISTRY_PREFIX}" \
  --output "${OUTPUT_DIRECTORY}/images.json"
