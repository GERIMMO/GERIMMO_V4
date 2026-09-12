-- La grille agence : un barème par tranches, et le lot comme unité.
--
-- LA DÉCISION (humain, 12/09). La grille actée le 25/07 facturait par PALIER —
-- 79 € jusqu'à 50 lots, 149 € jusqu'à 150, 249 € jusqu'à 300, 399 € jusqu'à
-- 600. Elle n'a jamais été implémentée, et son défaut de fond n'est pas son
-- niveau : c'est sa MARCHE. Une agence à 50 lots qui en signait un
-- cinquante-et-unième voyait sa facture logicielle passer de 79 € à 149 € —
-- +89 % le jour où elle gagnait 49 € d'honoraires.
--
-- CE QUE COÛTE UNE MARCHE, ET CE N'EST PAS DE L'ARGENT. L'agence ne saisit pas
-- ce lot, ou elle téléphone pour négocier. Dans le premier cas, le parc dans
-- l'outil cesse d'être le parc réel — et tout ce qui en découle (relevés de
-- gestion, régularisations de charges, états fiscaux) devient faux sans que
-- personne ne s'en aperçoive. Un prix qui abîme la donnée coûte plus cher qu'il
-- ne rapporte.
--
-- LE BARÈME EST MARGINAL, comme un barème d'impôt : chaque lot est facturé au
-- tarif de SA tranche, jamais au tarif du palier entier. Le même passage coûte
-- alors 1,30 €. Il n'y a plus de seuil à éviter, donc plus de raison de mentir
-- à son propre outil.
--
-- L'UNITÉ CHANGE, ET C'EST LA MOITIÉ DU TRAVAIL. Le calcul comptait les BIENS.
-- Pour une agence, c'est faux d'un facteur considérable : un immeuble de trente
-- lots comptait pour un. Le référentiel dit déjà quoi compter — « lot sous
-- mandat actif au dernier jour du mois, vacant compté, sans mandat non »
-- (RM-18.6) — et la base le permet : `mandat_lignes` porte `lot_id` et ses
-- dates, `mandats` porte son état. Un lot vacant SOUS MANDAT est compté : il
-- occupe l'outil, il coûte du travail, et c'est précisément quand il est vide
-- que l'agence s'en sert le plus.
--
-- LE PROPRIÉTAIRE DIRECT NE CHANGE PAS : 1ᵉʳ bien offert à vie, 5,99 €/bien
-- ensuite (décision du 05/09). Deux publics, deux unités, deux barèmes — une
-- seule fonction qui sait lequel appliquer, d'après `organizations.type`.

-- ── 1. Le barème, en données plutôt qu'en code ────────────────────────────
-- En table : le changer un jour ne demandera pas de migrer une fonction, et
-- l'historique des tranches reste lisible. Les bornes sont HAUTES et
-- inclusives ; la dernière est nulle (« au-delà »).
create table if not exists public.tarif_tranches (
  public public.organization_type not null,
  borne_haute integer,                    -- null = la tranche qui n'a pas de fin
  prix_unitaire_cents integer not null,
  forfait_cents integer not null default 0, -- plancher porté par la 1ʳᵉ tranche
  rang smallint not null,
  primary key (public, rang)
);
comment on table public.tarif_tranches is
  'Barème marginal par tranches. Chaque unité est facturée au tarif de SA tranche (comme un barème d''impôt) : aucune marche, aucun seuil à éviter.';
alter table public.tarif_tranches enable row level security;
-- Lisible par tout compte connecté : c'est le tarif public du produit, il
-- s'affiche sur « Mon abonnement » et il n'y a rien à y cacher. Écriture
-- réservée au propriétaire de la base (migration).
drop policy if exists tarif_tranches_lecture on public.tarif_tranches;
create policy tarif_tranches_lecture on public.tarif_tranches
  for select to authenticated using (true);
revoke insert, update, delete on public.tarif_tranches from anon, authenticated;
grant select on public.tarif_tranches to anon, authenticated, service_role;

delete from public.tarif_tranches;
insert into public.tarif_tranches (public, rang, borne_haute, prix_unitaire_cents, forfait_cents) values
  -- AGENCE — unité : le lot sous mandat actif.
  -- La première tranche porte le PLANCHER de 39 € : en dessous de dix lots,
  -- c'est lui qui s'applique. Sans plancher, une agence de cinq lots paierait
  -- 19,50 € pour un produit qui lui ouvre tout — et nous coûterait davantage
  -- en support qu'elle ne rapporte.
  ('agence', 1,   10, 0,   3900),
  ('agence', 2,   50, 200, 0),
  ('agence', 3,  150, 130, 0),
  ('agence', 4,  400,  80, 0),
  ('agence', 5, null,  50, 0),
  -- PROPRIÉTAIRE DIRECT — unité : le bien, le premier offert à vie (le retrait
  -- se fait au comptage, pas ici). Une seule tranche : 5,99 €, sans plancher.
  ('proprietaire_direct', 1, null, 599, 0);

-- Au-delà de ce nombre de lots, une agence ne souscrit plus en ligne : elle
-- passe par un devis (RM « requires_quote » de la grille du 25/07). Une agence
-- DÉJÀ abonnée qui franchit le seuil continue d'être facturée au tarif de la
-- dernière tranche — on ne coupe pas un client parce qu'il grandit.
create or replace function public.seuil_devis_agence()
returns integer language sql immutable set search_path = ''
as $$ select 600 $$;
revoke execute on function public.seuil_devis_agence() from public, anon;

-- ── 2. Ce qu'on compte, selon qui l'on est ────────────────────────────────
create or replace function public.abonnement_quantite_cible(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case o.type
    -- L'AGENCE : les lots sous mandat actif (RM-18.6). Un mandat en préavis
    -- court encore — il produit des quittances, des relevés, des incidents :
    -- le compter serait injuste s'il ne travaillait plus, mais il travaille.
    -- Un mandat en brouillon ou à signer, non : rien n'a été confié.
    when 'agence' then (
      select count(distinct ml.lot_id)::integer
      from public.mandat_lignes ml
      join public.mandats m on m.id = ml.mandat_id
      where ml.organization_id = o.id
        and m.etat in ('actif', 'preavis')
        and ml.date_debut <= current_date
        and (ml.date_fin is null or ml.date_fin >= current_date)
    )
    -- LE PROPRIÉTAIRE DIRECT : ses biens, le premier offert à vie.
    else greatest(0, (select count(*) from public.biens b
                      where b.organization_id = o.id) - 1)::integer
  end
  from public.organizations o where o.id = p_org;
$$;
comment on function public.abonnement_quantite_cible(uuid) is
  'Unités facturables : lots sous mandat actif pour une agence (RM-18.6, vacant compté, sans mandat non), biens moins le premier pour un propriétaire direct.';
revoke execute on function public.abonnement_quantite_cible(uuid) from public, anon;
grant execute on function public.abonnement_quantite_cible(uuid) to service_role;

-- ── 3. Le montant, par le barème ──────────────────────────────────────────
-- Écrit une fois, en centimes, et utilisé partout : l'écran, le miroir Stripe,
-- la tâche de nuit. Deux additions du même montant finissent par diverger.
create or replace function public.montant_abonnement_cents(
  p_type public.organization_type, p_unites integer
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  -- Les bornes BASSES se déduisent des hautes (la borne haute de la tranche
  -- précédente), et une fenêtre ne peut pas vivre dans un agrégat : on les
  -- calcule d'abord, on additionne ensuite.
  with bornes as (
    select coalesce(lag(t.borne_haute) over (order by t.rang), 0) as bas,
           coalesce(t.borne_haute, 2147483647) as haut,
           t.prix_unitaire_cents, t.forfait_cents
    from public.tarif_tranches t
    where t.public = p_type
  )
  select case when coalesce(p_unites, 0) <= 0 then 0 else coalesce((
    select sum(b.forfait_cents
               + greatest(0, least(p_unites, b.haut) - b.bas) * b.prix_unitaire_cents)::bigint
    from bornes b
    where b.bas < p_unites
  ), 0) end;
$$;
revoke execute on function public.montant_abonnement_cents(public.organization_type, integer)
  from public, anon;
grant execute on function public.montant_abonnement_cents(public.organization_type, integer) to service_role;

-- ── 4. Achetable en ligne, ou sur devis ───────────────────────────────────
-- Au-delà du seuil, une agence ne souscrit plus seule : le portefeuille mérite
-- une conversation (reprise comptable, formation, engagement). Mais une agence
-- DÉJÀ abonnée qui franchit le seuil n'est pas coupée — on ne punit pas un
-- client qui grandit ; sa facture suit simplement la dernière tranche.
create or replace function public.abonnement_en_ligne_possible(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when o.type <> 'agence' then true
    when a.stripe_subscription_id is not null then true   -- déjà client
    else public.abonnement_quantite_cible(o.id) <= public.seuil_devis_agence()
  end
  from public.organizations o
  left join public.abonnements a on a.organization_id = o.id
  where o.id = p_org;
$$;
revoke execute on function public.abonnement_en_ligne_possible(uuid) from public, anon;

-- ── 5. L'écran, en unités qui ne mentent pas ──────────────────────────────
-- « biens » ne veut rien dire pour une agence dont on compte les lots. Les
-- colonnes prennent le nom de ce qu'elles portent, et une colonne dit LEQUEL
-- des deux publics on est — l'écran n'a pas à le deviner.
drop function if exists public.etat_abonnement(uuid);
create function public.etat_abonnement(p_org uuid)
returns table (
  statut text,
  ecriture_ouverte boolean,
  essai_fin date,
  jours_essai_restants integer,
  public_tarif public.organization_type,
  unite text,                    -- « bien » ou « lot sous mandat »
  unites_total integer,          -- ce que l'organisation gère
  unites_facturees integer,      -- ce qui entre dans le calcul
  mensuel numeric,
  en_ligne_possible boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.status::text,
    public.org_ecriture_ouverte(o.id),
    o.essai_fin,
    case when o.status = 'essai' and o.essai_fin is not null
         then greatest(0, (o.essai_fin - current_date))::integer end,
    o.type,
    case when o.type = 'agence' then 'lot sous mandat' else 'bien' end,
    case when o.type = 'agence'
         then public.abonnement_quantite_cible(o.id)
         else (select count(*)::integer from public.biens b where b.organization_id = o.id)
    end,
    public.abonnement_quantite_cible(o.id),
    round(public.montant_abonnement_cents(o.type, public.abonnement_quantite_cible(o.id)) / 100.0, 2),
    public.abonnement_en_ligne_possible(o.id)
  from public.organizations o
  where o.id = p_org
    and o.id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
$$;
comment on function public.etat_abonnement(uuid) is
  'Ce que « Mon abonnement » affiche. Deux publics, deux unités : le bien pour un propriétaire direct (le 1ᵉʳ offert), le lot sous mandat actif pour une agence (RM-18.6).';
revoke execute on function public.etat_abonnement(uuid) from public, anon;

-- Le détail par tranche, pour que l'agence VOIE d'où sort son montant. Une
-- facture qu'on ne peut pas recalculer soi-même est une facture qu'on appelle
-- pour contester.
create or replace function public.detail_tranches_abonnement(p_org uuid)
returns table (
  rang smallint,
  libelle text,
  unites integer,
  prix_unitaire numeric,
  sous_total numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with orga as (
    select o.type, public.abonnement_quantite_cible(o.id) as n
    from public.organizations o
    where o.id = p_org
      and o.id in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  ),
  bornes as (
    select t.rang,
           coalesce(lag(t.borne_haute) over (order by t.rang), 0) as bas,
           coalesce(t.borne_haute, 2147483647) as haut,
           t.prix_unitaire_cents, t.forfait_cents
    from public.tarif_tranches t, orga where t.public = orga.type
  )
  select
    b.rang,
    case
      when b.forfait_cents > 0 then
        format('Jusqu''à %s', b.haut)
      when b.haut = 2147483647 then format('Au-delà de %s', b.bas)
      else format('Du %s%s au %s%s', b.bas + 1,
                  case when b.bas + 1 = 1 then 'ᵉʳ' else 'ᵉ' end,
                  b.haut, 'ᵉ')
    end,
    greatest(0, least(orga.n, b.haut) - b.bas)::integer,
    round(b.prix_unitaire_cents / 100.0, 2),
    round((b.forfait_cents
           + greatest(0, least(orga.n, b.haut) - b.bas) * b.prix_unitaire_cents) / 100.0, 2)
  from bornes b, orga
  where b.bas < orga.n
  order by b.rang;
$$;
revoke execute on function public.detail_tranches_abonnement(uuid) from public, anon;

-- ── 6. Le miroir Stripe suit le barème, plus une multiplication ───────────
-- `quantite * 599` était juste tant qu'il n'y avait qu'un public et qu'un prix.
-- Avec deux barèmes, c'est une facture fausse affichée à côté de la vraie.
create or replace function public.abonnement_synchro_faite(
  p_org uuid, p_quantite integer, p_erreur text default null
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.abonnements a set
    quantite = case when p_erreur is null then p_quantite else a.quantite end,
    montant_mensuel_cents = case when p_erreur is null
      then public.montant_abonnement_cents(o.type, p_quantite)
      else a.montant_mensuel_cents end,
    a_resynchroniser = p_erreur is not null,
    derniere_synchro = now(),
    derniere_erreur = p_erreur,
    updated_at = now()
  from public.organizations o
  where a.organization_id = p_org and o.id = a.organization_id;
$$;
revoke execute on function public.abonnement_synchro_faite(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.abonnement_synchro_faite(uuid, integer, text) to service_role;

-- ── 7. Les deux derniers endroits qui multipliaient par 5,99 ──────────────
-- `abonnement_appliquer` (miroir du webhook) et `mon_abonnement` (l'écran)
-- calculaient le montant en dur. Sur une agence, ils auraient affiché
-- 5,99 € × le nombre de lots — pour 300 lots, 1 797 € au lieu de 369 €.
-- Quatre fois trop, sur l'écran qui sert à décider de payer.
create or replace function public.abonnement_appliquer(
  p_customer text,
  p_subscription text,
  p_statut text,
  p_quantite integer,
  p_periode_fin timestamptz,
  p_annulation boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_type public.organization_type;
  v_statut_actuel public.organization_status;
  v_essai_fin date;
  v_cible public.organization_status;
  v_defaut_avant date;
begin
  select a.organization_id, a.paiement_en_defaut_depuis
    into v_org, v_defaut_avant
  from public.abonnements a where a.stripe_customer_id = btrim(p_customer);
  if v_org is null then
    -- Un événement pour un client qu'on ne connaît pas n'est pas une erreur à
    -- faire remonter en 500 : Stripe le rejouerait indéfiniment.
    return null;
  end if;
  select o.type, o.status, o.essai_fin into v_type, v_statut_actuel, v_essai_fin
  from public.organizations o where o.id = v_org;

  update public.abonnements set
    stripe_subscription_id = coalesce(nullif(btrim(coalesce(p_subscription,'')),''), stripe_subscription_id),
    stripe_statut = p_statut,
    quantite = coalesce(p_quantite, quantite),
    montant_mensuel_cents =
      public.montant_abonnement_cents(v_type, coalesce(p_quantite, quantite)),
    periode_fin = coalesce(p_periode_fin, periode_fin),
    annulation_demandee = coalesce(p_annulation, false),
    -- LE DÉFAUT SE POSE UNE FOIS, PAS À CHAQUE ÉVÉNEMENT. Stripe réémet
    -- `past_due` à chaque tentative ratée ; réécrire la date à chaque fois
    -- repousserait l'échéance indéfiniment, et les quinze jours ne
    -- viendraient jamais.
    paiement_en_defaut_depuis = case
      when p_statut in ('past_due', 'unpaid')
        then coalesce(paiement_en_defaut_depuis, current_date)
      when p_statut in ('active', 'trialing') then null   -- régularisé
      else paiement_en_defaut_depuis
    end,
    relances_paiement = case
      when p_statut in ('active', 'trialing') then 0 else relances_paiement end,
    derniere_relance_le = case
      when p_statut in ('active', 'trialing') then null else derniere_relance_le end,
    derniere_synchro = now(),
    derniere_erreur = null,
    updated_at = now()
  where organization_id = v_org;

  if v_statut_actuel = 'archivee' then
    return v_org;
  end if;

  v_cible := case
    when p_statut in ('active', 'trialing') then 'active'::public.organization_status
    -- `past_due` ne change PAS le statut : le client paie, sa carte a échoué.
    -- C'est l'écriture qui se ferme, au quinzième jour, par la date.
    when p_statut = 'past_due' then v_statut_actuel
    when p_statut = 'incomplete' then v_statut_actuel
    when p_statut in ('canceled', 'unpaid', 'incomplete_expired', 'paused') then
      case when v_essai_fin is not null and v_essai_fin >= current_date
           then 'essai'::public.organization_status
           else 'suspendue'::public.organization_status end
    else v_statut_actuel
  end;

  if v_cible is distinct from v_statut_actuel then
    perform set_config('gerimmo.systeme', 'on', true);
    update public.organizations set status = v_cible, updated_at = now()
    where id = v_org;
    perform set_config('gerimmo.systeme', '', true);

    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'abonnement_statut',
            jsonb_build_object('stripe', p_statut, 'avant', v_statut_actuel,
                               'apres', v_cible, 'souscription', p_subscription));
  end if;

  if v_defaut_avant is null and p_statut in ('past_due', 'unpaid') then
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'paiement_en_defaut',
            jsonb_build_object('stripe', p_statut,
                               'lecture_seule_le', current_date + public.delai_defaut_paiement_jours()));
  elsif v_defaut_avant is not null and p_statut in ('active', 'trialing') then
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'paiement_regularise',
            jsonb_build_object('en_defaut_depuis', v_defaut_avant));
  end if;

  return v_org;
end;
$$;
revoke execute on function public.abonnement_appliquer(text, text, text, integer, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.abonnement_appliquer(text, text, text, integer, timestamptz, boolean) to service_role;

drop function if exists public.mon_abonnement(uuid);
create function public.mon_abonnement(p_org uuid)
returns table (
  stripe_statut text,
  paye boolean,
  periode_fin timestamptz,
  annulation_demandee boolean,
  quantite_cible integer,
  montant_mensuel numeric,
  paiement_en_retard boolean,
  lecture_seule_le date,
  jours_avant_lecture_seule integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.stripe_statut,
    coalesce(a.stripe_statut in ('active', 'trialing'), false),
    a.periode_fin,
    coalesce(a.annulation_demandee, false),
    public.abonnement_quantite_cible(o.id),
    round(public.montant_abonnement_cents(o.type, public.abonnement_quantite_cible(o.id)) / 100.0, 2),
    a.paiement_en_defaut_depuis is not null,
    (a.paiement_en_defaut_depuis + public.delai_defaut_paiement_jours())::date,
    case when a.paiement_en_defaut_depuis is not null
         then greatest(0, public.delai_defaut_paiement_jours()
                          - (current_date - a.paiement_en_defaut_depuis))::integer end
  from public.organizations o
  left join public.abonnements a on a.organization_id = o.id
  where o.id = p_org
    and o.id in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]));
$$;
comment on function public.mon_abonnement(uuid) is
  'État de paiement pour « Mon abonnement ». Réservé au responsable ; ne rend aucun identifiant Stripe. Le montant suit le barème du public (tranches pour une agence, 5,99 €/bien pour un propriétaire direct).';
revoke execute on function public.mon_abonnement(uuid) from public, anon;

select public.fermer_fonctions_a_anon();

-- ── 8. Une fonction de plus ne doit pas élargir la surface ────────────────
-- `abonnement_en_ligne_possible` prend une organisation en paramètre et ne
-- vérifie pas qui appelle : exposée à `authenticated`, elle dirait de
-- N'IMPORTE QUELLE organisation si elle peut souscrire en ligne — donc en
-- creux si elle dépasse 600 lots et si elle est déjà cliente. Ce n'est pas une
-- fuite grave, mais c'est une entorse à l'invariant que
-- `tests/rpc-etancheite-inter-agences.test.ts` fait respecter, et les entorses
-- tolérées finissent par en couvrir une qui compte.
--
-- Elle n'est appelée que depuis `etat_abonnement`, qui porte déjà la garde
-- d'appartenance. Un SECURITY DEFINER appelle ce qu'il veut : la retirer à
-- `authenticated` ne casse rien et referme la porte.
revoke execute on function public.abonnement_en_ligne_possible(uuid)
  from public, anon, authenticated;
