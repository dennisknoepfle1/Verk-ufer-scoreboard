-- Morgen-Push des Prozessboards abgeschaltet (Dennis, 25.11.2026: „push nachricht morgens wieder rausnehmen“).
-- Nur der Zeitplan wird entfernt; Verkaufs-Push und Arbeitsanweisungs-Push (notify-sale) bleiben unverändert.
-- Die Edge Function process-digest und process_digest_trigger() bleiben liegen, werden aber nicht mehr aufgerufen.
do $$
begin
  -- verschachtelt, damit cron.job nur angefasst wird, wo pg_cron existiert (nicht in den lokalen Tests)
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'process-digest'$q$;
  end if;
end;
$$;
