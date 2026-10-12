#!/usr/bin/env bash
# Startet eine Wegwerf-Postgres-Instanz, spielt Migrationen ein und führt die SQL-Tests aus.
set -euo pipefail
BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
DIR=$(mktemp -d); PORT=${PGPORT_TEST:-54329}
cd "$(dirname "$0")/../.."
"$BIN/initdb" -D "$DIR" -U postgres >/dev/null
"$BIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR" -l "$DIR/log" start >/dev/null
trap '"$BIN/pg_ctl" -D "$DIR" stop -m immediate >/dev/null; rm -rf "$DIR"' EXIT
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -d postgres -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f tests/sql/auth_stub.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f tests/sql/test.sql
