-- Identité de l'éditeur (19/10) : la localisation de la Base Adresse Nationale et les coordonnées de chaque
-- prestataire (dénomination, adresse, téléphone) se saisissent depuis /admin/parametres, par les mêmes clés JSON que
-- les treize faits d'éditeur, et sont reprises sur les pages légales. La contrainte identite_champs_connus est une
-- liste FERMÉE de clés : elle s'ouvre ici aux douze clés nouvelles, exactement celles de CHAMPS_EDITEUR
-- (src/lib/identite-editeur.ts ; tests/prestataires-declares.test.ts compare les deux listes). Vingt-cinq champs de
-- 1 000 caractères dépassent la borne de 20 000 octets posée le 18/10 : elle passe à 40 000.
-- Aucune valeur écrite, aucun droit ajouté. Rejeu sans effet ; une contrainte d'une autre forme arrête la migration
-- sans rien modifier. À appliquer AVANT le code : sinon le premier enregistrement du formulaire est refusé
-- (check_violation, message « migration à appliquer » de l'écran).
-- Retour : supabase/retours-arriere/20261019123000_identite_editeur_prestataires.retour.sql
do $identite$
declare
  def text;
begin
  perform set_config('lock_timeout','10s',true);

  select pg_get_constraintdef(oid) into def from pg_constraint
    where conrelid = 'public.supervision_identite'::regclass and conname = 'identite_champs_connus';
  if def is null then
    raise exception 'Identité : contrainte identite_champs_connus absente, aucune réécriture';
  end if;
  if def like '%''localisationBan''%' then
    -- Déjà migrée : la liste doit alors être complète.
    if def not like '%''coordonneesMeta''%' then
      raise exception 'Identité : contrainte identite_champs_connus d''une forme inattendue, aucune réécriture';
    end if;
  elsif def like '%''mediateurSite''%' and def not like '%''coordonnees%' then
    alter table public.supervision_identite drop constraint identite_champs_connus;
    alter table public.supervision_identite add constraint identite_champs_connus check (
      valeurs - array['denomination','forme','capital','siege','rcs','siret','tvaIntracommunautaire','directeurPublication','email','telephone','mediateurNom','mediateurAdresse','mediateurSite','coordonneesSupabase','coordonneesVercel','coordonneesResend','coordonneesStripe','coordonneesZohoSign','coordonneesYousign','coordonneesOpenai','coordonneesScaleway','coordonneesGithub','localisationBan','coordonneesBan','coordonneesMeta']::text[] = '{}'::jsonb
    );
  else
    raise exception 'Identité : contrainte identite_champs_connus d''une forme inattendue, aucune réécriture';
  end if;

  select pg_get_constraintdef(oid) into def from pg_constraint
    where conrelid = 'public.supervision_identite'::regclass and conname = 'supervision_identite_valeurs_check';
  if def is null then
    raise exception 'Identité : contrainte supervision_identite_valeurs_check absente, aucune réécriture';
  end if;
  if def like '%< 20000%' then
    alter table public.supervision_identite drop constraint supervision_identite_valeurs_check;
    alter table public.supervision_identite add constraint supervision_identite_valeurs_check
      check (jsonb_typeof(valeurs) = 'object' and octet_length(valeurs::text) < 40000);
  elsif def not like '%< 40000%' then
    raise exception 'Identité : borne de taille d''une forme inattendue, aucune réécriture';
  end if;
end $identite$;
select public.fermer_fonctions_a_anon();
