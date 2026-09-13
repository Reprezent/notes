#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

for tool in cargo jq; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "Required tool '${tool}' is not available on PATH." >&2
    exit 1
  fi
done

mapfile -t wasm_bindgen_versions < <(
  cargo metadata --locked --format-version 1 |
    jq -r '.packages[] | select(.name == "wasm-bindgen") | .version'
)

if [ "${#wasm_bindgen_versions[@]}" -ne 1 ] || [ -z "${wasm_bindgen_versions[0]}" ]; then
  echo "Expected exactly one wasm-bindgen version from cargo metadata." >&2
  printf 'Found versions:\n' >&2
  printf '  %s\n' "${wasm_bindgen_versions[@]}" >&2
  exit 1
fi

cargo install --locked wasm-bindgen-cli --version "${wasm_bindgen_versions[0]}"
