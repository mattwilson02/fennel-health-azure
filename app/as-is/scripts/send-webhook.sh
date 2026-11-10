#!/usr/bin/env bash
# Sends one signed wearable webhook to the local app. Usage: scripts/send-webhook.sh [user_id] [glucose_value]
set -euo pipefail
USER_ID="${1:-1}"
VALUE="${2:-6.4}"
SECRET="${WEBHOOK_SECRET:-demo-webhook-secret}"
BODY="{\"user_id\":${USER_ID},\"kind\":\"glucose\",\"value\":${VALUE},\"unit\":\"mmol/L\"}"
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')
curl -s -o /dev/null -w "webhook -> HTTP %{http_code}\n" \
  -X POST http://localhost:8080/webhooks/wearable \
  -H "x-signature: $SIG" -d "$BODY"
