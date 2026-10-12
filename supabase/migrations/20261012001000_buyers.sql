-- Einkäufer-Challenge: Wer hat in diesem Monat wie viele Fahrzeug-Aufgaben in Asana angelegt?
-- Der Abruf liefert dafür zusätzlich Ersteller, Erstelldatum und ob die Aufgabe erledigt ist
-- (inkl. der in diesem Monat erledigten). Für den Cashflow zählen erledigte Aufgaben nicht.

alter table public.asana_deliveries add column created_at timestamptz;
alter table public.asana_deliveries add column created_by text;
alter table public.asana_deliveries add column completed boolean not null default false;

create or replace function public.asana_replace(p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int; t timestamptz := clock_timestamp();
begin
  insert into public.asana_deliveries (task_gid, name, section, stage, due_on, permalink_url, created_at, created_by, completed, synced_at)
  select r->>'task_gid', coalesce(r->>'name', ''), coalesce(r->>'section', ''), r->>'stage',
         nullif(r->>'due_on', '')::date, r->>'permalink_url',
         nullif(r->>'created_at', '')::timestamptz, nullif(r->>'created_by', ''), coalesce((r->>'completed')::boolean, false), t
  from jsonb_array_elements(p_rows) r
  on conflict (task_gid) do update set name = excluded.name, section = excluded.section, stage = excluded.stage,
    due_on = excluded.due_on, permalink_url = excluded.permalink_url, created_at = excluded.created_at,
    created_by = excluded.created_by, completed = excluded.completed, synced_at = excluded.synced_at;
  get diagnostics n = row_count;
  update public.asana_sync s set last_attempt_at = t, last_success_at = t, last_error = null, task_count = n where s.id;
  return n;
end;
$$;

-- Rangliste der Einkäufer für den laufenden Monat (deutsche Zeit). Stornos zählen nicht.
create function public.buyer_leaderboard() returns table (buyer text, vehicles int, rank int)
language sql stable set search_path = '' as $$
  with counts as (
    select d.created_by as buyer, count(*)::int as vehicles
    from public.asana_current() d
    where d.created_by is not null
      and d.section not ilike '%storno%'
      and (d.created_at at time zone 'Europe/Berlin') >= date_trunc('month', now() at time zone 'Europe/Berlin')
    group by d.created_by
  )
  select buyer, vehicles, (rank() over (order by vehicles desc))::int from counts order by vehicles desc, buyer;
$$;
revoke all on function public.buyer_leaderboard() from public, anon;
grant execute on function public.buyer_leaderboard() to authenticated;
