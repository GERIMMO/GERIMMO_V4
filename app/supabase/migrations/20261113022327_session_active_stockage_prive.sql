-- Schéma technique exclu des schémas exposés de la Data API.
create schema gerimmo_session_interne;
revoke all on schema gerimmo_session_interne from public;
grant usage on schema gerimmo_session_interne to anon, authenticated, service_role;

-- Réutilise le contrôle Auth du projet avec les droits du lecteur.
-- Si le composant Auth est retiré, la lecture privée échoue de façon fermée.
create function gerimmo_session_interne.session_valide() returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select from public.ma_session_active())
$$;
revoke all on function gerimmo_session_interne.session_valide() from public;
grant execute on function gerimmo_session_interne.session_valide() to authenticated;

-- Les politiques permissives accordent déjà l’accès selon le dossier.
-- Cette condition additionnelle est évaluée une fois par requête de lecture.
create policy session_active_pour_lecture_fichier on storage.objects
  as restrictive for select to authenticated
  using ((select gerimmo_session_interne.session_valide()));
