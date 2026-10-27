set -eu
: "${IMG:?set IMG to a local image, e.g. ghcr.io/solidbunch/starter-kit-mariadb:11.8.9-noble}"
: "${SCRATCH:?set SCRATCH to the scratchpad directory}"
docker image inspect "$IMG" > /dev/null 2>&1 || { echo "image $IMG is not available locally, aborting"; exit 1; }
ID="mdtest-$(date +%s)-$$-$RANDOM"
DATA="$SCRATCH/$ID"
helper() { docker run --rm --pull=never -v "$DATA:/d" --entrypoint sh "$IMG" -c "$*"; }
cleanup() {
  for NAME in $(docker ps -a --filter "name=^$ID" --format '{{.Names}}'); do
    docker rm -f "$NAME" > /dev/null 2>&1 || true
  done
  if [ -d "$DATA" ]; then
    helper 'find /d -mindepth 1 -delete' > /dev/null 2>&1 || true
    rm -rf "$DATA"
  fi
}
trap cleanup EXIT
trap 'exit 1' INT TERM HUP
mkdir -p "$DATA"

run_state() {
  # inputs: LABEL (state name) and EXTRA (more docker run options, may be empty)
  NAME="$ID-$LABEL"
  docker run -d --pull=never --name "$NAME" -v "$DATA:/var/lib/mysql" \
    -e MARIADB_ROOT_PASSWORD=scratch $EXTRA "$IMG" > /dev/null
  for TRY in $(seq 1 60); do
    STATUS="$(docker inspect -f '{{.State.Status}}' "$NAME")"
    [ "$STATUS" = "exited" ] && break
    docker exec "$NAME" healthcheck.sh --connect --innodb_initialized > /dev/null 2>&1 && break
    sleep 2
  done
  STATUS="$(docker inspect -f '{{.State.Status}}' "$NAME")"
  if [ "$STATUS" = "exited" ]; then
    echo "[$LABEL] container exited with code $(docker inspect -f '{{.State.ExitCode}}' "$NAME")"
  else
    echo "[$LABEL] container started and answers the healthcheck"
  fi
  docker logs "$NAME" 2>&1 | tail -n 6 | sed 's/^/    /'
  docker rm -f "$NAME" > /dev/null
}

LABEL=fresh; EXTRA=""
run_state
echo "recorded version after the fresh start: $(helper 'cat /d/mariadb_upgrade_info')"

helper "printf '11.8.8-MariaDB\n' > /d/mariadb_upgrade_info"
LABEL=patch-diff; EXTRA=""
run_state

helper "printf '11.4.2-MariaDB\n' > /d/mariadb_upgrade_info"
LABEL=other-series; EXTRA=""
run_state

helper "printf '11.4.2-MariaDB\n' > /d/mariadb_upgrade_info"
LABEL=auto-upgrade; EXTRA="-e MARIADB_AUTO_UPGRADE=1"
run_state
echo "recipe A finished; cleanup removes the containers and $DATA"
