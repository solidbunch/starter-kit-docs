set -eu
: "${SCRATCH:?set SCRATCH to the scratchpad directory}"
: "${COPY:?set COPY to the printed scratch project path}"
case "$COPY" in
  *..*|"$SCRATCH"/skdoc-*/*) echo "refusing to remove $COPY"; exit 1 ;;
  "$SCRATCH"/skdoc-*) ;;
  *) echo "refusing to remove $COPY"; exit 1 ;;
esac
rm -rf "$COPY"
test ! -e "$COPY" && echo "scratch project removed"
