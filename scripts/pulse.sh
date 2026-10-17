#!/usr/bin/env bash
# One pulse: fetch → test → (heal → retest)* → build gate → changelog.
# Healing is fully deterministic: no LLM or network-based code generation.
# Exit 0 only when the tree is fully green and changelog.md has a new entry.
set -uo pipefail

run_tests() {
  LIVE=1 npx vitest run --reporter=default --reporter=json --outputFile=test-report.json
}

rm -f heal-report.json test-report.json pulse-report.json

echo "::group::Fetch public APIs"
npm run -s pulse:refresh
echo "::endgroup::"

if ! run_tests; then
  echo "::warning::Tests failed — tier 1: quarantine failing feeds / repair snapshots"
  npm run -s pulse:heal -- data
  if ! run_tests; then
    echo "::warning::Still failing — tier 2: restore code from last green commit"
    npm run -s pulse:heal -- code
    git diff --quiet HEAD -- package-lock.json || npm ci --no-audit --no-fund
    if ! run_tests; then
      echo "::error::Pulse could not heal itself; nothing will be committed or deployed"
      exit 1
    fi
  fi
fi

echo "::group::Build gate"
npm run -s typecheck && npx next build || { echo "::error::Build failed"; exit 1; }
echo "::endgroup::"

npm run -s pulse:changelog
