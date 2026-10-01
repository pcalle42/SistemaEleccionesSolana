#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

R1CS="$ARTIFACT_DIR/anonymous-single-choice-v1.r1cs"
if [[ ! -f "$R1CS" ]]; then
  echo "Missing R1CS. Run pnpm zk:compile first." >&2
  exit 1
fi

pnpm exec snarkjs r1cs info "$R1CS" \
  | sed $'s/\033\\[[0-9;]*m//g' \
  | tee "$ARTIFACT_DIR/constraints.txt"
(
  cd "$ARTIFACT_DIR"
  wc -c anonymous-single-choice-v1.r1cs anonymous-single-choice-v1.wasm \
    > artifact-sizes.txt
)
