-- RETOUR ARRIÈRE de 20261119200100 (SCI-2). À jouer APRÈS celui de 20261119200200 et AVANT celui de 20261119200000.
-- La fiche d'une nouvelle société naît de nouveau sans e-mail, et le profil ne complète plus sa fiche. Les coordonnées
-- déjà recopiées sur des fiches restent (aucune donnée n'est effacée). Remettre aussi le code d'avant
-- (app/actions/organisation.ts appelle completer_fiche_societe_depuis_profil, son échec est seulement signalé).
-- Rejouable : une définition déjà rétablie et une fonction déjà retirée sont laissées.
do $retour$
declare
  definition text := pg_get_functiondef('public.initialiser_espace_proprietaire()'::regprocedure);
  avant text := $sql$coalesce(v_societe,v_nom), case when v_societe is null then v_prenom end, case when v_societe is null then v_email end, v_telephone,$sql$;
  apres text := $sql$coalesce(v_societe,v_nom), case when v_societe is null then v_prenom end, v_email, v_telephone,$sql$;
  n_avant integer := (length(definition) - length(replace(definition, avant, ''))) / length(avant);
  n_apres integer := (length(definition) - length(replace(definition, apres, ''))) / length(apres);
begin
  if n_apres = 1 and n_avant = 0 then
    execute replace(definition, apres, avant);
  elsif not (n_apres = 0 and n_avant = 1) then
    raise exception 'Retour refusé : initialiser_espace_proprietaire a une forme inattendue (% ancienne(s), % nouvelle(s)).', n_avant, n_apres;
  end if;
  drop function if exists public.completer_fiche_societe_depuis_profil(uuid);
  delete from supabase_migrations.schema_migrations where version = '20261119200100';
end $retour$;
notify pgrst, 'reload schema';
