#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPOSITORY_DIR="$(cd "$PACKAGE_DIR/../.." && pwd)"
ARTIFACT_DIR="$PACKAGE_DIR/artifacts/anonymous-single-choice-v1"
CACHE_DIR="$PACKAGE_DIR/.cache"
CIRCOM_IMAGE="votaciones-circom:2.2.3"

mkdir -p "$ARTIFACT_DIR" "$CACHE_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command is unavailable: $1" >&2
    exit 1
  fi
}
