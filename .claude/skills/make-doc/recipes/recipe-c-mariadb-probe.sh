set -eu
: "${IMG:?set IMG to a local image, e.g. ghcr.io/solidbunch/starter-kit-mariadb:11.8.9-noble}"
: "${SCRATCH:?set SCRATCH to the scratchpad directory (absolute path)}"
case "$SCRATCH" in
  /*) ;;
  *) echo "SCRATCH must be an absolute path, aborting"; exit 1 ;;
esac
PROBE_SQL="${PROBE_SQL:-}"
EXTRA="${EXTRA:-}"
if [ -n "$PROBE_SQL" ] && [ ! -f "$PROBE_SQL" ]; then
  echo "PROBE_SQL $PROBE_SQL is not a file, aborting"; exit 1
fi
# EXTRA guard: refuse options that publish, name, attach, mount or escalate the container.
set -f
for WORD in $EXTRA; do
  case "$WORD" in
    -p|-p*|-P|-P*|--publish|--publish=*|--publish-all|--publish-all=*|--name|--name=*|--network|--network=*|--net|--net=*|--privileged|--privileged=*|-v|-v*|--volume|--volume=*|--mount|--mount=*)
      echo "EXTRA contains the refused option $WORD, aborting"; exit 1 ;;
  esac
done
set +f
docker image inspect "$IMG" > /dev/null 2>&1 || { echo "image $IMG is not available locally, aborting"; exit 1; }
ID="mdprobe-$(date +%s)-$$-$RANDOM"
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

docker run -d --pull=never --name "$ID" -v "$DATA:/var/lib/mysql" \
  -e MARIADB_ROOT_PASSWORD=scratch $EXTRA "$IMG" > /dev/null
for TRY in $(seq 1 60); do
  STATUS="$(docker inspect -f '{{.State.Status}}' "$ID")"
  [ "$STATUS" = "exited" ] && break
  docker exec "$ID" healthcheck.sh --connect --innodb_initialized > /dev/null 2>&1 && break
  sleep 2
done

echo "host: $(uname -s) uid=$(id -u)"
ls -ln "$DATA" 2>&1 | head -n 5
if [ -r "$DATA/mariadb_upgrade_info" ]; then
  echo "host user can read mariadb_upgrade_info: yes"
else
  echo "host user can read mariadb_upgrade_info: no"
fi
if [ -n "$PROBE_SQL" ]; then
  docker exec -i "$ID" mariadb -uroot -pscratch < "$PROBE_SQL" 2>&1 || echo "SQL run exited with an error"
else
  echo "no PROBE_SQL given, skipped the SQL step"
fi
docker logs "$ID" 2>&1 | tail -n 5 | sed 's/^/    /'
echo "recipe C finished; cleanup removes the container and $DATA"
