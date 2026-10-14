-- RETOUR ARRIÈRE de 20261014122000_restitution_remise_cles.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les
-- migrations d'origine SANS cette migration, puis recopiées ici par un générateur — aucune n'est écrite
-- à la main. Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014122000_restitution_remise_cles.retour.sql
--
-- RÉINTRODUIT les défauts corrigés (SOR-02) : demarrer_restitution accepte de nouveau une remise des clés datée du futur
-- (le délai légal est alors calculé sur un événement qui n'a pas eu lieu), et un nouvel envoi tant que la restitution est
-- en cours relit de nouveau, en silence, le dépôt, les impayés et le trop-perçu avec leur date d'arrêté.
-- Ne touche à aucune restitution existante : les dates et montants déjà enregistrés restent tels quels.

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
-- Hors transaction, l'instruction démarre à l'instant même de sa transaction ; dans un lot, elle est plus tardive.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;


begin;
set local lock_timeout = '10s';

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public).
-- Rétablit la définition ANTÉRIEURE (reprise de la base reconstruite par les migrations d'origine) si, et
-- seulement si, la définition en vigueur porte la marque du correctif. Sans la marque, la fonction est
-- déjà revenue (rejeu) ou a été réécrite depuis : on n'y touche pas.
create function pg_temp.restaurer_fonction(p_signature text, p_marque text, p_definition text)
returns text language plpgsql as $retour_arriere$
declare v_oid regprocedure := to_regprocedure(p_signature); v_courante text;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', p_signature;
  end if;
  v_courante := pg_get_functiondef(v_oid);
  if position(p_marque in v_courante) = 0 then
    return p_signature || ' : marque du correctif absente, rien à faire';
  end if;
  execute p_definition;
  return p_signature || ' : définition antérieure rétablie';
end $retour_arriere$;

-- D35 (1) : remise des clés jamais dans le futur, correction sans réarrêt des montants
select pg_temp.restaurer_fonction('public.demarrer_restitution(uuid,date,boolean)',
  $marque$Décision D35 (1) du 14/10 (SOR-02)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.demarrer_restitution(p_bail uuid, p_date_remise date, p_conforme boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_m record; v_sans_edl boolean; v_id uuid; v_ecarts integer;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;

  v_sans_edl := not exists (
    select 1 from public.etats_des_lieux e
    where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe'
  );
  -- Audit 27/09 — RM-2.4.2 (wiki « Restitution du dépôt de garantie ») : le
  -- délai d'un mois suppose une sortie conforme à l'entrée. La case cochée à
  -- la main ne peut plus contredire le comparatif d'EDL qui relève des écarts.
  -- Le comparatif ne vaut que si les deux états des lieux sont signés (sinon
  -- toutes les lignes de l'entrée ressortent en « écart ») — même condition
  -- que l'écran (comparatifDisponible).
  if p_conforme
     and exists (select 1 from public.etats_des_lieux e
                  where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe')
     and exists (select 1 from public.etats_des_lieux e
                  where e.bail_id = p_bail and e.type = 'sortie' and e.etat = 'signe') then
    select count(*) into v_ecarts from public.comparatif_edl(p_bail) c where c.ecart;
    if v_ecarts > 0 then
      raise exception 'Sortie non conforme : le comparatif d''état des lieux relève % écart(s) entre l''entrée et la sortie — le délai de restitution est de 2 mois (RM-2.4.2)', v_ecarts;
    end if;
  end if;
  select * into v_m from public.montants_reels_bail(p_bail);

  insert into public.restitutions
    (organization_id, bail_id, date_remise_cles, delai_mois, depot, impayes, trop_percu,
     sans_edl_entree, montants_arretes_le)
  values (v.organization_id, p_bail, p_date_remise, case when p_conforme then 1 else 2 end,
          v_m.depot, v_m.impayes, v_m.trop_percu, v_sans_edl, now())
  on conflict (bail_id) do update
    set date_remise_cles = excluded.date_remise_cles, delai_mois = excluded.delai_mois,
        depot = excluded.depot, impayes = excluded.impayes, trop_percu = excluded.trop_percu,
        sans_edl_entree = excluded.sans_edl_entree,
        montants_arretes_le = excluded.montants_arretes_le
    where public.restitutions.statut = 'en_cours'
  returning id into v_id;
  if v_id is null then raise exception 'Restitution déjà finalisée pour ce bail'; end if;
  return v_id;
end $function$
$definition_anterieure$);


-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014122000';
  end if;
end $retour_arriere$;

commit;
