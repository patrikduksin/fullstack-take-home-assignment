#!/usr/bin/env bash
set -u

pnpm test:integration &
integration_process=$!
pnpm test:e2e &
browser_process=$!

integration_status=0
wait "$integration_process" || integration_status=$?
browser_status=0
wait "$browser_process" || browser_status=$?

if (( integration_status != 0 )); then
  exit "$integration_status"
fi
exit "$browser_status"
