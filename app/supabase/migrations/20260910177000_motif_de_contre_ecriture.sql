-- ============================================================================
-- LA RÈGLE : une contre-écriture porte le MOTIF de son auteur (RM-A6.6).
-- ============================================================================
-- Source : wiki [[Comptabilité]] et [[2026-07-24-gerimmo-v3-a6-doctrine-financiere]]
-- (livrable A6, doctrine financière). RM-A6.6, règle BLOQUANTE, énoncée
-- littéralement dans la matrice du livrable :
--     « Le motif d'une contre-écriture est obligatoire. »
-- Elle ne vit pas seule : RM-A6.3 pose l'immutabilité dès la création (« jamais
-- de modification ni de suppression, même avant clôture ») et renvoie la
-- correction sur la contre-écriture RM-A6.4, décrite ainsi — « sens inversé,
-- imputée au jour (RM-A6.5), date de pièce d'origine, MOTIF OBLIGATOIRE
-- (RM-A6.6), lien tracé, les deux visibles ». La doctrine résume l'enjeu :
-- « L'historique se lit, il ne se réécrit pas » — donc il doit se lire
-- ENTIÈREMENT, la raison comprise, parce qu'un rapport envoyé engage l'agence.
--
-- CE QUI EST CONSTATÉ (rejoué sur la base locale le 2026-09-10, sous l'identité
-- d'un admin d'agence, dans une transaction annulée). Deux chemins produisent
-- une contre-écriture :
--   1. le chemin MANUEL, public.contre_ecriture(p_ecriture, p_motif) : le motif
--      y est déjà exigé (« Motif de contre-écriture obligatoire ») — RM-A6.6 y
--      est tenue, mais le motif n'est conservé que fondu dans le libellé ;
--   2. les chemins AUTOMATIQUES, les déclencheurs de suppression
--      public.contre_passer_encaissement() (sur encaissements) et
--      public.contre_passer_depot_encaissement() (sur depot_encaissements).
--      Ceux-là partent avec un libellé constant :
--        delete from public.encaissements where id = '…';
--        → libelle « Annulation — encaissement supprimé », rien d'autre.
--      Le journal dit CE QUI a été annulé, jamais POURQUOI. Or c'est bien le
--      geste de correction courant : « un encaissement ne se modifie plus : on
--      supprime et on ressaisit » (migration 20260910160000, RM-A6.3). La
--      correction la plus fréquente est donc justement celle qui ne porte
--      aucune justification — RM-A6.6 n'est pas tenue sur ce chemin.
--
-- LA CORRECTION, en trois pièces.
--   a. Une colonne ecritures.motif, NULLABLE : le motif cesse d'être une
--      chaîne fondue dans le libellé et devient une donnée relisible (journal,
--      export RM-A6.10/A6.11 qui doit être « exploitable par l'expert-
--      comptable »). Non vide si présent.
--   b. Un transport : le déclencheur de suppression ne reçoit pas de paramètre.
--      Le motif voyage par un réglage LOCAL À LA TRANSACTION
--      (gerimmo.motif_contre_ecriture), posé par la fonction qui déclenche la
--      contre-passation et lu par le déclencheur. Absent → le comportement
--      d'avant, à l'identique.
--   c. Deux fonctions d'appel, public.supprimer_encaissement(uuid, text) et
--      public.supprimer_encaissement_depot(uuid, text), dont le motif est un
--      paramètre OPTIONNEL (default null). Elles ne remplacent rien : le DELETE
--      direct par PostgREST continue de fonctionner exactement comme avant.
--      Elles s'exécutent en SECURITY INVOKER — la RLS de encaissements /
--      depot_encaissements (politiques …_delete) tranche l'accès comme pour un
--      DELETE direct, aucune barrière n'est contournée.
--
-- RÉTROCOMPATIBILITÉ STRICTE — ce qui NE change PAS : la signature de
-- public.contre_ecriture(uuid, text), le sens, le montant, les deux dates et le
-- lien (contre_ecriture_de) des contre-écritures produites, le fait que le
-- DELETE direct continue de contre-passer, et le libellé exact des
-- contre-écritures sans motif. Le libellé n'est enrichi (« … : <motif> ») que
-- lorsqu'un motif est effectivement fourni.
--
-- CE QUE CETTE MIGRATION NE TRANCHE PAS — arbitrage humain, rien n'est codé :
--   * RM-A6.6 dit « obligatoire ». Le rendre obligatoire EN BASE sur les
--     chemins automatiques (refuser une suppression d'encaissement sans motif)
--     casserait tout appel existant — le DELETE direct de l'application, et
--     tout script de reprise. Le motif reste donc OPTIONNEL en base, et
--     obligatoire là où un humain déclenche le geste (formulaires de l'agence,
--     côté application). Rendre le refus structurel demande de décider du sort
--     des suppressions en cascade (un bail supprimé emporte ses encaissements
--     de dépôt : personne n'est là pour motiver) et de la reprise des
--     contre-écritures déjà écrites sans motif. Le wiki ne le tranche pas.
--   * Le wiki n'exige nulle part un vocabulaire fermé de motifs : le motif
--     reste du texte libre, comme la justification d'imputation d'incident.
-- ============================================================================

-- ---------------------------------------------------------------- 1. Colonne
alter table public.ecritures add column if not exists motif text;

comment on column public.ecritures.motif is
  'Motif de la correction, saisi par son auteur (RM-A6.6). Renseigné sur les '
  'contre-écritures ; nul sur les écritures d''origine. Optionnel en base : '
  'obligatoire côté application, là où un humain déclenche le geste.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ecritures'::regclass
       and conname = 'ecritures_motif_non_vide') then
    alter table public.ecritures
      add constraint ecritures_motif_non_vide
      check (motif is null or btrim(motif) <> '');
  end if;
end $$;

-- ------------------------------------------------- 2. Transport du motif
-- Un déclencheur de suppression ne prend pas de paramètre : le motif est posé
-- pour la seule transaction en cours (set_config(..., true)) par la fonction
-- appelante, puis relu ici. Absent ou vide → null, et le comportement reste
-- exactement celui d'avant cette migration.
create or replace function public.motif_de_contre_ecriture()
returns text
language sql
stable
set search_path to ''
as $$
  select nullif(btrim(coalesce(current_setting('gerimmo.motif_contre_ecriture', true), '')), '')
$$;

comment on function public.motif_de_contre_ecriture() is
  'Motif de correction porté par la transaction en cours (RM-A6.6), ou null.';

-- Helper interne : jamais appelé par l'application (les déclencheurs, eux,
-- s'exécutent sous postgres). Même durcissement que la migration
-- 20260910170000 : la surface exécutable est exactement l'API applicative.
revoke execute on function public.motif_de_contre_ecriture()
  from public, anon, authenticated, service_role;

-- ------------------------------ 3. Le chemin manuel conserve son motif
-- Signature inchangée, motif toujours exigé (RM-A6.6 était déjà tenue ici) :
-- il est désormais AUSSI stocké en clair sur l'écriture, au lieu de n'exister
-- que fondu dans le libellé.
create or replace function public.contre_ecriture(p_ecriture uuid, p_motif text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v record; v_new uuid;
begin
  select * into v from public.ecritures where id = p_ecriture;
  if v.id is null then raise exception 'Écriture introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if coalesce(btrim(p_motif), '') = '' then raise exception 'Motif de contre-écriture obligatoire'; end if;
  insert into public.ecritures
    (organization_id, bail_id, lot_id, mandat_id, categorie, sens, montant,
     date_piece, date_imputation, libelle, systeme, contre_ecriture_de, motif)
  values (v.organization_id, v.bail_id, v.lot_id, v.mandat_id, v.categorie,
     case when v.sens = 'recette' then 'depense' else 'recette' end, v.montant,
     v.date_piece, current_date, 'Contre-écriture : ' || p_motif, v.systeme, v.id,
     btrim(p_motif))
  returning id into v_new;
  return v_new;
end; $function$;

-- ------------------------- 4. Les chemins automatiques portent le motif
-- Le corps est celui d'avant, à l'identique (mêmes gardes « une seule
-- contre-passation », mêmes sens/montant/dates/lien) : seules la colonne motif
-- et l'enrichissement du libellé s'ajoutent. Sans motif, la ligne écrite est
-- exactement celle d'avant.
create or replace function public.contre_passer_encaissement()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare e record; v_motif text;
begin
  v_motif := public.motif_de_contre_ecriture();
  for e in
    select * from public.ecritures o
     where o.encaissement_id = old.id
       and o.contre_ecriture_de is null
       and not exists (select 1 from public.ecritures c where c.contre_ecriture_de = o.id)
  loop
    insert into public.ecritures
      (organization_id, bail_id, lot_id, mandat_id, categorie, sens, montant,
       date_piece, date_imputation, libelle, systeme, contre_ecriture_de, motif)
    values (e.organization_id, e.bail_id, e.lot_id, e.mandat_id, e.categorie,
            case when e.sens = 'recette' then 'depense' else 'recette' end,
            e.montant, current_date, current_date,
            'Annulation — encaissement supprimé' || coalesce(' : ' || v_motif, ''),
            true, e.id, v_motif);
  end loop;
  return old;
end $function$;

create or replace function public.contre_passer_depot_encaissement()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare e record; v_motif text;
begin
  v_motif := public.motif_de_contre_ecriture();
  for e in
    select * from public.ecritures o
     where o.depot_encaissement_id = old.id
       and o.contre_ecriture_de is null
       and not exists (select 1 from public.ecritures c where c.contre_ecriture_de = o.id)
  loop
    insert into public.ecritures
      (organization_id, bail_id, lot_id, mandat_id, categorie, sens, montant,
       date_piece, date_imputation, libelle, systeme, contre_ecriture_de, motif)
    values (e.organization_id, e.bail_id, e.lot_id, e.mandat_id, e.categorie,
            case when e.sens = 'recette' then 'depense' else 'recette' end,
            e.montant, current_date, current_date,
            'Annulation — encaissement de dépôt supprimé' || coalesce(' : ' || v_motif, ''),
            true, e.id, v_motif);
  end loop;
  return old;
end $function$;

-- CREATE OR REPLACE conserve les droits ; on redit tout de même la révocation
-- posée le 2026-09-10 (migration 20260910170000) pour que ce fichier soit sûr
-- à lui seul : une fonction déclencheur n'est appelable par personne.
revoke execute on function public.contre_passer_encaissement()
  from public, anon, authenticated, service_role;
revoke execute on function public.contre_passer_depot_encaissement()
  from public, anon, authenticated, service_role;

-- --------------------- 5. Les gestes utilisateur, motif en paramètre
-- OPTIONNEL (default null) : rétrocompatible par construction, et le DELETE
-- direct reste ouvert. SECURITY INVOKER : la RLS s'applique comme pour un
-- DELETE direct — ces fonctions n'ouvrent aucun accès nouveau.
create or replace function public.supprimer_encaissement(
  p_encaissement uuid,
  p_motif text default null)
returns void
language plpgsql
security invoker
set search_path to ''
as $function$
declare v_lignes integer;
begin
  perform set_config('gerimmo.motif_contre_ecriture',
                     coalesce(nullif(btrim(p_motif), ''), ''), true);
  delete from public.encaissements where id = p_encaissement;
  get diagnostics v_lignes = row_count;
  -- Le motif ne vaut que pour CE geste : on le retire aussitôt pour qu'il ne
  -- déteigne pas sur une autre suppression de la même transaction.
  perform set_config('gerimmo.motif_contre_ecriture', '', true);
  if v_lignes = 0 then
    raise exception 'Encaissement introuvable';
  end if;
end; $function$;

comment on function public.supprimer_encaissement(uuid, text) is
  'Supprime un encaissement ; la contre-passation automatique porte le motif '
  'fourni (RM-A6.6). Motif optionnel en base, obligatoire à l''écran.';

create or replace function public.supprimer_encaissement_depot(
  p_encaissement uuid,
  p_motif text default null)
returns void
language plpgsql
security invoker
set search_path to ''
as $function$
declare v_lignes integer;
begin
  perform set_config('gerimmo.motif_contre_ecriture',
                     coalesce(nullif(btrim(p_motif), ''), ''), true);
  delete from public.depot_encaissements where id = p_encaissement;
  get diagnostics v_lignes = row_count;
  perform set_config('gerimmo.motif_contre_ecriture', '', true);
  if v_lignes = 0 then
    raise exception 'Encaissement de dépôt introuvable';
  end if;
end; $function$;

comment on function public.supprimer_encaissement_depot(uuid, text) is
  'Retire un encaissement de dépôt ; la contre-passation automatique porte le '
  'motif fourni (RM-A6.6). Motif optionnel en base, obligatoire à l''écran.';

revoke execute on function public.supprimer_encaissement(uuid, text) from public, anon;
revoke execute on function public.supprimer_encaissement_depot(uuid, text) from public, anon;
grant execute on function public.supprimer_encaissement(uuid, text) to authenticated;
grant execute on function public.supprimer_encaissement_depot(uuid, text) to authenticated;

-- ------------- 6. Le quatrième producteur : le client, en écriture directe
-- AJOUT DU VÉRIFICATEUR (2026-09-10). Les points 1 à 5 traitent les TROIS
-- fonctions qui fabriquent une contre-écriture. Il en existe une quatrième
-- voie, et elle ne passe par aucune fonction : l'INSERT direct en table.
-- La politique `ecritures_insert` autorise tout membre de l'agence à écrire
-- dans le journal (c'est le geste normal : « Ajouter une écriture ») — rien
-- n'y filtrait la colonne contre_ecriture_de. Rejoué sur la base locale, sous
-- l'identité d'un admin d'agence (set_config('request.jwt.claims', …) +
-- set local role authenticated), dans une transaction annulée, avec des UUID
-- en dur :
--
--   insert into public.ecritures (id, organization_id, …, contre_ecriture_de)
--   values ('2222…2', '…', …, 'Annulation maison', '2222…1');
--   -- → INSERT 0 1 : contre-écriture acceptée, motif NULL.
--
-- Le journal portait donc une annulation sans la moindre justification, écrite
-- à la main, en contournant public.contre_ecriture(uuid,text) — la fonction
-- qui, elle, exige le motif depuis l'origine. RM-A6.6 (« le motif d'une
-- contre-écriture est obligatoire », règle BLOQUANTE) restait franchissable
-- par le chemin le plus court, et le garde-fou du point 7 aurait dit « tout va
-- bien » : il ne regarde que les trois fonctions.
--
-- CE QU'ON EXIGE, ET RIEN DE PLUS. Une contre-écriture écrite par un CLIENT
-- porte son motif. On ne touche ni au sens, ni au montant, ni aux dates —
-- RM-A6.4 les décrit aussi (« montant identique sens inversé, date de pièce
-- d'origine »), mais un INSERT direct peut encore les prendre à revers : c'est
-- un défaut voisin, réel, hors de ce lot, signalé et non codé ici.
--
-- QUI EST « LE CLIENT ». Les écritures internes de la base — contre-passation
-- automatique, contre_ecriture(), migrations, reprises — s'exécutent sous le
-- PROPRIÉTAIRE du journal (fonctions SECURITY DEFINER : sondé en local,
-- current_user = postgres, alors qu'un INSERT direct arrive sous
-- authenticated). C'est cette identité-là, et elle seule, qui garde le droit
-- d'écrire une contre-écriture sans motif : sans quoi la suppression
-- d'encaissement sans motif — le comportement d'avant, délibérément conservé
-- au point 5 et couvert par des tests existants — serait cassée par la bande.
-- On ne compare pas à un nom de rôle en dur : on lit le propriétaire de la
-- table, identique en local et en production.
create or replace function public.contre_ecriture_exige_son_motif()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare v_proprietaire text;
begin
  if new.contre_ecriture_de is not null
     and nullif(btrim(coalesce(new.motif, '')), '') is null then
    select r.rolname into v_proprietaire
      from pg_catalog.pg_class c
      join pg_catalog.pg_roles r on r.oid = c.relowner
     where c.oid = 'public.ecritures'::regclass;
    if current_user <> v_proprietaire then
      raise exception 'Motif de contre-écriture obligatoire';
    end if;
  end if;
  return new;
end $function$;

comment on function public.contre_ecriture_exige_son_motif() is
  'Une contre-écriture écrite par un client porte son motif (RM-A6.6). Les '
  'écritures internes de la base (contre-passation automatique) gardent le '
  'droit d''un motif nul : c''est le comportement d''avant, arbitrage humain.';

drop trigger if exists ecritures_contre_ecriture_motif on public.ecritures;
create trigger ecritures_contre_ecriture_motif
  before insert on public.ecritures
  for each row execute function public.contre_ecriture_exige_son_motif();

-- Même durcissement que la migration 20260910170000 : une fonction déclencheur
-- n'est appelable par personne (le droit EXECUTE est aussi ce qui autorise à
-- POSER la fonction en déclencheur sur une table à soi).
revoke execute on function public.contre_ecriture_exige_son_motif()
  from public, anon, authenticated, service_role;

-- ------------------------------------------ 7. Garde-fou de la migration
-- La migration échoue plutôt que de laisser croire que le motif circule.
do $$
declare v_manque text;
begin
  select string_agg(f.nom, ', ')
    into v_manque
    from (values
            ('public.contre_passer_encaissement()'),
            ('public.contre_passer_depot_encaissement()'),
            ('public.contre_ecriture(uuid,text)')) as f(nom)
   where position('motif' in pg_get_functiondef(f.nom::regprocedure)) = 0;
  if v_manque is not null then
    raise exception 'Contre-écritures encore sans motif : %', v_manque;
  end if;
  -- Et la quatrième voie, celle qui ne passe par aucune fonction (point 6).
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.ecritures'::regclass
       and tgname = 'ecritures_contre_ecriture_motif'
       and not tgisinternal) then
    raise exception 'L''écriture directe peut encore forger une contre-écriture sans motif';
  end if;
end $$;
