-- Conformité V1 (plan juriste/DPO du 23/10/2026, lot 1E ; constats R14, R15, R49, R51) : fermeture des comptes,
-- suppression des comptes inactifs, export complet. S'appuie sur `archives_comptes` (20261024090000, lot 1A).
--
-- 1. Garde de suppression des comptes (R12/R15) — déclencheur BEFORE DELETE sur `accounts` : un compte qui a accepté
--    les conditions et appartient à une organisation qui a payé au moins une facture ne se supprime pas tant que la
--    preuve de son contrat n'est pas copiée dans `archives_comptes`. Un compte qui n'a jamais payé part en cascade
--    (sa preuve part avec lui : plan du 23/10, choix 5).
--
-- 2. Fermeture (R15) — `fermetures_comptes` (une demande par ligne, origine titulaire, super_admin ou inactivite),
--    `simuler_fermeture_compte` (bilan sans rien effacer), `programmer_fermeture_compte`, `annuler_fermeture_compte`,
--    `geler_fermeture_compte` (litige ou créance : motif écrit, aucune exécution tant qu'il est posé), et
--    `executer_fermeture_compte`, réservée au propriétaire des fonctions (pg_cron « fermetures-comptes »).
--    Gardes de l'exécution : arrêt d'urgence (`tache_planifiee_autorisee`), sauvegarde quotidienne réussie le jour même,
--    date d'effet atteinte, aucun gel, bilan de simulation enregistré, aucune souscription Stripe vivante, compte qui
--    n'est pas un super-administrateur ; une fermeture pour inactivité est annulée si le compte a servi depuis.
--    Ordre d'effacement (plan, lot 1E) : archive de la preuve ; données de plateforme du compte ; organisations dont il
--    est le seul gérant actif (boucles (a)(b)(c) du nettoyage du 21/10 limitées à cette organisation, fichiers mis en
--    file de suppression, demandes Zoho relevées pour suppression chez le prestataire) ; sinon retrait de ses seules
--    adhésions ; `persons.account_id` mis à null chez les autres propriétaires, avec une alerte à chacun ; tentative de
--    suppression de `auth.users`, et si une référence subsiste (journaux, demande de droits, dossier d'un tiers),
--    neutralisation de l'identité (adresse efface-<uuid>@compte-supprime.invalid, mot de passe et métadonnées vidés,
--    accès bloqué pour cent ans, `accounts.efface_le`). Jamais d'invitation ni de fiche d'un autre propriétaire supprimée,
--    jamais de client Stripe supprimé. Tout se fait dans une seule transaction par fermeture ; un échec annule cette
--    fermeture seule, consigné sur sa ligne, et la suivante passe. Après : `audit_log` « compte_ferme » (sans compte
--    rattaché), `effacements_a_reappliquer` (à rejouer après toute restauration d'une sauvegarde :
--    `reappliquer_effacements`), contrôle de l'adresse d'origine.
--    Le courriel « Votre compte Gerimmo est fermé », le remboursement au prorata (Stripe) et le retrait des fichiers
--    hors du compartiment `documents` sont faits par l'application (lib/fermetures-comptes.ts, mission « purge »),
--    au moyen de `fermetures_suites_a_faire` et `fermeture_suites_faites`.
--
-- 3. Inactivité (R14, R51) — `comptes_inactifs_a_prevenir(p_version_min)` : comptes sans connexion d'un gérant ni
--    abonnement en cours depuis 22 mois (avertissement J-60) puis 23,5 mois (J-15) ; la date annoncée n'est jamais
--    avancée (au moins 60 jours après le premier avertissement). La règle ne vise que les comptes qui ont accepté une
--    version des conditions au moins égale à `p_version_min`, que l'application tient dans VERSION_MIN_INACTIVITE
--    (nulle : règle inactive, rien n'est rendu). La fermeture n'est programmée (par la tâche quotidienne) qu'une fois
--    les deux avertissements consignés et la date annoncée atteinte. Même règle pour un compte de locataire ou
--    d'artisan : seuls son compte et ses propres données sont effacés.
--
-- 4. Export complet (R49) — `exports_complets` et le compartiment privé `exports-complets` : demande par le seul
--    titulaire (second facteur ou mot de passe saisi depuis moins de quinze minutes), archive préparée par l'application,
--    lien signé de 24 h, suppression après 7 jours, `audit_log` et `acces_pieces_log` pour les pièces sensibles.
--    `export_complet_donnees(p_org)` rend les lignes de l'organisation, table par table.
--
-- Durées : à relire par le juriste (source non ouverte le 23/10/2026). Rejouable : IF NOT EXISTS, CREATE OR REPLACE,
-- DROP … IF EXISTS, `on conflict do nothing` ; `search_path = ''` ; aucune donnée existante réécrite ;
-- `fermer_fonctions_a_anon()` en fin. Aucune table nouvelle ne porte de colonne `organization_id` (la garde de lecture
-- seule des abonnements s'y poserait et refuserait l'export ou l'archivage d'un compte gelé). Le jour de Paris se
-- calcule dans l'expression (`aujourdhui_paris()` n'est pas cité : hors de la chaîne « Ordre complet »).
-- Retour : supabase/retours-arriere/20261024130000_fermeture_comptes.retour.sql.

do $verrou$ begin perform set_config('lock_timeout', '10s', true); end $verrou$;

-- ── 0. Colonne d'effacement du compte ────────────────────────────────────────────────────────────────────────────

alter table public.accounts add column if not exists efface_le timestamptz;
comment on column public.accounts.efface_le is
  'Fermeture exécutée par neutralisation (une référence empêchait la suppression) : identité effacée, accès bloqué. Posée par executer_fermeture_compte (24/10/2026, R15). Jamais lisible par authenticated.';

-- ── 1. Garde de suppression des comptes ──────────────────────────────────────────────────────────────────────────

-- Une organisation « a payé » si sa première facture non nulle est payée, ou si un paiement de facture Stripe de son
-- client a été traité.
create or replace function public.organisation_a_paye(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.abonnements a where a.organization_id = p_org and a.premiere_facture_payee)
      or exists (select 1 from public.abonnements a
                   join public.abonnement_evenements e
                     on e.type = 'invoice.paid' and e.traite_le is not null
                    and e.charge ->> 'client' = a.stripe_customer_id
                  where a.organization_id = p_org and a.stripe_customer_id is not null);
$$;
revoke all on function public.organisation_a_paye(uuid) from public, anon, authenticated, service_role;

create or replace function public.accounts_garde_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid;
begin
  if not exists (select 1 from public.acceptations_cgu c where c.account_id = old.id) then
    return old;
  end if;
  for v_org in
    select distinct m.organization_id from public.memberships m
     where m.account_id = old.id and m.organization_id is not null
       and m.role in ('admin_agence', 'agent', 'proprietaire_direct')
  loop
    if public.organisation_a_paye(v_org)
       and not exists (select 1 from public.archives_comptes a
                        where a.account_id_origine = old.id and a.organisation_id_origine = v_org) then
      raise exception 'Compte % : la preuve du contrat payé (organisation %) doit être archivée avant la suppression',
        old.id, v_org using errcode = '42501', hint = 'Passer par executer_fermeture_compte, qui archive d''abord.';
    end if;
  end loop;
  return old;
end $$;
revoke execute on function public.accounts_garde_archive() from public, anon, authenticated, service_role;

drop trigger if exists accounts_garde_archive on public.accounts;
create trigger accounts_garde_archive
  before delete on public.accounts
  for each row execute function public.accounts_garde_archive();

-- ── 2. Tables ─────────────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.fermetures_comptes (
  id uuid primary key default gen_random_uuid(),
  -- Pas de clé vers accounts : la ligne survit au compte (trace de la demande et de son traitement).
  account_id uuid not null,
  demande_id uuid references public.retours_utilisateurs(id) on delete set null,
  origine text not null check (origine in ('titulaire', 'super_admin', 'inactivite')),
  choix text check (choix in ('fin_periode', 'j14_prorata')),
  statut text not null default 'programmee' check (statut in ('programmee', 'executee', 'annulee')),
  programmee_le timestamptz not null default now(),
  programmee_par uuid,
  demandee_le date not null,
  effacement_prevu_le date not null,
  gel_motif text check (gel_motif is null or length(btrim(gel_motif)) between 5 and 1000),
  gel_pose_le timestamptz,
  empreinte_adresse text not null check (empreinte_adresse ~ '^[0-9a-f]{64}$'),
  -- L'adresse du courriel de fin ; effacée dès que le courriel est parti.
  adresse_courriel text check (adresse_courriel is null or length(adresse_courriel) <= 320),
  derniere_activite_le timestamptz,
  abonnement jsonb not null default '{}'::jsonb check (jsonb_typeof(abonnement) = 'object'),
  remboursement_prevu_cents bigint check (remboursement_prevu_cents is null or remboursement_prevu_cents >= 0),
  stripe_facture_id text check (stripe_facture_id is null or stripe_facture_id ~ '^in_[A-Za-z0-9_]{1,200}$'),
  remboursement_cents bigint check (remboursement_cents is null or remboursement_cents >= 0),
  stripe_remboursement_id text check (stripe_remboursement_id is null or length(stripe_remboursement_id) <= 255),
  rembourse_le timestamptz,
  bilan_simulation jsonb,
  simulee_le timestamptz,
  tentatives integer not null default 0,
  derniere_tentative_le timestamptz,
  derniere_erreur text check (derniere_erreur is null or length(derniere_erreur) <= 2000),
  executee_le timestamptz,
  mode_effacement text check (mode_effacement in ('suppression', 'neutralisation')),
  bilan_execution jsonb,
  courriel_envoye_le timestamptz,
  annulee_le timestamptz,
  annulation_motif text check (annulation_motif is null or length(annulation_motif) <= 1000),
  constraint fermetures_comptes_choix_si_abonnement check (choix is null or origine <> 'inactivite'),
  constraint fermetures_comptes_executee_coherente check (
    (statut = 'executee') = (executee_le is not null and mode_effacement is not null and bilan_execution is not null)),
  constraint fermetures_comptes_annulee_coherente check ((statut = 'annulee') = (annulee_le is not null))
);
create index if not exists fermetures_comptes_demande_idx on public.fermetures_comptes (demande_id);
create unique index if not exists fermetures_comptes_une_programmee
  on public.fermetures_comptes (account_id) where statut = 'programmee';
create index if not exists fermetures_comptes_echeance_idx
  on public.fermetures_comptes (statut, effacement_prevu_le);
create index if not exists fermetures_comptes_suites_idx
  on public.fermetures_comptes (executee_le) where statut = 'executee' and courriel_envoye_le is null;
alter table public.fermetures_comptes enable row level security;
drop policy if exists fermetures_comptes_lecture_superviseur on public.fermetures_comptes;
create policy fermetures_comptes_lecture_superviseur on public.fermetures_comptes
  for select to authenticated using ((select public.is_permanent_super_admin()));
revoke all on public.fermetures_comptes from public, anon, authenticated, service_role;
grant select on public.fermetures_comptes to authenticated, service_role;
comment on table public.fermetures_comptes is
  'Fermetures de comptes (R15, 24/10/2026) : programmées par le super-administrateur, le titulaire ou la règle d''inactivité, exécutées par pg_cron « fermetures-comptes ». Écriture par fonctions seulement. Lecture : super-administrateur permanent (second facteur) et clé de service.';

create table if not exists public.effacements_a_reappliquer (
  fermeture_id uuid primary key references public.fermetures_comptes(id) on delete cascade,
  account_id_origine uuid not null,
  organisations_effacees uuid[] not null default '{}',
  artisan_id_origine uuid,
  executee_le timestamptz not null,
  reappliquee_le timestamptz,
  reapplications integer not null default 0
);
alter table public.effacements_a_reappliquer enable row level security;
drop policy if exists effacements_a_reappliquer_lecture_superviseur on public.effacements_a_reappliquer;
create policy effacements_a_reappliquer_lecture_superviseur on public.effacements_a_reappliquer
  for select to authenticated using ((select public.is_permanent_super_admin()));
revoke all on public.effacements_a_reappliquer from public, anon, authenticated, service_role;
grant select on public.effacements_a_reappliquer to authenticated, service_role;
comment on table public.effacements_a_reappliquer is
  'Effacements exécutés, à rejouer après toute restauration d''une sauvegarde (reappliquer_effacements). Identifiants seulement, aucune donnée personnelle.';

create table if not exists public.avertissements_inactivite (
  account_id uuid not null references public.accounts(id) on delete cascade,
  etape text not null check (etape in ('j60', 'j15')),
  derniere_activite_le timestamptz not null,
  suppression_prevue_le date not null,
  envoye_le timestamptz not null default now(),
  primary key (account_id, etape, derniere_activite_le)
);
alter table public.avertissements_inactivite enable row level security;
drop policy if exists avertissements_inactivite_lecture_superviseur on public.avertissements_inactivite;
create policy avertissements_inactivite_lecture_superviseur on public.avertissements_inactivite
  for select to authenticated using ((select public.is_permanent_super_admin()));
revoke all on public.avertissements_inactivite from public, anon, authenticated, service_role;
grant select on public.avertissements_inactivite to authenticated, service_role;
comment on table public.avertissements_inactivite is
  'Avertissements J-60 et J-15 avant la suppression d''un compte inactif (R14, R51). Une connexion change la dernière activité : le cycle repart de zéro.';

create table if not exists public.exports_complets (
  id uuid primary key default gen_random_uuid(),
  organisation_id_export uuid not null references public.organizations(id) on delete cascade,
  demande_par uuid not null references public.accounts(id) on delete cascade,
  statut text not null default 'demande' check (statut in ('demande', 'en_cours', 'pret', 'echec', 'expire')),
  demande_le timestamptz not null default now(),
  commence_le timestamptz,
  pret_le timestamptz,
  expire_le timestamptz,
  chemin text check (chemin is null or length(chemin) <= 512),
  taille_octets bigint check (taille_octets is null or taille_octets >= 0),
  empreinte_sha256 text check (empreinte_sha256 is null or empreinte_sha256 ~ '^[0-9a-f]{64}$'),
  fichiers integer check (fichiers is null or fichiers >= 0),
  tables integer check (tables is null or tables >= 0),
  pieces_sensibles uuid[] not null default '{}',
  erreur text check (erreur is null or length(erreur) <= 1000),
  telechargements integer not null default 0,
  dernier_telechargement_le timestamptz,
  supprime_le timestamptz
);
create index if not exists exports_complets_org_idx on public.exports_complets (organisation_id_export, demande_le desc);
create index if not exists exports_complets_demande_par_idx on public.exports_complets (demande_par);
alter table public.exports_complets enable row level security;
drop policy if exists exports_complets_lecture_titulaire on public.exports_complets;
create policy exports_complets_lecture_titulaire on public.exports_complets
  for select to authenticated using (demande_par = (select auth.uid()) or (select public.is_permanent_super_admin()));
revoke all on public.exports_complets from public, anon, authenticated, service_role;
grant select on public.exports_complets to authenticated, service_role;
comment on table public.exports_complets is
  'Archives complètes des données d''une organisation (R49, 24/10/2026) : demandées par le titulaire, préparées par l''application dans le compartiment privé exports-complets, lien signé de 24 h, supprimées après 7 jours.';

-- Le compartiment privé des archives : aucune politique, la clé de service seule y accède (lien signé à la demande).
insert into storage.buckets (id, name, public)
values ('exports-complets', 'exports-complets', false)
on conflict (id) do nothing;

-- La tâche quotidienne s'arrête avec la clé « purge » (effacements de données), comme la purge de conservation.
insert into public.supervision_taches_arret (tache, cle) values ('fermetures-comptes', 'purge')
on conflict do nothing;

-- ── 3. Outils internes ────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.empreinte_adresse(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(pg_catalog.sha256(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8')), 'hex') $$;
revoke all on function public.empreinte_adresse(text) from public, anon, authenticated, service_role;

-- Les organisations dont ce compte est le SEUL gérant actif (admin_agence, agent ou proprietaire_direct) et dont il est
-- titulaire (admin_agence ou proprietaire_direct) : celles que sa fermeture efface. Un agent ne fait jamais effacer une
-- agence ; un locataire, un garant, un mandant ou un artisan n'efface que son accès.
create or replace function public.organisations_du_seul_titulaire(p_account uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct m.organization_id
    from public.memberships m
   where m.account_id = p_account and m.status = 'active' and m.organization_id is not null
     and m.role in ('admin_agence', 'proprietaire_direct')
     and not exists (select 1 from public.memberships x
                      where x.organization_id = m.organization_id and x.account_id <> p_account
                        and x.status = 'active' and x.role in ('admin_agence', 'agent', 'proprietaire_direct'));
$$;
revoke all on function public.organisations_du_seul_titulaire(uuid) from public, anon, authenticated, service_role;

-- La souscription Stripe des organisations effacées par la fermeture : vivante tant qu'elle n'est pas terminée chez
-- Stripe ; « payée en cours » si une facture non nulle a été payée et que la période active court encore.
create or replace function public.abonnement_de_fermeture(p_account uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'organisation', a.organization_id,
      'stripe_subscription_id', a.stripe_subscription_id,
      'stripe_customer_id', a.stripe_customer_id,
      'stripe_statut', a.stripe_statut,
      'periode_debut', a.periode_debut,
      'periode_fin', a.periode_fin,
      'montant_periode_cents', a.montant_periode_cents,
      'vivante', a.stripe_subscription_id is not null
                 and coalesce(a.stripe_statut, '') not in ('canceled', 'incomplete_expired'),
      'payee_en_cours', a.stripe_subscription_id is not null and a.premiere_facture_payee
                        and a.stripe_statut = 'active' and a.periode_fin > now())
      from public.abonnements a
     where a.organization_id in (select public.organisations_du_seul_titulaire(p_account))
     order by (a.stripe_subscription_id is not null) desc, a.periode_fin desc nulls last
     limit 1), '{}'::jsonb);
$$;
revoke all on function public.abonnement_de_fermeture(uuid) from public, anon, authenticated, service_role;

-- La dernière activité d'un compte, pour la règle d'inactivité : sa propre dernière connexion (ou sa création) et, pour
-- les organisations qu'il gère, la dernière connexion de tout gérant actif, la fin du dernier abonnement payé et la
-- création de l'organisation. Un abonnement vivant ou un essai en cours suspend la règle.
create or replace function public.activite_compte(p_account uuid)
returns table (derniere_activite_le timestamptz, abonnement_en_cours boolean, nature text, organisation text)
language sql
stable
security definer
set search_path = ''
as $$
  with orgs as (
    select distinct m.organization_id from public.memberships m
     where m.account_id = p_account and m.status = 'active' and m.organization_id is not null
       and m.role in ('admin_agence', 'agent', 'proprietaire_direct')
  ), gerants as (
    select m.account_id from public.memberships m
     where m.organization_id in (select organization_id from orgs) and m.status = 'active'
       and m.role in ('admin_agence', 'agent', 'proprietaire_direct')
  )
  -- À la seconde : la valeur fait le tour par l'application (avertissements) et doit se comparer à l'identique.
  select date_trunc('second', greatest(
           (select max(greatest(u.last_sign_in_at, u.created_at)) from auth.users u
             where u.id = p_account or u.id in (select account_id from gerants)),
           (select max(a.periode_fin) from public.abonnements a
             where a.organization_id in (select organization_id from orgs) and a.premiere_facture_payee),
           (select max(o.created_at) from public.organizations o where o.id in (select organization_id from orgs)))),
         exists (select 1 from public.abonnements a
                  where a.organization_id in (select organization_id from orgs)
                    and a.stripe_subscription_id is not null
                    and coalesce(a.stripe_statut, '') not in ('canceled', 'incomplete_expired'))
           or exists (select 1 from public.organizations o
                       where o.id in (select organization_id from orgs) and o.status = 'essai'
                         and o.essai_fin is not null and o.essai_fin >= (now() at time zone 'Europe/Paris')::date),
         case when exists (select 1 from orgs) then 'organisation' else 'personnel' end,
         (select string_agg(o.name, ', ' order by o.name) from public.organizations o
           where o.id in (select organization_id from orgs));
$$;
revoke all on function public.activite_compte(uuid) from public, anon, authenticated, service_role;

-- Une sauvegarde quotidienne réussie, consignée par le service (sans auteur), depuis minuit à Paris.
create or replace function public.sauvegarde_du_jour_reussie()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.tech_log
                  where evenement = 'tache_sauvegarde' and account_id is null and details ->> 'echecs' = '0'
                    and created_at >= ((now() at time zone 'Europe/Paris')::date)::timestamp at time zone 'Europe/Paris');
$$;
revoke all on function public.sauvegarde_du_jour_reussie() from public, anon, authenticated, service_role;

-- Les références au compte qui resteraient après l'effacement de son périmètre, par table et colonne : journaux,
-- demandes de droits, dossiers d'autres propriétaires. S'il en reste, la fermeture neutralise au lieu de supprimer.
create or replace function public.references_hors_perimetre(p_account uuid, p_orgs uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_n bigint;
  v_refs jsonb := '{}'::jsonb;
begin
  for r in
    select con.conrelid::regclass as tbl, att.attname as col,
           exists (select 1 from pg_attribute x where x.attrelid = con.conrelid and x.attname = 'organization_id'
                     and not x.attisdropped) as a_org
      from pg_constraint con
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
     where con.contype = 'f' and array_length(con.conkey, 1) = 1
       and con.confdeltype in ('a', 'r')
       and con.confrelid in ('public.accounts'::regclass, 'auth.users'::regclass)
       -- Retirés par la fermeture elle-même : lien des dossiers de tiers, fiche d'artisan.
       and not (con.conrelid in ('public.persons'::regclass, 'public.artisans'::regclass) and att.attname = 'account_id')
  loop
    if r.a_org then
      execute format('select count(*) from %s where %I = $1 and (organization_id is null or not (organization_id = any($2)))',
                     r.tbl, r.col) into v_n using p_account, p_orgs;
    else
      execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into v_n using p_account;
    end if;
    if v_n > 0 then v_refs := v_refs || jsonb_build_object(r.tbl::text || '.' || r.col, v_n); end if;
  end loop;
  return v_refs;
end $$;
revoke all on function public.references_hors_perimetre(uuid, uuid[]) from public, anon, authenticated, service_role;

-- Les gardes d'état qui refusent de supprimer une ligne figée (état des lieux signé, appel de charges figé, chambre
-- d'un bail signé, devis signé, avoir d'artisan) : utiles contre une modification, elles rendraient impossible
-- l'effacement demandé d'un espace entier. Suspendues le temps de l'effacement seulement, dans sa transaction (le DDL
-- est annulé avec elle en cas d'échec), puis rétablies. Les circuits de signature EN COURS ne sont pas concernés :
-- l'exécution refuse tant qu'il en reste un (à annuler d'abord). Le nom de la table des avoirs d'artisan est composé :
-- la fonction ne la lit pas et tolère son absence, mais le retour de 20261014710000 refuse de passer tant qu'une
-- fonction cite ce nom en toutes lettres.
create or replace function public.gardes_effacement(p_actives boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  for r in
    select g.tbl, g.declencheur
      from (values ('public.edl_lignes', 'edl_lignes_fige_trg'),
                   ('public.edl_compteurs', 'edl_compteurs_fige_trg'),
                   ('public.edl_cles', 'edl_cles_fige_trg'),
                   ('public.appel_charges_postes', 'postes_appel_non_fige_trg'),
                   ('public.lot_chambres', 'chambres_caracteristiques'),
                   ('public.incident_devis', 'devis_signature_verrou'),
                   ('public.artisan_avoirs' || '_externes', 'artisan_avoirs' || '_externes_suite')) g(tbl, declencheur)
     where to_regclass(g.tbl) is not null
       and exists (select 1 from pg_trigger t where t.tgrelid = to_regclass(g.tbl) and t.tgname = g.declencheur
                     and not t.tgisinternal)
  loop
    execute format('alter table %s %s trigger %I', r.tbl, case when p_actives then 'enable' else 'disable' end, r.declencheur);
  end loop;
end $$;
revoke all on function public.gardes_effacement(boolean) from public, anon, authenticated, service_role;

-- ── 4. Simulation ─────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.simuler_fermeture_compte(p_account uuid, p_fermeture uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orgs uuid[];
  v_org uuid;
  v_par_org jsonb := '[]'::jsonb;
  v_n bigint;
  v_artisan uuid;
  v_bilan jsonb;
  v_archive jsonb := '[]'::jsonb;
  v_refs jsonb;
begin
  if (select auth.role()) is not null and (select auth.role()) <> 'service_role'
     and not public.is_permanent_super_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if not exists (select 1 from public.accounts where id = p_account) then
    raise exception 'Compte inconnu' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(o), '{}') into v_orgs from public.organisations_du_seul_titulaire(p_account) o;
  foreach v_org in array v_orgs loop
    v_par_org := v_par_org || jsonb_build_array(jsonb_build_object(
      'organisation', v_org,
      'nom', (select name from public.organizations where id = v_org),
      'biens', (select count(*) from public.biens where organization_id = v_org),
      'lots', (select count(*) from public.lots where organization_id = v_org),
      'baux', (select count(*) from public.baux where organization_id = v_org),
      'personnes', (select count(*) from public.persons where organization_id = v_org),
      'documents', (select count(*) from public.documents where organization_id = v_org),
      'fichiers', (select count(*) from storage.objects o where o.bucket_id = 'documents' and o.name like v_org::text || '/%'),
      'membres_invites', (select count(*) from public.memberships m where m.organization_id = v_org and m.account_id <> p_account),
      'demandes_zoho', (select count(*) from public.bail_signature_circuits c where c.organization_id = v_org and c.external_request_id is not null)));
    if public.organisation_a_paye(v_org) then
      v_archive := v_archive || to_jsonb(v_org);
    end if;
  end loop;
  select id into v_artisan from public.artisans where account_id = p_account;
  -- Une fois l'effacement fait, il ne reste que ces références (les acceptations partent avec le compte).
  v_refs := public.references_hors_perimetre(p_account, v_orgs);
  v_bilan := jsonb_build_object(
    'simule_le', now(),
    'organisations_effacees', v_par_org,
    'adhesions_retirees', (select count(*) from public.memberships m
                            where m.account_id = p_account and m.organization_id is not null
                              and not (m.organization_id = any(v_orgs))),
    'dossiers_tiers', (select count(*) from public.persons p
                        where p.account_id = p_account and not (p.organization_id = any(v_orgs))),
    'proprietaires_prevenus', (select count(distinct p.organization_id) from public.persons p
                                where p.account_id = p_account and not (p.organization_id = any(v_orgs))),
    'artisan', v_artisan,
    'archive_requise', v_archive,
    'acceptations', (select count(*) from public.acceptations_cgu where account_id = p_account),
    'abonnement', public.abonnement_de_fermeture(p_account),
    'references_restantes', v_refs,
    'mode_prevu', case when v_refs = '{}'::jsonb then 'suppression' else 'neutralisation' end,
    'super_admin', exists (select 1 from public.memberships where account_id = p_account and role = 'super_admin'));
  if p_fermeture is not null then
    update public.fermetures_comptes set bilan_simulation = v_bilan, simulee_le = now()
     where id = p_fermeture and account_id = p_account and statut = 'programmee';
  end if;
  return v_bilan;
end $$;
revoke all on function public.simuler_fermeture_compte(uuid, uuid) from public, anon;
grant execute on function public.simuler_fermeture_compte(uuid, uuid) to authenticated, service_role;

-- ── 5. Programmation, annulation, gel ─────────────────────────────────────────────────────────────────────────────

-- Programme la fermeture d'un compte. Date d'effet (plan, lot 1E) :
--  · abonnement payé en cours : fin de la période payée (le lendemain de sa fin, jour de Paris) ou J+14 avec
--    annulation Stripe et remboursement au prorata, au choix du titulaire (p_choix obligatoire) ;
--  · sinon : J+14 ;
--  · inactivité : la date annoncée par les avertissements (p_effacement_prevu_le), jamais choisie par un appelant.
-- Les gestes Stripe (fin de période, date d'annulation, montant du remboursement) sont faits par l'application AVANT
-- cet appel ; p_remboursement ({"facture": "in_…", "montant_cents": n}) n'est accepté que de la clé de service.
create or replace function public.programmer_fermeture_compte(
  p_account uuid,
  p_origine text,
  p_choix text default null,
  p_demande_id uuid default null,
  p_par uuid default null,
  p_remboursement jsonb default null,
  p_effacement_prevu_le date default null,
  p_derniere_activite_le timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := (select auth.role());
  v_service boolean := (select auth.role()) = 'service_role';
  v_interne boolean := (select auth.role()) is null;
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_email text;
  v_abo jsonb;
  v_choix text;
  v_effet date;
  v_demandee date := (now() at time zone 'Europe/Paris')::date;
  v_par uuid;
  v_id uuid;
  v_bilan jsonb;
begin
  if not v_interne and not v_service and not public.is_permanent_super_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_origine is null or p_origine not in ('titulaire', 'super_admin', 'inactivite') then
    raise exception 'Origine de fermeture inconnue' using errcode = '22023';
  end if;
  if p_origine = 'inactivite' and not (v_interne or v_service) then
    raise exception 'La fermeture pour inactivité est programmée par la tâche quotidienne' using errcode = '42501';
  end if;
  if p_remboursement is not null and not (v_interne or v_service) then
    raise exception 'Remboursement fourni hors du traitement' using errcode = '42501';
  end if;
  select email into v_email from public.accounts where id = p_account and efface_le is null;
  if not found then raise exception 'Compte inconnu ou déjà effacé' using errcode = 'P0002'; end if;
  if exists (select 1 from public.memberships where account_id = p_account and role = 'super_admin') then
    raise exception 'Un compte de supervision ne se ferme pas par cette procédure' using errcode = '42501';
  end if;
  if exists (select 1 from public.fermetures_comptes where account_id = p_account and statut = 'programmee') then
    raise exception 'Une fermeture est déjà programmée pour ce compte' using errcode = '23505';
  end if;
  if p_demande_id is not null then
    select (r.cree_le at time zone 'Europe/Paris')::date into v_demandee
      from public.retours_utilisateurs r
     where r.id = p_demande_id and r.auteur_id = p_account and r.nature = 'question' and r.organization_id is null;
    if not found then raise exception 'Demande inconnue pour ce compte' using errcode = '22023'; end if;
  end if;

  v_abo := public.abonnement_de_fermeture(p_account);
  if p_origine = 'inactivite' then
    if p_effacement_prevu_le is null or p_derniere_activite_le is null then
      raise exception 'Date annoncée et dernière activité requises' using errcode = '22023';
    end if;
    if coalesce((v_abo ->> 'vivante')::boolean, false) then
      raise exception 'Abonnement en cours : pas de fermeture pour inactivité' using errcode = '22023';
    end if;
    v_choix := null;
    v_effet := p_effacement_prevu_le;
  elsif coalesce((v_abo ->> 'payee_en_cours')::boolean, false) then
    if p_choix is null or p_choix not in ('fin_periode', 'j14_prorata') then
      raise exception 'Abonnement payé en cours : choisir la fin de la période payée ou une fermeture à quatorze jours avec remboursement'
        using errcode = '22023';
    end if;
    v_choix := p_choix;
    v_effet := case when p_choix = 'fin_periode'
                    then (((v_abo ->> 'periode_fin')::timestamptz at time zone 'Europe/Paris')::date + 1)
                    else v_jour + 14 end;
  else
    v_choix := null;
    v_effet := v_jour + 14;
  end if;
  if v_choix is distinct from 'j14_prorata' and p_remboursement is not null then
    raise exception 'Remboursement au prorata réservé au choix j14_prorata' using errcode = '22023';
  end if;
  v_par := case when v_service or v_interne then p_par else (select auth.uid()) end;

  insert into public.fermetures_comptes (
    account_id, demande_id, origine, choix, programmee_par, demandee_le, effacement_prevu_le,
    empreinte_adresse, adresse_courriel, derniere_activite_le, abonnement,
    remboursement_prevu_cents, stripe_facture_id)
  values (
    p_account, p_demande_id, p_origine, v_choix, v_par, v_demandee, v_effet,
    public.empreinte_adresse(v_email), v_email, p_derniere_activite_le, v_abo,
    nullif(p_remboursement ->> 'montant_cents', '')::bigint, nullif(p_remboursement ->> 'facture', ''))
  returning id into v_id;

  v_bilan := public.simuler_fermeture_compte(p_account, v_id);
  insert into public.audit_log (account_id, organization_id, action, details)
  values (case when v_service or v_interne then null else (select auth.uid()) end, null, 'fermeture_programmee',
          jsonb_build_object('fermeture_id', v_id, 'compte', p_account, 'origine', p_origine, 'choix', v_choix,
                             'effacement_prevu_le', v_effet, 'role', coalesce(v_role, 'interne')));
  return jsonb_build_object('id', v_id, 'effacement_prevu_le', v_effet, 'choix', v_choix,
                            'abonnement', v_abo, 'bilan', v_bilan);
end $$;
revoke all on function public.programmer_fermeture_compte(uuid, text, text, uuid, uuid, jsonb, date, timestamptz) from public, anon;
grant execute on function public.programmer_fermeture_compte(uuid, text, text, uuid, uuid, jsonb, date, timestamptz) to authenticated, service_role;

-- Annule une fermeture encore programmée. Rend l'abonnement figé à la programmation : l'application défait le geste
-- Stripe (fin de période ou date d'annulation) qu'elle avait posé.
create or replace function public.annuler_fermeture_compte(p_fermeture uuid, p_motif text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare f public.fermetures_comptes;
begin
  if (select auth.role()) is distinct from 'service_role' and (select auth.role()) is not null
     and not public.is_permanent_super_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_motif is null or length(btrim(p_motif)) not between 5 and 1000 then
    raise exception 'Motif d''annulation requis (5 à 1000 caractères)' using errcode = '22023';
  end if;
  update public.fermetures_comptes
     set statut = 'annulee', annulee_le = now(), annulation_motif = btrim(p_motif), adresse_courriel = null
   where id = p_fermeture and statut = 'programmee'
  returning * into f;
  if not found then raise exception 'Aucune fermeture programmée sous cet identifiant' using errcode = 'P0002'; end if;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (case when (select auth.role()) = 'service_role' then null else (select auth.uid()) end, null, 'fermeture_annulee',
          jsonb_build_object('fermeture_id', f.id, 'compte', f.account_id));
  return jsonb_build_object('id', f.id, 'choix', f.choix, 'abonnement', f.abonnement,
                            'stripe_facture_id', f.stripe_facture_id);
end $$;
revoke all on function public.annuler_fermeture_compte(uuid, text) from public, anon;
grant execute on function public.annuler_fermeture_compte(uuid, text) to authenticated, service_role;

-- Gel (litige ou créance) : la fermeture reste programmée mais ne s'exécute pas tant que le motif est posé. Un motif
-- nul lève le gel.
create or replace function public.geler_fermeture_compte(p_fermeture uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' and (select auth.role()) is not null
     and not public.is_permanent_super_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_motif is not null and length(btrim(p_motif)) not between 5 and 1000 then
    raise exception 'Motif de gel : 5 à 1000 caractères' using errcode = '22023';
  end if;
  update public.fermetures_comptes
     set gel_motif = nullif(btrim(p_motif), ''), gel_pose_le = case when p_motif is null then null else now() end
   where id = p_fermeture and statut = 'programmee';
  if not found then raise exception 'Aucune fermeture programmée sous cet identifiant' using errcode = 'P0002'; end if;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (case when (select auth.role()) = 'service_role' then null else (select auth.uid()) end, null,
          case when p_motif is null then 'fermeture_degelee' else 'fermeture_gelee' end,
          jsonb_build_object('fermeture_id', p_fermeture));
end $$;
revoke all on function public.geler_fermeture_compte(uuid, text) from public, anon;
grant execute on function public.geler_fermeture_compte(uuid, text) to authenticated, service_role;

-- ── 6. Effacement ─────────────────────────────────────────────────────────────────────────────────────────────────

-- La preuve du contrat payé, copiée dans archives_comptes avant toute suppression (une ligne par organisation payante).
create or replace function public.archiver_compte_ferme(p_account uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_abo public.abonnements;
  v_n integer := 0;
  v_email text;
  v_factures jsonb;
  v_acceptations jsonb;
begin
  if not exists (select 1 from public.acceptations_cgu c where c.account_id = p_account) then
    return 0;
  end if;
  select email into v_email from public.accounts where id = p_account;
  select coalesce(jsonb_agg(jsonb_build_object('document', c.document, 'version', c.version, 'source', c.source,
                                               'acceptee_le', c.acceptee_le, 'empreinte_sha256', c.empreinte_sha256)
                            order by c.acceptee_le), '[]'::jsonb)
    into v_acceptations from public.acceptations_cgu c where c.account_id = p_account;
  for v_org in
    select distinct m.organization_id from public.memberships m
     where m.account_id = p_account and m.organization_id is not null
       and m.role in ('admin_agence', 'agent', 'proprietaire_direct')
  loop
    continue when not public.organisation_a_paye(v_org);
    select * into v_abo from public.abonnements where organization_id = v_org;
    -- Les factures payées : la référence Stripe et la date de réception du paiement (jour de Paris). Le détail
    -- (montants, mentions) reste chez Stripe, dont le client n'est jamais supprimé.
    select coalesce(jsonb_agg(jsonb_build_object('stripe_facture', e.charge ->> 'objet',
                                                 'emise_le', to_char((e.recu_le at time zone 'Europe/Paris')::date, 'YYYY-MM-DD'))
                              order by e.recu_le), '[]'::jsonb)
      into v_factures
      from public.abonnement_evenements e
     where e.type = 'invoice.paid' and e.traite_le is not null
       and v_abo.stripe_customer_id is not null and e.charge ->> 'client' = v_abo.stripe_customer_id;
    insert into public.archives_comptes (account_id_origine, organisation_id_origine, email, stripe_customer_id,
                                         acceptations, debut_abonnement, fin_dernier_abonnement_paye, factures)
    values (p_account, v_org, v_email, v_abo.stripe_customer_id, v_acceptations,
            coalesce((select min((e.recu_le at time zone 'Europe/Paris')::date) from public.abonnement_evenements e
                       where e.type = 'invoice.paid' and e.traite_le is not null
                         and e.charge ->> 'client' = v_abo.stripe_customer_id),
                     (v_abo.created_at at time zone 'Europe/Paris')::date),
            least(coalesce((v_abo.periode_fin at time zone 'Europe/Paris')::date, (now() at time zone 'Europe/Paris')::date),
                  (now() at time zone 'Europe/Paris')::date),
            v_factures)
    on conflict (account_id_origine, organisation_id_origine) do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.archiver_compte_ferme(uuid) from public, anon, authenticated, service_role;

-- Efface une organisation entière : les boucles (a)(b)(c) du nettoyage du 21/10 (20261021175930), limitées à cette
-- organisation. Fichiers du compartiment `documents` sous son dossier mis en file (`purge_fichiers`, supprimés la nuit
-- par la mission « purge ») ; journaux d'audit gardés, détachés de l'organisation effacée ; journal des réceptions Stripe
-- gardé (clé « on delete set null ») ; registres internes du support gardés (schéma support_interne, hors boucle).
create or replace function public.effacer_organisation_fermeture(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_passe int := 0;
  v_progres boolean;
  v_n bigint;
  v_total bigint := 0;
  v_fichiers bigint := 0;
  v_erreurs jsonb;
  v_zoho jsonb;
  v_hors jsonb;
  v_artisans uuid[];
  r record;
begin
  insert into public.purge_fichiers (storage_path)
  select o.name from storage.objects o
   where o.bucket_id = 'documents' and o.name like p_org::text || '/%'
     and not exists (select 1 from public.purge_fichiers p where p.storage_path = o.name and p.deleted_at is null);
  get diagnostics v_fichiers = row_count;
  select coalesce(jsonb_agg(distinct c.external_request_id), '[]'::jsonb) into v_zoho
    from public.bail_signature_circuits c where c.organization_id = p_org and c.external_request_id is not null;
  -- Fichiers hors du compartiment `documents` : retirés par l'application (lib/fermetures-comptes.ts).
  select coalesce(jsonb_agg(jsonb_build_object('compartiment', 'exports-complets', 'chemin', x.chemin)), '[]'::jsonb)
    into v_hors from public.exports_complets x
   where x.organisation_id_export = p_org and x.chemin is not null and x.supprime_le is null;

  update public.audit_log set organization_id = null,
         details = details || jsonb_build_object('organisation_effacee', p_org)
   where organization_id = p_org;
  update public.retours_utilisateurs set groupe_id = null
   where groupe_id in (select id from public.retours_utilisateurs where organization_id = p_org);
  update public.intervention_creneaux c set demande_id = null
   where c.organization_id = p_org and exists (
     select 1 from public.intervention_demandes_rdv d where d.id = c.demande_id and d.organization_id = p_org);
  -- Un artisan qui a son compte garde sa fiche ; une fiche privée créée par l'organisation part avec elle.
  update public.artisans set cree_par_organization_id = null
   where cree_par_organization_id = p_org and account_id is not null;
  select coalesce(array_agg(id), '{}') into v_artisans
    from public.artisans where cree_par_organization_id = p_org and account_id is null;

  loop
    v_passe := v_passe + 1;
    v_progres := false;
    v_erreurs := '{}'::jsonb;

    -- (a) Tables portant `organization_id` (schéma public seulement), sauf celles que leur clé détache d'elle-même.
    for r in
      select c.oid::regclass as tbl
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
       where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'organizations'
         and not exists (select 1 from pg_constraint con
                          where con.conrelid = c.oid and con.contype = 'f'
                            and con.confrelid = 'public.organizations'::regclass
                            and con.conkey[1] = a.attnum and con.confdeltype in ('n', 'd'))
    loop
      begin
        if r.tbl = 'public.audit_log'::regclass then
          -- Les traces posées pendant l'effacement (adhésions retirées…) : gardées, détachées comme les autres.
          execute 'update public.audit_log set organization_id = null, details = details || jsonb_build_object(''organisation_effacee'', $1) where organization_id = $1'
            using p_org;
        else
          execute format('delete from %s where organization_id = $1', r.tbl) using p_org;
        end if;
        get diagnostics v_n = row_count;
        if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
      exception when others then
        v_erreurs := v_erreurs || jsonb_build_object(r.tbl::text, sqlerrm);
      end;
    end loop;

    -- (b) Clés vers organizations sous un autre nom de colonne (parrainages, fiche prospect liée, fiches d'artisan
    --     privées de l'organisation).
    for r in
      select con.conrelid::regclass as tbl, att.attname as col
        from pg_constraint con
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
       where con.contype = 'f' and array_length(con.conkey, 1) = 1 and con.confdeltype in ('a', 'r')
         and con.confrelid = 'public.organizations'::regclass and att.attname <> 'organization_id'
    loop
      begin
        execute format('delete from %s where %I = $1', r.tbl, r.col) using p_org;
        get diagnostics v_n = row_count;
        if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
      exception when others then
        v_erreurs := v_erreurs || jsonb_build_object(r.tbl::text || '.' || r.col, sqlerrm);
      end;
    end loop;

    -- (c) Tables filles SANS `organization_id` d'une table qui en porte une.
    for r in
      select con.conrelid::regclass as tbl, att.attname as col, con.confrelid::regclass as parent, patt.attname as pcol
        from pg_constraint con
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
        join pg_attribute patt on patt.attrelid = con.confrelid and patt.attnum = con.confkey[1]
        join pg_class pc on pc.oid = con.confrelid
        join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = 'public'
       where con.contype = 'f' and array_length(con.conkey, 1) = 1 and con.confdeltype in ('a', 'r')
         and exists (select 1 from pg_attribute x where x.attrelid = con.confrelid
                        and x.attname = 'organization_id' and not x.attisdropped)
         and not exists (select 1 from pg_attribute y where y.attrelid = con.conrelid
                            and y.attname = 'organization_id' and not y.attisdropped)
    loop
      begin
        execute format('delete from %s where %I in (select %I from %s where organization_id = $1)',
                       r.tbl, r.col, r.pcol, r.parent) using p_org;
        get diagnostics v_n = row_count;
        if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
      exception when others then
        v_erreurs := v_erreurs || jsonb_build_object(r.tbl::text || '.' || r.col, sqlerrm);
      end;
    end loop;

    -- (c2) Les fiches d'artisan privées de l'organisation : leurs registres, puis la fiche.
    if cardinality(v_artisans) > 0 then
      for r in
        select con.conrelid::regclass as tbl, att.attname as col
          from pg_constraint con
          join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
         where con.contype = 'f' and con.confrelid = 'public.artisans'::regclass and array_length(con.conkey, 1) = 1
           and con.confdeltype in ('a', 'r')
      loop
        begin
          execute format('delete from %s where %I = any($1)', r.tbl, r.col) using v_artisans;
          get diagnostics v_n = row_count;
          if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
        exception when others then
          v_erreurs := v_erreurs || jsonb_build_object(r.tbl::text || '.' || r.col, sqlerrm);
        end;
      end loop;
    end if;

    -- (d) L'organisation.
    begin
      delete from public.organizations where id = p_org;
      get diagnostics v_n = row_count;
      if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
    exception when others then
      v_erreurs := v_erreurs || jsonb_build_object('organizations', sqlerrm);
    end;

    exit when not exists (select 1 from public.organizations where id = p_org);
    if not v_progres or v_passe >= 25 then
      raise exception 'Effacement de l''organisation bloqué après % passe(s). Refus : %', v_passe, v_erreurs::text
        using errcode = 'P0001';
    end if;
  end loop;

  return jsonb_build_object('organisation', p_org, 'lignes_supprimees', v_total, 'fichiers_en_file', v_fichiers,
                            'demandes_zoho', v_zoho, 'fichiers_hors_documents', v_hors, 'passes', v_passe);
end $$;
revoke all on function public.effacer_organisation_fermeture(uuid) from public, anon, authenticated, service_role;

-- L'effacement d'un compte, dans l'ordre du plan. Ne contrôle rien (les gardes sont dans executer_fermeture_compte) ;
-- lève une exception si une étape échoue : l'appelant annule alors tout l'effacement de ce compte.
create or replace function public.effacer_compte_ferme(p_account uuid, p_fermeture uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_orgs uuid[];
  v_org uuid;
  v_effacees jsonb := '[]'::jsonb;
  v_noms jsonb := '[]'::jsonb;
  v_hors jsonb := '[]'::jsonb;
  v_zoho jsonb := '[]'::jsonb;
  v_res jsonb;
  v_archives integer;
  v_adhesions bigint;
  v_dossiers bigint := 0;
  v_alertes bigint := 0;
  v_artisan uuid;
  v_artisan_sort text := null;
  v_fichiers bigint := 0;
  v_n bigint;
  v_mode text;
  v_blocage text;
  v_controle bigint;
  r record;
begin
  select email into v_email from public.accounts where id = p_account;
  if not found then
    return jsonb_build_object('mode', 'suppression', 'deja_absent', true);
  end if;
  perform public.tache_systeme();
  perform public.gardes_effacement(false);

  -- 1. La preuve du contrat payé.
  v_archives := public.archiver_compte_ferme(p_account);

  -- 2. Les données de plateforme du compte.
  delete from public.reseau_interets where account_id = p_account;
  delete from public.retours_soutiens where account_id = p_account;
  -- Les dépôts temporaires échus sont retirés (fichier et ligne) par la mission « purge ».
  update public.depots_temporaires set expire_le = least(expire_le, now() - interval '4 hours') where compte_id = p_account;
  select v_hors || coalesce(jsonb_agg(jsonb_build_object('compartiment', 'exports-complets', 'chemin', x.chemin)), '[]'::jsonb)
    into v_hors from public.exports_complets x
   where x.demande_par = p_account and x.chemin is not null and x.supprime_le is null;
  delete from public.exports_complets where demande_par = p_account;

  -- 3. Les organisations dont il est le seul gérant.
  select coalesce(array_agg(o), '{}') into v_orgs from public.organisations_du_seul_titulaire(p_account) o;
  foreach v_org in array v_orgs loop
    v_noms := v_noms || to_jsonb((select name from public.organizations where id = v_org));
    v_res := public.effacer_organisation_fermeture(v_org);
    v_effacees := v_effacees || jsonb_build_array(v_org);
    v_hors := v_hors || coalesce(v_res -> 'fichiers_hors_documents', '[]'::jsonb);
    v_zoho := v_zoho || coalesce(v_res -> 'demandes_zoho', '[]'::jsonb);
    v_fichiers := v_fichiers + coalesce((v_res ->> 'fichiers_en_file')::bigint, 0);
  end loop;

  -- 4. Ailleurs, ses seules adhésions.
  delete from public.memberships where account_id = p_account and organization_id is not null;
  get diagnostics v_adhesions = row_count;

  -- 5. Les dossiers des autres propriétaires : le lien au compte est retiré, la fiche reste au propriétaire, prévenu.
  for r in
    select p.organization_id, array_agg(p.id) as personnes from public.persons p
     where p.account_id = p_account group by p.organization_id
  loop
    update public.persons set account_id = null where account_id = p_account and organization_id = r.organization_id;
    get diagnostics v_n = row_count;
    v_dossiers := v_dossiers + v_n;
    insert into public.alerts (organization_id, type, criticite, titre, details, assigned_all)
    values (r.organization_id, 'compte_ferme', 'normale',
            'Un compte relié à votre dossier a été fermé',
            jsonb_build_object('personnes', to_jsonb(r.personnes), 'fermeture_id', p_fermeture,
                               'message', 'La personne a fermé son compte Gerimmo : elle n''a plus accès à son espace. Sa fiche et les documents de votre dossier restent sous votre responsabilité ; sa demande sur ses données vous est transmise.'),
            true);
    v_alertes := v_alertes + 1;
  end loop;

  -- 6. Sa fiche d'artisan : registres privés, zones, métiers, pièces. La fiche part si aucun dossier de propriétaire ne
  --    la cite ; sinon elle reste (identité professionnelle citée dans leurs devis et factures), détachée du compte et
  --    retirée du réseau.
  select id into v_artisan from public.artisans where account_id = p_account;
  if v_artisan is not null then
    insert into public.purge_fichiers (storage_path)
    select o.name from storage.objects o
     where o.bucket_id = 'documents' and o.name like 'artisans/' || v_artisan::text || '/%'
       and not exists (select 1 from public.documents d where d.storage_path = o.name)
       and not exists (select 1 from public.purge_fichiers p where p.storage_path = o.name and p.deleted_at is null);
    get diagnostics v_n = row_count;
    v_fichiers := v_fichiers + v_n;
    select v_hors || coalesce(jsonb_agg(jsonb_build_object('compartiment', 'artisan-prive', 'chemin', o.name)), '[]'::jsonb)
      into v_hors from storage.objects o
     where o.bucket_id = 'artisan-prive' and o.name like v_artisan::text || '/%';
    -- Plusieurs passes : les registres privés se citent entre eux (règlements et factures externes…). Le journal des
    -- sessions de diagnostic du support reste (contrôle interne) : la fiche est alors détachée au lieu d'être supprimée.
    for i in 1..6 loop
      v_n := 0;
      for r in
        select con.conrelid::regclass as tbl, att.attname as col
          from pg_constraint con
          join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
         where con.contype = 'f' and con.confrelid = 'public.artisans'::regclass and array_length(con.conkey, 1) = 1
           and con.conrelid <> 'public.supervision_sessions_artisan'::regclass
           and not exists (select 1 from pg_attribute y where y.attrelid = con.conrelid
                              and y.attname = 'organization_id' and not y.attisdropped)
      loop
        begin
          execute format('delete from %s where %I = $1', r.tbl, r.col) using v_artisan;
        exception when others then
          v_n := v_n + 1;
        end;
      end loop;
      exit when v_n = 0;
    end loop;
    begin
      delete from public.artisans where id = v_artisan;
      v_artisan_sort := 'supprimee';
    exception when foreign_key_violation then
      update public.artisans set account_id = null, visibilite = 'privee', email = null where id = v_artisan;
      v_artisan_sort := 'detachee';
    end;
  end if;

  -- 7. Le compte de connexion : supprimé, ou neutralisé si une référence subsiste.
  delete from auth.sessions where user_id = p_account;
  begin
    delete from auth.users where id = p_account;
    v_mode := 'suppression';
  exception when foreign_key_violation then
    get stacked diagnostics v_blocage = constraint_name;
    v_mode := 'neutralisation';
  end;
  if v_mode = 'neutralisation' then
    update auth.users
       set email = 'efface-' || p_account::text || '@compte-supprime.invalid',
           encrypted_password = '', phone = null,
           raw_user_meta_data = '{}'::jsonb,
           raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
           banned_until = now() + interval '100 years', email_change = '', email_change_token_new = '', email_change_token_current = '',
           confirmation_token = '', recovery_token = '', updated_at = now()
     where id = p_account;
    -- Tables de GoTrue absentes des bases locales : supprimées si elles existent.
    if to_regclass('auth.identities') is not null then
      execute 'delete from auth.identities where user_id = $1' using p_account;
    end if;
    if to_regclass('auth.mfa_factors') is not null then
      execute 'delete from auth.mfa_factors where user_id = $1' using p_account;
    end if;
    if to_regclass('auth.refresh_tokens') is not null then
      execute 'delete from auth.refresh_tokens where user_id = $1' using p_account::text;
    end if;
    if to_regclass('auth.one_time_tokens') is not null then
      execute 'delete from auth.one_time_tokens where user_id = $1' using p_account;
    end if;
    -- accounts.email suit auth.users (déclencheur on_auth_user_updated) ; l'effacement est daté.
    update public.accounts set email = 'efface-' || p_account::text || '@compte-supprime.invalid',
           mfa_actif = false, efface_le = now()
     where id = p_account;
  end if;

  -- 8. Contrôle : plus aucun compte ne porte l'adresse d'origine.
  select (select count(*) from auth.users where lower(email) = lower(v_email))
       + (select count(*) from public.accounts where lower(email) = lower(v_email))
    into v_controle;
  if v_controle <> 0 then
    raise exception 'Contrôle de l''adresse d''origine : % compte(s) la portent encore', v_controle using errcode = 'P0001';
  end if;
  perform public.gardes_effacement(true);

  return jsonb_build_object(
    'mode', v_mode,
    'blocage', v_blocage,
    'archives', v_archives,
    'organisations_effacees', v_effacees,
    -- Pour le seul courriel de fin : retiré de la ligne dès qu'il est parti, jamais écrit au journal d'audit.
    'organisations_noms', v_noms,
    'adhesions_retirees', v_adhesions,
    'dossiers_tiers_detaches', v_dossiers,
    'proprietaires_prevenus', v_alertes,
    'artisan', case when v_artisan is null then null else jsonb_build_object('id', v_artisan, 'fiche', v_artisan_sort) end,
    'fichiers_en_file', v_fichiers,
    'fichiers_hors_documents', v_hors,
    'demandes_zoho', v_zoho,
    'controle_adresse', v_controle);
end $$;
revoke all on function public.effacer_compte_ferme(uuid, uuid) from public, anon, authenticated, service_role;

-- ── 7. Exécution ──────────────────────────────────────────────────────────────────────────────────────────────────

-- Exécute UNE fermeture programmée, toutes gardes vérifiées. Réservée au propriétaire des fonctions (pg_cron) : aucun
-- rôle de l'API ne peut l'appeler. Rend un état ; ne lève que si l'effacement lui-même échoue (l'appelant l'isole).
create or replace function public.executer_fermeture_compte(p_fermeture uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.fermetures_comptes;
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_systeme text := coalesce(current_setting('gerimmo.systeme', true), '');
  v_abo jsonb;
  v_act record;
  v_bilan jsonb;
  v_artisan uuid;
begin
  -- Les gardes suspendues le temps de l'effacement posent un verrou de table : ne jamais l'attendre longtemps.
  perform pg_catalog.set_config('lock_timeout', '10s', true);
  select * into f from public.fermetures_comptes where id = p_fermeture for update;
  if not found then raise exception 'Fermeture inconnue' using errcode = 'P0002'; end if;
  if f.statut <> 'programmee' then return jsonb_build_object('etat', 'deja_' || f.statut); end if;
  if not public.tache_planifiee_autorisee('fermetures-comptes') then return jsonb_build_object('etat', 'arret_en_cours'); end if;
  if f.effacement_prevu_le > v_jour then return jsonb_build_object('etat', 'pas_encore'); end if;
  if f.gel_motif is not null then return jsonb_build_object('etat', 'gelee'); end if;
  if f.bilan_simulation is null then return jsonb_build_object('etat', 'simulation_manquante'); end if;
  if not public.sauvegarde_du_jour_reussie() then return jsonb_build_object('etat', 'sauvegarde_manquante'); end if;
  if exists (select 1 from public.memberships where account_id = f.account_id and role = 'super_admin') then
    return jsonb_build_object('etat', 'compte_de_supervision');
  end if;
  v_abo := public.abonnement_de_fermeture(f.account_id);
  if coalesce((v_abo ->> 'vivante')::boolean, false) then return jsonb_build_object('etat', 'souscription_active'); end if;
  if exists (select 1 from public.bail_signature_circuits c
              where c.organization_id in (select public.organisations_du_seul_titulaire(f.account_id))
                and c.etat in ('preparation', 'en_cours', 'a_verifier')) then
    return jsonb_build_object('etat', 'signature_en_cours');
  end if;
  if f.origine = 'inactivite' then
    select * into v_act from public.activite_compte(f.account_id);
    if v_act.derniere_activite_le is distinct from f.derniere_activite_le or v_act.abonnement_en_cours then
      update public.fermetures_comptes
         set statut = 'annulee', annulee_le = now(), adresse_courriel = null,
             annulation_motif = 'Le compte a servi depuis les avertissements (connexion ou abonnement) : suppression annulée.'
       where id = f.id;
      return jsonb_build_object('etat', 'annulee_activite');
    end if;
  end if;

  select id into v_artisan from public.artisans where account_id = f.account_id;
  v_bilan := public.effacer_compte_ferme(f.account_id, f.id);
  update public.fermetures_comptes
     set statut = 'executee', executee_le = now(), mode_effacement = v_bilan ->> 'mode', bilan_execution = v_bilan,
         tentatives = tentatives + 1, derniere_tentative_le = now(), derniere_erreur = null
   where id = f.id;
  insert into public.effacements_a_reappliquer (fermeture_id, account_id_origine, organisations_effacees,
                                                artisan_id_origine, executee_le)
  values (f.id, f.account_id,
          coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(v_bilan -> 'organisations_effacees') x), '{}'),
          v_artisan, now())
  on conflict (fermeture_id) do nothing;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (null, null, 'compte_ferme',
          jsonb_build_object('fermeture_id', f.id, 'compte', f.account_id, 'origine', f.origine,
                             'bilan', v_bilan - 'organisations_noms'));
  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);
  return jsonb_build_object('etat', 'executee', 'bilan', v_bilan);
end $$;
revoke all on function public.executer_fermeture_compte(uuid) from public, anon, authenticated, service_role;

-- ── 8. Inactivité ─────────────────────────────────────────────────────────────────────────────────────────────────

-- Les avertissements à envoyer aujourd'hui (J-60, puis J-15). p_version_min : la version des conditions à partir de
-- laquelle la règle s'applique (VERSION_MIN_INACTIVITE de l'application) ; nulle, la règle est inactive.
create or replace function public.comptes_inactifs_a_prevenir(p_version_min text, p_limite integer default 200)
returns table (account_id uuid, email text, etape text, nature text, organisation text,
               derniere_activite_le timestamptz, suppression_le date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  if (select auth.role()) is distinct from 'service_role' and (select auth.role()) is not null then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  if p_version_min is null then return; end if;
  if p_version_min !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Version des conditions invalide' using errcode = '22023';
  end if;
  return query
  with candidats as (
    select a.id, a.email, act.derniere_activite_le as activite, act.nature, act.organisation,
           ((act.derniere_activite_le at time zone 'Europe/Paris')::date + interval '24 months')::date as base
      from public.accounts a
      cross join lateral public.activite_compte(a.id) act
     where a.efface_le is null
       and not exists (select 1 from public.memberships m where m.account_id = a.id and m.role = 'super_admin')
       and not exists (select 1 from public.fermetures_comptes f where f.account_id = a.id and f.statut = 'programmee')
       and exists (select 1 from public.acceptations_cgu c
                    where c.account_id = a.id and c.version ~ '^\d{4}-\d{2}-\d{2}$' and c.version >= p_version_min)
       and not act.abonnement_en_cours
       and act.derniere_activite_le is not null
  ), etat as (
    select c.*, j60.suppression_prevue_le as annonce,
           exists (select 1 from public.avertissements_inactivite j
                    where j.account_id = c.id and j.etape = 'j15' and j.derniere_activite_le = c.activite) as j15_envoye
      from candidats c
      left join public.avertissements_inactivite j60
        on j60.account_id = c.id and j60.etape = 'j60' and j60.derniere_activite_le = c.activite
  )
  select * from (
    select e.id, e.email, 'j60'::text, e.nature, e.organisation, e.activite, greatest(e.base, v_jour + 60)
      from etat e where e.annonce is null and v_jour >= e.base - 60
    union all
    select e.id, e.email, 'j15'::text, e.nature, e.organisation, e.activite, e.annonce
      from etat e where e.annonce is not null and not e.j15_envoye and v_jour >= e.annonce - 15
  ) x
  order by 7, 1
  limit greatest(1, least(coalesce(p_limite, 200), 1000));
end $$;
revoke all on function public.comptes_inactifs_a_prevenir(text, integer) from public, anon, authenticated;
grant execute on function public.comptes_inactifs_a_prevenir(text, integer) to service_role;

create or replace function public.avertissement_inactivite_envoye(p_account uuid, p_etape text,
                                                                   p_derniere_activite_le timestamptz, p_suppression_le date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' and (select auth.role()) is not null then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  if p_etape not in ('j60', 'j15') or p_derniere_activite_le is null or p_suppression_le is null then
    raise exception 'Avertissement invalide' using errcode = '22023';
  end if;
  if p_etape = 'j15' and not exists (select 1 from public.avertissements_inactivite
                                      where account_id = p_account and etape = 'j60'
                                        and derniere_activite_le = p_derniere_activite_le
                                        and suppression_prevue_le = p_suppression_le) then
    raise exception 'Le rappel J-15 suit l''avertissement J-60 du même cycle, à la même date' using errcode = '22023';
  end if;
  insert into public.avertissements_inactivite (account_id, etape, derniere_activite_le, suppression_prevue_le)
  values (p_account, p_etape, p_derniere_activite_le, p_suppression_le)
  on conflict do nothing;
  return found;
end $$;
revoke all on function public.avertissement_inactivite_envoye(uuid, text, timestamptz, date) from public, anon, authenticated;
grant execute on function public.avertissement_inactivite_envoye(uuid, text, timestamptz, date) to service_role;

-- ── 9. Tâche quotidienne (pg_cron « fermetures-comptes ») ─────────────────────────────────────────────────────────

create or replace function public.fermetures_comptes_quotidiennes()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_programmees integer := 0;
  v_executees integer := 0;
  v_attente integer := 0;
  v_echecs integer := 0;
  v_supprimees integer := 0;
  v_etat jsonb;
  v_act record;
  v_msg text;
  r record;
begin
  if not public.tache_planifiee_autorisee('fermetures-comptes') then
    return jsonb_build_object('arret_en_cours', true);
  end if;

  -- 1. Les comptes inactifs prévenus deux fois, dont la date annoncée est atteinte.
  for r in
    select j60.account_id, j60.suppression_prevue_le, j60.derniere_activite_le
      from public.avertissements_inactivite j60
      join public.avertissements_inactivite j15
        on j15.account_id = j60.account_id and j15.etape = 'j15' and j15.derniere_activite_le = j60.derniere_activite_le
      join public.accounts a on a.id = j60.account_id and a.efface_le is null
     where j60.etape = 'j60' and j60.suppression_prevue_le <= v_jour
       and (j15.envoye_le at time zone 'Europe/Paris')::date <= v_jour - 14
       and not exists (select 1 from public.fermetures_comptes f
                        where f.account_id = j60.account_id
                          and (f.statut = 'programmee'
                               or (f.origine = 'inactivite' and f.derniere_activite_le = j60.derniere_activite_le)))
  loop
    select * into v_act from public.activite_compte(r.account_id);
    continue when v_act.derniere_activite_le is distinct from r.derniere_activite_le or v_act.abonnement_en_cours;
    begin
      perform public.programmer_fermeture_compte(r.account_id, 'inactivite', null, null, null, null, v_jour,
                                                 r.derniere_activite_le);
      v_programmees := v_programmees + 1;
    exception when others then
      v_echecs := v_echecs + 1;
    end;
  end loop;

  -- 2. Les fermetures arrivées à échéance : chacune dans sa propre sous-transaction.
  for r in
    select id from public.fermetures_comptes
     where statut = 'programmee' and effacement_prevu_le <= v_jour
     order by effacement_prevu_le, programmee_le
  loop
    begin
      v_etat := public.executer_fermeture_compte(r.id);
      if v_etat ->> 'etat' = 'executee' then v_executees := v_executees + 1; else v_attente := v_attente + 1; end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      update public.fermetures_comptes
         set tentatives = tentatives + 1, derniere_tentative_le = now(), derniere_erreur = left(v_msg, 2000)
       where id = r.id;
      v_echecs := v_echecs + 1;
    end;
  end loop;

  -- 3. Les comptes neutralisés que plus rien ne retient : suppression définitive.
  for r in
    select f.id, f.account_id from public.fermetures_comptes f
      join public.accounts a on a.id = f.account_id and a.efface_le is not null
     where f.statut = 'executee' and f.mode_effacement = 'neutralisation'
  loop
    begin
      delete from auth.users where id = r.account_id;
      update public.fermetures_comptes
         set mode_effacement = 'suppression',
             bilan_execution = bilan_execution || jsonb_build_object('supprime_ensuite_le', now())
       where id = r.id;
      v_supprimees := v_supprimees + 1;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  insert into public.tech_log (account_id, evenement, details)
  values (null, 'fermetures_comptes', jsonb_build_object('programmees', v_programmees, 'executees', v_executees,
          'en_attente', v_attente, 'echecs', v_echecs, 'neutralises_supprimes', v_supprimees));
  return jsonb_build_object('programmees', v_programmees, 'executees', v_executees, 'en_attente', v_attente,
                            'echecs', v_echecs, 'neutralises_supprimes', v_supprimees);
end $$;
revoke all on function public.fermetures_comptes_quotidiennes() from public, anon, authenticated, service_role;

-- Après une restauration : rejouer chaque effacement dont le compte ou l'organisation existe de nouveau. p_registre
-- (facultatif) : les lignes de `effacements_a_reappliquer` relevées AVANT la restauration (tableau JSON), que la
-- sauvegarde restaurée ne contient pas si elle est plus ancienne que la fermeture.
create or replace function public.reappliquer_effacements(p_registre jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_org uuid;
  v_n integer := 0;
  v_ajoutees integer := 0;
begin
  if (select auth.role()) is not null then
    raise exception 'Réservé au propriétaire des fonctions (procédure de restauration)' using errcode = '42501';
  end if;
  perform public.tache_systeme();
  if p_registre is not null then
    if jsonb_typeof(p_registre) <> 'array' then raise exception 'Registre : tableau JSON attendu' using errcode = '22023'; end if;
    for r in select * from jsonb_to_recordset(p_registre)
               as x(fermeture_id uuid, account_id_origine uuid, organisations_effacees uuid[], artisan_id_origine uuid,
                    executee_le timestamptz)
    loop
      -- La ligne de fermeture peut manquer dans la sauvegarde : elle est recréée, réduite à l'essentiel.
      insert into public.fermetures_comptes (id, account_id, origine, statut, demandee_le, effacement_prevu_le,
                                             empreinte_adresse, executee_le, mode_effacement, bilan_execution)
      values (r.fermeture_id, r.account_id_origine, 'super_admin', 'executee', (r.executee_le at time zone 'Europe/Paris')::date,
              (r.executee_le at time zone 'Europe/Paris')::date, repeat('0', 64), r.executee_le, 'suppression',
              jsonb_build_object('recree_apres_restauration', now()))
      on conflict (id) do nothing;
      insert into public.effacements_a_reappliquer (fermeture_id, account_id_origine, organisations_effacees,
                                                    artisan_id_origine, executee_le)
      values (r.fermeture_id, r.account_id_origine, coalesce(r.organisations_effacees, '{}'), r.artisan_id_origine,
              r.executee_le)
      on conflict (fermeture_id) do nothing;
      if found then v_ajoutees := v_ajoutees + 1; end if;
    end loop;
  end if;
  perform public.gardes_effacement(false);
  for r in select * from public.effacements_a_reappliquer loop
    if exists (select 1 from public.accounts where id = r.account_id_origine and efface_le is null)
       or exists (select 1 from public.organizations where id = any(r.organisations_effacees)) then
      foreach v_org in array r.organisations_effacees loop
        if exists (select 1 from public.organizations where id = v_org) then
          perform public.effacer_organisation_fermeture(v_org);
        end if;
      end loop;
      if exists (select 1 from public.accounts where id = r.account_id_origine and efface_le is null) then
        perform public.effacer_compte_ferme(r.account_id_origine, r.fermeture_id);
      end if;
      update public.effacements_a_reappliquer
         set reappliquee_le = now(), reapplications = reapplications + 1
       where fermeture_id = r.fermeture_id;
      v_n := v_n + 1;
    end if;
  end loop;
  perform public.gardes_effacement(true);
  insert into public.audit_log (account_id, organization_id, action, details)
  values (null, null, 'effacements_reappliques', jsonb_build_object('reappliques', v_n, 'registre_ajoute', v_ajoutees));
  return jsonb_build_object('reappliques', v_n, 'registre_ajoute', v_ajoutees);
end $$;
revoke all on function public.reappliquer_effacements(jsonb) from public, anon, authenticated, service_role;

-- ── 10. Suites applicatives (courriel, remboursement, fichiers hors `documents`) ──────────────────────────────────

create or replace function public.fermetures_suites_a_faire(p_limite integer default 20)
returns table (id uuid, account_id uuid, origine text, choix text, adresse_courriel text, demandee_le date,
               derniere_activite_le timestamptz,
               executee_le timestamptz, mode_effacement text, bilan_execution jsonb, abonnement jsonb,
               remboursement_prevu_cents bigint, stripe_facture_id text, rembourse_le timestamptz,
               archives jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  return query
    select f.id, f.account_id, f.origine, f.choix, f.adresse_courriel, f.demandee_le, f.derniere_activite_le,
           f.executee_le, f.mode_effacement,
           f.bilan_execution, f.abonnement, f.remboursement_prevu_cents, f.stripe_facture_id, f.rembourse_le,
           coalesce((select jsonb_agg(jsonb_build_object('preuve_conservee_jusqu_au', a.preuve_conservee_jusqu_au,
                                                         'factures_conservees_jusqu_au', a.factures_conservees_jusqu_au))
                       from public.archives_comptes a where a.account_id_origine = f.account_id), '[]'::jsonb)
      from public.fermetures_comptes f
     where f.statut = 'executee' and f.courriel_envoye_le is null
     order by f.executee_le
     limit greatest(1, least(coalesce(p_limite, 20), 100));
end $$;
revoke all on function public.fermetures_suites_a_faire(integer) from public, anon, authenticated;
grant execute on function public.fermetures_suites_a_faire(integer) to service_role;

create or replace function public.fermeture_suites_faites(p_fermeture uuid, p_remboursement_cents bigint default null,
                                                          p_stripe_remboursement_id text default null,
                                                          p_courriel_envoye boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  update public.fermetures_comptes
     set remboursement_cents = coalesce(p_remboursement_cents, remboursement_cents),
         stripe_remboursement_id = coalesce(p_stripe_remboursement_id, stripe_remboursement_id),
         rembourse_le = case when p_remboursement_cents is not null and rembourse_le is null then now() else rembourse_le end,
         courriel_envoye_le = case when p_courriel_envoye then coalesce(courriel_envoye_le, now()) else courriel_envoye_le end,
         adresse_courriel = case when p_courriel_envoye then null else adresse_courriel end,
         bilan_execution = case when p_courriel_envoye then bilan_execution - 'organisations_noms' else bilan_execution end
   where id = p_fermeture and statut = 'executee';
  if not found then raise exception 'Fermeture exécutée introuvable' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.fermeture_suites_faites(uuid, bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.fermeture_suites_faites(uuid, bigint, text, boolean) to service_role;

-- ── 11. Export complet ────────────────────────────────────────────────────────────────────────────────────────────

-- Le titulaire de l'organisation (admin_agence ou proprietaire_direct actif) demande une archive. Second facteur, ou
-- mot de passe saisi depuis moins de quinze minutes (méthode « password » du jeton). Une demande à la fois, trois par
-- jour au plus.
create or replace function public.demander_export_complet(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_recent boolean;
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if not exists (select 1 from public.memberships m
                  where m.account_id = v_uid and m.organization_id = p_org and m.status = 'active'
                    and m.role in ('admin_agence', 'proprietaire_direct')) then
    raise exception 'Réservé au titulaire de l''espace' using errcode = '42501';
  end if;
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
      or exists (select 1 from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) e
                  where e ->> 'method' = 'password'
                    and coalesce((e ->> 'timestamp')::bigint, 0) >= extract(epoch from now())::bigint - 900)
    into v_recent;
  if not v_recent then
    raise exception 'Confirmez votre identité : second facteur, ou nouvelle connexion avec votre mot de passe'
      using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(620240, pg_catalog.hashtext(p_org::text));
  if exists (select 1 from public.exports_complets x
              where x.organisation_id_export = p_org and x.statut in ('demande', 'en_cours')
                and x.demande_le > now() - interval '1 hour') then
    raise exception 'Une archive est déjà en préparation pour cet espace' using errcode = '23505';
  end if;
  if (select count(*) from public.exports_complets x
       where x.organisation_id_export = p_org and x.demande_le > now() - interval '24 hours') >= 3 then
    raise exception 'Trois archives au plus par jour : réessayez demain' using errcode = '54000';
  end if;
  insert into public.exports_complets (organisation_id_export, demande_par) values (p_org, v_uid) returning id into v_id;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (v_uid, p_org, 'export_complet_demande', jsonb_build_object('export_id', v_id));
  return v_id;
end $$;
revoke all on function public.demander_export_complet(uuid) from public, anon;
grant execute on function public.demander_export_complet(uuid) to authenticated;

-- Le traitement prend une demande (ou reprend une préparation interrompue depuis plus de quinze minutes).
create or replace function public.prendre_export_complet(p_export uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  update public.exports_complets set statut = 'en_cours', commence_le = now()
   where id = p_export
     and (statut = 'demande' or (statut = 'en_cours' and commence_le < now() - interval '15 minutes'));
  return found;
end $$;
revoke all on function public.prendre_export_complet(uuid) from public, anon, authenticated;
grant execute on function public.prendre_export_complet(uuid) to service_role;

create or replace function public.terminer_export_complet(p_export uuid, p_chemin text, p_taille bigint, p_empreinte text,
                                                          p_fichiers integer, p_tables integer, p_pieces uuid[],
                                                          p_erreur text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare x public.exports_complets;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  if p_erreur is null then
    update public.exports_complets
       set statut = 'pret', pret_le = now(), expire_le = now() + interval '7 days', chemin = p_chemin,
           taille_octets = p_taille, empreinte_sha256 = p_empreinte, fichiers = p_fichiers, tables = p_tables,
           pieces_sensibles = coalesce(p_pieces, '{}'), erreur = null
     where id = p_export and statut = 'en_cours'
    returning * into x;
  else
    update public.exports_complets set statut = 'echec', erreur = left(p_erreur, 1000)
     where id = p_export and statut = 'en_cours'
    returning * into x;
  end if;
  if not found then raise exception 'Export introuvable ou déjà terminé' using errcode = 'P0002'; end if;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (null, x.organisation_id_export, case when p_erreur is null then 'export_complet_pret' else 'export_complet_echec' end,
          jsonb_build_object('export_id', x.id, 'fichiers', x.fichiers, 'tables', x.tables, 'octets', x.taille_octets));
end $$;
revoke all on function public.terminer_export_complet(uuid, text, bigint, text, integer, integer, uuid[], text) from public, anon, authenticated;
grant execute on function public.terminer_export_complet(uuid, text, bigint, text, integer, integer, uuid[], text) to service_role;

-- Un téléchargement : journal d'audit, et une ligne d'accès par pièce sensible contenue dans l'archive.
create or replace function public.export_complet_telecharge(p_export uuid, p_account uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare x public.exports_complets;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  update public.exports_complets set telechargements = telechargements + 1, dernier_telechargement_le = now()
   where id = p_export and demande_par = p_account and statut = 'pret' and expire_le > now()
  returning * into x;
  if not found then raise exception 'Archive indisponible' using errcode = 'P0002'; end if;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (p_account, x.organisation_id_export, 'export_complet_telecharge',
          jsonb_build_object('export_id', x.id, 'pieces_sensibles', cardinality(x.pieces_sensibles)));
  insert into public.acces_pieces_log (organization_id, account_id, document_id, action)
  select x.organisation_id_export, p_account, d.id, 'telechargement'
    from public.documents d where d.id = any(x.pieces_sensibles) and d.organization_id = x.organisation_id_export;
end $$;
revoke all on function public.export_complet_telecharge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.export_complet_telecharge(uuid, uuid) to service_role;

create or replace function public.exports_complets_a_supprimer(p_limite integer default 50)
returns table (id uuid, chemin text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  return query
    select x.id, x.chemin from public.exports_complets x
     where x.statut = 'pret' and x.expire_le <= now() and x.supprime_le is null
     order by x.expire_le limit greatest(1, least(coalesce(p_limite, 50), 500));
end $$;
revoke all on function public.exports_complets_a_supprimer(integer) from public, anon, authenticated;
grant execute on function public.exports_complets_a_supprimer(integer) to service_role;

create or replace function public.export_complet_supprime(p_export uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  update public.exports_complets set statut = 'expire', supprime_le = now(), chemin = null
   where id = p_export and statut = 'pret' and expire_le <= now();
end $$;
revoke all on function public.export_complet_supprime(uuid) from public, anon, authenticated;
grant execute on function public.export_complet_supprime(uuid) to service_role;

-- Les données de l'organisation, table par table : chaque table portant `organization_id`, et chaque table fille qui
-- n'en porte pas. Hors archive : journaux techniques et d'audit, files de traitement, registres internes. Les colonnes
-- de jetons et de verrous ne sortent pas.
create or replace function public.export_complet_donnees(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_lignes jsonb;
  v_tables jsonb := '{}'::jsonb;
  v_exclues text[] := array['audit_log', 'acces_pieces_log', 'abonnement_evenements', 'automation_events',
                            'orchestration_cases', 'orchestration_history', 'verrous_facturation',
                            'intentions_souscription', 'retours_soutiens'];
  v_masque text := '(jeton|token|secret|verrou)';
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'Organisation inconnue' using errcode = 'P0002';
  end if;
  execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from public.organizations t where id = $1' into v_lignes using p_org;
  v_tables := v_tables || jsonb_build_object('organizations', v_lignes);
  for r in
    select c.relname as nom
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
     where c.relkind in ('r', 'p') and c.relname <> 'organizations' and not (c.relname = any(v_exclues))
     order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]'') from public.%I t where organization_id = $1', r.nom)
      into v_lignes using p_org;
    if jsonb_array_length(v_lignes) > 0 then
      v_tables := v_tables || jsonb_build_object(r.nom, v_lignes);
    end if;
  end loop;
  for r in
    select distinct cc.relname as nom, att.attname as col, pc.relname as parent, patt.attname as pcol
      from pg_constraint con
      join pg_class cc on cc.oid = con.conrelid
      join pg_namespace cn on cn.oid = cc.relnamespace and cn.nspname = 'public'
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
      join pg_class pc on pc.oid = con.confrelid
      join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = 'public'
      join pg_attribute patt on patt.attrelid = con.confrelid and patt.attnum = con.confkey[1]
     where con.contype = 'f' and array_length(con.conkey, 1) = 1
       and exists (select 1 from pg_attribute x where x.attrelid = con.confrelid and x.attname = 'organization_id' and not x.attisdropped)
       and not exists (select 1 from pg_attribute y where y.attrelid = con.conrelid and y.attname = 'organization_id' and not y.attisdropped)
       and pc.relname <> 'organizations' and not (pc.relname = any(v_exclues))
       and cc.relkind in ('r', 'p')
     order by 1, 2
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]'') from public.%I t where %I in (select %I from public.%I where organization_id = $1)',
                   r.nom, r.col, r.pcol, r.parent)
      into v_lignes using p_org;
    if jsonb_array_length(v_lignes) > 0 then
      v_tables := v_tables || jsonb_build_object(r.nom || case when v_tables ? r.nom then '__' || r.col else '' end, v_lignes);
    end if;
  end loop;
  -- Les colonnes de jetons et de verrous retirées de chaque ligne.
  return (select jsonb_object_agg(k, (select coalesce(jsonb_agg((select jsonb_object_agg(ck, cv) from jsonb_each(l) e(ck, cv)
                                                                 where ck !~* v_masque)), '[]'::jsonb)
                                       from jsonb_array_elements(v) l))
            from jsonb_each(v_tables) t(k, v));
end $$;
revoke all on function public.export_complet_donnees(uuid) from public, anon, authenticated;
grant execute on function public.export_complet_donnees(uuid) to service_role;

-- Les fichiers de l'organisation (compartiment `documents`, sous son dossier) : chemin et taille.
create or replace function public.export_complet_fichiers(p_org uuid)
returns table (chemin text, taille bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  return query
    select o.name, coalesce((o.metadata ->> 'size')::bigint, 0)
      from storage.objects o
     where o.bucket_id = 'documents' and o.name like p_org::text || '/%'
     order by o.name;
end $$;
revoke all on function public.export_complet_fichiers(uuid) from public, anon, authenticated;
grant execute on function public.export_complet_fichiers(uuid) to service_role;

-- Le compte qui demande l'export : identité, adhésions, acceptations des conditions.
create or replace function public.export_complet_compte(p_account uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'compte', (select jsonb_build_object('id', a.id, 'email', a.email, 'cree_le', a.created_at,
                                         'second_facteur', a.mfa_actif,
                                         'derniere_connexion', (select u.last_sign_in_at from auth.users u where u.id = a.id))
                 from public.accounts a where a.id = p_account),
    'adhesions', (select coalesce(jsonb_agg(jsonb_build_object('organisation', m.organization_id, 'role', m.role,
                                                               'statut', m.status, 'cree_le', m.created_at)
                                            order by m.created_at), '[]'::jsonb)
                    from public.memberships m where m.account_id = p_account),
    'acceptations_conditions', (select coalesce(jsonb_agg(jsonb_build_object('document', c.document, 'version', c.version,
                                                                             'source', c.source, 'acceptee_le', c.acceptee_le,
                                                                             'empreinte_sha256', c.empreinte_sha256)
                                                          order by c.acceptee_le), '[]'::jsonb)
                                  from public.acceptations_cgu c where c.account_id = p_account));
end $$;
revoke all on function public.export_complet_compte(uuid) from public, anon, authenticated;
grant execute on function public.export_complet_compte(uuid) to service_role;

-- L'export de l'artisan, étendu aux données de plateforme (R49) : sa fiche et tout ce qui la cite (métiers, zones,
-- pièces, validations, relations avec les espaces, sollicitations, devis, interventions, comptes rendus, factures,
-- évaluations reçues, contestations), ses acceptations des conditions. Les registres privés restent rendus par
-- `mon_activite_artisan_privee`. Jetons, verrous et identifiants des comptes d'autrui ne sortent pas. Chaque export est
-- inscrit au journal d'audit. (Nom des avoirs composé : voir gardes_effacement.)
create or replace function public.export_artisan_plateforme()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_artisan uuid;
  v jsonb;
  v_lignes jsonb;
  v_masque text := '(jeton|token|secret|verrou|account_id|_par$)';
  v_prives text[] := array['artisan_clients', 'artisan_chantiers', 'artisan_devis_externes', 'artisan_rendez_vous',
                           'artisan_factures_externes', 'artisan_evenements_prives', 'artisan_reglements',
                           'artisan_avoirs' || '_externes', 'artisan_pieces_privees', 'supervision_sessions_artisan'];
  r record;
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  select id into v_artisan from public.artisans where account_id = v_uid;
  if v_artisan is null then raise exception 'Réservé à un compte d''artisan' using errcode = '42501'; end if;
  v := jsonb_build_object('fiche', (select to_jsonb(a) from public.artisans a where a.id = v_artisan));
  for r in
    select con.conrelid::regclass as tbl, c.relname as nom, att.attname as col
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
     where con.contype = 'f' and con.confrelid = 'public.artisans'::regclass and array_length(con.conkey, 1) = 1
       and not (c.relname = any(v_prives))
     order by c.relname, att.attname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]'') from %s t where %I = $1', r.tbl, r.col)
      into v_lignes using v_artisan;
    if jsonb_array_length(v_lignes) > 0 then
      v := v || jsonb_build_object(r.nom || case when v ? r.nom then '__' || r.col else '' end, v_lignes);
    end if;
  end loop;
  v := v || jsonb_build_object('acceptations_conditions',
    (select coalesce(jsonb_agg(jsonb_build_object('document', c.document, 'version', c.version, 'source', c.source,
                                                  'acceptee_le', c.acceptee_le) order by c.acceptee_le), '[]'::jsonb)
       from public.acceptations_cgu c where c.account_id = v_uid));
  insert into public.audit_log (account_id, organization_id, action, details)
  values (v_uid, null, 'export_artisan', jsonb_build_object('artisan_id', v_artisan));
  return (select jsonb_object_agg(k,
            case jsonb_typeof(val)
              when 'array' then (select coalesce(jsonb_agg(case when jsonb_typeof(l) = 'object'
                                   then (select coalesce(jsonb_object_agg(ck, cv), '{}'::jsonb) from jsonb_each(l) e(ck, cv) where ck !~* v_masque)
                                   else l end), '[]'::jsonb) from jsonb_array_elements(val) l)
              when 'object' then (select coalesce(jsonb_object_agg(ck, cv), '{}'::jsonb) from jsonb_each(val) e(ck, cv) where ck !~* v_masque)
              else val end)
            from jsonb_each(v) t(k, val));
end $$;
revoke all on function public.export_artisan_plateforme() from public, anon;
grant execute on function public.export_artisan_plateforme() to authenticated;

-- ── 12. Planification ─────────────────────────────────────────────────────────────────────────────────────────────

-- 3 h 20 UTC : après la sauvegarde (1 h 20) et la purge de conservation (3 h 00), avant la mission « purge » (3 h 40),
-- qui supprime les fichiers mis en file et envoie les courriels de fin.
select cron.schedule('fermetures-comptes', '20 3 * * *', $$select public.fermetures_comptes_quotidiennes()$$);

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
