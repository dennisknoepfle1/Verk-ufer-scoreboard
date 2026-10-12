-- Trigger-Funktionen sind nicht für direkte Aufrufe über die API gedacht.
revoke execute on function public.compute_sale_commission() from public, anon, authenticated;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Rangliste und Hilfsfunktionen nur für angemeldete Nutzer (die Regeln prüfen zusätzlich die Freigabe).
revoke execute on function public.leaderboard(date) from public, anon;
revoke execute on function public.latest_sale() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.leaderboard(date), public.latest_sale(), public.is_admin(), public.is_active_user() to authenticated;
