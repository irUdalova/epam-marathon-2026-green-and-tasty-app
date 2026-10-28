#!/usr/bin/env bash
# Uploads location photos to the images bucket and loads locations.json
# into the Locations table.
# Safe to re-run: S3 uploads and DynamoDB PutRequests overwrite by key/id.
#
# Usage: ./seed-locations.sh            (dry run: checks and prints the plan)
#        ./seed-locations.sh --apply    (uploads and writes)
set -euo pipefail

REGION="eu-north-1"
BUCKET="restaurant-backend-dev-images-959579700557"
BASE_URL="https://${BUCKET}.s3.${REGION}.amazonaws.com/"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_JSON="${SCRIPT_DIR}/locations.json"
IMG_DIR="${SCRIPT_DIR}/../frontend/restaurant-frontend-app/src/assets/img/locations"

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

# Location id -> frontend image file (matched by address). "id:file" pairs,
# since macOS ships bash 3.2 without associative arrays.
IMAGES=(
  "7d598da3-0887-4a04-a3a1-fe26d8a4a4f2:abashidze-street-9.jpg"
  "2de08053-9bec-4662-bf56-2ccb70aeeb78:baratashvili-street-14.jpg"
  "98c4acc4-ca8b-4416-be9d-ef40f1e73e0a:rustaveli-avenue-48.jpg"
)

image_for() {
  local pair
  for pair in "${IMAGES[@]}"; do
    [[ "${pair%%:*}" == "$1" ]] && { echo "${pair#*:}"; return; }
  done
}

# 1. Check every location: image file exists and imageUrl points to our bucket
ids=$(jq -r '.Locations[].PutRequest.Item.id.S' "$DATA_JSON")
for id in $ids; do
  name=$(image_for "$id")
  [[ -n "$name" ]] || { echo "No image mapped for location $id" >&2; exit 1; }
  [[ -f "${IMG_DIR}/${name}" ]] || { echo "Missing image: ${IMG_DIR}/${name}" >&2; exit 1; }

  url=$(jq -r --arg id "$id" '.Locations[].PutRequest.Item | select(.id.S == $id) | .imageUrl.S' "$DATA_JSON")
  [[ "$url" == "$BASE_URL"* ]] || { echo "imageUrl of $id is not in our bucket: $url" >&2; exit 1; }
done

# 2. Upload images to the key each imageUrl points to
for id in $ids; do
  name=$(image_for "$id")
  url=$(jq -r --arg id "$id" '.Locations[].PutRequest.Item | select(.id.S == $id) | .imageUrl.S' "$DATA_JSON")
  key="${url#"$BASE_URL"}"
  echo "Upload ${name} -> s3://${BUCKET}/${key}"
  if $APPLY; then
    aws s3 cp "${IMG_DIR}/${name}" "s3://${BUCKET}/${key}" \
      --content-type image/jpeg --region "$REGION" --only-show-errors
  fi
done

# 3. Write items (BatchWriteItem takes up to 25 items per call)
count=$(jq '.Locations | length' "$DATA_JSON")
echo "Write ${count} items to Locations"
if $APPLY; then
  result=$(aws dynamodb batch-write-item --request-items "file://${DATA_JSON}" \
    --region "$REGION" --output json)
  if [[ $(echo "$result" | jq '.UnprocessedItems | length') != "0" ]]; then
    echo "Some items were not written:" >&2
    echo "$result" >&2
    exit 1
  fi
  echo "Done."
else
  echo "Dry run only. Re-run with --apply to upload and write."
fi
