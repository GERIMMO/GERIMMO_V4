-- Les politiques permissives accordent déjà l’accès selon le dossier.
-- Cette condition additionnelle est évaluée une fois par requête de lecture.
create policy session_active_pour_lecture_fichier on storage.objects
  as restrictive for select to authenticated
  using ((select exists (select from public.ma_session_active())));
