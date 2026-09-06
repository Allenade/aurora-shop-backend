#!/usr/bin/env bash
# Block shell git commands that would attribute agents on this repo.
set -euo pipefail

input="$(cat || true)"

if command -v python3 >/dev/null 2>&1; then
  command="$(printf '%s' "$input" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("command") or "")' 2>/dev/null || true)"
else
  command="$input"
fi
haystack="${command:-$input}"

deny() {
  # Escape for JSON string
  msg="${1//\\/\\\\}"
  msg="${msg//\"/\\\"}"
  printf '{"permission":"deny","user_message":"%s","agent_message":"%s"}\n' "$msg" "$msg"
  exit 0
}

if printf '%s' "$haystack" | grep -Eqi -- '--no-verify'; then
  if printf '%s' "$haystack" | grep -Eqi 'git[[:space:]]+(commit|push)'; then
    deny "Blocked: --no-verify is not allowed here. Hooks keep agent attribution off GitHub."
  fi
fi

if printf '%s' "$haystack" | grep -Eqi 'Co-authored-by:.*(Cursor|cursoragent|Copilot|ChatGPT|Claude|OpenAI|Anthropic)'; then
  deny "Blocked: do not add agent Co-authored-by trailers on this repository."
fi

printf '{"permission":"allow"}\n'
exit 0
