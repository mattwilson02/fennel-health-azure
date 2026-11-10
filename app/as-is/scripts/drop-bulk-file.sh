#!/usr/bin/env bash
# Drops a small synthetic bulk file into the app's inbox, then runs the ingest job once.
set -euo pipefail
cd "$(dirname "$0")/.."
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker compose exec -T vm1-app sh -c "mkdir -p /data/inbox && printf '%s\n' \
'{\"user_id\":1,\"kind\":\"glucose\",\"value\":5.9,\"unit\":\"mmol/L\",\"recorded_at\":\"$NOW\"}' \
'{\"user_id\":2,\"kind\":\"sleep\",\"value\":7.2,\"unit\":\"h\",\"recorded_at\":\"$NOW\"}' \
> /data/inbox/bulk-\$(date +%s).jsonl && node jobs/ingest.js"
