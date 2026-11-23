#!/usr/bin/env bash
# Applies supabase/migrations to a throwaway local Postgres (with a minimal Supabase
# auth stub) and runs the RLS / trigger / import behaviour tests in tests/db/rls.sql.
# Requires PostgreSQL 15+ binaries (initdb, pg_ctl, psql).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PGPORT_TEST:-54329}"
WORK="$(mktemp -d)"
chmod 777 "$WORK"

RUN=()
if [ "$(id -u)" = "0" ]; then RUN=(runuser -u postgres --); fi

cleanup() {
  "${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -m fast stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"${RUN[@]}" "$PGBIN/initdb" -D "$WORK/data" -E UTF8 --locale=C.UTF-8 -A trust -U postgres >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -l "$WORK/postgres.log" -w \
  -o "-k $WORK -p $PORT -c listen_addresses=''" start >/dev/null

# Same name-key samples as tests/domain.test.ts
node -e '
  const rows = require(process.argv[1]);
  const q = (s) => "$k$" + s + "$k$";
  for (const [input, expected] of rows)
    console.log(`select pg_temp.check(public.project_name_key(${q(input)}) = ${q(expected)}, ${q("name key: " + input)});`);
' "$ROOT/tests/fixtures/name-keys.json" > "$WORK/name_keys.sql"

cd "$ROOT"
psql -h "$WORK" -p "$PORT" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 \
  -f tests/db/stub.sql \
  -f supabase/migrations/0001_init.sql \
  -f supabase/migrations/0002_seed.sql \
  -f supabase/migrations/0003_task_templates.sql \
  -f supabase/migrations/0004_work_days_colors.sql \
  -f supabase/migrations/0005_user_backgrounds.sql \
  -f supabase/migrations/0006_project_manage.sql \
  -f supabase/migrations/0007_slot_details.sql \
  -f supabase/migrations/0008_project_edit.sql \
  -f tests/db/helpers.sql \
  -f "$WORK/name_keys.sql" \
  -f tests/db/rls.sql -o /dev/null 2>&1 | sed -e 's/^psql:[^ ]* NOTICE:  /  /'

echo "DB tests passed."
