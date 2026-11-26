#!/usr/bin/env bash
# Browser tests (Playwright, Chromium): builds the demo app and a Supabase-mode copy that talks to
# a fake Supabase (https://mock.supabase.test, answered inside the tests), serves both, runs the
# suites in tests/e2e and stops the servers. Usage: npm run test:e2e [-- suite …]  (e.g. batchL)
# Set REPORT=1 to also write the HTML test reports under docs/test-reports (see tests/e2e/report.cjs).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npx vite build >/dev/null || exit 1
VITE_SUPABASE_URL=https://mock.supabase.test VITE_SUPABASE_ANON_KEY=dummy-anon npx vite build --outDir .e2e-mock-dist --emptyOutDir >/dev/null || exit 1

npx vite preview --port 4173 --strictPort >/dev/null 2>&1 &
DEMO=$!
npx vite preview --port 4174 --strictPort --outDir .e2e-mock-dist >/dev/null 2>&1 &
MOCK=$!
trap 'kill $DEMO $MOCK 2>/dev/null' EXIT
for port in 4173 4174; do
  for _ in $(seq 1 50); do curl -s -o /dev/null "http://localhost:$port/" && break; sleep 0.2; done
done

if [ $# -gt 0 ]; then SUITES=("$@"); else SUITES=($(cd tests/e2e && ls *.e2e.cjs | sed 's/\.e2e\.cjs$//')); fi
failed=()
for s in "${SUITES[@]}"; do
  if node "tests/e2e/$s.e2e.cjs" >"/tmp/e2e-$s.log" 2>&1; then
    echo "✓ $s — $(tail -1 "/tmp/e2e-$s.log")"
  else
    echo "✗ $s"; grep -v '^\s*-\|\[2m' "/tmp/e2e-$s.log" | tail -6 | sed 's/^/    /'
    failed+=("$s")
  fi
done
echo
if [ ${#failed[@]} -eq 0 ]; then echo "All ${#SUITES[@]} browser suites passed."; else echo "Failed: ${failed[*]}"; exit 1; fi
