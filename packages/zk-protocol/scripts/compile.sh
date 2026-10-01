#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

require_command docker

docker build \
  --platform linux/amd64 \
  --tag "$CIRCOM_IMAGE" \
  --file "$PACKAGE_DIR/docker/circom.Dockerfile" \
  "$PACKAGE_DIR/docker"

docker run --rm \
  --platform linux/amd64 \
  --user "$(id -u):$(id -g)" \
  --volume "$REPOSITORY_DIR:/repo" \
  --workdir /repo/packages/zk-protocol \
  "$CIRCOM_IMAGE" \
  circuits/anonymous-single-choice-v1.circom \
  --r1cs --wasm --sym --O2 --inspect \
  --output artifacts/anonymous-single-choice-v1 \
  -l node_modules

mv \
  "$ARTIFACT_DIR/anonymous-single-choice-v1_js/anonymous-single-choice-v1.wasm" \
  "$ARTIFACT_DIR/anonymous-single-choice-v1.wasm"
rm -rf "$ARTIFACT_DIR/anonymous-single-choice-v1_js"

echo "Circom 2.2.3 compilation complete: $ARTIFACT_DIR"
