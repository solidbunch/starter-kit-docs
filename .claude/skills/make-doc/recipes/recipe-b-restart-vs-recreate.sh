set -eu
: "${SCRATCH:?set SCRATCH to the scratchpad directory}"
BASEIMG="${BASEIMG:-alpine:latest}"
docker image inspect "$BASEIMG" > /dev/null 2>&1 || { echo "image $BASEIMG is not available locally, aborting"; exit 1; }
ID="cmptest-$(date +%s)-$$-$RANDOM"
DIR="$SCRATCH/$ID"
FILE="$DIR/compose.yml"
cleanup() {
  docker compose --project-name "$ID" -f "$FILE" down -v --remove-orphans > /dev/null 2>&1 || true
  for CID in $(docker ps -aq --filter "label=com.docker.compose.project=$ID"); do
    docker rm -f "$CID" > /dev/null 2>&1 || true
  done
  for NID in $(docker network ls -q --filter "label=com.docker.compose.project=$ID"); do
    docker network rm "$NID" > /dev/null 2>&1 || true
  done
  for VID in $(docker volume ls -q --filter "label=com.docker.compose.project=$ID"); do
    docker volume rm "$VID" > /dev/null 2>&1 || true
  done
  rm -rf "$DIR"
}
trap cleanup EXIT
trap 'exit 1' INT TERM HUP
mkdir -p "$DIR"

write_compose() {
  # input: SECS (the sleep length that identifies the config version)
  cat > "$FILE" <<EOF
services:
  probe:
    image: $BASEIMG
    pull_policy: never
    entrypoint: []
    command: ["sleep","$SECS"]
EOF
}
show_command() {
  CID="$(docker compose --project-name "$ID" -f "$FILE" ps -q probe)"
  echo "$LABEL: $(docker inspect -f '{{json .Config.Cmd}}' "$CID")"
}

SECS=300
write_compose
docker compose --project-name "$ID" -f "$FILE" up -d > /dev/null 2>&1
LABEL="after up -d"
show_command

SECS=301
write_compose
docker compose --project-name "$ID" -f "$FILE" restart > /dev/null 2>&1
LABEL="after restart (file now says 301)"
show_command

docker compose --project-name "$ID" -f "$FILE" up -d --force-recreate > /dev/null 2>&1
LABEL="after up -d --force-recreate"
show_command
echo "recipe B finished; cleanup runs down -v and removes $DIR"
