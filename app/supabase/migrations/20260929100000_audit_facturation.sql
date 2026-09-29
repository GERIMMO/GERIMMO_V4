-- AUDIT DE LA FACTURATION DU 29/09/2026 — corrections de la grille du 28/09.
--
-- Ce qui est corrigé ici (le reste vit dans le code : webhook, actions,
-- adaptateur Stripe, tâche de nuit) :
--   · 3  — une capacité payée inférieure au portefeuille est TRACÉE
--          (`abonnement_details`) ; l'écran « Mon abonnement » montre alors la
--          hausse nécessaire, et la tâche de nuit prévient le client avant
--          l'échéance. Rien n'est prélevé sans confirmation.
--   · 4  — une organisation qui paie encore sur la grille historique ne
--          bascule plus en ajoutant un bien : sa souscription Stripe ne porte
--          ni formule ni capacité, la bascule la laissait sans garde ni
--          miroir. Elle bascule quand sa souscription prend fin.
--   · 7  — pas de délai de grâce de quinze jours pour qui n'a JAMAIS payé :
--          un premier prélèvement refusé gèle l'écriture comme un essai échu.
--   · 8  — la garde de capacité ne se déclenche que sur les transitions qui
--          AUGMENTENT le portefeuille (réactivation d'un lot archivé, mandat
--          qui entre en vigueur, ligne de mandat ajoutée ou rouverte).
--   · 9  — deux ajouts concurrents ne passent plus tous deux la garde : un
--          verrou consultatif par organisation sérialise le comptage.
--   · 10 — une organisation restée sur la grille historique sans souscription
--          vivante bascule d'elle-même (fin de souscription) ou à sa demande
--          (`abonnement_basculer_grille`), au lieu de l'impasse « premier
--          bien offert, rien à payer ».
--   · 11 — une baisse programmée à l'échéance ne se relit pas avant son
--          effet : la capacité n'est abaissée que par Stripe, à la nouvelle
--          période ; `abonnement_changements_a_recalculer` relance la
--          préparation quand un échéancier a été libéré.
--   · 12 — un client Stripe supprimé est remplacé par le chemin de service
--          (`abonnement_client_remplace`) ; lot_equipements et
--          cle_repartition_lignes, sans colonne d'organisation, reçoivent la
--          garde de lecture seule par leur parent.
--   · L215-1 du code de la consommation — l'avis de reconduction d'un
--          abonnement annuel de particulier, envoyé une fois par période.
--
-- La comparaison base / src/lib/tarifs.ts vit dans tests/tarification-2026.test.ts
-- (le nom de fichier cité jusqu'ici n'existait pas).
--
-- Idempotent.

-- ── 1. Colonnes ────────────────────────────────────────────────────────────
alter table public.abonnements
  add column if not exists premiere_facture_payee boolean not null default false,
  add column if not exists avis_reconduction_periode_fin date;
comment on column public.abonnements.premiere_facture_payee is
  'Vrai dès qu''une facture d''un montant non nul a été payée (webhook invoice.paid). Tant qu''elle est fausse, un prélèvement refusé gèle l''écriture sans délai de grâce.';
comment on column public.abonnements.avis_reconduction_periode_fin is
  'Fin de période pour laquelle l''avis de reconduction tacite (art. L215-1 du code de la consommation) a été envoyé. Évite un second envoi pour la même échéance.';

-- Reprise de l'existant : une souscription déjà active a forcément payé (la
-- page de paiement débite à la validation, hors essai). Les autres statuts
-- sont ambigus ; on leur laisse le délai de grâce qu'ils avaient — geler d'un
-- coup un client qui paie peut-être depuis des mois serait pire que de lui
-- laisser quinze jours. Seuls les essais Stripe partent à « faux ».
update public.abonnements
   set premiere_facture_payee = true
 where not premiere_facture_payee
   and stripe_subscription_id is not null
   and stripe_statut in ('active', 'past_due', 'unpaid', 'canceled');

-- ── 2. Lectures de service ─────────────────────────────────────────────────
-- L'adresse à laquelle écrire au sujet de l'abonnement : celle de contact de
-- l'organisation, à défaut celle du premier responsable actif. Même règle que
-- `abonnements_a_relancer`.
create or replace function public.destinataire_facturation(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(coalesce(o.email_contact, '')), ''),
    (select c.email from public.memberships m
       join public.accounts c on c.id = m.account_id
      where m.organization_id = o.id and m.status = 'active'
        and m.role in ('admin_agence', 'proprietaire_direct')
      order by m.created_at limit 1)
  )
  from public.organizations o where o.id = p_org;
$$;
revoke execute on function public.destinataire_facturation(uuid) from public, anon, authenticated;
grant execute on function public.destinataire_facturation(uuid) to service_role;

-- Ce que le webhook doit savoir d'un client Stripe AVANT d'appliquer un
-- événement : l'organisation, la souscription enregistrée et son statut.
create or replace function public.abonnement_par_client(p_customer text)
returns table (
  organization_id uuid,
  organisation text,
  public_tarif public.organization_type,
  grille text,
  stripe_subscription_id text,
  stripe_statut text,
  destinataire text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.organization_id, o.name, o.type, o.grille_tarifaire,
         a.stripe_subscription_id, a.stripe_statut,
         public.destinataire_facturation(o.id)
  from public.abonnements a
  join public.organizations o on o.id = a.organization_id
  where a.stripe_customer_id = btrim(p_customer);
$$;
revoke execute on function public.abonnement_par_client(text) from public, anon, authenticated;
grant execute on function public.abonnement_par_client(text) to service_role;

-- Une facture non nulle a été payée (invoice.paid). Une facture à 0 € — la
-- première d'un essai Stripe — ne compte pas : rien n'a été prélevé.
create or replace function public.abonnement_facture_payee(p_customer text, p_subscription text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_sub text;
  v_deja boolean;
begin
  select a.organization_id, a.stripe_subscription_id, a.premiere_facture_payee
    into v_org, v_sub, v_deja
  from public.abonnements a where a.stripe_customer_id = btrim(p_customer);
  if v_org is null then return null; end if;
  -- Une facture d'une AUTRE souscription (doublon non suivi) ne vaut pas
  -- paiement de celle qu'on suit.
  if v_sub is not null and nullif(btrim(coalesce(p_subscription, '')), '') is not null
     and v_sub <> btrim(p_subscription) then
    return v_org;
  end if;
  if not v_deja then
    update public.abonnements
       set premiere_facture_payee = true, updated_at = now()
     where organization_id = v_org;
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'abonnement_premiere_facture_payee',
            jsonb_build_object('souscription', p_subscription));
  end if;
  return v_org;
end;
$$;
revoke execute on function public.abonnement_facture_payee(text, text) from public, anon, authenticated;
grant execute on function public.abonnement_facture_payee(text, text) to service_role;

-- ── 3. abonnement_appliquer : pas de grâce sans premier paiement ; fin de la
-- grille historique quand sa souscription prend fin ───────────────────────
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
  v_grille text;
  v_statut_actuel public.organization_status;
  v_essai_fin date;
  v_cible public.organization_status;
  v_defaut_avant date;
  v_premiere boolean;
begin
  select a.organization_id, a.paiement_en_defaut_depuis, a.premiere_facture_payee
    into v_org, v_defaut_avant, v_premiere
  from public.abonnements a where a.stripe_customer_id = btrim(p_customer);
  if v_org is null then
    return null;
  end if;
  select o.type, o.status, o.essai_fin, o.grille_tarifaire
    into v_type, v_statut_actuel, v_essai_fin, v_grille
  from public.organizations o where o.id = v_org;

  update public.abonnements set
    stripe_subscription_id = coalesce(nullif(btrim(coalesce(p_subscription,'')),''), stripe_subscription_id),
    stripe_statut = p_statut,
    quantite = coalesce(p_quantite, quantite),
    montant_mensuel_cents = case when v_grille = 'historique'
      then public.montant_abonnement_cents(v_type, coalesce(p_quantite, quantite))
      else montant_mensuel_cents end,
    periode_fin = coalesce(p_periode_fin, periode_fin),
    annulation_demandee = coalesce(p_annulation, false),
    paiement_en_defaut_depuis = case
      when p_statut in ('past_due', 'unpaid')
        then coalesce(paiement_en_defaut_depuis, current_date)
      when p_statut in ('active', 'trialing') then null
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
    -- AUDIT 29/09, point 7 : le délai de quinze jours protège un client qui a
    -- déjà payé et dont la carte expire. Celui dont le PREMIER prélèvement
    -- échoue n'a jamais payé : il suit la règle de l'essai échu — ouvert tant
    -- que son essai court, gelé ensuite.
    when p_statut in ('past_due', 'unpaid') and not coalesce(v_premiere, false) then
      case when v_essai_fin is not null and v_essai_fin >= current_date
           then 'essai'::public.organization_status
           else 'suspendue'::public.organization_status end
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

  -- AUDIT 29/09, point 10 : la grille historique ne survit pas à sa
  -- souscription. Terminée, l'organisation relève de la grille du 28/09 —
  -- une nouvelle souscription se fera aux formules actuelles.
  if v_grille = 'historique' and p_statut in ('canceled', 'incomplete_expired') then
    perform set_config('gerimmo.systeme', 'on', true);
    update public.organizations set grille_tarifaire = '2026-09-28', updated_at = now()
     where id = v_org;
    perform set_config('gerimmo.systeme', '', true);
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'grille_tarifaire_basculee',
            jsonb_build_object('vers', '2026-09-28', 'motif', 'fin_souscription_historique',
                               'souscription', p_subscription));
  end if;

  if v_defaut_avant is null and p_statut in ('past_due', 'unpaid') then
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'paiement_en_defaut',
            jsonb_build_object('stripe', p_statut,
                               'premiere_facture_payee', coalesce(v_premiere, false),
                               'lecture_seule_le', case when coalesce(v_premiere, false)
                                 then current_date + public.delai_defaut_paiement_jours()
                                 else current_date end));
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

-- ── 4. abonnement_details : la capacité insuffisante est tracée ────────────
create or replace function public.abonnement_details(
  p_customer text,
  p_periodicite text,
  p_formule text,
  p_unites integer,
  p_montant_periode_cents bigint,
  p_periode_debut timestamptz
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_avant integer;
  v_a_couvrir integer;
begin
  select a.organization_id, a.unites_souscrites into v_org, v_avant
  from public.abonnements a where a.stripe_customer_id = btrim(p_customer);
  if v_org is null then return null; end if;
  if p_periodicite not in ('mensuel', 'annuel') then
    raise exception 'Périodicité inconnue : %', p_periodicite;
  end if;
  update public.abonnements set
    periodicite = p_periodicite,
    formule = nullif(btrim(coalesce(p_formule, '')), ''),
    unites_souscrites = p_unites,
    montant_periode_cents = p_montant_periode_cents,
    montant_mensuel_cents = case when p_periodicite = 'annuel'
      then round(coalesce(p_montant_periode_cents, 0) / 12.0)::bigint
      else coalesce(p_montant_periode_cents, 0) end,
    periode_debut = coalesce(p_periode_debut, periode_debut),
    -- La périodicité demandée est atteinte : la demande est soldée.
    periodicite_suivante = case when periodicite_suivante = p_periodicite then null
                                else periodicite_suivante end,
    updated_at = now()
  where organization_id = v_org;
  if v_avant is distinct from p_unites then
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'abonnement_capacite',
            jsonb_build_object('avant', v_avant, 'apres', p_unites, 'formule', p_formule,
                               'periodicite', p_periodicite, 'montant_periode_cents', p_montant_periode_cents));
    -- AUDIT 29/09, point 3 : le portefeuille a pu grandir entre l'ouverture
    -- de la page de paiement et sa validation (l'essai ne garde rien). La
    -- capacité enregistrée est celle que Stripe facture ; l'écart est tracé,
    -- et « Mon abonnement » présente la hausse à confirmer. Aucun débit ici.
    v_a_couvrir := public.unites_a_couvrir(v_org);
    if p_unites is not null and v_a_couvrir > p_unites then
      insert into public.audit_log (organization_id, action, details)
      values (v_org, 'abonnement_capacite_insuffisante',
              jsonb_build_object('capacite', p_unites, 'a_couvrir', v_a_couvrir));
    end if;
  end if;
  return v_org;
end;
$$;
revoke execute on function public.abonnement_details(text, text, text, integer, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.abonnement_details(text, text, text, integer, bigint, timestamptz) to service_role;

-- ── 5. La garde de capacité : sérialisée, et sur les seules hausses ────────
-- VOLATILE, et ce n'est pas un détail : une fonction STABLE garde l'image de
-- la base prise au début de la requête. Le verrou attendu, elle compterait
-- encore sans la ligne que l'autre transaction vient de valider.
create or replace function public.garde_capacite(p_org uuid, p_en_plus integer default 0)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_capacite integer := public.capacite_souscrite(p_org);
  v_besoin integer;
  v_type public.organization_type;
begin
  if v_capacite is null then return; end if;
  if coalesce(current_setting('gerimmo.systeme', true), '') = 'on' then return; end if;
  -- AUDIT 29/09, point 9 : deux ajouts simultanés comptaient chacun sans voir
  -- l'autre, et passaient tous deux. Un verrou par organisation, relâché en
  -- fin de transaction, les fait compter l'un après l'autre.
  perform pg_advisory_xact_lock(hashtext(p_org::text));
  v_besoin := public.unites_a_couvrir(p_org) + coalesce(p_en_plus, 0);
  if v_besoin <= v_capacite then return; end if;
  select o.type into v_type from public.organizations o where o.id = p_org;
  if v_type = 'agence' then
    raise exception 'Votre abonnement couvre % lot% sous mandat : ce changement en porterait % sous mandat. Ouvrez « Mon abonnement » pour voir le nouveau montant et le confirmer ; rien n''a été modifié.',
      v_capacite, case when v_capacite > 1 then 's' else '' end, v_besoin
      using errcode = 'GRM01';
  end if;
  raise exception 'Votre formule couvre % bien% : ce changement en porterait % en gestion. Ouvrez « Mon abonnement » pour voir le nouveau montant et le confirmer ; rien n''a été modifié.',
    v_capacite, case when v_capacite > 1 then 's' else '' end, v_besoin
    using errcode = 'GRM01';
end;
$$;
revoke execute on function public.garde_capacite(uuid, integer) from public, anon, authenticated;

-- Lots : à la création d'un lot actif, et quand un lot archivé revient —
-- plus sur n'importe quel changement d'état (louer un lot déjà compté ne
-- doit pas être refusé parce que le portefeuille dépasse la capacité).
drop trigger if exists lots_garde_capacite on public.lots;
create trigger lots_garde_capacite
  after insert on public.lots
  for each row when (new.etat <> 'archive')
  execute function public.garde_capacite_apres();
drop trigger if exists lots_garde_capacite_reactivation on public.lots;
create trigger lots_garde_capacite_reactivation
  after update of etat on public.lots
  for each row when (old.etat = 'archive' and new.etat <> 'archive')
  execute function public.garde_capacite_apres();

-- Mandats : seulement quand un mandat ENTRE en vigueur (actif ou préavis
-- depuis un autre état). Passer d'actif à préavis, ou modifier la date de
-- fin du mandat (elle ne change pas le décompte), ne l'est plus.
drop trigger if exists mandats_garde_capacite on public.mandats;
create trigger mandats_garde_capacite
  after update of etat on public.mandats
  for each row when (old.etat not in ('actif', 'preavis') and new.etat in ('actif', 'preavis'))
  execute function public.garde_capacite_apres();

-- Lignes de mandat : une ligne ajoutée, déplacée, ou rouverte sous un mandat
-- en vigueur. Une ligne d'un mandat en brouillon ne compte pas encore : elle
-- sera gardée à l'activation du mandat.
create or replace function public.garde_capacite_mandat_ligne()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.mandats m
                 where m.id = new.mandat_id and m.etat in ('actif', 'preavis')) then
    return null;
  end if;
  if new.date_fin is not null and new.date_fin < current_date then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and new.lot_id is not distinct from old.lot_id
     and new.mandat_id is not distinct from old.mandat_id
     -- Seule une ligne échue qui rouvre augmente le décompte.
     and not (old.date_fin is not null and old.date_fin < current_date) then
    return null;
  end if;
  perform public.garde_capacite(new.organization_id, 0);
  return null;
end;
$$;
revoke execute on function public.garde_capacite_mandat_ligne() from public, anon, authenticated;

drop trigger if exists mandat_lignes_garde_capacite on public.mandat_lignes;
create trigger mandat_lignes_garde_capacite
  after insert or update of lot_id, mandat_id, date_fin on public.mandat_lignes
  for each row execute function public.garde_capacite_mandat_ligne();

-- ── 6. Bascule à l'ajout : jamais sous une souscription historique vivante ─
-- AUDIT 29/09, point 4. Une organisation qui paie sur la grille historique a
-- une souscription Stripe au prix unitaire, sans formule ni capacité en
-- métadonnées. La basculer à l'ajout d'un bien la faisait facturer à
-- l'ancienne (la synchronisation de quantité s'arrêtait : elle ne vise que
-- l'historique) tout en l'affichant à la nouvelle — sans garde (capacité
-- nulle) ni montant juste. Tant que cette souscription vit (active, essai,
-- en retard, impayée), les règles historiques s'appliquent : la quantité
-- continue de suivre le parc chaque nuit. La bascule a lieu quand elle prend
-- fin (`abonnement_appliquer`) ou à la demande (`abonnement_basculer_grille`).
create or replace function public.basculer_grille_a_l_ajout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.organizations o
             where o.id = new.organization_id and o.grille_tarifaire = 'historique')
     and not exists (select 1 from public.abonnements a
                     where a.organization_id = new.organization_id
                       and a.stripe_subscription_id is not null
                       and a.stripe_statut in ('active', 'trialing', 'past_due', 'unpaid')) then
    perform set_config('gerimmo.systeme', 'on', true);
    update public.organizations set grille_tarifaire = '2026-09-28', updated_at = now()
     where id = new.organization_id;
    perform set_config('gerimmo.systeme', '', true);
    insert into public.audit_log (organization_id, action, details)
    values (new.organization_id, 'grille_tarifaire_basculee',
            jsonb_build_object('vers', '2026-09-28', 'motif', 'ajout_de_bien'));
  end if;
  return new;
end;
$$;
revoke execute on function public.basculer_grille_a_l_ajout() from public, anon, authenticated;

-- ── 7. Bascule à la demande (grille historique sans souscription vivante) ──
-- Appelée par l'action « souscrire », APRÈS qu'elle a vérifié que l'appelant
-- est le responsable (`mon_abonnement` ne rend rien à un autre) : plus
-- d'impasse « rien à payer », la souscription se fait aux formules
-- actuelles. Réservée au service, comme tout ce qui pose `gerimmo.systeme`
-- (aucune fonction atteignable depuis un navigateur ne touche ce drapeau —
-- tests/abonnement-stripe.test.ts le vérifie). Refusée tant qu'une
-- souscription historique vit : elle se gère dans le portail.
create or replace function public.abonnement_basculer_grille(p_org uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organizations o
                 where o.id = p_org and o.grille_tarifaire = 'historique') then
    return false;
  end if;
  if exists (select 1 from public.abonnements a
             where a.organization_id = p_org
               and a.stripe_subscription_id is not null
               and a.stripe_statut in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete')) then
    raise exception 'Un abonnement est en cours sur l''ancienne grille : gérez-le depuis « Carte et factures ».';
  end if;
  perform set_config('gerimmo.systeme', 'on', true);
  update public.organizations set grille_tarifaire = '2026-09-28', updated_at = now()
   where id = p_org;
  perform set_config('gerimmo.systeme', '', true);
  insert into public.audit_log (organization_id, action, details)
  values (p_org, 'grille_tarifaire_basculee',
          jsonb_build_object('vers', '2026-09-28', 'motif', 'souscription_demandee'));
  return true;
end;
$$;
revoke execute on function public.abonnement_basculer_grille(uuid) from public, anon, authenticated;
grant execute on function public.abonnement_basculer_grille(uuid) to service_role;

-- Rattrapage : les organisations dont la souscription historique a pris fin
-- depuis la bascule du 28/09 (section 12 de 20260928090000) basculent ici.
do $rattrapage$
begin
  perform set_config('gerimmo.systeme', 'on', true);
  with basculees as (
    update public.organizations o
       set grille_tarifaire = '2026-09-28', updated_at = now()
     where o.grille_tarifaire = 'historique'
       and not exists (select 1 from public.abonnements a
                       where a.organization_id = o.id
                         and a.stripe_subscription_id is not null
                         and a.stripe_statut in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete'))
    returning o.id
  )
  insert into public.audit_log (organization_id, action, details)
  select id, 'grille_tarifaire_basculee', jsonb_build_object('vers', '2026-09-28', 'motif', 'audit_2026_09_29')
  from basculees;
  perform set_config('gerimmo.systeme', '', true);
end
$rattrapage$;

-- ── 8. Client Stripe supprimé : remplacement par le chemin de service ─────
-- `abonnement_client_pose` ne remplace jamais un client (deux clients, deux
-- factures). Quand Stripe dit que l'ancien est SUPPRIMÉ — vérifié côté
-- serveur, par l'action, avant l'appel —, le nouveau prend sa place. Réservé
-- au service : un client ne choisit pas l'identifiant Stripe qu'on suit.
create or replace function public.abonnement_client_remplace(p_org uuid, p_ancien text, p_nouveau text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(coalesce(p_nouveau, '')), '') is null then
    raise exception 'Identifiant client Stripe vide';
  end if;
  update public.abonnements
     set stripe_customer_id = btrim(p_nouveau), updated_at = now()
   where organization_id = p_org
     and stripe_customer_id = btrim(p_ancien);
  if not found then return false; end if;
  insert into public.audit_log (organization_id, action, details)
  values (p_org, 'abonnement_client_remplace',
          jsonb_build_object('ancien', p_ancien, 'nouveau', p_nouveau));
  return true;
end;
$$;
revoke execute on function public.abonnement_client_remplace(uuid, text, text) from public, anon, authenticated;
grant execute on function public.abonnement_client_remplace(uuid, text, text) to service_role;

-- ── 9. Échéance à re-préparer ─────────────────────────────────────────────
-- Un échéancier Stripe libéré (résiliation, hausse, périodicité) emporte la
-- baisse ou le changement qu'il portait. La tâche de nuit doit pouvoir le
-- reprogrammer : on efface la marque « échéance préparée ». Sans effet
-- financier — la tâche recalcule, elle ne prélève rien.
create or replace function public.abonnement_changements_a_recalculer(p_org uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Réservé au responsable de l''organisation';
  end if;
  update public.abonnements
     set changement_applique_pour = null, updated_at = now()
   where organization_id = p_org;
end;
$$;
revoke execute on function public.abonnement_changements_a_recalculer(uuid) from public, anon;
grant execute on function public.abonnement_changements_a_recalculer(uuid) to authenticated;

-- ── 10. Lecture seule : les tables sans organisation, par leur parent ─────
-- `poser_gardes_abonnement` ne voit que les tables qui portent
-- `organization_id`. lot_equipements (par le lot) et cle_repartition_lignes
-- (par la clé) restaient donc modifiables sur un compte gelé.
create or replace function public.refuser_ecriture_si_fermee_par_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_ligne record;
begin
  if coalesce(current_setting('gerimmo.systeme', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then v_ligne := old; else v_ligne := new; end if;
  if tg_table_name = 'lot_equipements' then
    select l.organization_id into v_org from public.lots l where l.id = v_ligne.lot_id;
  elsif tg_table_name = 'cle_repartition_lignes' then
    select c.organization_id into v_org from public.cles_repartition c where c.id = v_ligne.cle_id;
  end if;
  -- Parent introuvable (suppression en cascade déjà passée) : la garde du
  -- parent a tranché.
  if v_org is null then
    return coalesce(new, old);
  end if;
  if not public.org_ecriture_ouverte(v_org) then
    if v_org in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[])) then
      raise exception
        'Abonnement suspendu : vos données restent consultables et exportables, mais aucune nouvelle saisie n''est possible. Réactivez l''abonnement depuis « Mon abonnement ».'
        using errcode = 'check_violation';
    else
      raise exception
        'Cette agence n''enregistre plus de nouvelles saisies pour le moment. Vos documents restent consultables ; pour toute démarche, contactez-la directement.'
        using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.refuser_ecriture_si_fermee_par_parent() from public, anon, authenticated;

drop trigger if exists abonnement_lot_equipements on public.lot_equipements;
create trigger abonnement_lot_equipements
  before insert or update or delete on public.lot_equipements
  for each row execute function public.refuser_ecriture_si_fermee_par_parent();
drop trigger if exists abonnement_cle_repartition_lignes on public.cle_repartition_lignes;
create trigger abonnement_cle_repartition_lignes
  before insert or update or delete on public.cle_repartition_lignes
  for each row execute function public.refuser_ecriture_si_fermee_par_parent();

-- ── 11. Avis de reconduction tacite (art. L215-1 du code de la consommation)
-- Un particulier abonné à l'année doit être informé, au plus tôt trois mois
-- et au plus tard un mois avant le terme, de la date de reconduction et de
-- son droit de ne pas reconduire. La tâche de nuit l'envoie une fois par
-- période ; la base retient la fin de période couverte.
create or replace function public.abonnements_avis_reconduction_dus(p_limite integer default 200)
returns table (
  organization_id uuid,
  organisation text,
  destinataire text,
  periode_fin timestamptz,
  montant_periode_cents bigint,
  formule text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.organization_id, o.name, public.destinataire_facturation(o.id),
         a.periode_fin, a.montant_periode_cents, a.formule
  from public.abonnements a
  join public.organizations o on o.id = a.organization_id
  where o.type = 'proprietaire_direct'
    and o.status <> 'archivee'
    and a.stripe_subscription_id is not null
    and a.stripe_statut in ('active', 'trialing', 'past_due')
    and not coalesce(a.annulation_demandee, false)
    and a.periodicite = 'annuel'
    and a.periode_fin is not null
    and a.periode_fin >= now() + interval '30 days'
    and a.periode_fin <= now() + interval '90 days'
    and a.avis_reconduction_periode_fin is distinct from (a.periode_fin at time zone 'Europe/Paris')::date
  order by a.periode_fin
  limit greatest(1, least(coalesce(p_limite, 200), 500));
$$;
revoke execute on function public.abonnements_avis_reconduction_dus(integer) from public, anon, authenticated;
grant execute on function public.abonnements_avis_reconduction_dus(integer) to service_role;

create or replace function public.abonnement_avis_reconduction_envoye(p_org uuid, p_periode_fin timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.abonnements
     set avis_reconduction_periode_fin = (p_periode_fin at time zone 'Europe/Paris')::date,
         updated_at = now()
   where organization_id = p_org;
  insert into public.audit_log (organization_id, action, details)
  values (p_org, 'abonnement_avis_reconduction',
          jsonb_build_object('periode_fin', p_periode_fin));
end;
$$;
revoke execute on function public.abonnement_avis_reconduction_envoye(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.abonnement_avis_reconduction_envoye(uuid, timestamptz) to service_role;

select public.fermer_fonctions_a_anon();
