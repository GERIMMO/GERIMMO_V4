-- Lot « reglement-facture » — décision D23 du dirigeant (14/10/2026), option A, fiches PRO2-21 et CHN-02 (point X06) :
-- règlement DÉCLARATIF de la facture d'intervention côté propriétaire ou gérant, trace côté artisan.
--
-- LE DÉFAUT (PRO2-21). Le propriétaire pouvait VALIDER la facture déposée par l'artisan (valider_facture_artisan), puis
-- l'écran disait seulement « Le paiement reste à effectuer et à enregistrer dans la comptabilité ». L'écriture libre
-- saisie ensuite au journal n'était liée ni à la facture ni à l'incident, la facture restait « validée » sans date de
-- règlement, et l'artisan ne voyait rien : son seul « payé » était son registre privé (artisan_reglements), que personne
-- ne confirme. CHN-02 (X06) : la validation de la facture n'écrivait rien au journal d'audit.
--
-- CE QUE FAIT CETTE MIGRATION (additive ; aucune ligne existante n'est réécrite ; aucune écriture libre déjà saisie n'est
-- rattachée, réponse 5 de la fiche B.15 ; AUCUN paiement, virement ni prélèvement n'est déclenché : le règlement est
-- déclaratif, comme la validation) :
--   1. le fil de l'incident connaît deux événements de plus : facture_reglee, reglement_retire ;
--   2. intervention_factures gagne une colonne facultative reglee_le (date du dernier règlement quand la facture est
--      réglée en totalité), tenue par les fonctions ci-dessous, jamais par un déclencheur caché ; et la clé (id,
--      organization_id) qu'exige la clé étrangère composite de la table des règlements ;
--   3. la table intervention_facture_reglements : un règlement déclaré (montant en centimes, date, moyen, référence
--      facultative), l'écriture de dépense qu'il a créée, la clé d'envoi du formulaire (un envoi n'écrit qu'une fois),
--      et son retrait éventuel (motif, contre-écriture). Lecture par la politique de l'organisation (portefeuille de
--      l'agent compris) ; ÉCRITURE UNIQUEMENT PAR FONCTION ; l'artisan ne lit pas la table (jamais la référence bancaire) ;
--   4. enregistrer_reglement_facture : sur une facture VALIDÉE, écrit dans la même transaction l'écriture de dépense
--      (catégorie « travaux », lot de l'incident, pièce datée du règlement, imputée au jour de Paris) et le règlement ;
--      règlement partiel admis (réponse 1 de B.15) ; le total ne dépasse jamais le montant de la facture ; date future
--      refusée au jour de Paris ; imputation « locataire » admise (réponse 2 : le propriétaire règle l'artisan, aucune
--      créance sur le bail n'est créée, l'écran le dit) ; événement et ligne d'audit ;
--   5. retirer_reglement_facture : annulation MOTIVÉE par contre-écriture, sur le patron de contre_passer_encaissement
--      (jamais de suppression) ; l'état de la facture est recalculé ; un règlement déjà retiré est refusé ;
--   6. etat_facture_intervention (interne) : deposee → validee → partiellement_reglee → reglee ;
--   7. mes_reglements_factures_artisan : l'artisan voit, pour SES factures seulement, l'état et la DATE et le MOYEN de
--      chaque règlement (réponse 3 de B.15), jamais la référence ni le détail des montants ;
--   8. valider_facture_artisan écrit la validation au journal d'audit (X06, CHN-02) ;
--   9. ecriture_annulable_depuis_le_journal refuse d'annuler depuis le journal l'écriture née d'un règlement, et dit où agir.
--
-- Les deux fonctions existantes (8 et 9) sont modifiées EN RELISANT leur définition en vigueur (pg_get_functiondef),
-- comme 20261013120000 : l'ancre est UNE ligne (jamais plusieurs : la mise en forme en production diffère du banc),
-- exigée exactement une fois, sinon la migration s'arrête sans rien modifier ; le bloc ajouté est encadré de marques
-- « -- >> » / « -- << » que le retour arrière retire chirurgicalement. Rejeu sans effet : chaque bloc reconnaît sa marque.
--
-- Jour et heure : public.aujourdhui_paris() (migration 20261014500000), jamais current_date.
-- Retour arrière : supabase/retours-arriere/20261014610000_reglement_facture_intervention.retour.sql

-- 0. Préalable.
do $d23$
begin
  if to_regprocedure('public.aujourdhui_paris()') is null then
    raise exception 'Règlement de facture : la fonction public.aujourdhui_paris() est absente ; appliquez d''abord 20261014500000.';
  end if;
end $d23$;

-- 1. Le fil de l'incident : deux événements de plus. La liste en vigueur est RELUE et complétée (un autre lot a pu y
-- ajouter des valeurs) : seul le crochet fermant du tableau sert d'ancre, exigé une fois.
do $d23$
declare v_def text; v_ancre constant text := '::text]'; v_nb integer;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.incident_evenements'::regclass and conname = 'incident_evenements_type_check';
  if v_def is null then
    raise exception 'Règlement de facture : la contrainte incident_evenements_type_check est absente ; rien n''est modifié.';
  end if;
  if position('''facture_reglee''' in v_def) > 0 and position('''reglement_retire''' in v_def) > 0 then return; end if;
  v_nb := (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre);
  if v_nb <> 1 then
    raise exception 'Règlement de facture : la contrainte incident_evenements_type_check a une forme inattendue (% crochet(s) fermant(s)) ; rien n''est modifié.', v_nb;
  end if;
  v_def := replace(v_def, v_ancre, '::text, ''facture_reglee''::text, ''reglement_retire''::text]');
  alter table public.incident_evenements drop constraint incident_evenements_type_check;
  execute 'alter table public.incident_evenements add constraint incident_evenements_type_check ' || v_def;
end $d23$;

-- 2. La facture : date de règlement total (facultative), et la clé composite pour la table des règlements.
-- Déjà posées : on ne touche pas la table (verrou exclusif épargné au rejeu).
do $d23$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'intervention_factures' and column_name = 'reglee_le') then
    alter table public.intervention_factures add column reglee_le date;
    comment on column public.intervention_factures.reglee_le is
      'Date du dernier règlement déclaré quand la facture est réglée en totalité ; NULL sinon. Tenue par enregistrer_reglement_facture et retirer_reglement_facture (D23).';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.intervention_factures'::regclass
                  and conname = 'intervention_factures_id_org_key') then
    alter table public.intervention_factures add constraint intervention_factures_id_org_key unique (id, organization_id);
  end if;
end $d23$;

-- 3. La table des règlements déclarés.
do $d23$
begin
  if to_regclass('public.intervention_facture_reglements') is not null then return; end if;

  create table public.intervention_facture_reglements (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    facture_id uuid not null,
    montant_cents bigint not null,
    date_reglement date not null,
    moyen text not null,
    reference text,
    ecriture_id uuid not null unique references public.ecritures(id),
    cle_envoi uuid not null,
    cree_par uuid references public.accounts(id),
    created_at timestamptz not null default now(),
    retire_le timestamptz,
    retire_par uuid references public.accounts(id),
    retrait_motif text,
    contre_ecriture_id uuid unique references public.ecritures(id),
    constraint intervention_facture_reglements_facture_fk
      foreign key (facture_id, organization_id) references public.intervention_factures(id, organization_id),
    constraint intervention_facture_reglements_montant check (montant_cents > 0 and montant_cents <= 100000000000),
    constraint intervention_facture_reglements_moyen check (moyen in ('virement', 'cheque', 'especes', 'carte', 'autre')),
    constraint intervention_facture_reglements_reference check (reference is null or length(btrim(reference)) between 1 and 200),
    constraint intervention_facture_reglements_retrait check (
      (retire_le is null and retire_par is null and retrait_motif is null and contre_ecriture_id is null)
      or (retire_le is not null and retire_par is not null and length(btrim(retrait_motif)) between 1 and 4000 and contre_ecriture_id is not null)),
    -- D05 : un même envoi du formulaire n'écrit qu'une fois (le nom porte « cle_envoi » : l'écran reconnaît le rejeu).
    constraint intervention_facture_reglements_cle_envoi_unique unique (facture_id, cle_envoi)
  );
  comment on table public.intervention_facture_reglements is
    'Règlement DÉCLARÉ par le propriétaire ou le gérant d''une facture d''intervention (D23, PRO2-21) : aucun paiement exécuté. Écriture de dépense liée ; retrait motivé par contre-écriture, jamais de suppression.';

  -- Chaque clé étrangère a son index (tests/schema-performance-securite).
  create index intervention_facture_reglements_org_idx on public.intervention_facture_reglements (organization_id);
  create index intervention_facture_reglements_facture_org_idx on public.intervention_facture_reglements (facture_id, organization_id);
  create index intervention_facture_reglements_cree_par_idx on public.intervention_facture_reglements (cree_par);
  create index intervention_facture_reglements_retire_par_idx on public.intervention_facture_reglements (retire_par);

  alter table public.intervention_facture_reglements enable row level security;
  revoke all on public.intervention_facture_reglements from public, anon, authenticated;
  grant select on public.intervention_facture_reglements to authenticated;

  -- Lecture : les gérants de l'organisation, dans le portefeuille de l'agent (la facture elle-même n'est visible qu'à
  -- cette condition) ; le super-administrateur. L'artisan, le locataire : rien (la référence bancaire ne sort pas).
  create policy intervention_facture_reglements_lecture on public.intervention_facture_reglements
    for select to authenticated
    using (
      (select public.is_super_admin())
      or (organization_id in (select public.org_ids_avec_roles(
            array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
          and exists (select 1 from public.intervention_factures f where f.id = facture_id))
    );

  -- Gardes posées sur cette table seulement (même raison que pour intervention_factures, 20260927123000).
  create trigger abonnement_intervention_facture_reglements
    before insert or update or delete on public.intervention_facture_reglements
    for each row execute function public.refuser_ecriture_si_fermee();
  create trigger diagnostic_artisan_lecture
    before insert or update or delete on public.intervention_facture_reglements
    for each row execute function public.refuser_mutation_diagnostic_artisan();
end $d23$;

-- 6. L'état de la facture, calculé. INTERNE : appelée par mes_reglements_factures_artisan et par les tests ; un compte
-- ne l'appelle pas directement (elle lit sans politique). L'écran du gérant calcule le même état sur les lignes qu'il lit
-- (src/lib/reglement-facture.ts, règle identique, testée côte à côte).
create or replace function public.etat_facture_intervention(p_facture uuid)
returns table (etat text, montant_ttc_cents bigint, total_regle_cents bigint, reste_cents bigint, reglee_le date)
language sql
stable
security definer
set search_path = ''
as $$
  select case when f.validee_le is null then 'deposee'
              when coalesce(r.total, 0) = 0 then 'validee'
              when coalesce(r.total, 0) < f.montant_ttc_cents then 'partiellement_reglee'
              else 'reglee' end,
         f.montant_ttc_cents,
         coalesce(r.total, 0)::bigint,
         (f.montant_ttc_cents - coalesce(r.total, 0))::bigint,
         f.reglee_le
  from public.intervention_factures f
  left join (select g.facture_id, sum(g.montant_cents) as total
               from public.intervention_facture_reglements g
              where g.retire_le is null
              group by g.facture_id) r on r.facture_id = f.id
  where f.id = p_facture
$$;
revoke all on function public.etat_facture_intervention(uuid) from public, anon, authenticated;

-- 4. Enregistrer un règlement (déclaratif).
create or replace function public.enregistrer_reglement_facture(
  p_org uuid,
  p_facture uuid,
  p_montant_cents bigint,
  p_date_reglement date,
  p_moyen text,
  p_reference text,
  p_cle_envoi uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  f record; i record;
  v_regle bigint; v_reste bigint; v_total bigint;
  v_ecriture uuid; v_reglement uuid;
  v_aujourdhui date; v_ref text;
begin
  if (select auth.uid()) is null or not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if p_cle_envoi is null then
    raise exception 'La référence de cet envoi manque. Rechargez la page avant d''enregistrer, pour éviter un doublon.';
  end if;
  -- La facture est verrouillée : deux envois simultanés se suivent, le second voit le premier.
  select * into f from public.intervention_factures where id = p_facture and organization_id = p_org for update;
  if not found or public.intervention_hors_portefeuille(p_org, f.intervention_id) then
    raise exception 'Accès refusé';
  end if;
  -- D05 : la même clé d'envoi sur la même facture est un rejeu, jamais un second règlement. Le code est celui d'une
  -- violation d'unicité et le message nomme la clé : l'écran répond « déjà enregistré » (lib/cle-envoi.ts).
  if exists (select 1 from public.intervention_facture_reglements r
              where r.facture_id = f.id and r.cle_envoi = p_cle_envoi) then
    raise exception 'Ce règlement est déjà enregistré (cle_envoi) : il n''a pas été enregistré une seconde fois.'
      using errcode = 'unique_violation';
  end if;
  if f.validee_le is null then
    raise exception 'Validez d''abord la facture : un règlement ne s''enregistre que sur une facture contrôlée et validée.';
  end if;
  if p_montant_cents is null or p_montant_cents <= 0 then
    raise exception 'Indiquez le montant réglé : un montant positif, au centime près.';
  end if;
  select coalesce(sum(r.montant_cents), 0) into v_regle
    from public.intervention_facture_reglements r where r.facture_id = f.id and r.retire_le is null;
  v_reste := f.montant_ttc_cents - v_regle;
  if v_reste <= 0 then
    raise exception 'Cette facture est déjà réglée en totalité : aucun règlement supplémentaire ne peut être enregistré.';
  end if;
  if p_montant_cents > v_reste then
    raise exception 'Le montant dépasse le reste à régler (% €) : le total des règlements ne peut pas dépasser le montant de la facture.',
      replace(to_char(v_reste / 100.0, 'FM9999999990.00'), '.', ',');
  end if;
  v_aujourdhui := public.aujourdhui_paris();
  if p_date_reglement is null then
    raise exception 'Indiquez la date du règlement.';
  end if;
  if p_date_reglement > v_aujourdhui then
    raise exception 'La date du règlement ne peut pas être dans le futur (aujourd''hui : %).', to_char(v_aujourdhui, 'DD/MM/YYYY');
  end if;
  if p_moyen is null or p_moyen not in ('virement', 'cheque', 'especes', 'carte', 'autre') then
    raise exception 'Choisissez le moyen de règlement : virement, chèque, espèces, carte ou autre.';
  end if;
  v_ref := nullif(btrim(coalesce(p_reference, '')), '');
  if length(v_ref) > 200 then
    raise exception 'La référence du règlement est trop longue (200 caractères au plus).';
  end if;
  select inc.* into i from public.incidents inc
    join public.incident_interventions iv on iv.incident_id = inc.id
   where iv.id = f.intervention_id and inc.organization_id = p_org;
  if not found then raise exception 'Accès refusé'; end if;

  -- L'écriture de dépense, dans la même transaction : catégorie « travaux », lot de l'incident, pièce datée du
  -- règlement, imputée au jour de Paris (un mois clos est refusé par le journal, avec son message). Aucun mot du libellé
  -- ne déclenche le classement « fonds de travaux » du récapitulatif fiscal (FIN-07) : la dépense y entre « à qualifier ».
  -- Pas de bail : le règlement n'ouvre aucune créance sur le locataire, même si l'incident lui est imputé.
  insert into public.ecritures (organization_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle)
  values (p_org, i.lot_id, 'travaux', 'depense', round(p_montant_cents::numeric / 100, 2), p_date_reglement, v_aujourdhui,
          'Règlement facture n° ' || f.numero || ' — incident ' || i.numero)
  returning id into v_ecriture;

  insert into public.intervention_facture_reglements
    (organization_id, facture_id, montant_cents, date_reglement, moyen, reference, ecriture_id, cle_envoi, cree_par)
  values (p_org, f.id, p_montant_cents, p_date_reglement, p_moyen, v_ref, v_ecriture, p_cle_envoi, (select auth.uid()))
  returning id into v_reglement;

  v_total := v_regle + p_montant_cents;
  if v_total = f.montant_ttc_cents then
    update public.intervention_factures
       set reglee_le = (select max(r.date_reglement) from public.intervention_facture_reglements r
                         where r.facture_id = f.id and r.retire_le is null)
     where id = f.id;
  end if;

  -- Le fil de l'incident (lu aussi par le locataire et l'artisan : ni référence, ni auteur nommé) et le journal d'audit.
  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, i.id, 'facture_reglee', (select auth.uid()),
          jsonb_build_object('facture_id', f.id, 'reglement_id', v_reglement, 'numero', f.numero,
                             'montant_cents', p_montant_cents, 'date_reglement', p_date_reglement, 'moyen', p_moyen,
                             'total_regle_cents', v_total, 'montant_ttc_cents', f.montant_ttc_cents,
                             'reglee', v_total = f.montant_ttc_cents));
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), p_org, 'reglement_facture_enregistre',
          jsonb_build_object('facture_id', f.id, 'reglement_id', v_reglement, 'ecriture_id', v_ecriture,
                             'incident_id', i.id, 'montant_cents', p_montant_cents, 'date_reglement', p_date_reglement,
                             'moyen', p_moyen, 'reglee', v_total = f.montant_ttc_cents));
  return v_reglement;
end $$;
revoke all on function public.enregistrer_reglement_facture(uuid, uuid, bigint, date, text, text, uuid) from public, anon;
grant execute on function public.enregistrer_reglement_facture(uuid, uuid, bigint, date, text, text, uuid) to authenticated;

-- 5. Retirer un règlement : contre-écriture motivée, jamais de suppression (patron de contre_passer_encaissement).
create or replace function public.retirer_reglement_facture(p_org uuid, p_reglement uuid, p_motif text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record; f record; e record; i record;
  v_contre uuid; v_motif text; v_regle bigint; v_aujourdhui date;
begin
  if (select auth.uid()) is null or not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into r from public.intervention_facture_reglements where id = p_reglement and organization_id = p_org for update;
  if not found then raise exception 'Accès refusé'; end if;
  select * into f from public.intervention_factures where id = r.facture_id and organization_id = p_org for update;
  if not found or public.intervention_hors_portefeuille(p_org, f.intervention_id) then
    raise exception 'Accès refusé';
  end if;
  if r.retire_le is not null then
    raise exception 'Ce règlement a déjà été retiré : rien n''a été modifié.';
  end if;
  v_motif := nullif(btrim(coalesce(p_motif, '')), '');
  if v_motif is null or length(v_motif) > 4000 then
    raise exception 'Indiquez le motif du retrait (4 000 caractères au plus).';
  end if;
  select * into e from public.ecritures where id = r.ecriture_id;
  if not found then
    raise exception 'L''écriture de ce règlement est introuvable : le retrait est impossible.';
  end if;
  select inc.* into i from public.incidents inc
    join public.incident_interventions iv on iv.incident_id = inc.id
   where iv.id = f.intervention_id and inc.organization_id = p_org;
  if not found then raise exception 'Accès refusé'; end if;
  v_aujourdhui := public.aujourdhui_paris();

  -- La contre-écriture : sens inversé, même montant, même lot, datée du jour de Paris, motif obligatoire.
  insert into public.ecritures
    (organization_id, bail_id, lot_id, mandat_id, categorie, sens, montant,
     date_piece, date_imputation, libelle, systeme, contre_ecriture_de, motif)
  values (e.organization_id, e.bail_id, e.lot_id, e.mandat_id, e.categorie,
          case when e.sens = 'recette' then 'depense' else 'recette' end, e.montant,
          v_aujourdhui, v_aujourdhui,
          'Annulation — règlement de la facture n° ' || f.numero || ' retiré : ' || v_motif,
          e.systeme, e.id, v_motif)
  returning id into v_contre;

  update public.intervention_facture_reglements
     set retire_le = now(), retire_par = (select auth.uid()), retrait_motif = v_motif, contre_ecriture_id = v_contre
   where id = r.id;

  select coalesce(sum(g.montant_cents), 0) into v_regle
    from public.intervention_facture_reglements g where g.facture_id = f.id and g.retire_le is null;
  update public.intervention_factures
     set reglee_le = case when v_regle = f.montant_ttc_cents
                          then (select max(g.date_reglement) from public.intervention_facture_reglements g
                                 where g.facture_id = f.id and g.retire_le is null)
                          else null end
   where id = f.id;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, i.id, 'reglement_retire', (select auth.uid()),
          jsonb_build_object('facture_id', f.id, 'reglement_id', r.id, 'numero', f.numero,
                             'montant_cents', r.montant_cents, 'date_reglement', r.date_reglement, 'moyen', r.moyen,
                             'motif', v_motif, 'total_regle_cents', v_regle, 'montant_ttc_cents', f.montant_ttc_cents));
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), p_org, 'reglement_facture_retire',
          jsonb_build_object('facture_id', f.id, 'reglement_id', r.id, 'ecriture_id', r.ecriture_id,
                             'contre_ecriture_id', v_contre, 'incident_id', i.id, 'montant_cents', r.montant_cents,
                             'motif', v_motif));
  return v_contre;
end $$;
revoke all on function public.retirer_reglement_facture(uuid, uuid, text) from public, anon;
grant execute on function public.retirer_reglement_facture(uuid, uuid, text) to authenticated;

-- 7. Ce que l'artisan voit : SES factures, leur état, et pour chaque règlement la date et le moyen seulement (réponse 3 de
-- B.15). Ni la référence, ni le montant de chaque règlement, ni l'auteur. Le montant de la facture est le sien.
create or replace function public.mes_reglements_factures_artisan()
returns table (
  facture_id uuid, intervention_id uuid, organization_id uuid, numero text, montant_ttc_cents bigint,
  validee_le timestamptz, etat text, reglee_le date, reglements jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.intervention_id, f.organization_id, f.numero, f.montant_ttc_cents, f.validee_le, e.etat, e.reglee_le,
         coalesce((select jsonb_agg(jsonb_build_object('date_reglement', r.date_reglement, 'moyen', r.moyen)
                                    order by r.date_reglement, r.created_at)
                     from public.intervention_facture_reglements r
                    where r.facture_id = f.id and r.retire_le is null), '[]'::jsonb)
  from public.intervention_factures f
  cross join lateral public.etat_facture_intervention(f.id) e
  where f.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  order by f.deposee_le desc
$$;
revoke all on function public.mes_reglements_factures_artisan() from public, anon;
grant execute on function public.mes_reglements_factures_artisan() to authenticated;

-- 8. X06 (CHN-02) : la validation de la facture s'écrit au journal d'audit, dans valider_facture_artisan.
-- Ancre d'UNE ligne (la fermeture de l'alerte « facture à valider »), exigée exactement une fois ; le bloc est inséré
-- au début de cette ligne, entre deux marques.
do $d23$
declare
  v_def text; v_avant text; v_pos integer; v_coupe integer;
  v_ancre constant text := 'closed_action=''Facture contrôlée et validée''';
  v_bloc constant text := E'  -- >> D23 (X06, CHN-02) : la validation d''une facture est une décision financière, elle s''écrit au journal d''audit.\n'
    || E'  insert into public.audit_log (account_id, organization_id, action, details)\n'
    || E'  values (auth.uid(), p_org, ''facture_validee'',\n'
    || E'          jsonb_build_object(''facture_id'', f.id, ''numero'', f.numero, ''intervention_id'', f.intervention_id, ''incident_id'', i.id,\n'
    || E'                             ''montant_ttc_cents'', f.montant_ttc_cents, ''imputation'', i.imputation));\n'
    || E'  -- << D23 (X06, CHN-02)\n';
begin
  select pg_get_functiondef('public.valider_facture_artisan(uuid,uuid,text)'::regprocedure) into v_def;
  if position('-- >> D23 (X06, CHN-02)' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif X06 (valider_facture_artisan) : définition inattendue (ancre absente ou répétée) ; rien n''est modifié.';
  end if;
  v_pos := position(v_ancre in v_def);
  v_avant := left(v_def, v_pos - 1);
  -- Le début de la ligne qui porte l'ancre : juste après le dernier saut de ligne qui la précède.
  v_coupe := position(E'\n' in reverse(v_avant));
  if v_coupe = 0 then
    raise exception 'Correctif X06 (valider_facture_artisan) : définition inattendue (ancre en tête de définition) ; rien n''est modifié.';
  end if;
  v_coupe := length(v_avant) - v_coupe + 1;
  execute left(v_def, v_coupe) || v_bloc || substr(v_def, v_coupe + 1);
end $d23$;
revoke all on function public.valider_facture_artisan(uuid, uuid, text) from public, anon;
grant execute on function public.valider_facture_artisan(uuid, uuid, text) to authenticated;

-- 9. Le journal ne propose pas d'annuler seule l'écriture d'un règlement : il dit où agir (fiche de l'incident).
-- Ancre d'UNE ligne (la branche de l'encaissement de loyer), exigée exactement une fois ; le bloc est inséré au début de
-- cette ligne, entre deux marques. Fonction de l'appelant : sous un client, la RLS des règlements s'applique.
do $d23$
declare
  v_def text; v_avant text; v_pos integer; v_coupe integer;
  v_ancre constant text := 'when e.encaissement_id is not null then';
  v_bloc constant text := E'    -- >> D23 (PRO2-21) : une écriture née d''un règlement de facture d''intervention se retire depuis la fiche de l''incident.\n'
    || E'    when exists (select 1 from public.intervention_facture_reglements r where r.ecriture_id = e.id) then\n'
    || E'      ''Cette écriture vient du règlement d''''une facture d''''intervention : retirez le règlement depuis la fiche de l''''incident (« Retirer ce règlement »), qui passe la contre-écriture et recalcule l''''état de la facture''\n'
    || E'    -- << D23 (PRO2-21)\n';
begin
  select pg_get_functiondef('public.ecriture_annulable_depuis_le_journal(uuid)'::regprocedure) into v_def;
  if position('-- >> D23 (PRO2-21)' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif PRO2-21 (ecriture_annulable_depuis_le_journal) : définition inattendue (ancre absente ou répétée) ; rien n''est modifié.';
  end if;
  v_pos := position(v_ancre in v_def);
  v_avant := left(v_def, v_pos - 1);
  v_coupe := position(E'\n' in reverse(v_avant));
  if v_coupe = 0 then
    raise exception 'Correctif PRO2-21 (ecriture_annulable_depuis_le_journal) : définition inattendue (ancre en tête de définition) ; rien n''est modifié.';
  end if;
  v_coupe := length(v_avant) - v_coupe + 1;
  execute left(v_def, v_coupe) || v_bloc || substr(v_def, v_coupe + 1);
end $d23$;
revoke all on function public.ecriture_annulable_depuis_le_journal(uuid) from public, anon;
grant execute on function public.ecriture_annulable_depuis_le_journal(uuid) to authenticated;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();
