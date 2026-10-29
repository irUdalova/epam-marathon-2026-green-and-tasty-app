#!/usr/bin/env bash
# Loads tables.json into the Tables table: 3 tables (2, 4 and 6 seats) per location.
# Without tables no time slot is available and no reservation can be made.
# Safe to re-run: PutRequests overwrite by id.
#
# Run seed-locations.sh first: the locations must exist.
#
# Usage: ./seed-tables.sh            (dry run: checks and prints the plan)
#        ./seed-tables.sh --apply    (writes)
set -euo pipefail

REGION="eu-north-1"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_JSON="${SCRIPT_DIR}/tables.json"

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

# 1. Check every location referenced by a table exists (read-only)
location_ids=$(jq -r '[.Tables[].PutRequest.Item.locationId.S] | unique | .[]' "$DATA_JSON")
for loc in $location_ids; do
  found=$(aws dynamodb get-item --table-name Locations --key "{\"id\":{\"S\":\"${loc}\"}}" \
    --projection-expression id --region "$REGION" --output json | jq -r '.Item.id.S // empty')
  [[ -n "$found" ]] || { echo "Location ${loc} is not in the Locations table. Run seed-locations.sh first." >&2; exit 1; }
done

# 2. Print the plan
jq -r '.Tables[].PutRequest.Item | "Table \(.tableNumber.N) (\(.capacity.N) seats) at location \(.locationId.S)"' "$DATA_JSON"
echo "Write $(jq '.Tables | length' "$DATA_JSON") items to Tables"

# 3. Write items (BatchWriteItem takes up to 25 items per call)
if $APPLY; then
  result=$(aws dynamodb batch-write-item --request-items "file://${DATA_JSON}" \
    --region "$REGION" --output json)
  if [[ $(echo "$result" | jq '.UnprocessedItems | length') != "0" ]]; then
    echo "Some tables were not written:" >&2
    echo "$result" >&2
    exit 1
  fi
  echo "Done."
else
  echo "Dry run only. Re-run with --apply to write."
fi
