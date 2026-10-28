-- RETOUR ARRIÈRE de 20261028100100_conge_ajuste_dernier_terme_et_depot_au_centime.sql (audit final du 27/10 : LOY-01, LOY-V01, COD-03).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une migration, il se
-- joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Une seule transaction : la moindre erreur annule tout.
--
-- Défait : rend à `enregistrer_conge` son texte de 20260929150000 et à `annuler_conge` celui de 20260803_annuler_conge (sans
-- l'ajustement du dernier terme) ; retire `ajuster_appel_fin_de_bail(uuid, date)`, `montants_appel_loyer(uuid, date, numeric, numeric)`,
-- `poser_alerte_terme(…)`, `suivre_document_remplace(uuid, uuid)`, `mois_de_periode(date)`, `montant_alerte(numeric)` et les
-- déclencheurs `appel_loyer_base_mensuelle` (appels_loyer) et `quittance_suit_document_remplace` (quittances) avec leurs fonctions,
-- et l'index `alerts_document_remplace_ouverte_idx` ; rend à `montants_reels_bail` son texte de 20260927104000 et à
-- `etat_loyers_bail_brut` celui de 20260910140000 (un terme après la fin du bail redevient dû et relancé) ;
-- rend à `capturer_composantes_fiscales` sa définition d'avant (ventilation sur le montant appelé) et retire
-- `capturer_correction_trop_percu(uuid)`, ôte de `historique_du_lot` la mention « Non dû » ; les composantes déjà conservées (dont les corrections portées par une
-- restitution) sont CONSERVÉES : fiscal.ts d'avant les ignore sur une restitution, qui redevient « à qualifier » ;
-- retire la garde du centime d'`encaisser_depot` (remplacement inverse à compte exact de l'ancre, sinon arrêt sans rien
-- modifier) ; retire les quatre contraintes du centime ; supprime la version.
-- CONSERVE : les appels de loyer déjà recalculés par un congé (ils sont justes), les quittances resynchronisées, les
-- alertes « terme_a_regulariser », « document_envoye_remplace » et « avis_echeance_recalcule » posées (le gérant les
-- ferme) et les colonnes `appels_loyer.base_loyer_hc` / `base_charges` (plus lues ni tenues après le retour ; une marche
-- avant remplit celles restées vides). Aucune donnée n'est réécrite.
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
drop trigger if exists quittance_suit_document_remplace on public.quittances;
drop function if exists public.quittance_suit_document_remplace();
drop function if exists public.suivre_document_remplace(uuid, uuid);
drop trigger if exists appel_loyer_base_mensuelle on public.appels_loyer;
drop function if exists public.appel_loyer_fixe_base();
drop function if exists public.mois_de_periode(date);
drop function if exists public.montant_alerte(numeric);
drop index if exists public.alerts_document_remplace_ouverte_idx;

-- historique_du_lot : remplacement inverse à compte exact (absent : rien à faire ; répété : arrêt).
do $historique_retour$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.historique_du_lot'::regproc) into v_def;
  v_ancre := $ancre$           to_char(a.periode, 'TMMonth YYYY')
             || case when b.date_fin is not null and a.periode > date_trunc('month', b.date_fin)::date
                     then ' · Non dû — après la fin du bail' else '' end, a.montant_du, null$ancre$;
  if position(v_ancre in v_def) = 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Retour 20261028100100 : définition d''historique_du_lot inattendue (ancre répétée)';
  end if;
  execute replace(v_def, v_ancre, $ancien$           to_char(a.periode, 'TMMonth YYYY'), a.montant_du, null$ancien$);
end $historique_retour$;

-- capturer_composantes_fiscales : définition d'avant (20261012224000 modifiée par 20261014420000).
CREATE OR REPLACE FUNCTION public.capturer_composantes_fiscales()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare origine public.fiscal_encaissements_composantes; enc public.encaissements;
 a record; avant numeric; cumul numeric:=0; gauche numeric; droite numeric;
 hc numeric:=0; ch numeric:=0; affecte numeric:=0; part numeric; partch numeric;
 details jsonb:='[]';
begin
 if new.contre_ecriture_de is not null then
  select * into origine from public.fiscal_encaissements_composantes where ecriture_id=new.contre_ecriture_de;
  if found then
   insert into public.fiscal_encaissements_composantes(ecriture_id,organization_id,loyer_hc,charges,non_ventile,appels,version_regle)
   values(new.id,new.organization_id,origine.loyer_hc,origine.charges,origine.non_ventile,origine.appels,origine.version_regle);
  end if;
  return new;
 end if;
 if new.encaissement_id is null or new.categorie<>'loyer' or new.sens<>'recette' then return new; end if;
 select * into enc from public.encaissements where id=new.encaissement_id and organization_id=new.organization_id;
 if not found then return new; end if;
 perform 1 from public.baux where id=enc.bail_id for update;
 -- X11 (FIN-09) v2 : « avant » ignore les encaissements qui attendent leur tour, c'est-à-dire ceux de la
 -- MÊME instruction (xmin et cmin identiques) pas encore captés ; aucun horodatage n'est lu. Migration 20261014420000.
 select coalesce(sum(o.montant),0) into avant
   from public.encaissements o
   cross join (select e.xmin as x, e.cmin as c from public.encaissements e where e.id=enc.id) me
   cross join (select n.xmin as x, n.cmin as c from public.ecritures n where n.id=new.id) mn
  where o.bail_id=enc.bail_id and o.organization_id=enc.organization_id and o.id<>enc.id
    and (exists(select 1 from public.ecritures x
                join public.fiscal_encaissements_composantes c on c.ecriture_id=x.id
                where x.encaissement_id=o.id and x.contre_ecriture_de is null)
         or not ((o.xmin=me.x and o.cmin=me.c)
                 or exists(select 1 from public.ecritures y
                           where y.encaissement_id=o.id and y.categorie='loyer' and y.sens='recette'
                             and y.xmin=mn.x and y.cmin=mn.c)));
 for a in select * from public.appels_loyer where bail_id=enc.bail_id and organization_id=enc.organization_id order by periode,id loop
  if a.montant_du<=0 or a.loyer_hc<0 or a.charges<0 or a.montant_du<>a.loyer_hc+a.charges then
   -- Un appel incohérent n'autorise jamais une ventilation inventée.
   cumul:=cumul+greatest(a.montant_du,0); continue;
  end if;
  gauche:=least(a.montant_du,greatest(0,avant-cumul));
  droite:=least(a.montant_du,greatest(0,avant+new.montant-cumul));
  part:=droite-gauche;
  if part>0 then
   partch:=round(droite*a.charges/a.montant_du,2)-round(gauche*a.charges/a.montant_du,2);
   hc:=hc+part-partch; ch:=ch+partch; affecte:=affecte+part;
   details:=details||jsonb_build_array(jsonb_build_object('appel_id',a.id,'periode',a.periode,'loyer_hc_appel',a.loyer_hc,'charges_appel',a.charges,'montant_du',a.montant_du,'couvert_avant',gauche,'couvert_apres',droite,'loyer_hc',part-partch,'charges',partch));
  end if;
  cumul:=cumul+a.montant_du;
 end loop;
 insert into public.fiscal_encaissements_composantes(ecriture_id,organization_id,loyer_hc,charges,non_ventile,appels)
 values(new.id,new.organization_id,hc,ch,round(new.montant-affecte,2),details);
 return new;
end $function$;
revoke execute on function public.capturer_composantes_fiscales() from public, anon, authenticated;
drop function if exists public.capturer_correction_trop_percu(uuid);

-- etat_loyers_bail_brut : texte de 20260910140000.
CREATE OR REPLACE FUNCTION public.etat_loyers_bail_brut(p_bail uuid)
 RETURNS TABLE(appel_id uuid, periode date, date_echeance date, montant_du numeric, cumul_du numeric, montant_couvert numeric, statut text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with b as (
    select id, organization_id from public.baux where id = p_bail
  ), a as (
    select al.id, al.periode, al.date_echeance, al.montant_du,
      sum(al.montant_du) over (order by al.periode rows between unbounded preceding and current row) as cumul_du
    from public.appels_loyer al join b on b.id = al.bail_id
    where al.organization_id = b.organization_id
  ), tot as (
    select coalesce(sum(e.montant), 0) as encaisse
    from public.encaissements e join b on b.id = e.bail_id
    where e.organization_id = b.organization_id
  )
  select
    a.id, a.periode, a.date_echeance, a.montant_du, a.cumul_du,
    round(least(a.montant_du, greatest(0, tot.encaisse - (a.cumul_du - a.montant_du))), 2) as montant_couvert,
    case
      when tot.encaisse >= a.cumul_du then 'paye'
      when tot.encaisse > (a.cumul_du - a.montant_du) then 'partiel'
      when a.date_echeance < public.aujourdhui_paris() then 'impaye'
      else 'attendu'
    end as statut
  from a, tot
  order by a.periode;
$function$;
comment on function public.etat_loyers_bail_brut(uuid) is null;
revoke execute on function public.etat_loyers_bail_brut(uuid) from public, anon, authenticated;

-- montants_reels_bail : texte de 20260927104000 (tous les appels comptent comme dus).
create or replace function public.montants_reels_bail(p_bail uuid)
 returns table(depot numeric, impayes numeric, trop_percu numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with net as (
    select
      coalesce((select sum(montant_du) from public.appels_loyer where bail_id = p_bail), 0)
      -- ecart = provisions − réel : un écart négatif est un complément dû par
      -- le locataire, un écart positif un trop-perçu qui lui revient.
      - coalesce((select sum(ecart) from public.regularisations_charges where bail_id = p_bail), 0)
      - coalesce((select sum(montant) from public.encaissements where bail_id = p_bail), 0) as solde
  )
  select
    -- Le dépôt à restituer est celui qui a été ENCAISSÉ (audit 09/09)
    coalesce((select sum(montant) from public.depot_encaissements where bail_id = p_bail), 0),
    round(greatest(0, net.solde), 2),
    round(greatest(0, - net.solde), 2)
  from net;
$function$;
comment on function public.montants_reels_bail(uuid) is null;
revoke execute on function public.montants_reels_bail(uuid) from public, anon, authenticated;
grant execute on function public.montants_reels_bail(uuid) to service_role;

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
