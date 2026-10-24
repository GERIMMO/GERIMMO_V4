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
--    `export_complet_donnees(p_org, p_account)` rend les lignes de l'organisation que le titulaire lit, table par table.
--
-- Relectures adverses du 24/10 (destruction et sécurité ; parcours et textes), corrigées dans ce même fichier (jamais
-- appliqué en production à cette date) :
--  · rien d'un autre compte n'est détruit avec un espace : le règlement déclaré par un artisan sur une facture de
--    l'espace est détaché (référence gardée dans `facture_gerimmo_effacee`) ; une demande au support déposée depuis
--    l'espace par un autre membre (locataire…) est détachée de l'espace, avec son historique ; un parrainage est détaché
--    de l'espace effacé et l'avantage de l'autre client reste ; la fiche d'un artisan qui ferme est détachée (jamais
--    supprimée) dès qu'un carnet de propriétaire, une invitation ou une agence créatrice la cite ;
--  · les archives (titulaire, artisan) ne contiennent que ce qu'une session du demandeur lit (RLS et droits de la
--    table rejoués par `lignes_lisibles_par`) ;
--  · les gardes d'exécution portent sur toutes les souscriptions des espaces effacés, sur le bilan (refait à
--    l'exécution : un périmètre plus large que celui du bilan enregistré refuse, état « bilan_change ») et sur une
--    souscription qu'un titulaire laisserait à des gestionnaires restants ;
--  · la preuve du contrat payé est archivée dès le retrait d'une adhésion de titulaire d'un espace payant ;
--  · le remboursement est dû dès l'arrêt chez Stripe (même si la fermeture est gelée ou annulée après), réparti sur
--    les paiements de la période, enregistré une fois ; une restauration le retrouve dans le registre ;
--  · inactivité : connexion d'un MEMBRE de l'espace, avertissements vérifiés avant toute programmation, rappel J-15 en
--    retard reculé à quinze jours, fermetures d'un même espace effacent l'espace ensemble ;
--  · trace d'une fermeture purgée trois ans après ; client Stripe supprimé au terme des factures (six ans) ;
--  · la tâche de nuit appelle une procédure qui valide chaque fermeture à part (verrous des gardes suspendues relâchés).
--
-- Durées : à relire par le juriste (source non ouverte le 23/10/2026). Rejouable : IF NOT EXISTS, CREATE OR REPLACE,
-- DROP … IF EXISTS, `on conflict do nothing` ; `search_path = ''` ; aucune donnée existante réécrite ;
-- `fermer_fonctions_a_anon()` en fin. Aucune table nouvelle ne porte de colonne `organization_id` (la garde de lecture
-- seule des abonnements s'y poserait et refuserait l'export ou l'archivage d'un compte gelé). Le jour de Paris se
-- calcule dans l'expression (`aujourdhui_paris()` n'est pas cité : hors de la chaîne « Ordre complet »).
-- Retour : supabase/retours-arriere/20261024130000_fermeture_comptes.retour.sql.

do $verrou$ begin perform set_config('lock_timeout', '10s', true); end $verrou$;

-- ── 0. Colonnes ajoutées à des tables existantes ─────────────────────────────────────────────────────────────────

alter table public.accounts add column if not exists efface_le timestamptz;
comment on column public.accounts.efface_le is
  'Fermeture exécutée par neutralisation (une référence empêchait la suppression) : identité effacée, accès bloqué. Posée par executer_fermeture_compte (24/10/2026, R15). Jamais lisible par authenticated.';

-- Registre privé de l'artisan (relecture du 24/10, B1) : un règlement déclaré sur une facture déposée dans un espace
-- effacé reste à l'artisan ; la facture n'existe plus, sa référence (numéro, montant, date de dépôt) est gardée ici.
alter table public.artisan_reglements add column if not exists facture_gerimmo_effacee jsonb;
do $reglements$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.artisan_reglements'::regclass
                  and conname = 'artisan_reglements_facture_effacee_objet') then
    alter table public.artisan_reglements add constraint artisan_reglements_facture_effacee_objet
      check (facture_gerimmo_effacee is null or jsonb_typeof(facture_gerimmo_effacee) = 'object');
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.artisan_reglements'::regclass and conname = 'artisan_reglements_check'
              and pg_get_constraintdef(oid) = 'CHECK ((num_nonnulls(facture_gerimmo_id, facture_externe_id) = 1))') then
    alter table public.artisan_reglements drop constraint artisan_reglements_check;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.artisan_reglements'::regclass
                  and conname = 'artisan_reglements_facture_ou_trace') then
    alter table public.artisan_reglements add constraint artisan_reglements_facture_ou_trace check (
      num_nonnulls(facture_gerimmo_id, facture_externe_id) = 1
      or (facture_gerimmo_id is null and facture_externe_id is null and facture_gerimmo_effacee is not null));
  end if;
end $reglements$;

-- Parrainage (relecture du 24/10, I8) : quand l'un des deux espaces est effacé, le parrainage reste à l'autre client,
-- détaché de l'espace effacé (colonne mise à null par l'effacement ; la clé reste « no action »).
alter table public.parrainages alter column parrain_organization_id drop not null;
alter table public.parrainages alter column filleul_organization_id drop not null;

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

-- La preuve du contrat payé d'un compte pour UNE organisation, copiée dans archives_comptes (une ligne par compte et
-- organisation, jamais réécrite). Rien si le compte n'a accepté aucune version des conditions ou si l'organisation n'a
-- jamais payé (plan du 23/10, choix 5).
create or replace function public.archiver_preuve_compte(p_account uuid, p_org uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_abo public.abonnements;
  v_email text;
  v_factures jsonb;
  v_acceptations jsonb;
begin
  if p_account is null or p_org is null
     or not exists (select 1 from public.acceptations_cgu c where c.account_id = p_account)
     or not public.organisation_a_paye(p_org) then
    return false;
  end if;
  select email into v_email from public.accounts where id = p_account;
  select coalesce(jsonb_agg(jsonb_build_object('document', c.document, 'version', c.version, 'source', c.source,
                                               'acceptee_le', c.acceptee_le, 'empreinte_sha256', c.empreinte_sha256)
                            order by c.acceptee_le), '[]'::jsonb)
    into v_acceptations from public.acceptations_cgu c where c.account_id = p_account;
  select * into v_abo from public.abonnements where organization_id = p_org;
  -- Les factures payées : la référence Stripe et la date de réception du paiement (jour de Paris). Le détail
  -- (montants, mentions) reste chez Stripe, dont le client est supprimé au terme des factures (clients_stripe_au_terme).
  select coalesce(jsonb_agg(jsonb_build_object('stripe_facture', e.charge ->> 'objet',
                                               'emise_le', to_char((e.recu_le at time zone 'Europe/Paris')::date, 'YYYY-MM-DD'))
                            order by e.recu_le), '[]'::jsonb)
    into v_factures
    from public.abonnement_evenements e
   where e.type = 'invoice.paid' and e.traite_le is not null
     and v_abo.stripe_customer_id is not null and e.charge ->> 'client' = v_abo.stripe_customer_id;
  insert into public.archives_comptes (account_id_origine, organisation_id_origine, email, stripe_customer_id,
                                       acceptations, debut_abonnement, fin_dernier_abonnement_paye, factures)
  values (p_account, p_org, v_email, v_abo.stripe_customer_id, v_acceptations,
          coalesce((select min((e.recu_le at time zone 'Europe/Paris')::date) from public.abonnement_evenements e
                     where e.type = 'invoice.paid' and e.traite_le is not null
                       and e.charge ->> 'client' = v_abo.stripe_customer_id),
                   (v_abo.created_at at time zone 'Europe/Paris')::date),
          least(coalesce((v_abo.periode_fin at time zone 'Europe/Paris')::date, (now() at time zone 'Europe/Paris')::date),
                (now() at time zone 'Europe/Paris')::date),
          v_factures)
  on conflict (account_id_origine, organisation_id_origine) do nothing;
  return found;
end $$;
revoke all on function public.archiver_preuve_compte(uuid, uuid) from public, anon, authenticated, service_role;
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

-- Relecture du 24/10 (I4) : la garde ci-dessus ne voit que les adhésions du moment. Un titulaire payant qui quitte
-- son espace (un autre le reprend), puis ferme son compte, partait sans preuve. La preuve est donc archivée dès le
-- retrait d'une adhésion de gérant d'un espace payant, quel que soit le chemin (application, fermeture, effacement
-- d'un espace, suppression directe).
create or replace function public.memberships_archiver_preuve()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.account_id is not null and old.organization_id is not null
     and old.role in ('admin_agence', 'agent', 'proprietaire_direct') then
    perform public.archiver_preuve_compte(old.account_id, old.organization_id);
  end if;
  return old;
end $$;
revoke execute on function public.memberships_archiver_preuve() from public, anon, authenticated, service_role;

drop trigger if exists memberships_archiver_preuve on public.memberships;
create trigger memberships_archiver_preuve
  before delete on public.memberships
  for each row execute function public.memberships_archiver_preuve();

-- ── 2. Tables ─────────────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.fermetures_comptes (
  id uuid primary key default gen_random_uuid(),
  -- Pas de clé vers accounts : la ligne survit au compte (trace de la demande et de son traitement, trois ans).
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
  -- L'adresse du courriel de fin ; relue à l'exécution, effacée dès que le courriel est parti.
  adresse_courriel text check (adresse_courriel is null or length(adresse_courriel) <= 320),
  derniere_activite_le timestamptz,
  abonnement jsonb not null default '{}'::jsonb check (jsonb_typeof(abonnement) = 'object'),
  -- L'état de la souscription chez Stripe AVANT la fermeture (résiliation déjà demandée, date d'arrêt, échéancier),
  -- remis à l'identique si la fermeture est annulée.
  stripe_avant jsonb check (stripe_avant is null or jsonb_typeof(stripe_avant) = 'object'),
  remboursement_prevu_cents bigint check (remboursement_prevu_cents is null or remboursement_prevu_cents >= 0),
  -- La première facture remboursée (affichage) ; la répartition complète, paiement par paiement.
  stripe_facture_id text check (stripe_facture_id is null or stripe_facture_id ~ '^in_[A-Za-z0-9_]{1,200}$'),
  remboursement_repartition jsonb check (remboursement_repartition is null or jsonb_typeof(remboursement_repartition) = 'array'),
  remboursement_cents bigint check (remboursement_cents is null or remboursement_cents >= 0),
  stripe_remboursement_id text check (stripe_remboursement_id is null or length(stripe_remboursement_id) <= 255),
  remboursements_faits jsonb not null default '[]'::jsonb check (jsonb_typeof(remboursements_faits) = 'array'),
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
-- Base où une version antérieure de ce fichier a été jouée (bancs de test) : les colonnes des relectures du 24/10.
alter table public.fermetures_comptes add column if not exists stripe_avant jsonb
  check (stripe_avant is null or jsonb_typeof(stripe_avant) = 'object');
alter table public.fermetures_comptes add column if not exists remboursement_repartition jsonb
  check (remboursement_repartition is null or jsonb_typeof(remboursement_repartition) = 'array');
alter table public.fermetures_comptes add column if not exists remboursements_faits jsonb not null default '[]'::jsonb
  check (jsonb_typeof(remboursements_faits) = 'array');
create index if not exists fermetures_comptes_demande_idx on public.fermetures_comptes (demande_id);
create unique index if not exists fermetures_comptes_une_programmee
  on public.fermetures_comptes (account_id) where statut = 'programmee';
create index if not exists fermetures_comptes_echeance_idx
  on public.fermetures_comptes (statut, effacement_prevu_le);
create index if not exists fermetures_comptes_suites_idx
  on public.fermetures_comptes (executee_le) where statut = 'executee' and courriel_envoye_le is null;
create index if not exists fermetures_comptes_remboursements_idx
  on public.fermetures_comptes (effacement_prevu_le) where choix = 'j14_prorata' and rembourse_le is null;
alter table public.fermetures_comptes enable row level security;
drop policy if exists fermetures_comptes_lecture_superviseur on public.fermetures_comptes;
create policy fermetures_comptes_lecture_superviseur on public.fermetures_comptes
  for select to authenticated using ((select public.is_permanent_super_admin()));
revoke all on public.fermetures_comptes from public, anon, authenticated, service_role;
grant select on public.fermetures_comptes to authenticated, service_role;
comment on table public.fermetures_comptes is
  'Fermetures de comptes (R15, 24/10/2026) : programmées par le super-administrateur, le titulaire ou la règle d''inactivité, exécutées par pg_cron « fermetures-comptes ». Écriture par fonctions seulement. Lecture : super-administrateur permanent (second facteur) et clé de service. Trace purgée trois ans après l''exécution ou l''annulation.';

create table if not exists public.effacements_a_reappliquer (
  fermeture_id uuid primary key references public.fermetures_comptes(id) on delete cascade,
  account_id_origine uuid not null,
  organisations_effacees uuid[] not null default '{}',
  artisan_id_origine uuid,
  executee_le timestamptz not null,
  reappliquee_le timestamptz,
  reapplications integer not null default 0,
  -- Les suites déjà faites (relecture du 24/10, I5) : une restauration ne les redemande pas.
  remboursement_cents bigint,
  remboursements_faits jsonb,
  rembourse_le timestamptz,
  courriel_envoye_le timestamptz
);
alter table public.effacements_a_reappliquer add column if not exists remboursement_cents bigint;
alter table public.effacements_a_reappliquer add column if not exists remboursements_faits jsonb;
alter table public.effacements_a_reappliquer add column if not exists rembourse_le timestamptz;
alter table public.effacements_a_reappliquer add column if not exists courriel_envoye_le timestamptz;
alter table public.effacements_a_reappliquer enable row level security;
drop policy if exists effacements_a_reappliquer_lecture_superviseur on public.effacements_a_reappliquer;
create policy effacements_a_reappliquer_lecture_superviseur on public.effacements_a_reappliquer
  for select to authenticated using ((select public.is_permanent_super_admin()));
revoke all on public.effacements_a_reappliquer from public, anon, authenticated, service_role;
grant select on public.effacements_a_reappliquer to authenticated, service_role;
comment on table public.effacements_a_reappliquer is
  'Effacements exécutés, à rejouer après toute restauration d''une sauvegarde (reappliquer_effacements), avec les suites déjà faites (remboursement, courriel). Identifiants et dates seulement, aucune donnée personnelle.';
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

-- Les clients Stripe supprimés au terme de leurs factures (six ans après la plus récente) : la suppression se fait chez
-- Stripe par l'application (mission « purge »), puis s'inscrit ici. L'archive elle-même ne se réécrit pas.
create table if not exists public.clients_stripe_supprimes (
  stripe_customer_id text primary key check (length(stripe_customer_id) between 1 and 255),
  supprime_le timestamptz not null default now()
);
alter table public.clients_stripe_supprimes enable row level security;
drop policy if exists clients_stripe_supprimes_lecture_superviseur on public.clients_stripe_supprimes;
create policy clients_stripe_supprimes_lecture_superviseur on public.clients_stripe_supprimes
  for select to authenticated using ((select public.is_permanent_super_admin()));
revoke all on public.clients_stripe_supprimes from public, anon, authenticated, service_role;
grant select on public.clients_stripe_supprimes to authenticated, service_role;
comment on table public.clients_stripe_supprimes is
  'Clients Stripe supprimés au terme de la conservation des factures (six ans, LPF L. 102 B ; éditeur non commerçant, décision du 23/10/2026). Relecture du 24/10.';

-- ── 3. Outils internes ────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.empreinte_adresse(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(pg_catalog.sha256(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8')), 'hex') $$;
revoke all on function public.empreinte_adresse(text) from public, anon, authenticated, service_role;

-- Les organisations que la fermeture de ce compte efface : celles dont il est titulaire (admin_agence ou
-- proprietaire_direct) et le SEUL gérant actif (admin_agence, agent ou proprietaire_direct). Un agent ne fait jamais
-- effacer une agence ; un locataire, un garant, un mandant ou un artisan n'efface que son accès.
-- p_avec_inactifs (fermeture pour inactivité, relecture du 24/10) : un autre gérant dont la fermeture pour inactivité
-- est elle aussi due (programmée, échue, non gelée) compte comme absent. Sans cela, titulaire et agent inactifs du même
-- espace partaient chacun sans lui, et l'espace restait orphelin avec les données des locataires.
create or replace function public.organisations_effacees_par(p_account uuid, p_avec_inactifs boolean)
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
     and not exists (
       select 1 from public.memberships x
        where x.organization_id = m.organization_id and x.account_id <> p_account
          and x.status = 'active' and x.role in ('admin_agence', 'agent', 'proprietaire_direct')
          and not (coalesce(p_avec_inactifs, false) and exists (
            select 1 from public.fermetures_comptes f
             where f.account_id = x.account_id and f.statut = 'programmee' and f.origine = 'inactivite'
               and f.gel_motif is null and f.effacement_prevu_le <= (now() at time zone 'Europe/Paris')::date)));
$$;
revoke all on function public.organisations_effacees_par(uuid, boolean) from public, anon, authenticated, service_role;

create or replace function public.organisations_du_seul_titulaire(p_account uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$ select public.organisations_effacees_par(p_account, false); $$;
revoke all on function public.organisations_du_seul_titulaire(uuid) from public, anon, authenticated, service_role;

-- Les souscriptions Stripe des organisations effacées par la fermeture (relecture du 24/10, I2 : TOUTES, pas une
-- seule). Les champs de premier niveau décrivent la souscription principale (la vivante d'abord, puis la payée en
-- cours, puis la plus tardive), sauf `vivante`, vrai si L'UNE d'elles vit encore (garde de l'exécution), et
-- `souscriptions_vivantes`, leur nombre (plus d'une : la programmation est refusée, chacune se résilie d'abord).
drop function if exists public.abonnement_de_fermeture(uuid);
create or replace function public.abonnement_de_fermeture(p_account uuid, p_avec_inactifs boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with abos as (
    select a.*,
           (a.stripe_subscription_id is not null and coalesce(a.stripe_statut, '') not in ('canceled', 'incomplete_expired')) as vit,
           (a.stripe_subscription_id is not null and a.premiere_facture_payee and a.stripe_statut = 'active'
              and a.periode_fin > now()) as payee
      from public.abonnements a
     where a.organization_id in (select public.organisations_effacees_par(p_account, p_avec_inactifs))
  )
  select coalesce((
    select jsonb_build_object(
      'organisation', p.organization_id,
      'stripe_subscription_id', p.stripe_subscription_id,
      'stripe_customer_id', p.stripe_customer_id,
      'stripe_statut', p.stripe_statut,
      'annulation_demandee', p.annulation_demandee,
      'periode_debut', p.periode_debut,
      'periode_fin', p.periode_fin,
      'montant_periode_cents', p.montant_periode_cents,
      'vivante', (select bool_or(vit) from abos),
      'payee_en_cours', p.payee,
      'souscriptions_vivantes', (select count(*) filter (where vit) from abos),
      'abonnements', (select jsonb_agg(jsonb_build_object('organisation', x.organization_id,
                                                          'stripe_subscription_id', x.stripe_subscription_id,
                                                          'stripe_statut', x.stripe_statut, 'vivante', x.vit,
                                                          'payee_en_cours', x.payee, 'periode_fin', x.periode_fin)
                                       order by x.organization_id) from abos x))
      from abos p
     order by p.vit desc, p.payee desc, p.periode_fin desc nulls last
     limit 1), '{}'::jsonb);
$$;
revoke all on function public.abonnement_de_fermeture(uuid, boolean) from public, anon, authenticated, service_role;

-- Relecture du 24/10 (R2-10) : les espaces dont le compte est le DERNIER titulaire actif sans en être le seul gérant
-- (un agent reste), et dont la souscription vit encore. Sa fermeture n'effacerait que son adhésion : la souscription
-- continuerait d'être facturée sur le moyen de paiement qu'il a laissé. La fermeture est refusée tant que la
-- titularité n'est pas transmise ou la souscription résiliée.
create or replace function public.souscriptions_laissees(p_account uuid, p_avec_inactifs boolean default false)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct m.organization_id), '{}')
    from public.memberships m
    join public.abonnements a on a.organization_id = m.organization_id
   where m.account_id = p_account and m.status = 'active' and m.organization_id is not null
     and m.role in ('admin_agence', 'proprietaire_direct')
     and a.stripe_subscription_id is not null and coalesce(a.stripe_statut, '') not in ('canceled', 'incomplete_expired')
     and m.organization_id not in (select public.organisations_effacees_par(p_account, p_avec_inactifs))
     and not exists (select 1 from public.memberships x
                      where x.organization_id = m.organization_id and x.account_id <> p_account and x.status = 'active'
                        and x.role in ('admin_agence', 'proprietaire_direct'));
$$;
revoke all on function public.souscriptions_laissees(uuid, boolean) from public, anon, authenticated, service_role;

-- La dernière activité d'un compte, pour la règle d'inactivité : sa propre dernière connexion (ou sa création) et, pour
-- les organisations qu'il gère, la dernière connexion de TOUT MEMBRE actif (relecture du 24/10, M4 : le plan dit « sans
-- connexion d'un membre » ; un espace dont les locataires se servent encore n'est pas inactif), la fin du dernier
-- abonnement payé et la création de l'organisation. Un abonnement vivant ou un essai en cours suspend la règle.
-- `nature` : organisation, artisan (fiche d'artisan à son compte) ou personnel ; `titulaire` : le compte est titulaire
-- d'au moins une de ces organisations (l'archive complète lui est réservée).
drop function if exists public.activite_compte(uuid);
create or replace function public.activite_compte(p_account uuid)
returns table (derniere_activite_le timestamptz, abonnement_en_cours boolean, nature text, organisation text, titulaire boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with orgs as (
    select distinct m.organization_id from public.memberships m
     where m.account_id = p_account and m.status = 'active' and m.organization_id is not null
       and m.role in ('admin_agence', 'agent', 'proprietaire_direct')
  ), membres as (
    select m.account_id from public.memberships m
     where m.organization_id in (select organization_id from orgs) and m.status = 'active' and m.account_id is not null
  )
  -- À la seconde : la valeur fait le tour par l'application (avertissements) et doit se comparer à l'identique.
  select date_trunc('second', greatest(
           (select max(greatest(u.last_sign_in_at, u.created_at)) from auth.users u
             where u.id = p_account or u.id in (select account_id from membres)),
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
         case when exists (select 1 from orgs) then 'organisation'
              when exists (select 1 from public.artisans x where x.account_id = p_account) then 'artisan'
              else 'personnel' end,
         (select string_agg(o.name, ', ' order by o.name) from public.organizations o
           where o.id in (select organization_id from orgs)),
         exists (select 1 from public.memberships m
                  where m.account_id = p_account and m.status = 'active' and m.organization_id is not null
                    and m.role in ('admin_agence', 'proprietaire_direct'));
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

-- Relecture du 24/10 (B2, I9) : les lignes d'une table qu'une session de ce compte LIRAIT, telles que la base les lui
-- rendrait — droit SELECT du rôle authenticated sur la table, colonnes qui lui sont accordées, et politiques de lecture
-- (RLS) rejouées : permissives réunies, restrictives cumulées, évaluées avec le jeton du compte (aal1, rien de plus).
-- Une archive ne contient ainsi rien que son demandeur ne puisse déjà lire : ni le registre privé d'un artisan, ni la
-- question d'un locataire au support, ni le mémo d'une invitation ou le motif d'une liste noire. p_filtre porte la
-- condition de périmètre (organisation, fiche d'artisan), avec $1 = p_valeur et `$T` pour le nom de la table (les
-- politiques citent souvent la table par son nom : elle n'est donc pas renommée dans la requête). Le jeton de la
-- session appelante est remis à l'identique avant de rendre la main, même en cas d'erreur.
create or replace function public.lignes_lisibles_par(p_table regclass, p_filtre text, p_valeur uuid, p_compte uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_role text := current_setting('request.jwt.claim.role', true);
  v_cols text;
  v_permissives text;
  v_restrictives text;
  v_rls boolean;
  v_nom text;
  v_res jsonb;
begin
  if p_table is null or p_compte is null or p_filtre is null then return '[]'::jsonb; end if;
  if not pg_catalog.has_table_privilege('authenticated', p_table, 'SELECT') then return '[]'::jsonb; end if;
  select pg_catalog.quote_ident(c.relname) into v_nom from pg_catalog.pg_class c where c.oid = p_table;
  select string_agg(format('%s.%I', v_nom, a.attname), ', ' order by a.attnum) into v_cols
    from pg_catalog.pg_attribute a
   where a.attrelid = p_table and a.attnum > 0 and not a.attisdropped
     and pg_catalog.has_column_privilege('authenticated', p_table, a.attnum, 'SELECT');
  if v_cols is null then return '[]'::jsonb; end if;
  select c.relrowsecurity into v_rls from pg_catalog.pg_class c where c.oid = p_table;
  if v_rls then
    select string_agg('(' || coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), 'true') || ')', ' or ')
             filter (where p.polpermissive),
           string_agg('(' || coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), 'true') || ')', ' and ')
             filter (where not p.polpermissive)
      into v_permissives, v_restrictives
      from pg_catalog.pg_policy p
     where p.polrelid = p_table and p.polcmd in ('r', '*')
       and (0::oid = any(p.polroles) or 'authenticated'::regrole::oid = any(p.polroles));
    if v_permissives is null then return '[]'::jsonb; end if;
  end if;
  perform pg_catalog.set_config('request.jwt.claims',
    jsonb_build_object('sub', p_compte, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  if v_sub is not null then perform pg_catalog.set_config('request.jwt.claim.sub', p_compte::text, true); end if;
  if v_role is not null then perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true); end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), ''[]''::jsonb) from (select %s from %s where (%s) and (%s) and (%s)) x',
                 v_cols, p_table, replace(p_filtre, '$T', v_nom), coalesce(v_permissives, 'true'), coalesce(v_restrictives, 'true'))
    into v_res using p_valeur;
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  if v_sub is not null then perform pg_catalog.set_config('request.jwt.claim.sub', v_sub, true); end if;
  if v_role is not null then perform pg_catalog.set_config('request.jwt.claim.role', v_role, true); end if;
  return v_res;
exception when others then
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  if v_sub is not null then perform pg_catalog.set_config('request.jwt.claim.sub', v_sub, true); end if;
  if v_role is not null then perform pg_catalog.set_config('request.jwt.claim.role', v_role, true); end if;
  raise;
end $$;
revoke all on function public.lignes_lisibles_par(regclass, text, uuid, uuid) from public, anon, authenticated, service_role;

-- ── 4. Simulation ─────────────────────────────────────────────────────────────────────────────────────────────────

-- Le bilan sans rien effacer. p_fermeture : la fermeture dont le bilan est enregistré (programmation, exécution) ; pour
-- une fermeture pour inactivité, les autres gérants dont la fermeture pour inactivité est due comptent comme absents.
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
  v_artisan uuid;
  v_bilan jsonb;
  v_archive jsonb := '[]'::jsonb;
  v_refs jsonb;
  v_inactif boolean := false;
begin
  if (select auth.role()) is not null and (select auth.role()) <> 'service_role'
     and not public.is_permanent_super_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if not exists (select 1 from public.accounts where id = p_account) then
    raise exception 'Compte inconnu' using errcode = 'P0002';
  end if;
  if p_fermeture is not null then
    select f.origine = 'inactivite' into v_inactif from public.fermetures_comptes f where f.id = p_fermeture;
    v_inactif := coalesce(v_inactif, false);
  end if;
  select coalesce(array_agg(o), '{}') into v_orgs from public.organisations_effacees_par(p_account, v_inactif) o;
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
      'demandes_zoho', (select count(*) from public.bail_signature_circuits c where c.organization_id = v_org and c.external_request_id is not null),
      -- Ce qui reste aux autres comptes, détaché de l'espace (relecture du 24/10, B1 et I8).
      'demandes_tiers_detachees', (select count(*) from public.retours_utilisateurs r where r.organization_id = v_org and r.auteur_id <> p_account),
      'reglements_artisans_detaches', (select count(*) from public.artisan_reglements g
                                         join public.intervention_factures f on f.id = g.facture_gerimmo_id
                                        where f.organization_id = v_org),
      'parrainages_detaches', (select count(*) from public.parrainages p
                                where p.parrain_organization_id = v_org or p.filleul_organization_id = v_org)));
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
    'abonnement', public.abonnement_de_fermeture(p_account, v_inactif),
    'souscriptions_laissees', to_jsonb(public.souscriptions_laissees(p_account, v_inactif)),
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
--    annulation Stripe et remboursement au prorata, au choix du titulaire (p_choix obligatoire). J+14 est refusé quand
--    la période payée se termine avant (relecture du 24/10, I7 : Stripe renouvellerait la période, facturée entière) ;
--  · sinon : J+14 ;
--  · inactivité : la date annoncée par les avertissements (p_effacement_prevu_le), jamais avant celle du rappel J-15, et
--    seulement si les deux avertissements du même cycle sont consignés (relecture du 24/10, M5).
-- Relectures du 24/10 : une demande « Fermer mon compte » ou « effacement » du compte (support privé, hors espace) est
-- exigée de la clé de service comme du superviseur (M6) ; refus si plusieurs souscriptions des espaces effacés vivent
-- encore (I2), ou si le compte laisse une souscription en cours à des gestionnaires restants (R2-10).
-- Les gestes Stripe (fin de période, date d'annulation, montant du remboursement) sont faits par l'application AVANT
-- cet appel ; p_remboursement ({"montant_cents": n, "factures": [{"facture": "in_…", "montant_cents": n}…]}, ou la forme
-- d'une seule facture {"facture": "in_…", "montant_cents": n}) et p_stripe_avant (l'état de la souscription avant la
-- fermeture) ne sont acceptés que de la clé de service ou du propriétaire des fonctions.
drop function if exists public.programmer_fermeture_compte(uuid, text, text, uuid, uuid, jsonb, date, timestamptz);
create or replace function public.programmer_fermeture_compte(
  p_account uuid,
  p_origine text,
  p_choix text default null,
  p_demande_id uuid default null,
  p_par uuid default null,
  p_remboursement jsonb default null,
  p_effacement_prevu_le date default null,
  p_derniere_activite_le timestamptz default null,
  p_stripe_avant jsonb default null)
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
  v_repartition jsonb;
  v_total bigint;
  v_annonce date;
  v_laissees uuid[];
  v_act record;
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
  if (p_remboursement is not null or p_stripe_avant is not null) and not (v_interne or v_service) then
    raise exception 'Remboursement fourni hors du traitement' using errcode = '42501';
  end if;
  if p_stripe_avant is not null and jsonb_typeof(p_stripe_avant) <> 'object' then
    raise exception 'État Stripe invalide' using errcode = '22023';
  end if;
  select email into v_email from public.accounts where id = p_account and efface_le is null;
  if not found then raise exception 'Compte inconnu ou déjà effacé' using errcode = 'P0002'; end if;
  if exists (select 1 from public.memberships where account_id = p_account and role = 'super_admin') then
    raise exception 'Un compte de supervision ne se ferme pas par cette procédure' using errcode = '42501';
  end if;
  if exists (select 1 from public.fermetures_comptes where account_id = p_account and statut = 'programmee') then
    raise exception 'Une fermeture est déjà programmée pour ce compte' using errcode = '23505';
  end if;
  if p_origine <> 'inactivite' and p_demande_id is null and not v_interne then
    raise exception 'Demande de fermeture requise : « Fermer mon compte » ou « Demander l’effacement de mes données », déposée par le compte'
      using errcode = '22023';
  end if;
  if p_demande_id is not null then
    select (r.cree_le at time zone 'Europe/Paris')::date into v_demandee
      from public.retours_utilisateurs r
     where r.id = p_demande_id and r.auteur_id = p_account and r.nature = 'question' and r.organization_id is null
       and r.titre in ('Données personnelles — Fermer mon compte', 'Données personnelles — Demander l’effacement de mes données');
    if not found then raise exception 'Demande inconnue pour ce compte' using errcode = '22023'; end if;
  end if;

  v_abo := public.abonnement_de_fermeture(p_account);
  if coalesce((v_abo ->> 'souscriptions_vivantes')::integer, 0) > 1 then
    raise exception 'Les espaces effacés portent plusieurs souscriptions en cours : résiliez-les d''abord une à une' using errcode = '22023';
  end if;
  v_laissees := public.souscriptions_laissees(p_account);
  if cardinality(v_laissees) > 0 then
    raise exception 'Le compte est le dernier titulaire d''un espace qui garde d''autres gestionnaires et une souscription en cours : transmettre la titularité ou résilier la souscription d''abord (espace %)',
      array_to_string(v_laissees, ', ') using errcode = '22023';
  end if;
  if p_origine = 'inactivite' then
    if p_effacement_prevu_le is null or p_derniere_activite_le is null then
      raise exception 'Date annoncée et dernière activité requises' using errcode = '22023';
    end if;
    if coalesce((v_abo ->> 'vivante')::boolean, false) then
      raise exception 'Abonnement en cours : pas de fermeture pour inactivité' using errcode = '22023';
    end if;
    select j15.suppression_prevue_le into v_annonce
      from public.avertissements_inactivite j60
      join public.avertissements_inactivite j15
        on j15.account_id = j60.account_id and j15.etape = 'j15' and j15.derniere_activite_le = j60.derniere_activite_le
     where j60.account_id = p_account and j60.etape = 'j60' and j60.derniere_activite_le = p_derniere_activite_le;
    if not found then
      raise exception 'Les deux avertissements (J-60 et J-15) de ce cycle d''inactivité ne sont pas consignés' using errcode = '22023';
    end if;
    if p_effacement_prevu_le < v_annonce then
      raise exception 'Avant la date annoncée au compte (%) : pas de fermeture', v_annonce using errcode = '22023';
    end if;
    select * into v_act from public.activite_compte(p_account);
    if v_act.derniere_activite_le is distinct from p_derniere_activite_le or v_act.abonnement_en_cours then
      raise exception 'Le compte a servi depuis les avertissements : pas de fermeture' using errcode = '22023';
    end if;
    v_choix := null;
    v_effet := p_effacement_prevu_le;
  elsif coalesce((v_abo ->> 'payee_en_cours')::boolean, false) then
    if p_choix is null or p_choix not in ('fin_periode', 'j14_prorata') then
      raise exception 'Abonnement payé en cours : choisir la fin de la période payée ou une fermeture à quatorze jours avec remboursement'
        using errcode = '22023';
    end if;
    if p_choix = 'j14_prorata'
       and ((v_abo ->> 'periode_fin')::timestamptz at time zone 'Europe/Paris')::date <= v_jour + 14 then
      raise exception 'La période payée se termine avant le quatorzième jour : choisir la fin de la période payée'
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
  if p_remboursement is not null then
    v_repartition := coalesce(p_remboursement -> 'factures',
                              case when p_remboursement ? 'facture'
                                   then jsonb_build_array(jsonb_build_object('facture', p_remboursement ->> 'facture',
                                                                             'montant_cents', (p_remboursement ->> 'montant_cents')::bigint))
                              end, '[]'::jsonb);
    if jsonb_typeof(v_repartition) <> 'array'
       or exists (select 1 from jsonb_array_elements(v_repartition) e
                   where coalesce(e ->> 'facture', '') !~ '^in_[A-Za-z0-9_]{1,200}$'
                      or coalesce(e ->> 'montant_cents', '') !~ '^[0-9]{1,12}$') then
      raise exception 'Répartition du remboursement invalide' using errcode = '22023';
    end if;
    v_total := coalesce(nullif(p_remboursement ->> 'montant_cents', '')::bigint,
                        (select sum((e ->> 'montant_cents')::bigint) from jsonb_array_elements(v_repartition) e));
    if v_total is distinct from (select coalesce(sum((e ->> 'montant_cents')::bigint), 0) from jsonb_array_elements(v_repartition) e) then
      raise exception 'Le total du remboursement ne correspond pas à sa répartition' using errcode = '22023';
    end if;
  end if;
  v_par := case when v_service or v_interne then p_par else (select auth.uid()) end;

  insert into public.fermetures_comptes (
    account_id, demande_id, origine, choix, programmee_par, demandee_le, effacement_prevu_le,
    empreinte_adresse, adresse_courriel, derniere_activite_le, abonnement, stripe_avant,
    remboursement_prevu_cents, stripe_facture_id, remboursement_repartition)
  values (
    p_account, p_demande_id, p_origine, v_choix, v_par, v_demandee, v_effet,
    public.empreinte_adresse(v_email), v_email, p_derniere_activite_le, v_abo, p_stripe_avant,
    v_total, v_repartition -> 0 ->> 'facture', v_repartition)
  returning id into v_id;

  v_bilan := public.simuler_fermeture_compte(p_account, v_id);
  insert into public.audit_log (account_id, organization_id, action, details)
  values (case when v_service or v_interne then null else (select auth.uid()) end, null, 'fermeture_programmee',
          jsonb_build_object('fermeture_id', v_id, 'compte', p_account, 'origine', p_origine, 'choix', v_choix,
                             'effacement_prevu_le', v_effet, 'role', coalesce(v_role, 'interne')));
  return jsonb_build_object('id', v_id, 'effacement_prevu_le', v_effet, 'choix', v_choix,
                            'abonnement', v_abo, 'bilan', v_bilan);
end $$;
revoke all on function public.programmer_fermeture_compte(uuid, text, text, uuid, uuid, jsonb, date, timestamptz, jsonb) from public, anon;
grant execute on function public.programmer_fermeture_compte(uuid, text, text, uuid, uuid, jsonb, date, timestamptz, jsonb) to authenticated, service_role;

-- Annule une fermeture encore programmée. Rend l'abonnement figé à la programmation et l'état de la souscription chez
-- Stripe d'avant la fermeture : l'application remet ce dernier à l'identique (une résiliation déjà demandée par le
-- client reste demandée, relecture du 24/10, R2-2).
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
  return jsonb_build_object('id', f.id, 'choix', f.choix, 'abonnement', f.abonnement, 'stripe_avant', f.stripe_avant,
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

-- La preuve du contrat payé, copiée dans archives_comptes avant toute suppression (une ligne par organisation payante
-- dont le compte est ou a été gérant ; celles qu'il a quittées sont archivées au retrait de l'adhésion).
create or replace function public.archiver_compte_ferme(p_account uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_n integer := 0;
begin
  for v_org in
    select distinct m.organization_id from public.memberships m
     where m.account_id = p_account and m.organization_id is not null
       and m.role in ('admin_agence', 'agent', 'proprietaire_direct')
  loop
    if public.archiver_preuve_compte(p_account, v_org) then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.archiver_compte_ferme(uuid) from public, anon, authenticated, service_role;

-- Efface une organisation entière : les boucles (a)(b)(c) du nettoyage du 21/10 (20261021175930), limitées à cette
-- organisation. Fichiers du compartiment `documents` sous son dossier mis en file (`purge_fichiers`, supprimés la nuit
-- par la mission « purge ») ; journaux d'audit gardés, détachés de l'organisation effacée ; journal des réceptions Stripe
-- gardé (clé « on delete set null ») ; registres internes du support gardés (schéma support_interne, hors boucle).
-- Relectures du 24/10 — ce qui appartient à un AUTRE compte n'est jamais supprimé avec l'espace (B1, I8) :
--  · la demande au support d'un autre membre (locataire, agent…) est détachée de l'espace, avec son historique et ses
--    soutiens ; seules celles de p_account (le compte qui ferme) partent ;
--  · le règlement qu'un artisan a déclaré dans son registre privé sur une facture de l'espace est détaché de la facture,
--    dont la référence est gardée (`facture_gerimmo_effacee`) ;
--  · un parrainage est détaché de l'espace effacé ; l'avantage de l'autre client reste ; un parrainage dont les deux
--    espaces sont effacés part avec ses avantages ;
--  · la preuve du contrat payé de chaque gérant de l'espace est archivée avant que les adhésions ne partent ;
--  · les PDF des préparations de devis (compartiment `devis-preparations`) sont rendus pour retrait par l'application.
-- Les préparations de devis elles-mêmes suivent la sollicitation à laquelle elles répondent (clé primaire en cascade,
-- 20261012090000).
drop function if exists public.effacer_organisation_fermeture(uuid);
create or replace function public.effacer_organisation_fermeture(p_org uuid, p_account uuid default null)
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
  v_detaches jsonb;
  v_m bigint;
  r record;
begin
  insert into public.purge_fichiers (storage_path)
  select o.name from storage.objects o
   where o.bucket_id = 'documents' and o.name like p_org::text || '/%'
     and not exists (select 1 from public.purge_fichiers p where p.storage_path = o.name and p.deleted_at is null);
  get diagnostics v_fichiers = row_count;
  select coalesce(jsonb_agg(distinct c.external_request_id), '[]'::jsonb) into v_zoho
    from public.bail_signature_circuits c where c.organization_id = p_org and c.external_request_id is not null;
  -- Fichiers hors du compartiment `documents` : retirés par l'application (lib/comptes-fermeture-serveur.ts).
  select coalesce(jsonb_agg(jsonb_build_object('compartiment', 'exports-complets', 'chemin', x.chemin)), '[]'::jsonb)
    into v_hors from public.exports_complets x
   where x.organisation_id_export = p_org and x.chemin is not null and x.supprime_le is null;
  select v_hors || coalesce(jsonb_agg(jsonb_build_object('compartiment', 'devis-preparations', 'chemin', p.pdf_path)), '[]'::jsonb)
    into v_hors
    from public.artisan_devis_preparations p
    join public.incident_sollicitations s on s.id = p.sollicitation_id
   where s.organization_id = p_org and p.pdf_bucket = 'devis-preparations' and p.pdf_path is not null;

  -- La preuve de chaque gérant (titulaire parti compris), tant que l'abonnement de l'espace se lit encore.
  perform public.archiver_preuve_compte(m.account_id, p_org)
     from public.memberships m
    where m.organization_id = p_org and m.account_id is not null
      and m.role in ('admin_agence', 'agent', 'proprietaire_direct');

  update public.audit_log set organization_id = null,
         details = details || jsonb_build_object('organisation_effacee', p_org)
   where organization_id = p_org;

  -- Les demandes au support : celles du compte qui ferme partent (avec leur historique, par la boucle (c)) ; celles des
  -- autres membres restent à leur auteur, détachées de l'espace, avec leur historique et leurs soutiens.
  delete from public.retours_soutiens s
   where s.retour_id in (select r2.id from public.retours_utilisateurs r2
                          where r2.organization_id = p_org and r2.auteur_id is not distinct from p_account);
  update public.retours_utilisateurs set groupe_id = null
   where groupe_id in (select r2.id from public.retours_utilisateurs r2
                        where r2.organization_id = p_org and r2.auteur_id is not distinct from p_account);
  update public.retours_utilisateurs set organization_id = null
   where organization_id = p_org and auteur_id is distinct from p_account;
  get diagnostics v_n = row_count;
  v_detaches := jsonb_build_object('demandes_support', v_n);
  update public.retours_soutiens set organization_id = null
   where organization_id = p_org and account_id is distinct from p_account
     and retour_id not in (select r2.id from public.retours_utilisateurs r2 where r2.organization_id = p_org);

  -- Le registre privé des artisans : la facture de l'espace disparaît, le règlement déclaré reste, détaché.
  update public.artisan_reglements g
     set facture_gerimmo_id = null,
         facture_gerimmo_effacee = jsonb_build_object('numero', f.numero, 'montant_ttc_cents', f.montant_ttc_cents,
                                                      'deposee_le', f.deposee_le, 'espace_efface_le', now())
    from public.intervention_factures f
   where f.id = g.facture_gerimmo_id and f.organization_id = p_org;
  get diagnostics v_n = row_count;
  v_detaches := v_detaches || jsonb_build_object('reglements_artisans', v_n);

  -- Les parrainages : l'avantage de l'espace effacé part ; l'autre client garde le sien et son parrainage, détaché.
  delete from public.avantages_parrainage where beneficiaire_organization_id = p_org;
  delete from public.avantages_parrainage a
   using public.parrainages p
   where a.parrainage_id = p.id
     and ((p.parrain_organization_id = p_org and p.filleul_organization_id is null)
          or (p.filleul_organization_id = p_org and p.parrain_organization_id is null));
  delete from public.parrainages
   where (parrain_organization_id = p_org and filleul_organization_id is null)
      or (filleul_organization_id = p_org and parrain_organization_id is null);
  update public.parrainages set parrain_organization_id = null where parrain_organization_id = p_org;
  get diagnostics v_n = row_count;
  update public.parrainages set filleul_organization_id = null where filleul_organization_id = p_org;
  get diagnostics v_m = row_count;
  v_detaches := v_detaches || jsonb_build_object('parrainages', v_n + v_m);

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

    -- (b) Clés vers organizations sous un autre nom de colonne (fiche prospect liée, fiches d'artisan privées de
    --     l'organisation ; les parrainages sont détachés plus haut et ne correspondent plus).
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
                            'demandes_zoho', v_zoho, 'fichiers_hors_documents', v_hors, 'passes', v_passe,
                            'detaches', v_detaches);
end $$;
revoke all on function public.effacer_organisation_fermeture(uuid, uuid) from public, anon, authenticated, service_role;

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
  v_detaches jsonb := '[]'::jsonb;
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
  v_journal bigint := null;
  v_origine text;
  v_message text;
  r record;
begin
  select email into v_email from public.accounts where id = p_account;
  if not found then
    return jsonb_build_object('mode', 'suppression', 'deja_absent', true);
  end if;
  select f.origine into v_origine from public.fermetures_comptes f where f.id = p_fermeture;
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

  -- 3. Les organisations dont il est le seul gérant (pour une fermeture pour inactivité, les autres gérants dont la
  --    fermeture pour inactivité est due comptent comme absents : l'espace ne reste jamais orphelin).
  select coalesce(array_agg(o), '{}') into v_orgs
    from public.organisations_effacees_par(p_account, coalesce(v_origine, '') = 'inactivite') o;
  foreach v_org in array v_orgs loop
    v_noms := v_noms || to_jsonb((select name from public.organizations where id = v_org));
    v_res := public.effacer_organisation_fermeture(v_org, p_account);
    v_effacees := v_effacees || jsonb_build_array(v_org);
    v_hors := v_hors || coalesce(v_res -> 'fichiers_hors_documents', '[]'::jsonb);
    v_zoho := v_zoho || coalesce(v_res -> 'demandes_zoho', '[]'::jsonb);
    v_detaches := v_detaches || jsonb_build_array(coalesce(v_res -> 'detaches', '{}'::jsonb));
    v_fichiers := v_fichiers + coalesce((v_res ->> 'fichiers_en_file')::bigint, 0);
  end loop;

  -- 4. Ailleurs, ses seules adhésions (la preuve d'un espace payant est archivée au retrait, déclencheur des adhésions).
  delete from public.memberships where account_id = p_account and organization_id is not null;
  get diagnostics v_adhesions = row_count;

  -- 5. Les dossiers des autres propriétaires : le lien au compte est retiré, la fiche reste au propriétaire, prévenu. Le
  --    message dit la vraie cause : une demande de la personne, ou deux ans sans connexion (relecture du 24/10, R2-4).
  v_message := case when coalesce(v_origine, '') = 'inactivite'
    then 'Le compte Gerimmo de cette personne a été supprimé après deux ans sans connexion, malgré deux avertissements : elle n''a plus accès à son espace. Sa fiche et les documents de votre dossier restent sous votre responsabilité.'
    else 'La personne a demandé la fermeture de son compte Gerimmo : elle n''a plus accès à son espace. Sa fiche et les documents de votre dossier restent sous votre responsabilité ; si elle vous demande l''effacement de ses données dans votre dossier, c''est à vous d''y répondre.' end;
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
            jsonb_build_object('personnes', to_jsonb(r.personnes), 'fermeture_id', p_fermeture, 'message', v_message),
            true);
    v_alertes := v_alertes + 1;
  end loop;

  -- 6. Sa fiche d'artisan : registres privés, zones, métiers, pièces, préparations de devis. La fiche part seulement si
  --    rien d'un propriétaire ne la cite : ni carnet d'un espace (avec sa liste noire), ni invitation, ni agence qui l'a
  --    créée, ni dossier (devis, intervention, facture). Sinon elle reste, détachée du compte et retirée du réseau
  --    (relecture du 24/10, I1 : la suppression emportait en cascade les carnets des autres propriétaires).
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
    select v_hors || coalesce(jsonb_agg(jsonb_build_object('compartiment', 'devis-preparations', 'chemin', p.pdf_path)), '[]'::jsonb)
      into v_hors from public.artisan_devis_preparations p
     where p.artisan_id = v_artisan and p.pdf_bucket = 'devis-preparations' and p.pdf_path is not null;
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
    if exists (select 1 from public.artisan_agences x where x.artisan_id = v_artisan)
       or exists (select 1 from public.invitations_artisans x where x.artisan_id = v_artisan)
       or exists (select 1 from public.artisans x where x.id = v_artisan and x.cree_par_organization_id is not null) then
      update public.artisans set account_id = null, visibilite = 'privee', email = null where id = v_artisan;
      v_artisan_sort := 'detachee';
    else
      begin
        delete from public.artisans where id = v_artisan;
        v_artisan_sort := 'supprimee';
      exception when foreign_key_violation then
        update public.artisans set account_id = null, visibilite = 'privee', email = null where id = v_artisan;
        v_artisan_sort := 'detachee';
      end;
    end if;
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

  -- 8. Contrôle : plus aucun compte ne porte l'adresse d'origine. Le journal de connexion de GoTrue
  --    (auth.audit_log_entries, adresse et IP) est un journal de sécurité, purgé à sa propre durée (lot 2, R64) : ses
  --    entrées qui portent encore l'adresse sont relevées dans le bilan (relecture du 24/10, M3), sans bloquer.
  select (select count(*) from auth.users where lower(email) = lower(v_email))
       + (select count(*) from public.accounts where lower(email) = lower(v_email))
    into v_controle;
  if v_controle <> 0 then
    raise exception 'Contrôle de l''adresse d''origine : % compte(s) la portent encore', v_controle using errcode = 'P0001';
  end if;
  if to_regclass('auth.audit_log_entries') is not null then
    execute 'select count(*) from auth.audit_log_entries where lower(payload ->> ''actor_username'') = lower($1) or payload ->> ''actor_id'' = $2'
      into v_journal using v_email, p_account::text;
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
    'detaches', v_detaches,
    'controle_adresse', v_controle,
    'controle_journal_connexions', v_journal);
end $$;
revoke all on function public.effacer_compte_ferme(uuid, uuid) from public, anon, authenticated, service_role;

-- ── 7. Exécution ──────────────────────────────────────────────────────────────────────────────────────────────────

-- Exécute UNE fermeture programmée, toutes gardes vérifiées. Réservée au propriétaire des fonctions (pg_cron) : aucun
-- rôle de l'API ne peut l'appeler. Rend un état ; ne lève que si l'effacement lui-même échoue (l'appelant l'isole).
-- Relectures du 24/10 :
--  · la souscription de CHAQUE espace effacé est regardée (I2), et une souscription laissée à des gestionnaires
--    restants refuse aussi (R2-10) ;
--  · le bilan est refait : pour une demande, un périmètre plus large que celui du bilan enregistré (espace effacé ou
--    fiche d'artisan qui n'y figuraient pas) refuse l'exécution, état « bilan_change », jusqu'à ce que la supervision
--    relise et enregistre le nouveau bilan (I3) ; pour l'inactivité, annoncée par les avertissements, il est enregistré ;
--  · l'adresse du courriel de fin est relue sur le compte au moment de l'exécution (M2).
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
  v_inactif boolean;
  v_abo jsonb;
  v_act record;
  v_bilan jsonb;
  v_frais jsonb;
  v_hors_bilan jsonb;
  v_artisan uuid;
  v_email text;
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
  v_inactif := f.origine = 'inactivite';
  v_abo := public.abonnement_de_fermeture(f.account_id, v_inactif);
  if coalesce((v_abo ->> 'vivante')::boolean, false) then return jsonb_build_object('etat', 'souscription_active'); end if;
  if cardinality(public.souscriptions_laissees(f.account_id, v_inactif)) > 0 then
    return jsonb_build_object('etat', 'souscription_laissee');
  end if;
  if exists (select 1 from public.bail_signature_circuits c
              where c.organization_id in (select public.organisations_effacees_par(f.account_id, v_inactif))
                and c.etat in ('preparation', 'en_cours', 'a_verifier')) then
    return jsonb_build_object('etat', 'signature_en_cours');
  end if;
  if v_inactif then
    select * into v_act from public.activite_compte(f.account_id);
    if v_act.derniere_activite_le is distinct from f.derniere_activite_le or v_act.abonnement_en_cours then
      update public.fermetures_comptes
         set statut = 'annulee', annulee_le = now(), adresse_courriel = null,
             annulation_motif = 'Le compte a servi depuis les avertissements (connexion ou abonnement) : suppression annulée.'
       where id = f.id;
      return jsonb_build_object('etat', 'annulee_activite');
    end if;
    perform public.simuler_fermeture_compte(f.account_id, f.id);
  else
    v_frais := public.simuler_fermeture_compte(f.account_id, null);
    select coalesce(jsonb_agg(o -> 'organisation'), '[]'::jsonb) into v_hors_bilan
      from jsonb_array_elements(v_frais -> 'organisations_effacees') o
     where not exists (select 1 from jsonb_array_elements(f.bilan_simulation -> 'organisations_effacees') e
                        where e ->> 'organisation' = o ->> 'organisation');
    if jsonb_array_length(v_hors_bilan) > 0
       or (v_frais ->> 'artisan' is not null and f.bilan_simulation ->> 'artisan' is distinct from v_frais ->> 'artisan') then
      update public.fermetures_comptes
         set derniere_erreur = left('Bilan changé depuis la programmation : '
               || case when jsonb_array_length(v_hors_bilan) = 1 then 'un espace serait désormais effacé entièrement'
                       when jsonb_array_length(v_hors_bilan) > 1
                       then jsonb_array_length(v_hors_bilan) || ' espaces seraient désormais effacés entièrement'
                       else 'une fiche d''artisan est désormais concernée' end
               || '. Relisez le bilan (« Enregistrer le nouveau bilan ») ou annulez la fermeture.', 2000),
             derniere_tentative_le = now()
       where id = f.id;
      return jsonb_build_object('etat', 'bilan_change');
    end if;
  end if;

  select email into v_email from public.accounts where id = f.account_id and efface_le is null;
  if v_email is not null and f.adresse_courriel is distinct from v_email then
    update public.fermetures_comptes set adresse_courriel = v_email where id = f.id;
  end if;
  select id into v_artisan from public.artisans where account_id = f.account_id;
  v_bilan := public.effacer_compte_ferme(f.account_id, f.id);
  update public.fermetures_comptes
     set statut = 'executee', executee_le = now(), mode_effacement = v_bilan ->> 'mode', bilan_execution = v_bilan,
         tentatives = tentatives + 1, derniere_tentative_le = now(), derniere_erreur = null
   where id = f.id;
  insert into public.effacements_a_reappliquer (fermeture_id, account_id_origine, organisations_effacees,
                                                artisan_id_origine, executee_le, remboursement_cents, remboursements_faits,
                                                rembourse_le)
  select f.id, f.account_id,
         coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(v_bilan -> 'organisations_effacees') x), '{}'),
         v_artisan, now(), z.remboursement_cents, z.remboursements_faits, z.rembourse_le
    from public.fermetures_comptes z where z.id = f.id
  on conflict (fermeture_id) do nothing;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (null, null, 'compte_ferme',
          jsonb_build_object('fermeture_id', f.id, 'compte', f.account_id, 'origine', f.origine,
                             'bilan', v_bilan - 'organisations_noms'));
  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);
  return jsonb_build_object('etat', 'executee', 'bilan', v_bilan);
end $$;
revoke all on function public.executer_fermeture_compte(uuid) from public, anon, authenticated, service_role;

-- Une fermeture exécutée dans sa propre sous-transaction : un échec n'annule qu'elle, consigné sur sa ligne.
create or replace function public.executer_fermeture_isolee(p_fermeture uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_msg text;
begin
  return public.executer_fermeture_compte(p_fermeture);
exception when others then
  get stacked diagnostics v_msg = message_text;
  update public.fermetures_comptes
     set tentatives = tentatives + 1, derniere_tentative_le = now(), derniere_erreur = left(v_msg, 2000)
   where id = p_fermeture;
  return jsonb_build_object('etat', 'echec', 'erreur', left(v_msg, 500));
end $$;
revoke all on function public.executer_fermeture_isolee(uuid) from public, anon, authenticated, service_role;

-- ── 8. Inactivité ─────────────────────────────────────────────────────────────────────────────────────────────────

-- Les avertissements à envoyer aujourd'hui (J-60, puis J-15). p_version_min : la version des conditions à partir de
-- laquelle la règle s'applique (VERSION_MIN_INACTIVITE de l'application) ; nulle, la règle est inactive.
-- Relectures du 24/10 : `nature` distingue l'artisan (R2-6), `titulaire` dit si l'archive complète lui est ouverte
-- (R2-10) ; un rappel J-15 envoyé en retard (tâche arrêtée) annonce une date à quinze jours au moins, jamais passée
-- (R2-11) : la date annoncée recule, elle n'avance jamais.
drop function if exists public.comptes_inactifs_a_prevenir(text, integer);
create or replace function public.comptes_inactifs_a_prevenir(p_version_min text, p_limite integer default 200)
returns table (account_id uuid, email text, etape text, nature text, organisation text, titulaire boolean,
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
    select a.id, a.email, act.derniere_activite_le as activite, act.nature, act.organisation, act.titulaire,
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
    select e.id, e.email, 'j60'::text, e.nature, e.organisation, e.titulaire, e.activite, greatest(e.base, v_jour + 60)
      from etat e where e.annonce is null and v_jour >= e.base - 60
    union all
    select e.id, e.email, 'j15'::text, e.nature, e.organisation, e.titulaire, e.activite, greatest(e.annonce, v_jour + 15)
      from etat e where e.annonce is not null and not e.j15_envoye and v_jour >= e.annonce - 15
  ) x
  order by 8, 1
  limit greatest(1, least(coalesce(p_limite, 200), 1000));
end $$;
revoke all on function public.comptes_inactifs_a_prevenir(text, integer) from public, anon, authenticated;
grant execute on function public.comptes_inactifs_a_prevenir(text, integer) to service_role;

-- Consigne un avertissement envoyé. Le rappel J-15 suit l'avertissement J-60 du même cycle et n'annonce jamais une date
-- plus proche que lui (il peut l'annoncer plus tard, s'il part en retard).
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
                                        and suppression_prevue_le <= p_suppression_le) then
    raise exception 'Le rappel J-15 suit l''avertissement J-60 du même cycle, et n''avance jamais sa date' using errcode = '22023';
  end if;
  insert into public.avertissements_inactivite (account_id, etape, derniere_activite_le, suppression_prevue_le)
  values (p_account, p_etape, p_derniere_activite_le, p_suppression_le)
  on conflict do nothing;
  return found;
end $$;
revoke all on function public.avertissement_inactivite_envoye(uuid, text, timestamptz, date) from public, anon, authenticated;
grant execute on function public.avertissement_inactivite_envoye(uuid, text, timestamptz, date) to service_role;

-- ── 9. Tâche quotidienne (pg_cron « fermetures-comptes ») ─────────────────────────────────────────────────────────

-- 1. Les comptes inactifs prévenus deux fois, dont la date annoncée par le rappel J-15 est atteinte : programmés.
create or replace function public.fermetures_comptes_programmer_inactifs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_programmees integer := 0;
  v_echecs integer := 0;
  v_act record;
  r record;
begin
  for r in
    select j60.account_id, j15.suppression_prevue_le, j60.derniere_activite_le
      from public.avertissements_inactivite j60
      join public.avertissements_inactivite j15
        on j15.account_id = j60.account_id and j15.etape = 'j15' and j15.derniere_activite_le = j60.derniere_activite_le
      join public.accounts a on a.id = j60.account_id and a.efface_le is null
     where j60.etape = 'j60' and j60.suppression_prevue_le <= v_jour and j15.suppression_prevue_le <= v_jour
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
  return jsonb_build_object('programmees', v_programmees, 'echecs', v_echecs);
end $$;
revoke all on function public.fermetures_comptes_programmer_inactifs() from public, anon, authenticated, service_role;

-- 3. Les comptes neutralisés que plus rien ne retient : suppression définitive. 4. Les traces de plus de trois ans :
-- purgées (relecture du 24/10, R2-5 ; même durée que les journaux de contrôle interne et les demandes de droits). Une
-- fermeture encore neutralisée reste, pour que la suppression définitive se fasse un jour.
create or replace function public.fermetures_comptes_menage()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supprimees integer := 0;
  v_purgees integer := 0;
  r record;
begin
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
  delete from public.fermetures_comptes f
   where (f.statut = 'executee' and f.mode_effacement = 'suppression' and f.executee_le < now() - interval '36 months')
      or (f.statut = 'annulee' and f.annulee_le < now() - interval '36 months');
  get diagnostics v_purgees = row_count;
  return jsonb_build_object('neutralises_supprimes', v_supprimees, 'traces_purgees', v_purgees);
end $$;
revoke all on function public.fermetures_comptes_menage() from public, anon, authenticated, service_role;

-- Une passe complète dans UNE transaction (appel direct, essais). La tâche planifiée passe par la procédure ci-dessous.
create or replace function public.fermetures_comptes_quotidiennes()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_prog jsonb;
  v_menage jsonb;
  v_executees integer := 0;
  v_attente integer := 0;
  v_echecs integer := 0;
  v_etat jsonb;
  v_bilan jsonb;
  r record;
begin
  if not public.tache_planifiee_autorisee('fermetures-comptes') then
    return jsonb_build_object('arret_en_cours', true);
  end if;
  v_prog := public.fermetures_comptes_programmer_inactifs();
  for r in
    select id from public.fermetures_comptes
     where statut = 'programmee' and effacement_prevu_le <= v_jour
     order by effacement_prevu_le, programmee_le
  loop
    v_etat := public.executer_fermeture_isolee(r.id);
    if v_etat ->> 'etat' = 'executee' then v_executees := v_executees + 1;
    elsif v_etat ->> 'etat' = 'echec' then v_echecs := v_echecs + 1;
    else v_attente := v_attente + 1; end if;
  end loop;
  v_menage := public.fermetures_comptes_menage();
  v_bilan := jsonb_build_object('programmees', (v_prog ->> 'programmees')::integer, 'executees', v_executees,
                                'en_attente', v_attente, 'echecs', v_echecs + (v_prog ->> 'echecs')::integer,
                                'neutralises_supprimes', (v_menage ->> 'neutralises_supprimes')::integer,
                                'traces_purgees', (v_menage ->> 'traces_purgees')::integer);
  insert into public.tech_log (account_id, evenement, details) values (null, 'fermetures_comptes', v_bilan);
  return v_bilan;
end $$;
revoke all on function public.fermetures_comptes_quotidiennes() from public, anon, authenticated, service_role;

-- La tâche de nuit (relecture du 24/10, M8) : la même passe, mais chaque fermeture est VALIDÉE à part. Les gardes
-- d'état suspendues pendant un effacement (`alter table … disable trigger`) posent un verrou de table tenu jusqu'à la
-- fin de la transaction : en une seule transaction, les écritures sur les états des lieux et les devis attendaient la
-- dernière fermeture de la nuit. Une procédure ne peut pas être SECURITY DEFINER ni porter de SET si elle valide : elle
-- n'appelle que des fonctions qualifiées (qui, elles, le sont), et n'est exécutable que par son propriétaire (pg_cron).
-- Appelée dans une transaction ouverte, elle échoue dès sa première validation (aucune validation à l'insu de l'appelant).
create or replace procedure public.fermetures_comptes_nuit()
language plpgsql
as $$
declare
  v_jour date := (pg_catalog.now() at time zone 'Europe/Paris')::date;
  v_prog jsonb;
  v_menage jsonb;
  v_ids uuid[];
  v_id uuid;
  v_etat jsonb;
  v_executees integer := 0;
  v_attente integer := 0;
  v_echecs integer := 0;
begin
  if not public.tache_planifiee_autorisee('fermetures-comptes') then
    insert into public.tech_log (account_id, evenement, details)
    values (null, 'fermetures_comptes', pg_catalog.jsonb_build_object('arret_en_cours', true));
    commit;
    return;
  end if;
  v_prog := public.fermetures_comptes_programmer_inactifs();
  commit;
  select coalesce(pg_catalog.array_agg(f.id order by f.effacement_prevu_le, f.programmee_le), '{}') into v_ids
    from public.fermetures_comptes f
   where f.statut = 'programmee' and f.effacement_prevu_le <= v_jour;
  foreach v_id in array v_ids loop
    v_etat := public.executer_fermeture_isolee(v_id);
    if v_etat ->> 'etat' = 'executee' then v_executees := v_executees + 1;
    elsif v_etat ->> 'etat' = 'echec' then v_echecs := v_echecs + 1;
    else v_attente := v_attente + 1; end if;
    commit;
  end loop;
  v_menage := public.fermetures_comptes_menage();
  insert into public.tech_log (account_id, evenement, details)
  values (null, 'fermetures_comptes', pg_catalog.jsonb_build_object(
    'programmees', (v_prog ->> 'programmees')::integer, 'executees', v_executees, 'en_attente', v_attente,
    'echecs', v_echecs + (v_prog ->> 'echecs')::integer,
    'neutralises_supprimes', (v_menage ->> 'neutralises_supprimes')::integer,
    'traces_purgees', (v_menage ->> 'traces_purgees')::integer, 'procedure', true));
  commit;
end $$;
revoke all on procedure public.fermetures_comptes_nuit() from public, anon, authenticated, service_role;

-- Après une restauration : rejouer chaque effacement dont le compte ou l'organisation existe de nouveau. p_registre
-- (facultatif) : les lignes de `effacements_a_reappliquer` relevées AVANT la restauration (tableau JSON), que la
-- sauvegarde restaurée ne contient pas si elle est plus ancienne que la fermeture. Relecture du 24/10 (I5) : la ligne
-- de fermeture de la sauvegarde (souvent encore « programmee ») est remise « executee », avec le remboursement et le
-- courriel déjà faits d'après le registre : la nuit suivante ne les redemande pas.
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
                    executee_le timestamptz, remboursement_cents bigint, remboursements_faits jsonb,
                    rembourse_le timestamptz, courriel_envoye_le timestamptz)
    loop
      -- La ligne de fermeture peut manquer dans la sauvegarde (recréée, réduite à l'essentiel) ou y être encore
      -- programmée : elle redevient exécutée, avec les suites déjà faites.
      insert into public.fermetures_comptes (id, account_id, origine, statut, demandee_le, effacement_prevu_le,
                                             empreinte_adresse, executee_le, mode_effacement, bilan_execution,
                                             remboursement_cents, remboursements_faits, rembourse_le, courriel_envoye_le)
      values (r.fermeture_id, r.account_id_origine, 'super_admin', 'executee', (r.executee_le at time zone 'Europe/Paris')::date,
              (r.executee_le at time zone 'Europe/Paris')::date, repeat('0', 64), r.executee_le, 'suppression',
              jsonb_build_object('recree_apres_restauration', now()),
              r.remboursement_cents, coalesce(r.remboursements_faits, '[]'::jsonb), r.rembourse_le, r.courriel_envoye_le)
      on conflict (id) do update
         set statut = 'executee',
             executee_le = coalesce(public.fermetures_comptes.executee_le, excluded.executee_le),
             mode_effacement = coalesce(public.fermetures_comptes.mode_effacement, 'suppression'),
             bilan_execution = coalesce(public.fermetures_comptes.bilan_execution, excluded.bilan_execution),
             annulee_le = null, annulation_motif = null, gel_motif = null, gel_pose_le = null,
             remboursement_cents = coalesce(public.fermetures_comptes.remboursement_cents, excluded.remboursement_cents),
             remboursements_faits = case when jsonb_array_length(public.fermetures_comptes.remboursements_faits) > 0
                                         then public.fermetures_comptes.remboursements_faits else excluded.remboursements_faits end,
             stripe_remboursement_id = coalesce(public.fermetures_comptes.stripe_remboursement_id,
                                                excluded.remboursements_faits -> 0 ->> 'remboursement'),
             rembourse_le = coalesce(public.fermetures_comptes.rembourse_le, excluded.rembourse_le),
             courriel_envoye_le = coalesce(public.fermetures_comptes.courriel_envoye_le, excluded.courriel_envoye_le),
             adresse_courriel = case when coalesce(public.fermetures_comptes.courriel_envoye_le, excluded.courriel_envoye_le) is null
                                     then public.fermetures_comptes.adresse_courriel end;
      insert into public.effacements_a_reappliquer (fermeture_id, account_id_origine, organisations_effacees,
                                                    artisan_id_origine, executee_le, remboursement_cents,
                                                    remboursements_faits, rembourse_le, courriel_envoye_le)
      values (r.fermeture_id, r.account_id_origine, coalesce(r.organisations_effacees, '{}'), r.artisan_id_origine,
              r.executee_le, r.remboursement_cents, r.remboursements_faits, r.rembourse_le, r.courriel_envoye_le)
      on conflict (fermeture_id) do update
         set remboursement_cents = coalesce(public.effacements_a_reappliquer.remboursement_cents, excluded.remboursement_cents),
             remboursements_faits = coalesce(public.effacements_a_reappliquer.remboursements_faits, excluded.remboursements_faits),
             rembourse_le = coalesce(public.effacements_a_reappliquer.rembourse_le, excluded.rembourse_le),
             courriel_envoye_le = coalesce(public.effacements_a_reappliquer.courriel_envoye_le, excluded.courriel_envoye_le);
      v_ajoutees := v_ajoutees + 1;
    end loop;
  end if;
  perform public.gardes_effacement(false);
  for r in select * from public.effacements_a_reappliquer loop
    if exists (select 1 from public.accounts where id = r.account_id_origine and efface_le is null)
       or exists (select 1 from public.organizations where id = any(r.organisations_effacees)) then
      foreach v_org in array r.organisations_effacees loop
        if exists (select 1 from public.organizations where id = v_org) then
          perform public.effacer_organisation_fermeture(v_org, r.account_id_origine);
        end if;
      end loop;
      if exists (select 1 from public.accounts where id = r.account_id_origine and efface_le is null) then
        perform public.effacer_compte_ferme(r.account_id_origine, r.fermeture_id);
        -- effacer_compte_ferme rétablit les gardes en sortant : les suspendre de nouveau pour la suivante.
        perform public.gardes_effacement(false);
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

-- ── 10. Suites applicatives (remboursement, courriel, fichiers hors `documents`, clients Stripe) ──────────────────

-- Les remboursements dus (relecture du 24/10, I7) : choix J+14, montant prévu, pas encore remboursé, et souscription
-- arrêtée chez Stripe (minuit, heure de Paris, de la date d'effet). Dus quel que soit le sort de la fermeture : exécutée,
-- gelée au-delà de cette date, ou annulée APRÈS l'arrêt (annulée avant, l'arrêt a été levé : rien n'est dû).
create or replace function public.fermetures_remboursements_dus(p_limite integer default 20)
returns table (id uuid, remboursement_prevu_cents bigint, remboursement_repartition jsonb, stripe_facture_id text)
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
    select f.id, f.remboursement_prevu_cents,
           coalesce(f.remboursement_repartition,
                    case when f.stripe_facture_id is not null
                         then jsonb_build_array(jsonb_build_object('facture', f.stripe_facture_id, 'montant_cents', f.remboursement_prevu_cents))
                    end),
           f.stripe_facture_id
      from public.fermetures_comptes f
     where f.choix = 'j14_prorata' and coalesce(f.remboursement_prevu_cents, 0) > 0 and f.rembourse_le is null
       and (f.effacement_prevu_le::timestamp at time zone 'Europe/Paris') <= now()
       and (f.statut <> 'annulee' or f.annulee_le >= (f.effacement_prevu_le::timestamp at time zone 'Europe/Paris'))
     order by f.effacement_prevu_le
     limit greatest(1, least(coalesce(p_limite, 20), 100));
end $$;
revoke all on function public.fermetures_remboursements_dus(integer) from public, anon, authenticated;
grant execute on function public.fermetures_remboursements_dus(integer) to service_role;

-- Le remboursement fait, paiement par paiement ([{"facture", "remboursement", "montant_cents"}]) : inscrit une fois,
-- sur la fermeture et sur le registre à rejouer après une restauration.
create or replace function public.fermeture_remboursement_fait(p_fermeture uuid, p_faits jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_total bigint;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  if p_faits is null or jsonb_typeof(p_faits) <> 'array' or jsonb_array_length(p_faits) = 0
     or exists (select 1 from jsonb_array_elements(p_faits) e
                 where coalesce(e ->> 'remboursement', '') = '' or coalesce(e ->> 'montant_cents', '') !~ '^[0-9]{1,12}$') then
    raise exception 'Remboursements invalides' using errcode = '22023';
  end if;
  select sum((e ->> 'montant_cents')::bigint) into v_total from jsonb_array_elements(p_faits) e;
  update public.fermetures_comptes
     set remboursements_faits = p_faits, remboursement_cents = v_total,
         stripe_remboursement_id = left(p_faits -> 0 ->> 'remboursement', 255), rembourse_le = now()
   where id = p_fermeture and rembourse_le is null;
  if not found then raise exception 'Fermeture introuvable ou déjà remboursée' using errcode = 'P0002'; end if;
  update public.effacements_a_reappliquer
     set remboursements_faits = p_faits, remboursement_cents = v_total, rembourse_le = now()
   where fermeture_id = p_fermeture;
end $$;
revoke all on function public.fermeture_remboursement_fait(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fermeture_remboursement_fait(uuid, jsonb) to service_role;

drop function if exists public.fermetures_suites_a_faire(integer);
create or replace function public.fermetures_suites_a_faire(p_limite integer default 20)
returns table (id uuid, account_id uuid, origine text, choix text, adresse_courriel text, demandee_le date,
               derniere_activite_le timestamptz,
               executee_le timestamptz, mode_effacement text, bilan_execution jsonb, abonnement jsonb,
               remboursement_prevu_cents bigint, remboursement_cents bigint, rembourse_le timestamptz,
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
           f.bilan_execution, f.abonnement, f.remboursement_prevu_cents, f.remboursement_cents, f.rembourse_le,
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

-- Les suites faites. Le courriel parti : l'adresse est effacée, et les noms des espaces effacés sont retirés du bilan
-- d'exécution ET du bilan de simulation (relecture du 24/10, R2-5). p_remboursement_cents et
-- p_stripe_remboursement_id : forme d'avant les relectures (un seul paiement), gardée pour compatibilité.
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
         bilan_execution = case when p_courriel_envoye then bilan_execution - 'organisations_noms' else bilan_execution end,
         bilan_simulation = case when p_courriel_envoye and bilan_simulation ? 'organisations_effacees'
                                 then jsonb_set(bilan_simulation, '{organisations_effacees}',
                                                coalesce((select jsonb_agg(o - 'nom') from jsonb_array_elements(bilan_simulation -> 'organisations_effacees') o), '[]'::jsonb))
                                 else bilan_simulation end
   where id = p_fermeture and statut = 'executee';
  if not found then raise exception 'Fermeture exécutée introuvable' using errcode = 'P0002'; end if;
  update public.effacements_a_reappliquer
     set courriel_envoye_le = case when p_courriel_envoye then coalesce(courriel_envoye_le, now()) else courriel_envoye_le end,
         remboursement_cents = coalesce(p_remboursement_cents, remboursement_cents),
         rembourse_le = case when p_remboursement_cents is not null then coalesce(rembourse_le, now()) else rembourse_le end
   where fermeture_id = p_fermeture;
end $$;
revoke all on function public.fermeture_suites_faites(uuid, bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.fermeture_suites_faites(uuid, bigint, text, boolean) to service_role;

-- Les clients Stripe dont toutes les factures archivées ont passé leurs six ans (relecture du 24/10, R2-5 : le courriel
-- de fin le promet) et qu'aucun abonnement ne porte plus : l'application les supprime chez Stripe, puis les inscrit.
create or replace function public.clients_stripe_au_terme(p_limite integer default 50)
returns table (stripe_customer_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  return query
    select a.stripe_customer_id
      from public.archives_comptes a
     where a.stripe_customer_id is not null
       and not exists (select 1 from public.clients_stripe_supprimes s where s.stripe_customer_id = a.stripe_customer_id)
       and not exists (select 1 from public.abonnements b where b.stripe_customer_id = a.stripe_customer_id)
     group by a.stripe_customer_id
    having max(coalesce(a.factures_conservees_jusqu_au, (a.archive_le at time zone 'Europe/Paris')::date)) < v_jour
     order by 1
     limit greatest(1, least(coalesce(p_limite, 50), 500));
end $$;
revoke all on function public.clients_stripe_au_terme(integer) from public, anon, authenticated;
grant execute on function public.clients_stripe_au_terme(integer) to service_role;

create or replace function public.client_stripe_supprime(p_customer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  if p_customer is null or p_customer !~ '^cus_[A-Za-z0-9_]{1,250}$' then
    raise exception 'Client Stripe invalide' using errcode = '22023';
  end if;
  insert into public.clients_stripe_supprimes (stripe_customer_id) values (p_customer) on conflict do nothing;
end $$;
revoke all on function public.client_stripe_supprime(text) from public, anon, authenticated;
grant execute on function public.client_stripe_supprime(text) to service_role;

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
-- n'en porte pas, LIMITÉES à ce que le demandeur lit lui-même (relecture du 24/10, B2 : l'archive contenait le registre
-- privé d'un artisan, ses brouillons de devis, la question d'un locataire au support et les réponses du support).
-- Hors archive : journaux techniques et d'audit, files de traitement, registres internes. Les colonnes de jetons et de
-- verrous ne sortent pas.
drop function if exists public.export_complet_donnees(uuid);
create or replace function public.export_complet_donnees(p_org uuid, p_account uuid)
returns jsonb
language plpgsql
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
  if p_account is null or not exists (select 1 from public.memberships m
                                       where m.account_id = p_account and m.organization_id = p_org and m.status = 'active'
                                         and m.role in ('admin_agence', 'proprietaire_direct')) then
    raise exception 'Réservé au titulaire de l''espace' using errcode = '42501';
  end if;
  v_lignes := public.lignes_lisibles_par('public.organizations'::regclass, '$T.id = $1', p_org, p_account);
  v_tables := v_tables || jsonb_build_object('organizations', v_lignes);
  for r in
    select c.oid::regclass as tbl, c.relname as nom
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
     where c.relkind in ('r', 'p') and c.relname <> 'organizations' and not (c.relname = any(v_exclues))
     order by c.relname
  loop
    v_lignes := public.lignes_lisibles_par(r.tbl, '$T.organization_id = $1', p_org, p_account);
    if jsonb_array_length(v_lignes) > 0 then
      v_tables := v_tables || jsonb_build_object(r.nom, v_lignes);
    end if;
  end loop;
  for r in
    select distinct con.conrelid::regclass as tbl, cc.relname as nom, att.attname as col, pc.relname as parent, patt.attname as pcol
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
     order by 2, 3
  loop
    v_lignes := public.lignes_lisibles_par(r.tbl,
                  format('$T.%I in (select p.%I from public.%I p where p.organization_id = $1)', r.col, r.pcol, r.parent),
                  p_org, p_account);
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
revoke all on function public.export_complet_donnees(uuid, uuid) from public, anon, authenticated;
grant execute on function public.export_complet_donnees(uuid, uuid) to service_role;

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
-- pièces, validations, sollicitations, devis, interventions, comptes rendus, factures, évaluations reçues,
-- contestations), ses acceptations des conditions. Les registres privés restent rendus par
-- `mon_activite_artisan_privee`. Relecture du 24/10 (I9) : seulement ce que sa session lit elle-même — ni le mémo
-- privé d'une invitation, ni le carnet d'un propriétaire et son motif de liste noire. Jetons, verrous et identifiants
-- des comptes d'autrui ne sortent pas. Chaque export est inscrit au journal d'audit. (Nom des avoirs composé : voir
-- gardes_effacement.)
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
    v_lignes := public.lignes_lisibles_par(r.tbl, format('$T.%I = $1', r.col), v_artisan, v_uid);
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
-- qui supprime les fichiers mis en file, rembourse, envoie les courriels de fin et supprime les clients Stripe au terme.
-- La procédure valide chaque fermeture à part (relecture du 24/10, M8). Rejouée, `cron.schedule` remplace la commande.
select cron.schedule('fermetures-comptes', '20 3 * * *', $$call public.fermetures_comptes_nuit()$$);

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
