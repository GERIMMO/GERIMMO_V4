-- Lecture du début de la session courante, sans exposer les autres sessions.
create or replace function public.ma_session_active()
returns table (id uuid, cree_le timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.created_at
  from auth.sessions s
  where s.user_id = (select auth.uid())
    and s.id = (select case
      when auth.jwt()->>'session_id' ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      then (auth.jwt()->>'session_id')::uuid else null end)
    and (s.not_after is null or s.not_after > now())
$$;
revoke all on function public.ma_session_active() from public, anon, service_role;
grant execute on function public.ma_session_active() to authenticated;
select public.fermer_fonctions_a_anon();
