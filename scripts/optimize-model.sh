#!/bin/sh
# Input is the source GLB. Output is a separate, web-ready GLB.
set -eu
input=${1:?Source GLB required}
output=${2:?Destination GLB required}
if [ "$input" -ef "$output" ]; then exit 1; fi
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
case "$(basename "$input")" in
  watch_future.glb) set -- --simplify-ratio 0.15 --simplify-error 0.002 ;;
  watch_squash.glb|watch_inflate.fullframe.optimized.glb) set -- --simplify-ratio 0.07 --simplify-error 0.004 ;;
  *) set -- --simplify false --prune false ;;
esac
npx --yes @gltf-transform/cli@4.5.1 optimize "$input" "$temporary/model.glb" --compress draco --texture-compress webp --texture-size 1024 --join false --flatten false --instance false --palette false --resample false --prune-attributes false --prune-solid-textures false "$@"
python3 "$(dirname "$0")/restore-material-names.py" "$input" "$temporary/model.glb" "$output"
