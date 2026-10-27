set -eu
: "${FOUNDATION:?set FOUNDATION to the foundation checkout path}"
: "${SCRATCH:?set SCRATCH to the scratchpad directory}"
ID="skdoc-$(date +%s)-$$-$RANDOM"
COPY="$SCRATCH/$ID"
git clone -q --no-hardlinks "$FOUNDATION" "$COPY"
git -C "$COPY" remote remove origin
DIRTY="$(git --no-optional-locks -C "$FOUNDATION" status --porcelain)"
if [ -n "$DIRTY" ]; then
  echo "uncommitted foundation changes not in the scratch project:"
  echo "$DIRTY"
fi
ENVMAIN="$COPY/config/environment/.env.main"
sed "s/^APP_NAME=.*/APP_NAME=$ID/" "$ENVMAIN" > "$ENVMAIN.tmp" && mv "$ENVMAIN.tmp" "$ENVMAIN"
cp "$COPY/sh/env/.env.secret.template" "$COPY/config/environment/.env.secret"
echo "COPY=$COPY"
echo "APP_NAME=$ID"
