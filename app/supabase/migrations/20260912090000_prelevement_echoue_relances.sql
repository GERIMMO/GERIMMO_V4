-- Un prélèvement qui échoue prévient, puis ferme au bout de quinze jours.
--
-- LA DÉCISION (humain, 12/09). La règle posée la veille laissait `past_due`
-- sans effet : Stripe relançait de son côté, et le produit attendait qu'il
-- abandonne — sans échéance connue du client ni de nous. Le client décide
-- autrement : alerte immédiate, relances, puis LECTURE SEULE au quinzième jour,
-- jusqu'à régularisation.
--
-- LA FERMETURE EST PORTÉE PAR LA DATE, PAS PAR UNE TÂCHE DE NUIT. C'est le même
-- choix que l'expiration d'essai, et pour la même raison : une tâche qui ne
-- tourne pas laisserait le compte ouvert, et surtout la RÉGULARISATION doit
-- rouvrir à la seconde. Un client qui vient de mettre sa carte à jour et qui
-- doit attendre le passage d'une tâche de nuit pour retravailler nous
-- téléphone — à raison. Ici, `abonnement_appliquer` efface la date de défaut
-- quand Stripe redit « active », et l'écriture rouvre dans la même transaction.
--
-- QUINZE JOURS, ET LE COMPTE RESTE `active`. On ne suspend pas l'organisation :
-- ce client PAIE, sa carte a échoué. `status` reste `active` — c'est
-- l'ÉCRITURE qui se ferme. La distinction compte : elle évite qu'une carte
-- expirée laisse dans le journal d'audit la même trace qu'une résiliation, et
-- elle fait rouvrir le compte sans qu'aucun statut n'ait à être redressé.
--
-- CE QUI RESTE POSSIBLE, ET C'EST L'ENGAGEMENT. Lecture seule ne veut pas dire
-- porte close : tout se consulte, tout s'exporte, le journal de gestion compris.
-- Seules les nouvelles saisies attendent.

-- ── 1. De quand date le défaut, et ce qu'on a déjà dit ────────────────────
alter table public.abonnements
  add column if not exists paiement_en_defaut_depuis date,
  add column if not exists relances_paiement smallint not null default 0,
  add column if not exists derniere_relance_le date;

comment on column public.abonnements.paiement_en_defaut_depuis is
  'Premier jour où Stripe a signalé le prélèvement en échec. Effacé dès qu''il redit « active » : c''est cette date, et elle seule, qui ferme l''écriture au quinzième jour.';
comment on column public.abonnements.relances_paiement is
  'Nombre de courriers de relance déjà partis pour CE défaut. Remis à zéro à la régularisation — un client qui régularise repart d''une page blanche.';

-- Le délai en un seul endroit. Le changer un jour ne doit pas obliger à
-- retrouver « 15 » dans quatre fichiers.
create or replace function public.delai_defaut_paiement_jours()
returns integer language sql immutable set search_path = ''
as $$ select 15 $$;
comment on function public.delai_defaut_paiement_jours() is
  'Jours de tolérance après un prélèvement échoué avant la lecture seule (décision humain du 2026-09-12).';
revoke execute on function public.delai_defaut_paiement_jours() from public, anon;

-- ── 2. L'écriture se ferme par la date ────────────────────────────────────
create or replace function public.org_ecriture_ouverte(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case o.status
           -- L'essai court jusqu'à sa date incluse ; sans date, il ne ferme pas
           -- (organisation créée avant que l'essai n'existe).
           when 'essai' then o.essai_fin is null or o.essai_fin >= current_date
           -- Active, mais le prélèvement est en défaut depuis plus de quinze
           -- jours : l'écriture se ferme, le statut ne change pas. Ce client
           -- paie — c'est sa carte qui a échoué.
           when 'active' then
             a.paiement_en_defaut_depuis is null
             or (current_date - a.paiement_en_defaut_depuis) < public.delai_defaut_paiement_jours()
           else false                     -- suspendue, archivee
         end
  from public.organizations o
  left join public.abonnements a on a.organization_id = o.id
  where o.id = p_org;
$$;
comment on function public.org_ecriture_ouverte(uuid) is
  'L''écriture est-elle ouverte ? Essai non expiré, ou compte actif dont le prélèvement n''est pas en défaut depuis quinze jours ou plus. Aucune tâche de nuit : la date suffit, et la régularisation rouvre à la seconde.';
revoke execute on function public.org_ecriture_ouverte(uuid) from public, anon;

-- ── 3. Stripe pose et lève le défaut ──────────────────────────────────────
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
  v_defaut_avant date;
begin
  select a.organization_id, a.paiement_en_defaut_depuis
    into v_org, v_defaut_avant
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
    -- Régulariser remet le compteur de relances à zéro : le prochain incident
    -- repart d'une page blanche, sans hériter des courriers du précédent.
    relances_paiement = case
      when p_statut in ('active', 'trialing') then 0 else relances_paiement end,
    derniere_relance_le = case
      when p_statut in ('active', 'trialing') then null else derniere_relance_le end,
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
    -- `past_due` ne change PAS le statut : le client paie, sa carte a échoué.
    -- C'est l'écriture qui se ferme, au quinzième jour, par la date.
    when p_statut = 'past_due' then v_statut_actuel
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

  -- Le passage en défaut et la régularisation sont tracés même quand le statut
  -- ne bouge pas : ce sont eux qui ferment et rouvrent l'écriture.
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
comment on function public.abonnement_appliquer(text, text, text, integer, timestamptz, boolean) is
  'Applique l''état Stripe. past_due pose une date de défaut (une seule fois) : l''écriture se ferme au quinzième jour, le statut ne bouge pas. « active » efface la date et rouvre à la seconde.';
revoke execute on function public.abonnement_appliquer(text, text, text, integer, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.abonnement_appliquer(text, text, text, integer, timestamptz, boolean) to service_role;

-- ── 4. Qui relancer aujourd'hui, et pour dire quoi ────────────────────────
-- QUATRE COURRIERS, ET CHACUN DIT AUTRE CHOSE. Répéter le même message tous
-- les trois jours apprend à ne plus l'ouvrir ; le dernier, celui qui compte,
-- arriverait dans un fil qu'on ne lit plus.
--
--   J+0   l'alerte  — le prélèvement n'est pas passé, voici jusqu'à quand
--   J+7   le rappel — il vous reste huit jours, voici où corriger
--   J+14  l'avis    — demain, la saisie s'arrête
--   J+15  le constat— le compte est en lecture seule, voici comment le rouvrir
--
-- Le destinataire est l'adresse de contact de l'organisation, et à défaut celle
-- de son responsable : une facture impayée ne se règle pas en écrivant au
-- locataire.
create or replace function public.abonnements_a_relancer(p_limite integer default 200)
returns table (
  organization_id uuid,
  organisation text,
  destinataire text,
  palier smallint,              -- 0 alerte · 1 rappel · 2 avis · 3 constat
  jours_ecoules integer,
  jours_restants integer,
  lecture_seule_le date,
  montant_mensuel numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with delai as (select public.delai_defaut_paiement_jours() as j)
  select
    a.organization_id,
    o.name,
    coalesce(
      nullif(btrim(coalesce(o.email_contact, '')), ''),
      (select c.email from public.memberships m
         join public.accounts c on c.id = m.account_id
        where m.organization_id = o.id and m.status = 'active'
          and m.role in ('admin_agence', 'proprietaire_direct')
        order by m.created_at limit 1)
    ),
    v.palier,
    (current_date - a.paiement_en_defaut_depuis)::integer,
    greatest(0, d.j - (current_date - a.paiement_en_defaut_depuis))::integer,
    (a.paiement_en_defaut_depuis + d.j)::date,
    round(a.montant_mensuel_cents / 100.0, 2)
  from public.abonnements a
  join public.organizations o on o.id = a.organization_id
  cross join delai d
  cross join lateral (
    select a.relances_paiement::smallint as palier
  ) v
  where a.paiement_en_defaut_depuis is not null
    and o.status not in ('archivee', 'suspendue')
    -- Le palier suivant n'est dû qu'à partir de son jour. Le premier (l'alerte)
    -- l'est immédiatement : c'est précisément son intérêt.
    and (current_date - a.paiement_en_defaut_depuis) >= case a.relances_paiement
          when 0 then 0
          when 1 then 7
          when 2 then d.j - 1
          when 3 then d.j
          else 99999 end
    -- Jamais deux courriers le même jour, quoi qu'il arrive : une tâche rejouée
    -- ne doit pas doubler l'envoi.
    and (a.derniere_relance_le is null or a.derniere_relance_le < current_date)
  order by a.paiement_en_defaut_depuis
  limit greatest(1, least(coalesce(p_limite, 200), 500));
$$;
comment on function public.abonnements_a_relancer(integer) is
  'Les organisations dont un courrier de relance de paiement est dû aujourd''hui, avec son palier (0 alerte, 1 rappel, 2 avis, 3 constat de lecture seule).';
revoke execute on function public.abonnements_a_relancer(integer) from public, anon, authenticated;
grant execute on function public.abonnements_a_relancer(integer) to service_role;

create or replace function public.abonnement_relance_envoyee(p_org uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.abonnements
     set relances_paiement = relances_paiement + 1,
         derniere_relance_le = current_date,
         updated_at = now()
   where organization_id = p_org
     and paiement_en_defaut_depuis is not null
     -- Garde-fou d'idempotence : deux appels le même jour ne comptent qu'une
     -- relance. Une tâche relancée à la main ne doit pas brûler un palier.
     and (derniere_relance_le is null or derniere_relance_le < current_date);
$$;
revoke execute on function public.abonnement_relance_envoyee(uuid) from public, anon, authenticated;
grant execute on function public.abonnement_relance_envoyee(uuid) to service_role;

-- ── 5. L'écran dit la date, pas seulement le fait ─────────────────────────
-- Deux colonnes de plus au retour : PostgreSQL exige de défaire la fonction
-- avant de la refaire. Le DROP emporte les droits avec elle — d'où l'appel à
-- `fermer_fonctions_a_anon()` en fin de fichier, sans quoi elle renaîtrait
-- ouverte à `anon` (migration 20260911290000).
drop function if exists public.mon_abonnement(uuid);
create function public.mon_abonnement(p_org uuid)
returns table (
  stripe_statut text,
  paye boolean,              -- une souscription existe et Stripe l'honore
  periode_fin timestamptz,
  annulation_demandee boolean,
  quantite_cible integer,
  montant_mensuel numeric,
  paiement_en_retard boolean, -- prélèvement échoué
  lecture_seule_le date,      -- le jour où la saisie s'arrête, faute de règlement
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
    round(public.abonnement_quantite_cible(o.id) * 5.99, 2),
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
  'État de paiement pour « Mon abonnement ». Réservé au responsable ; ne rend aucun identifiant Stripe. Dit LE JOUR où la saisie s''arrêtera faute de règlement — un délai qu''on ne nomme pas est un délai qu''on subit.';
revoke execute on function public.mon_abonnement(uuid) from public, anon;

select public.fermer_fonctions_a_anon();
