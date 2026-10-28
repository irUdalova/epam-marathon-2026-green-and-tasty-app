#!/usr/bin/env bash
# Uploads dish photos to the images bucket, loads dishes.json into the Dishes
# table and links every dish to every location (Locations.specialtyDishIds),
# so each location's guest pre-order menu shows the full menu.
# Safe to re-run: S3 uploads and DynamoDB PutRequests overwrite by key/id,
# and specialtyDishIds is a string set, so adding the same ids again is a no-op.
#
# Run seed-locations.sh first: the locations must exist.
#
# Usage: ./seed-dishes.sh            (dry run: checks and prints the plan)
#        ./seed-dishes.sh --apply    (uploads and writes)
set -euo pipefail

REGION="eu-north-1"
BUCKET="restaurant-backend-dev-images-959579700557"
BASE_URL="https://${BUCKET}.s3.${REGION}.amazonaws.com/"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_JSON="${SCRIPT_DIR}/dishes.json"
LOCATIONS_JSON="${SCRIPT_DIR}/locations.json"
IMG_DIR="${SCRIPT_DIR}/images"

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

# Photo file is named after the dish: "Grilled Salmon" -> grilled-salmon.jpeg
image_for() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g' | sed 's/$/.jpeg/'
}

dish_field() {
  jq -r --arg id "$1" --arg field "$2" \
    '.Dishes[].PutRequest.Item | select(.id.S == $id) | .[$field].S' "$DATA_JSON"
}

dish_ids=$(jq -r '.Dishes[].PutRequest.Item.id.S' "$DATA_JSON")
location_ids=$(jq -r '.Locations[].PutRequest.Item.id.S' "$LOCATIONS_JSON")

# 1. Check every dish: photo exists and imageUrl points to our bucket
for id in $dish_ids; do
  name=$(dish_field "$id" name)
  file="${IMG_DIR}/$(image_for "$name")"
  url=$(dish_field "$id" imageUrl)
  [[ -f "$file" ]] || { echo "Missing photo for '${name}': ${file}" >&2; exit 1; }
  [[ "$url" == "$BASE_URL"* ]] || { echo "imageUrl of '${name}' is not in our bucket: ${url}" >&2; exit 1; }
done

# 2. Check the locations exist in the table (read-only)
for loc in $location_ids; do
  found=$(aws dynamodb get-item --table-name Locations --key "{\"id\":{\"S\":\"${loc}\"}}" \
    --projection-expression id --region "$REGION" --output json | jq -r '.Item.id.S // empty')
  [[ -n "$found" ]] || { echo "Location ${loc} is not in the Locations table. Run seed-locations.sh first." >&2; exit 1; }
done

# 3. Upload photos to the key each imageUrl points to
for id in $dish_ids; do
  name=$(dish_field "$id" name)
  file="${IMG_DIR}/$(image_for "$name")"
  key="$(dish_field "$id" imageUrl)"
  key="${key#"$BASE_URL"}"
  echo "Upload $(basename "$file") -> s3://${BUCKET}/${key}"
  if $APPLY; then
    aws s3 cp "$file" "s3://${BUCKET}/${key}" \
      --content-type image/jpeg --region "$REGION" --only-show-errors
  fi
done

# 4. Write dishes (BatchWriteItem takes up to 25 items per call)
echo "Write $(jq '.Dishes | length' "$DATA_JSON") items to Dishes"
if $APPLY; then
  result=$(aws dynamodb batch-write-item --request-items "file://${DATA_JSON}" \
    --region "$REGION" --output json)
  if [[ $(echo "$result" | jq '.UnprocessedItems | length') != "0" ]]; then
    echo "Some dishes were not written:" >&2
    echo "$result" >&2
    exit 1
  fi
fi

# 5. Link all dishes to every location. The backend stores List<string> as a
#    string set (SS); ADD merges with ids already there instead of replacing them.
ids_json=$(jq -c '{":ids": {SS: [.Dishes[].PutRequest.Item.id.S]}}' "$DATA_JSON")
for loc in $location_ids; do
  echo "Add dishes to specialtyDishIds of location ${loc}"
  if $APPLY; then
    aws dynamodb update-item --table-name Locations \
      --key "{\"id\":{\"S\":\"${loc}\"}}" \
      --update-expression "ADD specialtyDishIds :ids" \
      --expression-attribute-values "$ids_json" \
      --region "$REGION" --output text >/dev/null
  fi
done

if $APPLY; then
  echo "Done."
else
  echo "Dry run only. Re-run with --apply to upload and write."
fi
