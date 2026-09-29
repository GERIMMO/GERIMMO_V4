-- Audit des flux de gestion du 29/09/2026 — charges, dépôt, mandats, EDL,
-- relances, réseau d'artisans, zone tendue.
--
-- Chaque fonction ci-dessous repart de sa DERNIÈRE définition connue
-- (pg_get_functiondef après la migration 20260928090000) :
--   regulariser_charges                    ← 20260909190000
--   regulariser_charges_avec_justificatif  ← 20260927183000
--   ajouter_retenue                        ← 20260909190000
--   controler_mise_en_location             ← 20260911120000
--   signer_edl                             ← 20260909190000
--   enregistrer_grille_edl                 ← 20260731_sprint4_edl_fondation
--   relances_loyer_dues                    ← 20260927105000
--   reseau_nom_commune / reseau_controler_commune_bien ← 20260928081000
--   figer_zone_tendue_bail / enregistrer_conge / mon_bail_locataire ← 20260927103000
--
-- Sections :
--   1. Régularisation : colocation à contrats individuels (quote-part par
--      chambre), prescription triennale (art. 7-1), régularisation tardive
--      payable par douzièmes (art. 23 al. 5).
--   2. Retenue sans EDL d'entrée : présomption de l'art. 1731 C. civ.
--   3. Agence : pas de location ni d'encaissement sans mandat en cours.
--   4. EDL : la signature exige une preuve (PDF signé ou constat).
--   5. Relances : seuil minimal, information de la caution, plan d'apurement.
--   6. Réseau d'artisans : communes tolérantes, adresse corrigée sans perte.
--   7. Zone tendue inconnue : jamais « non » par défaut.

-- ============================================================
-- 1. RÉGULARISATION DES CHARGES
-- ============================================================
-- 1a. Colocation à contrats individuels : chaque contrat recevait les charges
--     du logement ENTIER (v_reel := charges_recuperables_exercice(lot)) —
--     trois contrats × 1 200 € = 3 600 € réclamés pour 1 200 € de charges.
--     Clé retenue : la surface de la chambre sur la surface cumulée des
--     chambres du logement (parts égales si aucune surface n'est connue). La
--     part d'une chambre vacante reste au bailleur (charges d'un local non
--     occupé). Le prorata des jours d'occupation s'applique ensuite.
-- 1b. Prescription : art. 7-1 loi 89-462 — toute action dérivant du bail se
--     prescrit par trois ans. Un complément réclamé pour un exercice clos
--     depuis plus de trois ans est refusé ; un trop-perçu à rendre reste
--     possible (le bailleur peut toujours rembourser).
-- 1c. Régularisation tardive : art. 23 al. 5 — faite après le terme de
--     l'année civile suivant l'exercice, le locataire peut payer le
--     complément par douzièmes. Option p_etaler : douze échéances mensuelles
--     conservées avec la régularisation (colonne etalement_12_mois).
alter table public.regularisations_charges
  add column if not exists quote_part_colocation numeric
    check (quote_part_colocation is null or (quote_part_colocation > 0 and quote_part_colocation <= 1)),
  add column if not exists tardive boolean not null default false,
  add column if not exists etalement_12_mois jsonb;
comment on column public.regularisations_charges.quote_part_colocation is
  'Contrat individuel de colocation : part du logement retenue (surface de la chambre / surface des chambres), avant prorata des jours.';
comment on column public.regularisations_charges.tardive is
  'Régularisation faite après le 31/12 de l''année suivant l''exercice : le locataire peut demander le paiement par douzièmes (art. 23 loi 89-462).';
comment on column public.regularisations_charges.etalement_12_mois is
  'Échéancier du complément sur 12 mois ([{rang, echeance, montant}]) quand le locataire a demandé l''étalement.';

drop function if exists public.regulariser_charges_avec_justificatif(uuid, integer, numeric, text, text, text, bigint, text);
drop function if exists public.regulariser_charges(uuid, integer, numeric, uuid, text);

create function public.regulariser_charges(p_bail uuid, p_annee integer, p_charges_reelles numeric, p_justificatif uuid, p_note text default null::text, p_etaler boolean default false)
returns numeric
language plpgsql security definer set search_path to '' as $$
declare v_org uuid; v_lot uuid; v_mode text; v_copro boolean; v_chambre uuid;
        v_debut date; v_fin date; v_jours integer; v_jours_annee integer;
        v_reel numeric; v_prov numeric; v_ecart numeric; v_nb integer;
        v_part numeric; v_surf_chambre numeric; v_surf_total numeric; v_nb_chambres integer;
        v_tardive boolean; v_etalement jsonb; v_du numeric; v_base numeric; v_k integer;
        v_premier_mois date;
begin
  select b.organization_id, b.lot_id, b.charges_mode, b.chambre_id,
         greatest(coalesce(b.date_debut, make_date(p_annee, 1, 1)), make_date(p_annee, 1, 1)),
         least(coalesce(b.date_fin, make_date(p_annee, 12, 31)), make_date(p_annee, 12, 31))
    into v_org, v_lot, v_mode, v_chambre, v_debut, v_fin
    from public.baux b where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_mode = 'forfait' then
    raise exception 'Charges au forfait : aucune régularisation n''est possible, le forfait est définitif (RM-3.9.8)';
  end if;
  if p_justificatif is null then
    raise exception 'Un justificatif est obligatoire pour la régularisation (décompte remis au locataire)';
  end if;
  if p_annee is null or p_annee > extract(year from current_date)::integer then
    raise exception 'Exercice invalide : on ne régularise qu''un exercice commencé';
  end if;
  -- RM-3.9.7 : une régularisation émise ne se modifie jamais
  if exists (select 1 from public.regularisations_charges
             where bail_id = p_bail and annee = p_annee) then
    raise exception 'Une régularisation existe déjà pour l''exercice % — émise, elle ne se modifie plus (la rectificative arrive avec un prochain chantier)', p_annee;
  end if;

  select coalesce(bi.copropriete, false) into v_copro
    from public.lots l join public.biens bi on bi.id = l.bien_id where l.id = v_lot;

  if v_copro then
    select count(*) into v_nb from public.appels_charges
      where lot_id = v_lot and exercice = p_annee and statut in ('ventile', 'fige');
    if v_nb = 0 then
      raise exception 'Régularisation bloquée : aucun appel de charges saisi et ventilé pour l''exercice % (RM-3.9.2)', p_annee;
    end if;
    v_reel := public.charges_recuperables_exercice(v_lot, p_annee);
  else
    if p_charges_reelles is null or p_charges_reelles < 0 then raise exception 'Charges réelles invalides'; end if;
    v_reel := p_charges_reelles;
  end if;

  -- Audit 29/09 (1a) : un contrat individuel ne porte que la part de SA
  -- chambre — surface de la chambre / surface cumulée des chambres du
  -- logement ; parts égales si aucune surface n'est connue.
  if v_chambre is not null then
    select c.surface_m2 into v_surf_chambre from public.lot_chambres c where c.id = v_chambre;
    select sum(c.surface_m2), count(*) into v_surf_total, v_nb_chambres
      from public.lot_chambres c where c.lot_id = v_lot;
    if coalesce(v_surf_total, 0) > 0 and coalesce(v_surf_chambre, 0) > 0 then
      v_part := v_surf_chambre / v_surf_total;
    else
      v_part := 1.0 / greatest(coalesce(v_nb_chambres, 0), 1);
    end if;
    v_reel := v_reel * v_part;
  end if;

  -- RM-3.9.1 : la quote-part du locataire suit ses jours d'occupation
  v_jours := greatest(0, v_fin - v_debut + 1);
  v_jours_annee := make_date(p_annee, 12, 31) - make_date(p_annee, 1, 1) + 1;
  if v_jours = 0 then
    raise exception 'Le bail ne couvre aucun jour de l''exercice %', p_annee;
  end if;
  v_reel := round(v_reel * v_jours / v_jours_annee, 2);

  v_prov := public.provisions_charges_annee(p_bail, p_annee);
  v_ecart := round(v_prov - v_reel, 2);

  -- Audit 29/09 (1b) : prescription triennale (art. 7-1 loi 89-462)
  if v_ecart < 0 and make_date(p_annee, 12, 31) < (current_date - interval '3 years')::date then
    raise exception 'Exercice % prescrit : un complément de charges ne se réclame plus au-delà de trois ans (art. 7-1 loi du 6 juillet 1989). Seul un trop-perçu peut encore être rendu au locataire', p_annee;
  end if;

  -- Audit 29/09 (1c) : régularisation tardive, paiement par douzièmes
  v_tardive := current_date > make_date(p_annee + 1, 12, 31);
  if coalesce(p_etaler, false) then
    if not v_tardive then
      raise exception 'L''étalement sur 12 mois est réservé à une régularisation tardive (faite après le 31/12/%) : art. 23 loi du 6 juillet 1989', p_annee + 1;
    end if;
    if v_ecart >= 0 then
      raise exception 'Aucun complément à étaler : la régularisation ne met rien à la charge du locataire';
    end if;
    v_du := -v_ecart;
    v_base := trunc(v_du * 100 / 12) / 100;
    v_premier_mois := (date_trunc('month', current_date) + interval '1 month')::date;
    v_etalement := '[]'::jsonb;
    for v_k in 1..12 loop
      v_etalement := v_etalement || jsonb_build_array(jsonb_build_object(
        'rang', v_k,
        'echeance', (v_premier_mois + ((v_k - 1) || ' months')::interval)::date,
        'montant', case when v_k < 12 then v_base else round(v_du - v_base * 11, 2) end));
    end loop;
  end if;

  insert into public.regularisations_charges
    (organization_id, bail_id, annee, provisions, charges_reelles, ecart, justificatif_document, note,
     quote_part_colocation, tardive, etalement_12_mois)
  values (v_org, p_bail, p_annee, v_prov, v_reel, v_ecart, p_justificatif, p_note,
          case when v_chambre is not null then round(v_part, 6) end, v_tardive, v_etalement);

  if v_copro then
    update public.appels_charges set statut = 'fige'
      where lot_id = v_lot and exercice = p_annee and statut = 'ventile';
  end if;
  return v_ecart;
end $$;
revoke execute on function public.regulariser_charges(uuid, integer, numeric, uuid, text, boolean) from public, anon;
grant execute on function public.regulariser_charges(uuid, integer, numeric, uuid, text, boolean) to authenticated, service_role;

create function public.regulariser_charges_avec_justificatif(
  p_bail uuid, p_annee integer, p_charges_reelles numeric, p_note text,
  p_storage_path text, p_mime text, p_taille bigint, p_empreinte text, p_etaler boolean default false)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare v_org uuid; v_doc uuid;
begin
  select organization_id into v_org from public.baux where id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  v_doc := public.creer_fiche_justificatif(
    v_org, 'Décompte de charges ' || p_annee, p_storage_path, p_mime, p_taille, p_empreinte);
  -- Si `regulariser_charges` refuse, son exception annule aussi la fiche.
  return public.regulariser_charges(p_bail, p_annee, p_charges_reelles, v_doc, p_note, p_etaler);
end $function$;
revoke execute on function public.regulariser_charges_avec_justificatif(uuid, integer, numeric, text, text, text, bigint, text, boolean)
  from public, anon;
grant execute on function public.regulariser_charges_avec_justificatif(uuid, integer, numeric, text, text, text, bigint, text, boolean)
  to authenticated;

-- ============================================================
-- 2. RETENUE SANS EDL D'ENTRÉE — art. 1731 du Code civil
-- ============================================================
-- La règle « sans EDL d'entrée, aucune retenue » était fausse : à défaut
-- d'état des lieux, le preneur est PRÉSUMÉ avoir reçu le logement en bon état
-- de réparations locatives (art. 1731 C. civ.), sauf preuve contraire — et
-- sauf si c'est le bailleur qui a fait obstacle à l'état des lieux (art. 3-2
-- loi 89-462). Une retenue reste donc possible, mais uniquement JUSTIFIÉE
-- (devis, facture, constat) ; le décompte garde la mention « sans EDL
-- d'entrée » (restitutions.sans_edl_entree).
create or replace function public.ajouter_retenue(p_restitution uuid, p_libelle text, p_cout numeric, p_duree_vie numeric, p_age numeric, p_justificatif uuid default null::uuid)
returns numeric
language plpgsql security definer set search_path to '' as $$
declare v record; v_montant numeric; v_retenue uuid;
begin
  select * into v from public.restitutions where id = p_restitution;
  if v.id is null then raise exception 'Restitution introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'finalise' then raise exception 'Décompte finalisé — plus de retenue possible'; end if;
  if v.sans_edl_entree and p_justificatif is null then
    raise exception 'Sans état des lieux d''entrée, une retenue doit être justifiée (devis, facture ou constat) : le locataire est présumé avoir reçu le logement en bon état (art. 1731 du Code civil), présomption qui ne joue pas si le bailleur a fait obstacle à l''état des lieux';
  end if;
  if p_cout is null or p_cout <= 0 then raise exception 'Coût de remise en état invalide'; end if;
  if p_age is not null and p_age < 0 then raise exception 'Âge de l''élément invalide'; end if;

  if p_duree_vie is null or p_duree_vie <= 0 or p_age is null then
    v_montant := round(p_cout, 2);
  else
    if p_age >= p_duree_vie then
      raise exception 'Élément entièrement amorti (% ans sur % ans) : aucune retenue possible (RM-2.4.5)',
        p_age, p_duree_vie;
    end if;
    v_montant := round(p_cout * ((p_duree_vie - p_age) / p_duree_vie), 2);
  end if;

  insert into public.retenues
    (organization_id, restitution_id, libelle, cout, duree_vie_ans, age_ans, montant_retenu,
     justificatif_document, sans_justificatif)
  values (v.organization_id, p_restitution, p_libelle, p_cout, p_duree_vie, p_age, v_montant,
          p_justificatif, p_justificatif is null)
  returning id into v_retenue;

  if p_justificatif is null then
    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (v.organization_id, 'retenue_sans_justificatif', 'normale',
            'Retenue sans justificatif — difficilement défendable',
            jsonb_build_object('retenue_id', v_retenue, 'restitution_id', p_restitution,
                               'libelle', p_libelle, 'montant', v_montant));
  end if;
  return v_montant;
end $$;

-- ============================================================
-- 3. AGENCE : PAS DE LOCATION NI D'ENCAISSEMENT SANS MANDAT EN COURS
-- ============================================================
-- Une agence (organizations.type = 'agence') gère pour le compte d'autrui :
-- sans mandat écrit en cours (loi Hoguet, art. 6), elle ne peut ni donner le
-- lot à bail ni encaisser des fonds. Le propriétaire direct n'est pas visé.
-- « En cours » : mandat actif ou en préavis, ligne du lot non close.
create or replace function public.lot_couvert_par_mandat(p_lot uuid)
returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.mandat_lignes ml
    join public.mandats m on m.id = ml.mandat_id and m.organization_id = ml.organization_id
    where ml.lot_id = p_lot
      and m.etat in ('actif', 'preavis')
      and (ml.date_fin is null or ml.date_fin >= current_date)
  );
$$;
-- Prédicat interne (aucun contrôle d'appartenance) : appelé par les seules
-- fonctions definer ci-dessous, jamais exposé à l'API.
revoke execute on function public.lot_couvert_par_mandat(uuid) from public, anon, authenticated;
grant execute on function public.lot_couvert_par_mandat(uuid) to service_role;

create or replace function public.controler_mise_en_location(p_bail uuid)
returns void
language plpgsql security definer set search_path to '' as $$
declare
  v record;
  v_lot record;
  v_blocages text[];
  v_mentions text[];
  v_plafond numeric;
begin
  select * into v from public.baux where id = p_bail;
  perform 1 from public.lots where id = v.lot_id for update;
  if not found then raise exception 'Bail introuvable'; end if;

  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'brouillon' then
    raise exception 'Seul un bail en brouillon peut être activé';
  end if;

  -- Mentions obligatoires du contrat : sans elles, le bail activé est un bail
  -- faux — appels de loyer à 0 €, prorata d'entrée arbitraire, dépôt sans plafond
  -- opposable (wiki « Mentions obligatoires du bail »).
  v_mentions := public.bail_mentions_manquantes_valeurs(v.locataire_principal, v.date_debut, v.loyer_hc);
  if array_length(v_mentions, 1) > 0 then
    raise exception 'Mentions obligatoires du bail manquantes : % — à compléter dans le brouillon avant de déposer le bail signé',
      array_to_string(v_mentions, ' ; ');
  end if;

  if v.depot_garantie is not null then
    v_plafond := public.plafond_depot_mois(v.type::text, v.lot_id) * v.loyer_hc;
    if v.depot_garantie > v_plafond then
      raise exception 'Dépôt de garantie trop élevé : maximum % mois de loyer hors charges (soit % €)',
        public.plafond_depot_mois(v.type::text, v.lot_id), v_plafond;
    end if;
  end if;

  -- Audit 29/09 : une agence ne loue qu'un lot confié par un mandat en cours.
  if (select o.type from public.organizations o where o.id = v.organization_id) = 'agence'
     and not public.lot_couvert_par_mandat(v.lot_id) then
    raise exception 'Mise en location refusée : aucun mandat de gestion en cours ne couvre ce lot. Une agence ne peut ni louer ni encaisser pour le compte d''un propriétaire sans mandat écrit (loi Hoguet, art. 6) — faites signer et activez le mandat, puis réessayez';
  end if;

  -- Un seul bail actif par lot ; le brouillon suivant attend la fin du précédent
  if exists (
    select 1 from public.baux b
    where b.lot_id = v.lot_id and b.id <> p_bail and b.etat in ('actif', 'preavis')
      and (v.chambre_id is null or b.chambre_id is null or b.chambre_id = v.chambre_id)
  ) then
    raise exception 'Un bail est déjà en cours sur ce lot : il doit être terminé avant de déposer celui-ci';
  end if;

  select * into v_lot from public.lots where id = v.lot_id;
  if v_lot.etat <> 'disponible' and not (v.chambre_id is not null and v_lot.etat in ('loue','preavis')) then
    raise exception 'Le lot doit être « disponible » pour être loué (actuel : %)', v_lot.etat;
  end if;

  v_blocages := public.lot_blocages_location(v.lot_id);
  if array_length(v_blocages, 1) > 0 then
    raise exception 'Mise en location bloquée : %', array_to_string(v_blocages, ' ; ');
  end if;
end;
$$;

-- Encaissements (loyers et dépôt) saisis depuis l'application par une agence.
-- Les écritures d'administration de la base (reprise, maintenance) ne sont
-- pas visées : même périmètre que garde_document_fichier_depose.
create or replace function public.encaissement_exige_mandat()
returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_lot uuid; v_type public.organization_type;
begin
  if coalesce(current_setting('role', true), 'none') not in ('authenticated', 'anon') then
    return new;
  end if;
  select o.type into v_type from public.organizations o where o.id = new.organization_id;
  if v_type is distinct from 'agence' then return new; end if;
  select b.lot_id into v_lot from public.baux b where b.id = new.bail_id;
  if v_lot is not null and not public.lot_couvert_par_mandat(v_lot) then
    raise exception 'Encaissement refusé : aucun mandat de gestion en cours ne couvre ce lot. Une agence n''encaisse pas de fonds pour un propriétaire sans mandat écrit (loi Hoguet, art. 6) — activez le mandat du propriétaire avant d''enregistrer ce paiement';
  end if;
  return new;
end $$;
revoke execute on function public.encaissement_exige_mandat() from public, anon, authenticated;

drop trigger if exists encaissements_exige_mandat on public.encaissements;
create trigger encaissements_exige_mandat
  before insert on public.encaissements
  for each row execute function public.encaissement_exige_mandat();
drop trigger if exists depot_encaissements_exige_mandat on public.depot_encaissements;
create trigger depot_encaissements_exige_mandat
  before insert on public.depot_encaissements
  for each row execute function public.encaissement_exige_mandat();

-- ============================================================
-- 4. EDL : LA SIGNATURE EXIGE SA PREUVE
-- ============================================================
-- Un clic de l'agent figeait l'EDL « signé ». L'état des lieux est établi
-- contradictoirement par les parties (art. 3-2 loi 89-462) ou, à défaut, par
-- un commissaire de justice : sa signature s'appuie désormais sur une pièce
-- déposée en GED — le PDF signé par les parties, ou le constat du commissaire
-- de justice. terminer_bail continue de lire etat = 'signe'.
alter table public.etats_des_lieux
  add column if not exists signature_mode text
    check (signature_mode is null or signature_mode in ('pdf_signe', 'constat_commissaire')),
  add column if not exists preuve_signature_document uuid;
alter table public.etats_des_lieux drop constraint if exists edl_preuve_signature_meme_org_fk;
alter table public.etats_des_lieux
  add constraint edl_preuve_signature_meme_org_fk
  foreign key (preuve_signature_document, organization_id) references public.documents(id, organization_id);
create index if not exists etats_des_lieux_preuve_signature_idx
  on public.etats_des_lieux (preuve_signature_document, organization_id);
comment on column public.etats_des_lieux.signature_mode is
  'Preuve de la signature : pdf_signe (EDL signé par les parties) ou constat_commissaire (constat de commissaire de justice).';

drop function if exists public.enregistrer_grille_edl(uuid, jsonb, boolean);
drop function if exists public.signer_edl(uuid);

create function public.signer_edl(p_edl uuid, p_mode text, p_document uuid)
returns void
language plpgsql security definer set search_path to '' as $$
declare
  v record;
  v_bail_etat public.bail_etat;
  v_manquantes int;
  v_total int;
begin
  select * into v from public.etats_des_lieux where id = p_edl;
  if not found then raise exception 'EDL introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat = 'signe' then raise exception 'EDL déjà signé'; end if;
  if p_mode is null or p_mode not in ('pdf_signe', 'constat_commissaire') then
    raise exception 'Indiquez la preuve de signature : état des lieux signé par les parties, ou constat de commissaire de justice';
  end if;
  if p_document is null then
    raise exception 'Preuve de signature obligatoire : déposez l''état des lieux signé par les deux parties (ou le constat du commissaire de justice) avant de le figer';
  end if;
  if not exists (select 1 from public.documents d
                  where d.id = p_document and d.organization_id = v.organization_id
                    and d.purged_at is null and d.storage_path is not null) then
    raise exception 'Preuve de signature introuvable dans les documents de l''organisation';
  end if;
  select b.etat into v_bail_etat from public.baux b where b.id = v.bail_id;
  if v.type = 'sortie' and v_bail_etat not in ('preavis', 'termine') then
    raise exception 'Un état des lieux de sortie se signe pendant le préavis — enregistrez d''abord le congé';
  end if;

  select count(*) filter (where etat is null), count(*)
    into v_manquantes, v_total
  from public.edl_lignes where edl_id = p_edl;
  if v_total = 0 then
    raise exception 'Grille vide : générez la grille avant de signer';
  end if;
  if v_manquantes > 0 then
    raise exception 'Aucune ligne ne peut rester sans état (% à compléter)', v_manquantes;
  end if;

  update public.etats_des_lieux
     set etat = 'signe', signe_le = now(),
         signature_mode = p_mode, preuve_signature_document = p_document
   where id = p_edl;
  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (p_document, v.organization_id, 'bail', v.bail_id)
  on conflict (document_id, entite, entite_id) do nothing;
end;
$$;
revoke execute on function public.signer_edl(uuid, text, uuid) from public, anon;
grant execute on function public.signer_edl(uuid, text, uuid) to authenticated, service_role;

create function public.enregistrer_grille_edl(p_edl uuid, p_lignes jsonb, p_signer boolean default false, p_mode text default null, p_document uuid default null)
returns void
language plpgsql security definer set search_path to '' as $$
declare v record; l record; v_etat public.etat_element;
begin
  select * into v from public.etats_des_lieux where id = p_edl;
  if not found then raise exception 'EDL introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat = 'signe' then
    raise exception 'EDL signé : les lignes sont figées';
  end if;

  for l in select * from jsonb_to_recordset(p_lignes)
           as x(id uuid, etat text, commentaire text)
  loop
    if nullif(l.etat, '') is null then
      v_etat := null;
    elsif l.etat in ('neuf', 'bon', 'usage', 'mauvais', 'absent') then
      v_etat := l.etat::public.etat_element;
    else
      raise exception 'État « % » inconnu — valeurs possibles : neuf, bon, usagé, mauvais, absent', l.etat;
    end if;
    update public.edl_lignes
       set etat = v_etat, commentaire = nullif(l.commentaire, '')
     where id = l.id and edl_id = p_edl;
  end loop;

  if p_signer then
    perform public.signer_edl(p_edl, p_mode, p_document);
  end if;
end $$;
revoke execute on function public.enregistrer_grille_edl(uuid, jsonb, boolean, text, uuid) from public, anon;
grant execute on function public.enregistrer_grille_edl(uuid, jsonb, boolean, text, uuid) to authenticated, service_role;

-- La pièce naît dans la transaction de la signature (même principe que
-- creer_fiche_justificatif, 20260927183000) : un refus ne laisse rien en GED.
create function public.creer_fiche_preuve_edl(p_org uuid, p_mode text, p_storage_path text, p_mime text, p_taille bigint, p_empreinte text)
returns uuid
language plpgsql security definer set search_path to '' as $$
declare v_doc uuid;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  perform public.controler_fichier_ged(p_org, p_storage_path, p_mime);
  begin
    insert into public.documents
      (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, deposited_by)
    values
      (p_org, 'etat_des_lieux',
       case when p_mode = 'constat_commissaire' then 'Constat de commissaire de justice — état des lieux'
            else 'État des lieux signé par les parties' end,
       p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()))
    returning id into v_doc;
  exception when unique_violation then
    raise exception 'Un fichier au contenu strictement identique existe déjà dans la GED';
  end;
  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, p_org, 'organisation', p_org);
  return v_doc;
end $$;
revoke execute on function public.creer_fiche_preuve_edl(uuid, text, text, text, bigint, text) from public, anon, authenticated;

create function public.signer_edl_avec_preuve(p_edl uuid, p_mode text, p_storage_path text, p_mime text, p_taille bigint, p_empreinte text)
returns void
language plpgsql security definer set search_path to '' as $$
declare v_org uuid; v_doc uuid;
begin
  select organization_id into v_org from public.etats_des_lieux where id = p_edl;
  if v_org is null then raise exception 'EDL introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  v_doc := public.creer_fiche_preuve_edl(v_org, p_mode, p_storage_path, p_mime, p_taille, p_empreinte);
  perform public.signer_edl(p_edl, p_mode, v_doc);
end $$;
revoke execute on function public.signer_edl_avec_preuve(uuid, text, text, text, bigint, text) from public, anon;
grant execute on function public.signer_edl_avec_preuve(uuid, text, text, text, bigint, text) to authenticated;

create function public.enregistrer_grille_edl_avec_preuve(p_edl uuid, p_lignes jsonb, p_mode text, p_storage_path text, p_mime text, p_taille bigint, p_empreinte text)
returns void
language plpgsql security definer set search_path to '' as $$
declare v_org uuid; v_doc uuid;
begin
  select organization_id into v_org from public.etats_des_lieux where id = p_edl;
  if v_org is null then raise exception 'EDL introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  v_doc := public.creer_fiche_preuve_edl(v_org, p_mode, p_storage_path, p_mime, p_taille, p_empreinte);
  perform public.enregistrer_grille_edl(p_edl, p_lignes, true, p_mode, v_doc);
end $$;
revoke execute on function public.enregistrer_grille_edl_avec_preuve(uuid, jsonb, text, text, text, bigint, text) from public, anon;
grant execute on function public.enregistrer_grille_edl_avec_preuve(uuid, jsonb, text, text, text, bigint, text) to authenticated;

-- La politique edl_update laisse l'API écrire la table : sans ce garde, un
-- PATCH « etat = signe » contournait signer_edl. Même périmètre que
-- garde_document_fichier_depose (écritures venues de l'API).
create or replace function public.edl_signature_exige_preuve()
returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'UPDATE' and old.etat = 'signe'
     and (new.signature_mode is distinct from old.signature_mode
          or new.preuve_signature_document is distinct from old.preuve_signature_document) then
    raise exception 'État des lieux signé : sa preuve de signature est figée';
  end if;
  if new.etat = 'signe' and (tg_op = 'INSERT' or old.etat is distinct from 'signe')
     and (new.signature_mode is null or new.preuve_signature_document is null)
     and coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon') then
    raise exception 'Un état des lieux ne se signe qu''avec sa preuve : état des lieux signé par les parties, ou constat de commissaire de justice';
  end if;
  return new;
end $$;
revoke execute on function public.edl_signature_exige_preuve() from public, anon, authenticated;
drop trigger if exists edl_signature_exige_preuve_trg on public.etats_des_lieux;
create trigger edl_signature_exige_preuve_trg
  before insert or update on public.etats_des_lieux
  for each row execute function public.edl_signature_exige_preuve();

-- ============================================================
-- 5. RELANCES AUTOMATIQUES
-- ============================================================
-- 5a. Seuil minimal : un reliquat de quelques centimes déclenchait relance 1
--     puis relance 2. Réglage d'organisation, 5 € par défaut.
-- 5b. Caution : au niveau 2, la caution du bail (bail_personnes.role =
--     'garant', e-mail renseigné) est informée de la défaillance (art. 2303 du
--     Code civil, information de la caution personne physique dès le premier
--     incident de paiement non régularisé dans le mois). La fonction rend
--     `garants` (vide hors niveau 2) et `locataire` (nom affiché).
-- 5c. Plan d'apurement : AUCUNE table ne le porte (seul le document
--     « protocole_apurement » existe, sans échéancier en base) — la
--     suspension des relances pendant un plan n'est pas implémentable ici.
alter table public.organizations
  add column if not exists relance_seuil_montant numeric(10,2) not null default 5
    check (relance_seuil_montant >= 0 and relance_seuil_montant <= 1000);
comment on column public.organizations.relance_seuil_montant is
  'Relances automatiques : dette échue totale minimale (€) pour relancer. 5 € par défaut.';

drop function if exists public.relances_loyer_dues(integer);
create function public.relances_loyer_dues(p_limite integer default 200)
 returns table(bail_id uuid, organization_id uuid, niveau text, destinataire text, prenom text, emetteur text, lot text, periode date, date_echeance date, reste numeric, jours_retard integer, total_du numeric, autres_destinataires text[], garants text[], locataire text)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  return query
  with candidats as (
    select
      b.id as bail_id,
      b.organization_id,
      o.name as emetteur,
      o.relance_1_jours,
      o.relance_2_jours,
      o.relance_seuil_montant,
      l.nom as lot,
      loc.email as destinataire,
      loc.prenom,
      btrim(coalesce(loc.prenom, '') || ' ' || coalesce(loc.nom, '')) as locataire,
      -- Audit 27/09 : en colocation, chaque colocataire titulaire reçoit le
      -- courrier (wiki [[Relances et mise en demeure]]).
      array(
        select distinct btrim(p.email)
          from public.bail_personnes bp join public.persons p on p.id = bp.person_id
         where bp.bail_id = b.id and bp.role = 'colocataire'
           and p.id is distinct from b.locataire_principal
           and (bp.date_solidarite_fin is null or bp.date_solidarite_fin >= current_date)
           and p.email is not null and length(btrim(p.email)) > 0
           and lower(btrim(p.email)) <> lower(btrim(loc.email))
      ) as autres_destinataires,
      -- Audit 29/09 : la caution du bail, informée au niveau 2.
      array(
        select distinct btrim(p.email)
          from public.bail_personnes bp join public.persons p on p.id = bp.person_id
         where bp.bail_id = b.id and bp.role = 'garant'
           and (bp.date_solidarite_fin is null or bp.date_solidarite_fin >= current_date)
           and p.email is not null and length(btrim(p.email)) > 0
           and lower(btrim(p.email)) <> lower(btrim(loc.email))
      ) as garants,
      x.periode,
      x.date_echeance,
      round(x.montant_du - x.montant_couvert, 2) as reste,
      (current_date - x.date_echeance)::integer as jours_retard,
      (select round(coalesce(sum(t.montant_du - t.montant_couvert), 0), 2)
         from public.etat_loyers_bail_brut(b.id) t
        where t.montant_couvert < t.montant_du and t.date_echeance < current_date) as total_du
    from public.baux b
    join public.organizations o on o.id = b.organization_id
    join public.lots l on l.id = b.lot_id
    join public.persons loc on loc.id = b.locataire_principal
    cross join lateral (
      -- Le terme impayé le plus ancien : c'est lui qu'on relance.
      select e.periode, e.date_echeance, e.montant_du, e.montant_couvert
      from public.etat_loyers_bail_brut(b.id) e
      where e.montant_couvert < e.montant_du
        and e.date_echeance < current_date
      order by e.periode
      limit 1
    ) x
    where b.etat in ('actif', 'preavis')
      and o.relances_envoi_auto
      and public.org_ecriture_ouverte(o.id)
      and loc.email is not null and length(btrim(loc.email)) > 0
  ), niveaux as (
    select
      c.*,
      exists (
        select 1 from public.relances r
        where r.bail_id = c.bail_id and r.date_envoi >= c.date_echeance
          and r.niveau = 'relance_1'
      ) as a_relance_1,
      exists (
        select 1 from public.relances r
        where r.bail_id = c.bail_id and r.date_envoi >= c.date_echeance
          and r.niveau in ('relance_2', 'mise_en_demeure')
      ) as a_relance_2,
      exists (
        select 1 from public.relances r
        where r.bail_id = c.bail_id and r.date_envoi = current_date
      ) as relance_du_jour
    from candidats c
  )
  select
    n.bail_id,
    n.organization_id,
    case when not n.a_relance_1 then 'relance_1' else 'relance_2' end as niveau,
    n.destinataire,
    n.prenom,
    n.emetteur,
    n.lot,
    n.periode,
    n.date_echeance,
    n.reste,
    n.jours_retard,
    n.total_du,
    n.autres_destinataires,
    case when n.a_relance_1 then n.garants else '{}'::text[] end as garants,
    n.locataire
  from niveaux n
  where not n.relance_du_jour
    -- Audit 29/09 : pas de relance pour un reliquat sous le seuil.
    and n.total_du >= n.relance_seuil_montant
    and (
      (not n.a_relance_1 and n.jours_retard >= n.relance_1_jours)
      or (n.a_relance_1 and not n.a_relance_2 and n.jours_retard >= n.relance_2_jours)
    )
  order by n.date_echeance, n.bail_id
  limit greatest(1, least(p_limite, 500));
end;
$function$;
revoke execute on function public.relances_loyer_dues(integer) from public, anon, authenticated;
grant execute on function public.relances_loyer_dues(integer) to service_role;

-- ============================================================
-- 6. RÉSEAU D'ARTISANS — COMMUNE DU BIEN
-- ============================================================
-- 6a. Nom de commune tolérant : casse, accents, tirets, apostrophes,
--     ligatures (œ, æ), « St »/« Ste » pour « Saint »/« Sainte »,
--     arrondissement (« Paris 12e ») et « Cedex » ignorés.
create or replace function public.reseau_nom_commune(p_nom text) returns text
language sql immutable set search_path='' as $$
 select regexp_replace(
  regexp_replace(
   regexp_replace(
    regexp_replace(
     regexp_replace(
      lower(translate(
        replace(replace(replace(replace(coalesce(p_nom,''),'œ','oe'),'Œ','oe'),'æ','ae'),'Æ','ae'),
        'ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸàâäçéèêëîïôöùûüÿÁÍÓÚáíóúÑñ',
        'AAACEEEEIIOOUUUYaaaceeeeiioouuuyAIOUaiouNn')),
      '\s+cedex(\s*\d+)?\s*$', '', 'g'),
     '\s*\d+\s*(er|e|eme)?(\s*arrondissement)?\s*$', '', 'g'),
    '(^|[^a-z0-9])ste([^a-z0-9]|$)', '\1sainte\2', 'g'),
   '(^|[^a-z0-9])st([^a-z0-9]|$)', '\1saint\2', 'g'),
  '[^a-z0-9]', '', 'g');
$$;
revoke all on function public.reseau_nom_commune(text) from public,anon,authenticated;

-- 6b. Une correction d'adresse n'efface plus la commune confirmée tant
--     qu'elle reste cohérente (code postal desservi, même ville) ; elle ne
--     tombe que si l'adresse désigne désormais une autre commune.
create or replace function public.reseau_controler_commune_bien() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_coherente boolean;
begin
 if new.commune_insee is not null then
  v_coherente := exists (
   select 1 from public.reseau_communes c where c.code=new.commune_insee and new.postal_code=any(c.codes_postaux)
    and public.reseau_nom_commune(c.nom)=public.reseau_nom_commune(new.city)
    and length(trim(coalesce(new.address_line1,'')))>0 and length(trim(coalesce(new.city,'')))>0);
 else
  v_coherente := true;
 end if;
 if tg_op='UPDATE' and (new.address_line1,new.postal_code,new.city) is distinct from (old.address_line1,old.postal_code,old.city)
    and new.commune_insee is not distinct from old.commune_insee and not v_coherente then
  -- L'adresse désigne une autre commune : l'ancienne confirmation tombe.
  new.commune_insee:=null;
  return new;
 end if;
 if not v_coherente then
  raise exception 'Complétez l’adresse du bien et choisissez une commune correspondant à son code postal.';
 end if;
 return new;
end $$;
revoke all on function public.reseau_controler_commune_bien() from public,anon,authenticated;

-- ============================================================
-- 7. ZONE TENDUE INCONNUE
-- ============================================================
-- biens.zone_tendue valait « non » par défaut (NOT NULL DEFAULT false) : un
-- bien jamais qualifié passait pour hors zone tendue, et le préavis d'un mois
-- du locataire (art. 15 loi 89-462, de plein droit en zone tendue) exigeait
-- un justificatif. Aucun référentiel communal de zone tendue n'est en base
-- (lacune documentée au wiki). Choix protecteur du locataire :
--   · la zone d'un bien peut être « inconnue » (NULL) — les biens existants
--     gardent leur valeur ;
--   · le bail en garde la trace (NULL figé tant qu'elle n'est pas connue) et
--     une alerte « zone tendue à vérifier » naît à l'activation ;
--   · un congé du locataire à 1 mois sur un bail en zone inconnue est
--     ACCEPTÉ, marqué « à vérifier » (conges.zone_tendue_a_verifier) avec une
--     alerte — jamais refusé faute de justificatif.
alter table public.biens alter column zone_tendue drop not null;
alter table public.biens alter column zone_tendue drop default;
comment on column public.biens.zone_tendue is
  'Zone tendue (décret n° 2013-392) : vrai, faux, ou NULL = non vérifiée. Une zone inconnue ne vaut jamais « hors zone tendue ».';
alter table public.conges add column if not exists zone_tendue_a_verifier boolean not null default false;
comment on column public.conges.zone_tendue_a_verifier is
  'Congé du locataire à 1 mois accepté alors que la zone tendue du bail n''était pas renseignée : à vérifier (choix protecteur du locataire).';

create or replace function public.figer_zone_tendue_bail()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_bien boolean;
begin
  if tg_op = 'UPDATE' and old.etat is distinct from 'brouillon'::public.bail_etat then
    -- Bail engagé : la zone ne bouge plus (RM-1.1.7). Un bail dont la zone
    -- est encore inconnue reçoit sa valeur une fois.
    if old.zone_tendue is not null then
      if new.zone_tendue is distinct from old.zone_tendue then
        raise exception 'La zone tendue est figée au bail à sa signature (RM-1.1.7) : elle ne se modifie plus';
      end if;
      return new;
    end if;
  end if;
  select bi.zone_tendue into v_bien
    from public.lots l join public.biens bi on bi.id = l.bien_id
   where l.id = new.lot_id;
  -- Audit 29/09 : une zone inconnue reste inconnue (NULL), jamais « non ».
  new.zone_tendue := case
    when new.zone_honoraires in ('tres_tendue', 'tendue') then true
    when new.zone_honoraires = 'autre' then false
    else v_bien
  end;
  return new;
end;
$function$;

-- Alerte à l'activation d'un bail dont la zone tendue est inconnue.
create or replace function public.alerte_zone_tendue_inconnue()
returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.etat = 'actif' and old.etat = 'brouillon' and new.zone_tendue is null
     and not exists (select 1 from public.alerts a
                      where a.organization_id = new.organization_id and a.statut = 'ouverte'
                        and a.type = 'zone_tendue_a_verifier' and a.details ->> 'bail_id' = new.id::text) then
    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (new.organization_id, 'zone_tendue_a_verifier', 'normale',
            'Zone tendue non renseignée — préavis du locataire à vérifier',
            jsonb_build_object('bail_id', new.id, 'lot_id', new.lot_id));
  end if;
  return new;
end $$;
revoke execute on function public.alerte_zone_tendue_inconnue() from public, anon, authenticated;
drop trigger if exists baux_alerte_zone_tendue_inconnue on public.baux;
create trigger baux_alerte_zone_tendue_inconnue
  after update of etat on public.baux
  for each row execute function public.alerte_zone_tendue_inconnue();

create or replace function public.enregistrer_conge(p_bail uuid, p_par public.conge_par, p_date_presentation date, p_preavis_mois smallint, p_motif text default null::text, p_justificatif uuid default null::uuid, p_prix_vente numeric default null::numeric, p_beneficiaire text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_org uuid;
  v_lot uuid;
  v_type public.bail_type;
  v_etat public.bail_etat;
  v_zone boolean;
  v_meuble boolean;
  v_preavis smallint;
  v_effet date;
  v_conge uuid;
  v_debut date;
  v_etudiant boolean;
  v_duree_reduite text;
  v_duree interval;
  v_reconduction interval;
  v_terme date;
  v_k integer;
  v_zone_a_verifier boolean := false;
begin
  select b.organization_id, b.lot_id, b.type, b.etat,
         -- Audit 27/09 : la zone figée au bail (RM-1.10.7), pas celle du bien.
         -- Audit 29/09 : inconnue = NULL, jamais « non ».
         coalesce(b.zone_tendue, bi.zone_tendue),
         (b.type = 'meuble' or (b.type = 'colocation' and coalesce(l.meuble, false))),
         b.date_debut, coalesce(b.meuble_etudiant, false), nullif(btrim(coalesce(b.duree_reduite_evenement, '')), '')
    into v_org, v_lot, v_type, v_etat, v_zone, v_meuble, v_debut, v_etudiant, v_duree_reduite
  from public.baux b
  join public.lots l on l.id = b.lot_id
  join public.biens bi on bi.id = l.bien_id
  where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_etat <> 'actif' then raise exception 'Seul un bail actif peut recevoir un congé'; end if;

  if p_par = 'bailleur' then
    -- Préavis légal : 6 mois (nu/colocation nue) / 3 mois (meublé). Motif obligatoire.
    v_preavis := case when v_meuble then 3 else 6 end;
    if coalesce(btrim(p_motif), '') = '' then
      raise exception 'Congé du bailleur : le motif est obligatoire (reprise, vente ou motif légitime et sérieux) — sinon le congé est nul';
    end if;
    if btrim(p_motif) ilike 'reprise%' and coalesce(btrim(p_beneficiaire), '') = '' then
      raise exception 'Congé pour reprise : indiquez le bénéficiaire de la reprise (nom et lien avec le bailleur)';
    end if;
    if btrim(p_motif) ilike 'vente%' and (p_prix_vente is null or p_prix_vente <= 0) then
      raise exception 'Congé pour vente : le prix de vente proposé est obligatoire (le congé vaut offre de vente au locataire)';
    end if;
  else
    -- Locataire : meublé = 1 mois ; nu = 3 mois, ramené à 1 mois de plein droit
    -- en zone tendue, ou sur justificatif dérogatoire hors zone tendue.
    if v_meuble then
      v_preavis := 1;
    elsif v_zone then
      v_preavis := 1;   -- de plein droit, aucun justificatif exigible
    elsif v_zone is null and p_preavis_mois = 1 then
      -- Audit 29/09 : zone tendue inconnue — le préavis d'un mois est
      -- accepté (choix protecteur du locataire), à vérifier par le gérant.
      v_preavis := 1;
      v_zone_a_verifier := p_justificatif is null;
    elsif p_preavis_mois = 1 then
      if p_justificatif is null then
        raise exception 'Préavis réduit à 1 mois hors zone tendue : un justificatif est obligatoire (mutation, santé, perte d''emploi, RSA/AAH…)';
      end if;
      v_preavis := 1;
    else
      v_preavis := 3;
    end if;
  end if;

  v_effet := (p_date_presentation + (v_preavis || ' months')::interval)::date;

  -- Audit 27/09 : le congé du bailleur se donne pour le TERME du bail
  -- (wiki [[Bail]] § 1.11), avec le préavis complet avant ce terme.
  if p_par = 'bailleur' and v_debut is not null
     and not (not v_meuble and v_duree_reduite is not null) then
    if v_meuble then
      v_duree := case when v_etudiant then interval '9 months' else interval '1 year' end;
      v_reconduction := case when v_etudiant then null else interval '1 year' end;
    else
      v_duree := case when exists (
          select 1 from public.detentions d join public.persons p on p.id = d.person_id
           where d.lot_id = v_lot and d.date_fin is null)
        and not exists (
          select 1 from public.detentions d join public.persons p on p.id = d.person_id
           where d.lot_id = v_lot and d.date_fin is null
             and coalesce(p.qualite, 'Personne physique') = 'Personne physique')
        then interval '6 years' else interval '3 years' end;
      v_reconduction := v_duree;
    end if;
    v_k := 0;
    loop
      v_terme := (v_debut + v_duree + coalesce(v_reconduction * v_k, interval '0'))::date - 1;
      exit when v_terme >= p_date_presentation or v_reconduction is null or v_k > 200;
      v_k := v_k + 1;
    end loop;
    if v_terme < p_date_presentation then
      raise exception 'Congé du bailleur impossible : le bail étudiant a pris fin le % (il n''est jamais reconduit)',
        to_char(v_terme, 'DD/MM/YYYY');
    end if;
    if v_effet > v_terme + 1 then
      raise exception 'Congé du bailleur tardif : le bail arrive à son terme le %, le congé devait être reçu au plus tard le % (préavis de % mois). Reçu le %, il serait nul (wiki Bail § 1.11)',
        to_char(v_terme, 'DD/MM/YYYY'),
        to_char(((v_terme + 1) - (v_preavis || ' months')::interval)::date, 'DD/MM/YYYY'),
        v_preavis, to_char(p_date_presentation, 'DD/MM/YYYY');
    end if;
    v_effet := v_terme;
  end if;

  insert into public.conges
    (organization_id, bail_id, par, date_premiere_presentation, preavis_mois, date_effet,
     motif, justificatif_document, zone_tendue, prix_vente, beneficiaire_reprise, zone_tendue_a_verifier)
  values
    (v_org, p_bail, p_par, p_date_presentation, v_preavis, v_effet,
     nullif(btrim(coalesce(p_motif, '')), ''), p_justificatif, coalesce(v_zone, false),
     case when p_par = 'bailleur' and btrim(coalesce(p_motif, '')) ilike 'vente%' then p_prix_vente end,
     case when p_par = 'bailleur' and btrim(coalesce(p_motif, '')) ilike 'reprise%'
          then nullif(btrim(coalesce(p_beneficiaire, '')), '') end,
     v_zone_a_verifier)
  returning id into v_conge;

  update public.baux set etat = 'preavis', date_fin = v_effet, updated_at = now() where id = p_bail;
  update public.lots set etat = public.etat_location_du_lot(v_lot) where id = v_lot and etat in ('loue','preavis');

  update public.intentions_conge
     set traitee_le = now(), conge_id = v_conge
   where bail_id = p_bail and traitee_le is null;
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
         closed_action = 'Congé enregistré'
   where organization_id = v_org and statut = 'ouverte'
     and type = 'conge_intention' and (details ->> 'bail_id')::uuid = p_bail;

  insert into public.alerts (organization_id, type, criticite, titre, echeance, details)
  values (v_org, 'edl_sortie', 'normale', 'État des lieux de sortie à réaliser', v_effet,
          jsonb_build_object('bail_id', p_bail, 'lot_id', v_lot, 'date_effet', v_effet));

  if v_zone_a_verifier then
    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (v_org, 'zone_tendue_a_verifier', 'normale',
            'Congé à 1 mois accepté, zone tendue non renseignée — à vérifier',
            jsonb_build_object('bail_id', p_bail, 'lot_id', v_lot, 'conge_id', v_conge));
  end if;

  return v_conge;
end $function$;

-- L'espace locataire lit la même zone ; inconnue = NULL (l'écran le dit).
create or replace function public.mon_bail_locataire(p_org uuid)
 RETURNS TABLE(bail_id uuid, type bail_type, etat bail_etat, loyer_hc numeric, charges numeric, date_debut date, date_fin date, lot_nom text, document_signe uuid, charges_mode text, jour_echeance smallint, surface_m2 numeric, pieces integer, etage text, meuble boolean, adresse text, ville text, zone_tendue boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select b.id, b.type, b.etat, b.loyer_hc, b.charges, b.date_debut, b.date_fin,
         l.nom, b.document_signe, b.charges_mode, b.jour_echeance,
         l.surface_m2, l.pieces, l.etage, l.meuble,
         bi.address_line1 || ', ' || bi.postal_code || ' ' || bi.city,
         bi.city,
         coalesce(b.zone_tendue, bi.zone_tendue)
  from public.baux b
  join public.lots l on l.id = b.lot_id
  join public.biens bi on bi.id = l.bien_id
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis')
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status = 'active')
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by b.created_at desc;
$function$;

select public.fermer_fonctions_a_anon();
