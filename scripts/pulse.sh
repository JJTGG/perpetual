#!/usr/bin/env bash
# One pulse: fetch → test → (heal → retest)* → build gate → changelog.
# Repair runs through engine/ (deterministic by default; LLM tiers are opt-in).
# Exit 0 only when the tree is fully green and changelog.md has a new entry.
set -uo pipefail

run_tests() {
  LIVE=1 npx vitest run --reporter=default --reporter=json --outputFile=test-report.json
}

rm -f heal-report.json test-report.json pulse-report.json

echo "::group::Fetch public APIs"
npm run -s pulse:refresh
echo "::endgroup::"

npm run -s pulse:housekeeping

if ! run_tests; then
  echo "::warning::Tests failed — handing over to the repair engine (mode: ${REPAIR_MODE:-from config/repair.json})"
  if ! npm run -s repair; then
    echo "::error::Repair engine could not reach green; nothing will be committed or deployed"
    exit 1
  fi
  run_tests || { echo "::error::Post-repair confirmation run failed"; exit 1; }
fi

echo "::group::Build gate"
npm run -s typecheck && npx next build || { echo "::error::Build failed"; exit 1; }
echo "::endgroup::"

npm run -s pulse:changelog
