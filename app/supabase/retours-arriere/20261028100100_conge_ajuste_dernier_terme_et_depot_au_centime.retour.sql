-- RETOUR ARRIÈRE de 20261028100100_conge_ajuste_dernier_terme_et_depot_au_centime.sql (audit final du 27/10 : LOY-01, LOY-V01, COD-03).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une migration, il se
-- joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Une seule transaction : la moindre erreur annule tout.
--
-- Défait : rend à `enregistrer_conge` son texte de 20260929150000 et à `annuler_conge` celui de 20260803_annuler_conge (sans
-- l'ajustement du dernier terme) ; retire `ajuster_appel_fin_de_bail(uuid, date)`, `montants_appel_loyer(uuid, date, numeric, numeric)` et `poser_alerte_terme(…)` ;
-- retire la garde du centime d'`encaisser_depot` (remplacement inverse à compte exact de l'ancre, sinon arrêt sans rien
-- modifier) ; retire les quatre contraintes du centime ; supprime la version.
-- CONSERVE : les appels de loyer déjà recalculés par un congé (ils sont justes), les quittances resynchronisées et les
-- alertes « terme_a_regulariser » posées (le gérant les ferme). Aucune donnée n'est réécrite.
-- Remettre le code précédent n'est pas nécessaire (signatures inchangées) ; l'application ignore une alerte d'un type
-- qu'elle ne nomme pas (bouton « Traiter » absent, titre affiché).
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261028100100_conge_ajuste_dernier_terme_et_depot_au_centime.retour.sql
--
-- RÉINTRODUIT : un congé enregistré après la génération de l'appel du mois de sortie laisse cet appel au mois plein ; un
-- congé annulé laisse l'appel au prorata ; la base accepte de nouveau un dépôt, une retenue, un poste de charges ou une
-- écriture à trois décimales écrits par un client qui contourne l'application (lireMontant refuse toujours).
-- Rejouable : sans les objets, les instructions ne font rien.
begin;
set local lock_timeout = '10s';

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
    -- Audit 29/09 : le prix n'est exigé qu'en location NUE, où le congé pour
    -- vendre vaut offre de vente au locataire (art. 15 II). En meublé
    -- (art. 25-8), pas de droit de préemption : le prix reste facultatif.
    if btrim(p_motif) ilike 'vente%' and not v_meuble and (p_prix_vente is null or p_prix_vente <= 0) then
      raise exception 'Congé pour vente : le prix de vente proposé est obligatoire (le congé vaut offre de vente au locataire, art. 15 II)';
    end if;
    if p_prix_vente is not null and p_prix_vente <= 0 then
      raise exception 'Congé pour vente : le prix proposé doit être positif';
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
    -- Audit 29/09 : une seule règle de durée (SCI familiale et indivision =
    -- 3 ans), partagée avec le bail PDF.
    v_terme := public.terme_bail_calcule(p_bail, p_date_presentation);
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
revoke execute on function public.enregistrer_conge(uuid, public.conge_par, date, smallint, text, uuid, numeric, text) from public, anon;

create or replace function public.annuler_conge(p_bail uuid, p_motif text default null)
returns void language plpgsql security definer set search_path to '' as $function$
declare
  v_org uuid;
  v_lot uuid;
  v_etat public.bail_etat;
  v_conge uuid;
begin
  select b.organization_id, b.lot_id, b.etat into v_org, v_lot, v_etat
  from public.baux b where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_etat <> 'preavis' then
    raise exception 'Ce bail n''est pas en préavis : il n''y a pas de congé à annuler';
  end if;

  if exists (select 1 from public.etats_des_lieux e
              where e.bail_id = p_bail and e.type = 'sortie' and e.etat = 'signe') then
    raise exception 'L''état des lieux de sortie est signé : le départ a eu lieu, le congé ne s''annule plus';
  end if;
  if exists (select 1 from public.restitutions r where r.bail_id = p_bail) then
    raise exception 'La restitution du dépôt est engagée : le congé ne s''annule plus';
  end if;

  select c.id into v_conge from public.conges c
   where c.bail_id = p_bail and c.annule_le is null
   order by c.created_at desc limit 1;
  if v_conge is null then
    raise exception 'Aucun congé en cours sur ce bail';
  end if;

  update public.conges
     set annule_le = now(),
         annulation_motif = nullif(btrim(coalesce(p_motif, '')), '')
   where id = v_conge;

  -- Le bail d'abord, le lot ensuite : le déclencheur du lot exige un bail
  -- vivant pour accepter « loué ».
  update public.baux set etat = 'actif', date_fin = null, updated_at = now()
   where id = p_bail;
  update public.lots set etat = public.etat_location_du_lot(v_lot) where id = v_lot and etat in ('loue','preavis');

  -- L'alerte d'état des lieux de sortie n'a plus d'objet.
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = auth.uid(),
         closed_action = 'Congé annulé — le locataire reste', updated_at = now()
   where organization_id = v_org
     and type = 'edl_sortie'
     and statut = 'ouverte'
     and details->>'bail_id' = p_bail::text;

  -- Un état des lieux de sortie commencé mais non signé redevient sans objet :
  -- on le laisse en brouillon, il resservira si un nouveau congé arrive.
end $function$;
revoke execute on function public.annuler_conge(uuid, text) from public, anon;

drop function if exists public.ajuster_appel_fin_de_bail(uuid, date);
drop function if exists public.montants_appel_loyer(uuid, date, numeric, numeric);
drop function if exists public.poser_alerte_terme(uuid, uuid, text, public.alerte_criticite, text, date, jsonb);

do $retour$
declare v_def text; v_ancre text;
begin
  if to_regprocedure('public.encaisser_depot(uuid,numeric,date,text,uuid,text,uuid)') is null then return; end if;
  select pg_get_functiondef('public.encaisser_depot(uuid,numeric,date,text,uuid,text,uuid)'::regprocedure) into v_def;
  v_ancre := $ancre$
  -- Audit final du 27/10 (COD-03) : même garde que lireMontant (lib/saisie-montant.ts) et que la contrainte de la table.
  if p_montant <> round(p_montant, 2) then
    raise exception 'Le montant s''exprime au centime près : deux décimales au plus.';
  end if;$ancre$;
  if position(v_ancre in v_def) = 0 then return; -- déjà sans la garde : rien à faire
  end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Retour 20261028100100 : définition d''encaisser_depot inattendue (ancre répétée)';
  end if;
  execute replace(v_def, v_ancre, '');
end $retour$;

alter table public.depot_encaissements drop constraint if exists depot_encaissements_montant_centime_check;
alter table public.retenues drop constraint if exists retenues_montant_retenu_centime_check;
alter table public.appel_charges_postes drop constraint if exists appel_charges_postes_montant_centime_check;
alter table public.ecritures drop constraint if exists ecritures_montant_centime_check;

select public.fermer_fonctions_a_anon();
delete from supabase_migrations.schema_migrations where version = '20261028100100';
commit;
