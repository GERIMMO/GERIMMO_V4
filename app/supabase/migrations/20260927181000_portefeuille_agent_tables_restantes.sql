-- Audit agence du 27/09 — la cloison du portefeuille agent, table par table.
--
-- CONSTAT. Le wiki (Agent immobilier, RM-18.1.3) décrit la cloison « un agent
-- ne voit et ne touche que les dossiers de ses mandats » comme « appliquée en
-- base » ; le 09/09 (20260909230000) l'a posée sur 23 tables — policies
-- RESTRICTIVES de lecture et trigger `garde_portefeuille_agent` sur les
-- écritures. Rejoué le 27/09 sous l'identité d'un agent (transaction
-- annulée) : l'insertion d'une pièce (`lot_pieces`) et d'un appel de charges
-- (`appels_charges`) sur un lot HORS de son portefeuille passait, et une
-- douzaine de tables restaient lisibles sur toute l'agence.
--
-- CORRECTION, sur le modèle du 09/09 :
--   · une policy RESTRICTIVE `<table>_agent_portefeuille` (FOR ALL : lecture
--     ET écriture) par table, écrite avec les helpers existants
--     (lot/bail/bien/edl/person/mandat/intervention/incident_hors_portefeuille,
--     tous « faux » dès que l'appelant n'est pas QU'agent : admin d'agence,
--     propriétaire direct, super admin et locataires ne sont pas touchés) ;
--   · le trigger `garde_portefeuille_agent` sur les tables qui portent une
--     clé qu'il sait lire (lot_id, bail_id, edl_id, person_id) : il vaut aussi
--     pour les fonctions SECURITY DEFINER, que la RLS ne voit pas.
-- Les tables sans organisation propre suivent leur parent : la policy de
-- `cle_repartition_lignes` lit déjà `cles_repartition` sous RLS, celle de
-- `appel_charges_postes` s'y ajoute ici.
--
-- Idempotent : drop policy if exists / create ; drop trigger if exists / create.

-- ------------------------------------------------ 1. Tables rattachées à un lot
do $$
declare t text;
begin
  foreach t in array array['lot_pieces', 'lot_chambres', 'appels_charges'] loop
    execute format('drop policy if exists %I on public.%I', t || '_agent_portefeuille', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (not public.lot_hors_portefeuille(organization_id, lot_id))
         with check (not public.lot_hors_portefeuille(organization_id, lot_id))',
      t || '_agent_portefeuille', t);
    execute format('drop trigger if exists garde_portefeuille_agent on public.%I', t);
    execute format(
      'create trigger garde_portefeuille_agent before insert or update or delete on public.%I
         for each row execute function public.garde_portefeuille_agent()', t);
  end loop;
end $$;

-- Les postes d'un appel de charges suivent leur appel (lu sous RLS).
drop policy if exists appel_charges_postes_agent_portefeuille on public.appel_charges_postes;
create policy appel_charges_postes_agent_portefeuille on public.appel_charges_postes
  as restrictive for all to authenticated
  using (not public.est_agent_restreint(organization_id)
         or appel_id in (select a.id from public.appels_charges a))
  with check (not public.est_agent_restreint(organization_id)
              or appel_id in (select a.id from public.appels_charges a));

-- ------------------------------------------------ 2. Tables rattachées à un bail
do $$
declare t text;
begin
  foreach t in array array['regularisations_charges', 'intentions_conge'] loop
    execute format('drop policy if exists %I on public.%I', t || '_agent_portefeuille', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (not public.bail_hors_portefeuille(organization_id, bail_id))
         with check (not public.bail_hors_portefeuille(organization_id, bail_id))',
      t || '_agent_portefeuille', t);
    execute format('drop trigger if exists garde_portefeuille_agent on public.%I', t);
    execute format(
      'create trigger garde_portefeuille_agent before insert or update or delete on public.%I
         for each row execute function public.garde_portefeuille_agent()', t);
  end loop;
end $$;

-- ------------------------------------- 3. Tables rattachées à un état des lieux
do $$
declare t text;
begin
  foreach t in array array['edl_cles', 'edl_compteurs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_agent_portefeuille', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (not public.edl_hors_portefeuille(organization_id, edl_id))
         with check (not public.edl_hors_portefeuille(organization_id, edl_id))',
      t || '_agent_portefeuille', t);
    execute format('drop trigger if exists garde_portefeuille_agent on public.%I', t);
    execute format(
      'create trigger garde_portefeuille_agent before insert or update or delete on public.%I
         for each row execute function public.garde_portefeuille_agent()', t);
  end loop;
end $$;

-- ----------------------------------------- 4. Tables rattachées à une personne
-- Pièces demandées à un locataire, demandes de signature : la personne doit
-- être dans le périmètre de l'agent (perimetre_persons_gerant).
do $$
declare t text;
begin
  foreach t in array array['pieces_demandees', 'demandes_signature'] loop
    execute format('drop policy if exists %I on public.%I', t || '_agent_portefeuille', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (not public.person_hors_portefeuille(organization_id, person_id))
         with check (not public.person_hors_portefeuille(organization_id, person_id))',
      t || '_agent_portefeuille', t);
    execute format('drop trigger if exists garde_portefeuille_agent on public.%I', t);
    execute format(
      'create trigger garde_portefeuille_agent before insert or update or delete on public.%I
         for each row execute function public.garde_portefeuille_agent()', t);
  end loop;
end $$;

-- ------------------------------------------------ 5. Tables rattachées à un bien
-- Clés de répartition et informations pratiques d'immeuble : le bien doit
-- compter au moins un lot du portefeuille. Pas de trigger de garde : il ne
-- sait pas lire `bien_id` et refuserait tout ; les écritures de ces tables
-- passent par l'API, donc par la RLS.
do $$
declare t text;
begin
  foreach t in array array['cles_repartition', 'bien_infos_pratiques'] loop
    execute format('drop policy if exists %I on public.%I', t || '_agent_portefeuille', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (not public.bien_hors_portefeuille(organization_id, bien_id))
         with check (not public.bien_hors_portefeuille(organization_id, bien_id))',
      t || '_agent_portefeuille', t);
  end loop;
end $$;

-- Annonces aux locataires : celle d'un bien suit le bien ; une annonce à toute
-- l'agence (bien_id nul) reste lisible par l'agent, mais seul un gérant qui
-- voit toute l'agence la publie ou la retire.
drop policy if exists annonces_agent_portefeuille on public.annonces;
create policy annonces_agent_portefeuille on public.annonces
  as restrictive for select to authenticated
  using (bien_id is null or not public.bien_hors_portefeuille(organization_id, bien_id));
drop policy if exists annonces_agent_portefeuille_ecriture on public.annonces;
create policy annonces_agent_portefeuille_ecriture on public.annonces
  as restrictive for insert to authenticated
  with check (not public.est_agent_restreint(organization_id)
              or (bien_id is not null and not public.bien_hors_portefeuille(organization_id, bien_id)));
drop policy if exists annonces_agent_portefeuille_suppression on public.annonces;
create policy annonces_agent_portefeuille_suppression on public.annonces
  as restrictive for delete to authenticated
  using (not public.est_agent_restreint(organization_id)
         or (bien_id is not null and not public.bien_hors_portefeuille(organization_id, bien_id)));

-- ------------------------------------ 6. Comptes des mandants, reprise de soldes
-- Lecture seule côté API (écritures par fonctions). Un mouvement de mandant se
-- lit par son mandat ; sans mandat, par le mandant lui-même.
drop policy if exists mouvements_mandants_agent_portefeuille on public.mouvements_mandants;
create policy mouvements_mandants_agent_portefeuille on public.mouvements_mandants
  as restrictive for select to authenticated
  using (organization_id is null
         or not public.est_agent_restreint(organization_id)
         or (mandat_id is not null and not public.mandat_hors_portefeuille(organization_id, mandat_id))
         or (mandat_id is null and not public.person_hors_portefeuille(organization_id, mandant_person_id)));

-- La reprise de soldes est un écran d'admin ; un agent n'en lit que les
-- lignes de ses baux ou de ses personnes.
drop policy if exists reprise_soldes_agent_portefeuille on public.reprise_soldes;
create policy reprise_soldes_agent_portefeuille on public.reprise_soldes
  as restrictive for select to authenticated
  using (not public.est_agent_restreint(organization_id)
         or (bail_id is not null and not public.bail_hors_portefeuille(organization_id, bail_id))
         or (bail_id is null and person_id is not null
             and not public.person_hors_portefeuille(organization_id, person_id)));

-- -------------------------------------- 7. Suivi des dossiers d'intervention
drop policy if exists dossier_contacts_agent_portefeuille on public.dossier_contacts;
create policy dossier_contacts_agent_portefeuille on public.dossier_contacts
  as restrictive for all to authenticated
  using (not public.incident_hors_portefeuille(organization_id, incident_id))
  with check (not public.incident_hors_portefeuille(organization_id, incident_id));

drop policy if exists intervention_rappels_agent_portefeuille on public.intervention_rappels;
create policy intervention_rappels_agent_portefeuille on public.intervention_rappels
  as restrictive for all to authenticated
  using (not public.intervention_hors_portefeuille(organization_id, intervention_id))
  with check (not public.intervention_hors_portefeuille(organization_id, intervention_id));

-- ------------------------------------------------------ 8. Garde-fou
-- La migration échoue si une des tables visées reste sans cloison.
do $$
declare t text;
begin
  foreach t in array array['lot_pieces', 'lot_chambres', 'appels_charges', 'appel_charges_postes',
    'regularisations_charges', 'intentions_conge', 'edl_cles', 'edl_compteurs',
    'pieces_demandees', 'demandes_signature', 'cles_repartition', 'bien_infos_pratiques',
    'annonces', 'mouvements_mandants', 'reprise_soldes', 'dossier_contacts',
    'intervention_rappels'] loop
    if not exists (select 1 from pg_catalog.pg_policy p
                    where p.polrelid = ('public.' || t)::regclass and not p.polpermissive) then
      raise exception 'Cloison du portefeuille absente sur %', t;
    end if;
  end loop;
end $$;
