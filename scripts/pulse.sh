#!/usr/bin/env bash
# One pulse: fetch → test → (heal → retest)* → build gate → changelog.
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
    healed=""
    if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
      echo "::warning::Still failing — tier 2: AI patch"
      npx tsx scripts/ai-fix.ts
      if ! git diff --quiet -- src tests && run_tests; then healed="ai"; else git checkout -- src tests; fi
    fi
    if [ -z "$healed" ]; then
      echo "::warning::Still failing — tier 3: restore code from last green commit"
      npm run -s pulse:heal -- code
      git diff --quiet HEAD -- package-lock.json || npm ci --no-audit --no-fund
      if ! run_tests; then
        echo "::error::Pulse could not heal itself; nothing will be committed or deployed"
        exit 1
      fi
    fi
  fi
fi

echo "::group::Build gate"
npm run -s typecheck && npx next build || { echo "::error::Build failed"; exit 1; }
echo "::endgroup::"

npm run -s pulse:changelog
