-- Cashflow in Euro: Betrag (Asana-Feld „Verkaufspreis“) und Ankaufsart (Feld „Art des Geschäftes“) je Fahrzeug.
-- In die Euro-Summe zählt nur „Direkter Ankauf“ (eigene Fahrzeuge), nicht Vermittlung.
alter table public.asana_deliveries add column amount numeric(12, 2);
alter table public.asana_deliveries add column deal_type text;

create or replace function public.asana_replace(p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int; t timestamptz := clock_timestamp();
begin
  insert into public.asana_deliveries (task_gid, name, section, stage, due_on, permalink_url, created_at, created_by, completed, amount, deal_type, synced_at)
  select r->>'task_gid', coalesce(r->>'name', ''), coalesce(r->>'section', ''), r->>'stage',
         nullif(r->>'due_on', '')::date, r->>'permalink_url',
         nullif(r->>'created_at', '')::timestamptz, nullif(r->>'created_by', ''), coalesce((r->>'completed')::boolean, false),
         case when jsonb_typeof(r->'amount') = 'number' then (r->>'amount')::numeric end, nullif(r->>'deal_type', ''), t
  from jsonb_array_elements(p_rows) r
  on conflict (task_gid) do update set name = excluded.name, section = excluded.section, stage = excluded.stage,
    due_on = excluded.due_on, permalink_url = excluded.permalink_url, created_at = excluded.created_at,
    created_by = excluded.created_by, completed = excluded.completed, amount = excluded.amount,
    deal_type = excluded.deal_type, synced_at = excluded.synced_at;
  get diagnostics n = row_count;
  update public.asana_sync s set last_attempt_at = t, last_success_at = t, last_error = null, task_count = n where s.id;
  return n;
end;
$$;
