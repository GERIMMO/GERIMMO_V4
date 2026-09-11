-- Encaisser : ce que Gerimmo compte, Stripe le prélève (module 16 / RM-18.6.9).
--
-- CE QUI MANQUAIT. « Mon abonnement » sait dire combien l'agence doit — la
-- formule est actée (1ᵉʳ bien offert à vie, 5,99 €/bien/mois ensuite, décision
-- humain du 05/09), le décompte vient de `etat_abonnement`, et depuis le 11/09
-- un essai expiré FERME réellement l'écriture. Il n'existait simplement aucun
-- moyen de payer. Le produit savait fermer la porte, pas la rouvrir.
--
-- LE PARTAGE DES RÔLES, ET IL N'EST PAS NÉGOCIABLE. Gerimmo compte les biens,
-- Stripe encaisse. La quantité facturée se calcule ICI, dans la base qui tient
-- le parc ; jamais à partir de ce que Stripe croit savoir. Dans l'autre sens,
-- l'état du paiement vient de Stripe et de lui seul : c'est lui qui sait si la
-- carte est passée. Deux additions du même montant finissent toujours par
-- diverger — chaque fait a donc UNE source, et une seule.
--
-- LE PIÈGE QUI AURAIT TOUT BLOQUÉ. Toute table portant `organization_id` est
-- gardée par le refus d'écriture des comptes fermés (migration du 11/09). Posée
-- sur `abonnements`, cette garde crée une impasse parfaite : le compte est
-- fermé parce qu'il n'a pas payé, et il ne PEUT pas payer parce que le compte
-- est fermé. Les deux tables de ce fichier sont donc exclues de la garde, au
-- même titre que les journaux — et pour une raison plus forte encore : c'est
-- précisément quand le compte est fermé qu'on doit pouvoir y écrire.
--
-- LES ÉVÉNEMENTS SONT DÉDOUBLONNÉS, PARCE QUE STRIPE RÉESSAIE. Un webhook non
-- confirmé est renvoyé, plusieurs fois, pendant trois jours. Traiter deux fois
-- « paiement reçu » n'est pas grave ; traiter deux fois dans le désordre l'est.
-- On enregistre donc l'identifiant de l'événement AVANT de le traiter : le
-- second passage se reconnaît et ne fait rien.

-- ── 1. Ce que Stripe sait, rangé chez nous ─────────────────────────────────
create table if not exists public.abonnements (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  -- Identifiants Stripe. Uniques : deux organisations ne partagent jamais un
  -- client ni une souscription, et une collision voudrait dire qu'on facture
  -- l'une pour l'autre.
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  -- Le statut TEL QUE STRIPE LE DIT, sans traduction. La traduction en statut
  -- d'organisation est un choix métier, fait plus bas et lisible ; garder le
  -- mot d'origine permet de comprendre après coup pourquoi on a fermé.
  stripe_statut text,
  -- La quantité qu'on a effectivement poussée chez Stripe, et celle qu'on
  -- devrait pousser. L'écart est ce que la tâche de nuit a à faire.
  quantite integer not null default 0,
  montant_mensuel_cents bigint not null default 0,
  periode_fin timestamptz,
  -- Annulation demandée : la souscription court jusqu'au bout de la période
  -- déjà payée. On ne coupe pas un mois acheté.
  annulation_demandee boolean not null default false,
  -- Posé par un déclencheur dès qu'un bien entre ou sort. Relevé par la tâche
  -- planifiée, qui pousse la nouvelle quantité.
  a_resynchroniser boolean not null default false,
  derniere_synchro timestamptz,
  derniere_erreur text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.abonnements is
  'Miroir local de la souscription Stripe d''une organisation. Gerimmo compte les biens, Stripe encaisse : la quantité part d''ici, le statut de paiement vient de là-bas.';

create index if not exists abonnements_a_resynchroniser_idx
  on public.abonnements (a_resynchroniser) where a_resynchroniser;

alter table public.abonnements enable row level security;
-- RLS ACTIF **ET** AUCUN DROIT : les deux, pas l'un ou l'autre. Sans politique,
-- le RLS seul suffirait à ne rien rendre — mais il suffit qu'on en écrive une
-- un jour « pour dépanner » pour que la table s'ouvre. Retirer les droits ferme
-- la porte en amont : `anon` et `authenticated` n'atteignent pas la table, quoi
-- qu'on écrive ensuite. L'accès passe par les fonctions ci-dessous, qui ne
-- rendent jamais un identifiant Stripe (voir `mon_abonnement`).
revoke all on table public.abonnements from anon, authenticated;

create table if not exists public.abonnement_evenements (
  stripe_event_id text primary key,
  type text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  recu_le timestamptz not null default now(),
  traite_le timestamptz,
  erreur text,
  charge jsonb
);
comment on table public.abonnement_evenements is
  'Journal des webhooks Stripe. La clé primaire EST le dédoublonnage : Stripe réessaie pendant trois jours, le second passage se reconnaît et ne refait rien.';
alter table public.abonnement_evenements enable row level security;
revoke all on table public.abonnement_evenements from anon, authenticated;

-- ── 2. Les deux tables sortent de la garde d'abonnement ────────────────────
-- Sans cette exclusion, le compte fermé ne peut pas se rouvrir : la garde
-- refuserait l'écriture qui enregistre le paiement. C'est l'impasse décrite en
-- tête de fichier, et elle serait invisible jusqu'au premier client qui paie.
create or replace function public.poser_gardes_abonnement()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  -- Les journaux : jamais gardés. Lire une pièce écrit dans `acces_pieces_log`,
  -- toute action écrit dans `audit_log` : les bloquer bloquerait la LECTURE
  -- elle-même, et ferait perdre la trace au moment précis où elle compte.
  --
  -- L'abonnement : jamais gardé non plus, et pour la raison inverse. C'est la
  -- table par laquelle un compte fermé se rouvre. La garder, c'est exiger d'un
  -- client qu'il paie avec un compte qu'on lui a fermé faute de paiement.
  v_jamais text[] := array['acces_pieces_log', 'audit_log',
                           'abonnements', 'abonnement_evenements'];
  -- Gardées en création et suppression seulement : leur UPDATE est un effet de
  -- LECTURE (marquage « lu »), pas un geste de gestion. Sans cette exception,
  -- un locataire ne pourrait plus ouvrir son courrier parce que son agence ne
  -- paie plus.
  v_sans_update text[] := array['messages'];
  v_ops text;
  v_n integer := 0;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (select 1 from pg_attribute a
                  where a.attrelid = c.oid and a.attname = 'organization_id'
                    and a.attnum > 0 and not a.attisdropped)
    order by c.relname
  loop
    if t.relname = any(v_jamais) then
      -- Rattrapage : une garde a pu être posée avant cette exclusion.
      execute format('drop trigger if exists %I on public.%I',
                     'abonnement_' || t.relname, t.relname);
      continue;
    end if;
    v_ops := case when t.relname = any(v_sans_update)
                  then 'insert or delete' else 'insert or update or delete' end;
    execute format('drop trigger if exists %I on public.%I',
                   'abonnement_' || t.relname, t.relname);
    execute format(
      'create trigger %I before %s on public.%I for each row execute function public.refuser_ecriture_si_fermee()',
      'abonnement_' || t.relname, v_ops, t.relname);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
comment on function public.poser_gardes_abonnement() is
  'Repose le refus d''écriture sur toutes les tables d''organisation. À APPELER EN FIN DE TOUTE MIGRATION qui crée une table portant organization_id. Exclut les journaux et les tables d''abonnement : c''est par elles qu''un compte fermé se rouvre.';
revoke execute on function public.poser_gardes_abonnement() from public, anon, authenticated;
select public.poser_gardes_abonnement();

-- ── 3. Le statut d'organisation devient écrivable par le système ───────────
-- `organizations_champs_reserves_sa` réserve `status` au super admin. Un
-- webhook Stripe n'a pas d'identité : il ne peut être ni super admin, ni quoi
-- que ce soit. On rouvre donc exactement le même passage que la rétention
-- légale — un réglage LOCAL à la transaction, que seules les fonctions de ce
-- fichier posent et que PostgREST n'a aucun moyen de poser.
create or replace function public.organizations_champs_reserves_sa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('gerimmo.systeme', true), '') = 'on' then
    return new;
  end if;
  if (new.status is distinct from old.status
      or new.type is distinct from old.type
      or new.essai_fin is distinct from old.essai_fin)
     and not public.is_super_admin() then
    raise exception 'Seul le super admin modifie le statut, le type ou l''essai d''une organisation';
  end if;
  return new;
end;
$$;
revoke execute on function public.organizations_champs_reserves_sa() from public, anon, authenticated;

-- ── 4. La quantité à facturer, calculée ici et nulle part ailleurs ─────────
-- 1ᵉʳ bien offert à vie, 5,99 €/bien/mois ensuite (décision humain 2026-09-05).
-- Le prix unitaire vit chez Stripe ; ce qui vit ici, c'est le NOMBRE. Le
-- dupliquer des deux côtés, c'est se garantir qu'ils divergeront.
create or replace function public.abonnement_quantite_cible(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, count(*) - 1)::integer
  from public.biens where organization_id = p_org;
$$;
revoke execute on function public.abonnement_quantite_cible(uuid) from public, anon, authenticated;

-- ── 5. Ce que l'écran de l'agence a le droit de voir ───────────────────────
-- Ni l'identifiant client, ni celui de la souscription : ils ne servent à rien
-- dans un navigateur et tout à qui les collecte.
create or replace function public.mon_abonnement(p_org uuid)
returns table (
  stripe_statut text,
  paye boolean,              -- une souscription existe et Stripe l'honore
  periode_fin timestamptz,
  annulation_demandee boolean,
  quantite_cible integer,
  montant_mensuel numeric,
  paiement_en_retard boolean -- prélèvement échoué : Stripe relance, rien n'est fermé
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
    round(public.abonnement_quantite_cible(o.id) * 5.99, 2),
    coalesce(a.stripe_statut = 'past_due', false)
  from public.organizations o
  left join public.abonnements a on a.organization_id = o.id
  where o.id = p_org
    and o.id in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]));
$$;
comment on function public.mon_abonnement(uuid) is
  'État de paiement pour « Mon abonnement ». Réservé au responsable de l''organisation ; ne rend aucun identifiant Stripe.';
revoke execute on function public.mon_abonnement(uuid) from public, anon;

-- ── 6. Le responsable enregistre son client Stripe ────────────────────────
-- Appelée AVANT d'ouvrir la page de paiement, avec la session du responsable :
-- pas besoin de la clé de service pour souscrire. Elle passe même quand le
-- compte est fermé — c'est tout l'objet de l'exclusion posée plus haut.
create or replace function public.abonnement_client_pose(p_org uuid, p_customer text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Réservé au responsable de l''organisation : souscrire engage l''agence';
  end if;
  if nullif(btrim(coalesce(p_customer, '')), '') is null then
    raise exception 'Identifiant client Stripe vide';
  end if;

  insert into public.abonnements (organization_id, stripe_customer_id)
  values (p_org, btrim(p_customer))
  on conflict (organization_id) do update
    -- On ne REMPLACE jamais un client existant : deux clients pour une même
    -- organisation, c'est deux factures et un moyen de paiement orphelin.
    set stripe_customer_id = coalesce(public.abonnements.stripe_customer_id, excluded.stripe_customer_id),
        updated_at = now();
end;
$$;
revoke execute on function public.abonnement_client_pose(uuid, text) from public, anon;

create or replace function public.mon_client_stripe(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.stripe_customer_id
  from public.abonnements a
  where a.organization_id = p_org
    and p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]));
$$;
revoke execute on function public.mon_client_stripe(uuid) from public, anon;

-- ── 7. Les webhooks : d'abord ne rien refaire deux fois ───────────────────
create or replace function public.abonnement_evenement_a_traiter(
  p_event_id text, p_type text, p_charge jsonb default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nouveau boolean;
begin
  insert into public.abonnement_evenements (stripe_event_id, type, charge)
  values (p_event_id, p_type, p_charge)
  on conflict (stripe_event_id) do nothing;
  get diagnostics v_nouveau = row_count;
  -- `row_count` vaut 0 quand la ligne existait déjà : l'événement a déjà été
  -- vu, on répond « rien à faire » et l'appelant confirme à Stripe sans
  -- rejouer. C'est le dédoublonnage, et il tient dans une clé primaire.
  return v_nouveau;
end;
$$;
revoke execute on function public.abonnement_evenement_a_traiter(text, text, jsonb)
  from public, anon, authenticated;

create or replace function public.abonnement_evenement_solde(
  p_event_id text, p_erreur text default null
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.abonnement_evenements
     set traite_le = now(), erreur = p_erreur
   where stripe_event_id = p_event_id;
$$;
revoke execute on function public.abonnement_evenement_solde(text, text)
  from public, anon, authenticated;

-- L'ÉCHEC DOIT POUVOIR ÊTRE REJOUÉ, ET C'EST LE PIÈGE DE TOUT DÉDOUBLONNAGE.
-- On enregistre l'événement AVANT de le traiter, pour qu'une seconde livraison
-- simultanée ne le refasse pas. Mais si le traitement échoue, la trace laissée
-- ferait passer la RELANCE de Stripe pour un doublon : l'événement serait perdu
-- pour toujours, et le compte resterait fermé alors que le client a payé. On
-- efface donc la trace en cas d'échec — la relance repart d'une page blanche.
create or replace function public.abonnement_evenement_rejouable(p_event_id text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.abonnement_evenements
   where stripe_event_id = p_event_id and traite_le is null;
$$;
revoke execute on function public.abonnement_evenement_rejouable(text)
  from public, anon, authenticated;

-- ── 8. Appliquer ce que Stripe dit ────────────────────────────────────────
-- LA TRADUCTION EST LE CŒUR MÉTIER DE CE FICHIER, et elle est écrite en clair
-- plutôt que dispersée dans du code applicatif : c'est elle qui décide quand un
-- client perd l'usage de son outil de travail.
--
--   trialing, active   → le compte est ouvert. Rien d'autre à dire.
--   past_due           → le prélèvement a échoué et Stripe RELANCE (il réessaie
--                        pendant des semaines, selon le réglage du compte). On
--                        ne ferme RIEN : une carte expirée n'est pas un impayé,
--                        et couper une agence au premier échec lui fait perdre
--                        sa journée pour une raison qu'elle ignore encore. Le
--                        bandeau la prévient ; Stripe fait son travail.
--   canceled, unpaid,
--   incomplete_expired,
--   paused             → Stripe a épuisé ses relances, ou le client a résilié
--                        et la période payée est écoulée. Lecture seule.
--   incomplete         → la première carte n'est pas encore confirmée. On ne
--                        touche à rien : le compte est dans l'état où il était.
--
-- ET L'ESSAI SURVIT À L'ANNULATION. Une organisation qui annule pendant ses
-- quatorze jours retombe en `essai`, pas en `suspendue` : elle n'a jamais payé
-- et son essai n'est pas fini. Fermer là serait lui reprendre un droit acquis.
--
-- `archivee` n'est JAMAIS touché : une organisation archivée l'a été par un
-- geste humain, aucun événement de paiement ne la réveille.
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
  v_statut_actuel public.organization_status;
  v_essai_fin date;
  v_cible public.organization_status;
begin
  select a.organization_id into v_org
  from public.abonnements a where a.stripe_customer_id = btrim(p_customer);
  if v_org is null then
    -- Un événement pour un client qu'on ne connaît pas n'est pas une erreur à
    -- faire remonter en 500 : Stripe le rejouerait indéfiniment. L'appelant
    -- l'enregistre comme traité, avec son motif.
    return null;
  end if;

  update public.abonnements set
    stripe_subscription_id = coalesce(nullif(btrim(coalesce(p_subscription,'')),''), stripe_subscription_id),
    stripe_statut = p_statut,
    quantite = coalesce(p_quantite, quantite),
    montant_mensuel_cents = coalesce(p_quantite, quantite) * 599,
    periode_fin = coalesce(p_periode_fin, periode_fin),
    annulation_demandee = coalesce(p_annulation, false),
    derniere_synchro = now(),
    derniere_erreur = null,
    updated_at = now()
  where organization_id = v_org;

  select o.status, o.essai_fin into v_statut_actuel, v_essai_fin
  from public.organizations o where o.id = v_org;

  if v_statut_actuel = 'archivee' then
    return v_org;
  end if;

  v_cible := case
    when p_statut in ('active', 'trialing') then 'active'::public.organization_status
    when p_statut = 'past_due' then v_statut_actuel     -- on ne ferme pas sur une relance
    when p_statut = 'incomplete' then v_statut_actuel   -- première carte non confirmée
    when p_statut in ('canceled', 'unpaid', 'incomplete_expired', 'paused') then
      case when v_essai_fin is not null and v_essai_fin >= current_date
           then 'essai'::public.organization_status
           else 'suspendue'::public.organization_status end
    else v_statut_actuel
  end;

  if v_cible is distinct from v_statut_actuel then
    -- Le passage réservé au système : un webhook n'a pas d'identité, il ne peut
    -- pas être super admin. Le réglage est LOCAL à cette transaction.
    perform set_config('gerimmo.systeme', 'on', true);
    update public.organizations set status = v_cible, updated_at = now()
    where id = v_org;
    perform set_config('gerimmo.systeme', '', true);

    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'abonnement_statut',
            jsonb_build_object('stripe', p_statut, 'avant', v_statut_actuel,
                               'apres', v_cible, 'souscription', p_subscription));
  end if;

  return v_org;
end;
$$;
comment on function public.abonnement_appliquer(text, text, text, integer, timestamptz, boolean) is
  'Applique l''état Stripe d''une souscription. past_due NE FERME PAS : Stripe relance, un échec de carte n''est pas un impayé. Un essai en cours survit à l''annulation.';
revoke execute on function public.abonnement_appliquer(text, text, text, integer, timestamptz, boolean)
  from public, anon, authenticated;

-- ── 9. La quantité suit le parc, avec un jour de retard assumé ────────────
-- POURQUOI PAS TOUT DE SUITE. Pousser la quantité chez Stripe au moment où un
-- bien est créé lierait la saisie du parc à la disponibilité d'un tiers : Stripe
-- indisponible, et l'agence ne peut plus ajouter un bien. Or le retard ne coûte
-- rien — Stripe facture à la fin de la période, pas à la seconde. Le déclencheur
-- se contente donc de LEVER UN DRAPEAU ; la tâche de nuit le baisse.
create or replace function public.abonnement_marquer_a_resynchroniser()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
begin
  update public.abonnements set a_resynchroniser = true, updated_at = now()
  where organization_id = v_org and stripe_subscription_id is not null;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.abonnement_marquer_a_resynchroniser()
  from public, anon, authenticated;

drop trigger if exists biens_abonnement_resynchro on public.biens;
create trigger biens_abonnement_resynchro
  after insert or delete on public.biens
  for each row execute function public.abonnement_marquer_a_resynchroniser();

create or replace function public.abonnements_a_synchroniser(p_limite integer default 100)
returns table (
  organization_id uuid,
  organisation text,
  stripe_subscription_id text,
  quantite_posee integer,
  quantite_cible integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.organization_id, o.name, a.stripe_subscription_id,
         a.quantite, public.abonnement_quantite_cible(a.organization_id)
  from public.abonnements a
  join public.organizations o on o.id = a.organization_id
  where a.stripe_subscription_id is not null
    and o.status <> 'archivee'
    and (a.a_resynchroniser
         or a.quantite is distinct from public.abonnement_quantite_cible(a.organization_id))
  order by a.updated_at
  limit greatest(1, least(coalesce(p_limite, 100), 500));
$$;
revoke execute on function public.abonnements_a_synchroniser(integer)
  from public, anon, authenticated;

create or replace function public.abonnement_synchro_faite(
  p_org uuid, p_quantite integer, p_erreur text default null
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.abonnements set
    quantite = case when p_erreur is null then p_quantite else quantite end,
    montant_mensuel_cents = case when p_erreur is null then p_quantite * 599
                                 else montant_mensuel_cents end,
    a_resynchroniser = p_erreur is not null,
    derniere_synchro = now(),
    derniere_erreur = p_erreur,
    updated_at = now()
  where organization_id = p_org;
$$;
revoke execute on function public.abonnement_synchro_faite(uuid, integer, text)
  from public, anon, authenticated;

-- La tâche de nuit et le webhook se présentent avec la clé de service : c'est
-- le seul rôle qui les voit. Aucun de ces gestes ne part d'un navigateur.
grant execute on function public.abonnement_evenement_a_traiter(text, text, jsonb) to service_role;
grant execute on function public.abonnement_evenement_solde(text, text) to service_role;
grant execute on function public.abonnement_evenement_rejouable(text) to service_role;
grant execute on function public.abonnement_appliquer(text, text, text, integer, timestamptz, boolean) to service_role;
grant execute on function public.abonnements_a_synchroniser(integer) to service_role;
grant execute on function public.abonnement_synchro_faite(uuid, integer, text) to service_role;
grant execute on function public.abonnement_quantite_cible(uuid) to service_role;

-- Refermer ce que ce fichier vient d'ouvrir : un CREATE rend les droits par
-- défaut, `anon` compris (migration 20260911290000).
select public.fermer_fonctions_a_anon();
