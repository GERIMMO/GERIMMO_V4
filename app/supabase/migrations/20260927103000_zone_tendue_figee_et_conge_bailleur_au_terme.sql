-- Audit métier du 27/09 — zone tendue figée au bail, congé du bailleur au
-- terme.
--
-- 1. ZONE TENDUE NON FIGÉE. Le préavis du locataire (enregistrer_conge) lisait
--    la zone ACTUELLE du bien (biens.zone_tendue, case cochée à la main), le
--    bail PDF aussi, tandis que les honoraires lisaient baux.zone_honoraires,
--    saisie à part : deux sources qui peuvent se contredire, et un rezonage du
--    bien changeait les baux en cours. Wiki [[Bail]] : « Zone tendue figée au
--    bail à sa signature » (RM-1.1.7), préavis calculé sur la zone « figée au
--    bail » (RM-1.10.7) ; source module 0 : un changement de décret ne modifie
--    jamais les baux signés (RM-0.1.6/7).
--
--    Correction : colonne baux.zone_tendue, UNE seule valeur par bail.
--      · Tant que le bail est un brouillon, elle se déduit à chaque écriture :
--        de la zone des honoraires quand elle est renseignée (très tendue ou
--        tendue = zone tendue ; autre = hors zone tendue), sinon du bien.
--        Honoraires et préavis lisent donc la même zone.
--      · Dès que le bail quitte le brouillon (signature), elle est figée : ni
--        un rezonage du bien ni une écriture directe ne la changent plus.
--      · Les baux existants sont renseignés une fois, selon la même règle
--        (meilleure information disponible : zone des honoraires, sinon zone
--        actuelle du bien).
--    La déduction automatique depuis la commune (RM-0.1.6) n'est PAS faite :
--    le wiki ne source pas la liste des communes en zone tendue (lacune).
--
-- 2. CONGÉ DU BAILLEUR À N'IMPORTE QUELLE DATE. La date d'effet valait
--    présentation + 6 mois (ou 3), devenait la fin du bail, sans comparaison
--    avec l'échéance du contrat. Wiki [[Bail]] § Congé du bailleur (1.11) :
--    « au terme uniquement … insuffisant = blocage (le congé serait nul) ».
--    Durées : [[Bail]], [[Types de baux]], [[Structure du modèle-type de bail]]
--    (nu : 3 ans personne physique / 6 ans personne morale, reconduction 3 ou
--    6 ans ; meublé : 1 an, reconduction 1 an ; étudiant : 9 mois, jamais
--    reconduit).
--    Correction : le terme de la période en cours est calculé (date de début +
--    durée, puis reconductions) ; le congé prend effet à ce terme et il est
--    refusé si la présentation laisse moins que le préavis avant ce terme.
--    Bail nu à durée réduite (duree_reduite_evenement) : la durée convenue
--    n'est pas enregistrée, le terme ne peut pas se calculer — comportement
--    inchangé (voir le rapport).
--
-- 3. CONGÉ DU BAILLEUR SANS PRIX NI BÉNÉFICIAIRE (audit agence) : wiki [[Bail]]
--    § 1.11 — reprise : bénéficiaire identifié ; vente : prix obligatoire.
--    Deux paramètres facultatifs, exigés selon le motif, conservés au congé.
--
-- Idempotent : add column if not exists, drop/create, trigger recréé.

alter table public.baux add column if not exists zone_tendue boolean;
comment on column public.baux.zone_tendue is
  'Zone tendue figée au bail à sa signature (RM-1.1.7, RM-1.10.7). Déduite en brouillon de zone_honoraires, sinon du bien ; figée ensuite.';

create or replace function public.figer_zone_tendue_bail()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_bien boolean;
begin
  if tg_op = 'UPDATE' and old.etat is distinct from 'brouillon'::public.bail_etat then
    -- Bail engagé : la zone ne bouge plus (RM-1.1.7). Un bail antérieur à la
    -- colonne, encore vide, reçoit sa valeur une fois.
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
  new.zone_tendue := case
    when new.zone_honoraires in ('tres_tendue', 'tendue') then true
    when new.zone_honoraires = 'autre' then false
    else coalesce(v_bien, false)
  end;
  return new;
end;
$function$;

drop trigger if exists baux_zone_tendue_figee on public.baux;
create trigger baux_zone_tendue_figee
  before insert or update on public.baux
  for each row execute function public.figer_zone_tendue_bail();

-- Renseigner les baux existants, une fois, selon la même règle. Les
-- déclencheurs de baux sont suspendus le temps de ce rattrapage (dans la même
-- transaction) : il n'écrit que la nouvelle colonne et ne doit ni rejouer les
-- contrôles métier sur des baux anciens, ni buter sur un abonnement suspendu.
do $$
begin
  alter table public.baux disable trigger user;
  update public.baux b
     set zone_tendue = case
       when b.zone_honoraires in ('tres_tendue', 'tendue') then true
       when b.zone_honoraires = 'autre' then false
       else coalesce((select bi.zone_tendue from public.lots l join public.biens bi on bi.id = l.bien_id
                       where l.id = b.lot_id), false)
     end
   where b.zone_tendue is null;
  alter table public.baux enable trigger user;
end $$;

alter table public.conges add column if not exists prix_vente numeric;
alter table public.conges add column if not exists beneficiaire_reprise text;
comment on column public.conges.prix_vente is 'Congé pour vente : prix proposé (le congé vaut offre, wiki Bail § 1.11).';
comment on column public.conges.beneficiaire_reprise is 'Congé pour reprise : bénéficiaire identifié (wiki Bail § 1.11).';

-- Nouvelle signature (prix et bénéficiaire) : l'ancienne est retirée pour ne
-- pas laisser deux surcharges ambiguës à l'appel par nom.
drop function if exists public.enregistrer_conge(uuid, public.conge_par, date, smallint, text, uuid);
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
begin
  select b.organization_id, b.lot_id, b.type, b.etat,
         -- Audit 27/09 : la zone figée au bail (RM-1.10.7), pas celle du bien
         coalesce(b.zone_tendue, bi.zone_tendue, false),
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
    -- Audit 27/09 : wiki [[Bail]] § 1.11 — reprise : bénéficiaire identifié ;
    -- vente : prix obligatoire (le congé vaut offre).
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
      -- 6 ans quand le bail n'a pour bailleurs que des personnes morales,
      -- 3 ans sinon ; la reconduction reprend la même durée.
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
    -- Terme de la période en cours : le premier terme qui n'est pas passé à
    -- la date de présentation.
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
     motif, justificatif_document, zone_tendue, prix_vente, beneficiaire_reprise)
  values
    (v_org, p_bail, p_par, p_date_presentation, v_preavis, v_effet,
     nullif(btrim(coalesce(p_motif, '')), ''), p_justificatif, v_zone,
     case when p_par = 'bailleur' and btrim(coalesce(p_motif, '')) ilike 'vente%' then p_prix_vente end,
     case when p_par = 'bailleur' and btrim(coalesce(p_motif, '')) ilike 'reprise%'
          then nullif(btrim(coalesce(p_beneficiaire, '')), '') end)
  returning id into v_conge;

  update public.baux set etat = 'preavis', date_fin = v_effet, updated_at = now() where id = p_bail;
  -- Le bail fait foi : le lot suit, sinon le parc annonce « loué » pour un
  -- logement dont le locataire part.
  update public.lots set etat = public.etat_location_du_lot(v_lot) where id = v_lot and etat in ('loue','preavis');

  -- L'intention transmise depuis l'espace locataire est soldée par ce congé
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

  return v_conge;
end $function$;

-- L'espace locataire annonce le préavis sur la même zone (écran « Mon
-- logement ») : même valeur que enregistrer_conge.
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
         -- Audit 27/09 : la zone figée au bail (RM-1.10.7), pas celle du bien.
         coalesce(b.zone_tendue, bi.zone_tendue, false)
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

revoke execute on function public.enregistrer_conge(uuid, public.conge_par, date, smallint, text, uuid, numeric, text) from public, anon;
grant execute on function public.enregistrer_conge(uuid, public.conge_par, date, smallint, text, uuid, numeric, text) to authenticated, service_role;
revoke execute on function public.figer_zone_tendue_bail() from public, anon, authenticated;

select public.fermer_fonctions_a_anon();
