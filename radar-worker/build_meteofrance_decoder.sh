#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
vendor_dir="${script_dir}/vendor/opera-bufr-3.2"
output_path="${1:-${script_dir}/bin/decode_meteofrance_bufr}"
compiler="${CC:-cc}"

mkdir -p "$(dirname -- "${output_path}")"

"${compiler}" \
  -O2 \
  -std=c99 \
  -Wall \
  -Wextra \
  -Wno-unused-parameter \
  -I"${vendor_dir}/src" \
  "${vendor_dir}/src/bufr.c" \
  "${vendor_dir}/src/desc.c" \
  "${vendor_dir}/src/bitio.c" \
  "${vendor_dir}/src/rlenc.c" \
  "${vendor_dir}/src/bufr_io.c" \
  "${script_dir}/decode_meteofrance_bufr.c" \
  -lm \
  -lz \
  -o "${output_path}"

chmod 0755 "${output_path}"
"${output_path}" 2>&1 | grep -q "TABLE_DIRECTORY" || true
