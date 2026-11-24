-- Textes officiels, reprise du lot T3 (25/11/2026), point T3R-1 de la relecture — complément de charges d'un exercice
-- clos depuis plus de trois ans : la confirmation est exigée PAR LA BASE.
--
-- LE DÉFAUT. Le lot T3 (20261125111000) a retiré de `regulariser_charges` et de
-- `consommations_interne.emettre_regularisation` le refus « exercice prescrit » (article 7-1 de la loi du 6 juillet 1989 :
-- le délai court du jour où le bailleur a connu les dépenses, que la base ne connaît pas). La confirmation explicite qui
-- devait le remplacer n'était vérifiée que par l'application. Un appel direct de la fonction, par le gérant de l'espace
-- (rôle `authenticated`), enregistrait donc un complément de 2012 sans aucune confirmation : régression par rapport à
-- l'état d'avant le lot T3, où la base refusait. Pas d'élévation de droits : seul le gérant de l'espace le pouvait.
--
-- CE QUI CHANGE.
--  1. Dans les deux fonctions, à la place exacte de la ligne laissée par le lot T3 : un COMPLÉMENT (écart négatif) d'un
--     exercice dont le 31 décembre a plus de trois ans (même seuil que l'ancien refus et que l'application) est refusé
--     avec « confirmation nécessaire », sauf confirmation explicite. Le mot « prescrit » n'est pas dit : la base ne le sait
--     pas. Un trop-perçu, un exercice récent : rien ne change. Mêmes calculs, mêmes montants, mêmes autres refus.
--  2. La confirmation est un paramètre `p_exercice_ancien`, ajouté aux deux fonctions ET à leurs deux enveloppes
--     publiques par une SECONDE signature (un paramètre de plus, en dernier) :
--       public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean,boolean)
--       public.regulariser_charges_avec_justificatif(uuid,integer,numeric,text,text,text,bigint,text,boolean,boolean)
--       consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text,boolean)
--       public.emettre_regularisation_fourniture(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text,boolean)
--     POURQUOI UNE SECONDE SIGNATURE et non un paramètre « default false » ajouté à l'existante : un paramètre ne s'ajoute
--     pas à une signature existante (il faudrait la supprimer), et plusieurs migrations, leurs retours et leurs tests
--     relisent ces fonctions par leur signature (20261014821000, 20261123150000, 20261125111000) ; une seconde signature
--     AVEC valeur par défaut rendrait ambigus les appels actuels. L'ancienne signature vaut donc « p_exercice_ancien =
--     faux » : l'appel sans le paramètre est refusé pour un complément ancien ; celui qui le passe à vrai est accepté.
--     Même méthode que la reprise du lot D2 (20261124130000) : la seconde signature dépose la confirmation dans un réglage
--     de la transaction (« gerimmo.exercice_ancien_confirme »), appelle la première, où tout reste écrit une seule fois,
--     puis l'efface. Elle s'exécute avec les droits de l'APPELANT (pas de SECURITY DEFINER) : c'est la fonction d'origine
--     qui vérifie qui appelle.
--  3. Droits des secondes signatures : ceux de leur jumelle, à l'identique (rien pour `anon` ni pour PUBLIC).
--
-- CE QUI NE CHANGE PAS. Aucune donnée écrite, modifiée ni supprimée : les régularisations déjà enregistrées restent telles
-- quelles. Aucune règle de lecture (RLS) touchée. Les deux fonctions gardent SECURITY DEFINER, leur chemin de recherche
-- vide, leur propriétaire et leurs droits. `regulariser_charges` garde ses quatre citations du jour de Paris (le retour de
-- 20261014821000 les compte) : la ligne remplacée en citait une, la nouvelle aussi.
-- La ligne remplacée est relue dans la définition EN VIGUEUR et attendue une fois ; déjà remplacée (rejeu) : rien à faire ;
-- toute autre forme arrête la migration entière sans rien modifier. Rejouable.
-- Retour arrière : supabase/retours-arriere/20261125151000_textes_t3_reprise_exercice_ancien.retour.sql (à jouer AVANT
-- celui de 20261125111000, qui attend la ligne du lot T3).

do $reprise_t3$
declare
  r record;
  definition text;
  corps text;
  occurrences integer;
begin
  for r in select * from (values
    -- (fonction, ligne laissée par le lot T3, texte de cette reprise)
    ('public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)',
     $a$-- Lot T3 (R16-A1) : plus de refus « exercice prescrit » ici quand make_date(p_annee, 12, 31) < (public.aujourdhui_paris() - interval '3 years')::date. Article 7-1 : le délai court du jour où le bailleur a connu les dépenses, que la base ne connaît pas ; l'application avertit et fait confirmer.$a$,
     $n$-- Lot T3 (R16-A1), reprise T3R-1 : un complément d'un exercice clos depuis plus de trois ans n'est plus refusé comme
  -- « prescrit » (article 7-1 : le délai court du jour où le bailleur a connu les dépenses, que la base ne connaît pas),
  -- mais il ne s'enregistre qu'avec une confirmation explicite : celle de la signature à sept paramètres
  -- (p_exercice_ancien), déposée dans le réglage de la transaction « gerimmo.exercice_ancien_confirme ». Un trop-perçu
  -- n'en a pas besoin.
  if v_ecart < 0 and make_date(p_annee, 12, 31) < (public.aujourdhui_paris() - interval '3 years')::date
     and coalesce(current_setting('gerimmo.exercice_ancien_confirme', true), '') <> 'oui' then
    raise exception 'Exercice % clos depuis plus de trois ans : confirmation nécessaire pour enregistrer un complément de charges à la charge du locataire', p_annee;
  end if;$n$),
    ('consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text)',
     $a$/* Lot T3 (R16-A1) : plus de refus « exercice prescrit » ici ; l'application avertit et fait confirmer. */$a$,
     $n$/* Lot T3 (R16-A1), reprise T3R-1 : complément d'un exercice clos depuis plus de trois ans, plus refusé comme « prescrit » mais enregistré sur confirmation explicite seulement (signature à onze paramètres, réglage « gerimmo.exercice_ancien_confirme »). */
 if v_ecart<0 and make_date(d.annee,12,31)<(public.aujourdhui_paris()-interval '3 years')::date and coalesce(current_setting('gerimmo.exercice_ancien_confirme',true),'')<>'oui' then raise exception 'Exercice % clos depuis plus de trois ans : confirmation nécessaire pour enregistrer un complément de charges à la charge du locataire', d.annee; end if;$n$)
  ) x(signature, ancien, nouveau) loop
    select pg_get_functiondef(p.oid), p.prosrc into definition, corps
      from pg_proc p where p.oid = to_regprocedure(r.signature) and p.prosecdef;
    if corps is null then
      raise exception 'Reprise du lot T3 : fonction % introuvable ou inattendue ; rien n''est modifié', r.signature;
    end if;
    -- Déjà appliquée (rejeu) : rien à faire.
    continue when position('reprise T3R-1' in corps) > 0;
    occurrences := (length(corps) - length(replace(corps, r.ancien, ''))) / length(r.ancien);
    if occurrences <> 1 then
      raise exception 'Reprise du lot T3 : définition inattendue pour % (% occurrence(s) de la ligne du lot T3) ; rien n''est modifié', r.signature, occurrences;
    end if;
    execute replace(definition, corps, replace(corps, r.ancien, r.nouveau));
  end loop;
end $reprise_t3$;

-- Les secondes signatures : elles reçoivent la confirmation, la déposent pour la fonction d'origine le temps de l'appel,
-- puis l'effacent. Elles ne calculent ni ne contrôlent rien elles-mêmes.
create or replace function public.regulariser_charges(
  p_bail uuid, p_annee integer, p_charges_reelles numeric, p_justificatif uuid, p_note text, p_etaler boolean,
  p_exercice_ancien boolean)
returns numeric
language plpgsql
set search_path to ''
as $fonction$
declare
  v_ecart numeric;
begin
  perform set_config('gerimmo.exercice_ancien_confirme', case when p_exercice_ancien then 'oui' else '' end, true);
  v_ecart := public.regulariser_charges(p_bail, p_annee, p_charges_reelles, p_justificatif, p_note, p_etaler);
  perform set_config('gerimmo.exercice_ancien_confirme', '', true);
  return v_ecart;
end;
$fonction$;

create or replace function public.regulariser_charges_avec_justificatif(
  p_bail uuid, p_annee integer, p_charges_reelles numeric, p_note text, p_storage_path text, p_mime text, p_taille bigint,
  p_empreinte text, p_etaler boolean, p_exercice_ancien boolean)
returns numeric
language plpgsql
set search_path to ''
as $fonction$
declare
  v_ecart numeric;
begin
  perform set_config('gerimmo.exercice_ancien_confirme', case when p_exercice_ancien then 'oui' else '' end, true);
  v_ecart := public.regulariser_charges_avec_justificatif(
    p_bail, p_annee, p_charges_reelles, p_note, p_storage_path, p_mime, p_taille, p_empreinte, p_etaler);
  perform set_config('gerimmo.exercice_ancien_confirme', '', true);
  return v_ecart;
end;
$fonction$;

create or replace function consommations_interne.emettre_regularisation(
  p_org uuid, p_brouillon uuid, p_empreinte text, p_complet boolean, p_exercice_en_cours boolean, p_etaler boolean,
  p_storage_path text, p_mime text, p_taille bigint, p_fichier_empreinte text, p_exercice_ancien boolean)
returns uuid
language plpgsql
set search_path to ''
as $fonction$
declare
  v_id uuid;
begin
  perform set_config('gerimmo.exercice_ancien_confirme', case when p_exercice_ancien then 'oui' else '' end, true);
  v_id := consommations_interne.emettre_regularisation(
    p_org, p_brouillon, p_empreinte, p_complet, p_exercice_en_cours, p_etaler, p_storage_path, p_mime, p_taille, p_fichier_empreinte);
  perform set_config('gerimmo.exercice_ancien_confirme', '', true);
  return v_id;
end;
$fonction$;

create or replace function public.emettre_regularisation_fourniture(
  p_org uuid, p_brouillon uuid, p_empreinte text, p_complet boolean, p_exercice_en_cours boolean, p_etaler boolean,
  p_storage_path text, p_mime text, p_taille bigint, p_fichier_empreinte text, p_exercice_ancien boolean)
returns uuid
language plpgsql
set search_path to ''
as $fonction$
declare
  v_id uuid;
begin
  perform set_config('gerimmo.exercice_ancien_confirme', case when p_exercice_ancien then 'oui' else '' end, true);
  v_id := public.emettre_regularisation_fourniture(
    p_org, p_brouillon, p_empreinte, p_complet, p_exercice_en_cours, p_etaler, p_storage_path, p_mime, p_taille, p_fichier_empreinte);
  perform set_config('gerimmo.exercice_ancien_confirme', '', true);
  return v_id;
end;
$fonction$;

-- Droits : ceux de la jumelle, à l'identique (les fonctions créées dans `public` reçoivent par défaut un droit pour
-- `anon` : il est retiré ; celles de `consommations_interne`, un droit pour PUBLIC : retiré aussi).
revoke all on function public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean,boolean) from public, anon;
grant execute on function public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean,boolean) to authenticated, service_role;
revoke all on function public.regulariser_charges_avec_justificatif(uuid,integer,numeric,text,text,text,bigint,text,boolean,boolean) from public, anon;
grant execute on function public.regulariser_charges_avec_justificatif(uuid,integer,numeric,text,text,text,bigint,text,boolean,boolean) to authenticated, service_role;
revoke all on function public.emettre_regularisation_fourniture(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text,boolean) from public, anon;
grant execute on function public.emettre_regularisation_fourniture(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text,boolean) to authenticated, service_role;
revoke all on function consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text,boolean) from public, anon, service_role;
grant execute on function consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text,boolean) to authenticated;
