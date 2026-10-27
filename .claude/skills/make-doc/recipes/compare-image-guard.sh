set -eu
: "${IMG:?set IMG to a local image, e.g. ghcr.io/solidbunch/starter-kit-mariadb:11.8.9-noble}"
: "${FOUNDATION:?set FOUNDATION to the foundation checkout path (read only)}"
: "${SCRATCH:?set SCRATCH to the scratchpad directory}"
docker image inspect "$IMG" > /dev/null 2>&1 || { echo "image $IMG is not available locally, aborting"; exit 1; }
ID="cmptest-$(date +%s)-$$-$RANDOM"
WORK="$SCRATCH/$ID"
GUARD=dockerfiles/mariadb/docker-entrypoint.d/10-version-guard.sh
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT
trap 'exit 1' INT TERM HUP
mkdir -p "$WORK"
docker run --rm --pull=never --entrypoint sh "$IMG" -c 'cat /docker-entrypoint.d/10-version-guard.sh' > "$WORK/guard.image.sh"
if diff "$WORK/guard.image.sh" "$FOUNDATION/$GUARD" > "$WORK/guard.diff"; then
  echo "guard in the image is identical to the source"
else
  echo "guard in the image DIFFERS from the source:"
  cat "$WORK/guard.diff"
fi
echo "image created:      $(docker image inspect --format '{{.Created}}' "$IMG")"
echo "source last change: $(git --no-optional-locks -C "$FOUNDATION" log -1 --format='%h %cI' -- "$GUARD")"
