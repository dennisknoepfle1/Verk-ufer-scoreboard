-- Morgen-Push des Prozessboards abgeschaltet (Dennis, 25.11.2026: „push nachricht morgens wieder rausnehmen“).
-- Nur der Zeitplan wird entfernt; Verkaufs-Push und Arbeitsanweisungs-Push (notify-sale) bleiben unverändert.
-- Die Edge Function process-digest und process_digest_trigger() bleiben liegen, werden aber nicht mehr aufgerufen.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'process-digest') then
    perform cron.unschedule('process-digest');
  end if;
end;
$$;
