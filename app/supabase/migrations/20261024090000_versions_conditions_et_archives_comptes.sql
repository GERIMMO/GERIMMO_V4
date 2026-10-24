-- Conformité V1 (plan juriste/DPO du 23/10/2026, lot 1A ; constat R12, base de R10/R60 et de R15) : archive des
-- versions des conditions, nature et empreinte des acceptations, archive des comptes fermés.
--
-- 1. `public.versions_conditions` — une ligne par version publiée d'un document contractuel (conditions clients ;
--    conditions de l'espace artisan quand elles existeront). AJOUT SEUL : ni mise à jour, ni suppression, ni vidage
--    (déclencheurs, sur le modèle de `acceptations_cgu_ajout_seul`). Elle garde le HTML tel que la page publiée
--    l'affichait, l'identité de l'éditeur qui s'y lisait, et l'empreinte SHA-256 de ce HTML, que la base RECALCULE à
--    l'insertion (une empreinte qui ne correspond pas au texte est refusée). Lecture publique (anon, authenticated) pour
--    les pages /conditions/versions ; écriture par la clé de service seulement, au travers de
--    `archiver_version_conditions` (action serveur du super-administrateur permanent, second facteur exigé).
--
-- 2. `public.acceptations_cgu` — deux colonnes :
--    · `document` : conditions_clients | conditions_artisans | regles_invites. Défaut conditions_clients : toutes les
--      lignes existantes sont des acceptations des conditions clients (la colonne s'ajoute sans réécrire la table) ;
--    · `empreinte_sha256` : posée par la base, celle de la version archivée au moment de l'acceptation ; nulle tant que
--      la version n'est pas archivée. Jamais fournie par l'appelant.
--    `accepter_cgu(p_version, p_source, p_document)` remplace `accepter_cgu(p_version, p_source)` : les appels existants,
--    nommés (p_version, p_source) ou positionnels, restent valables et enregistrent conditions_clients.
--    PAS DE CLÉ ÉTRANGÈRE vers `versions_conditions` : la production n'en a encore archivé aucune, et une clé ferait
--    échouer toute inscription et toute souscription. Une version inconnue s'enregistre donc toujours (aucune
--    acceptation perdue) ; `acceptations_sans_version_archivee()` (super-administrateur, page /admin/sante) dit ce qui
--    manque. La clé sera posée par une migration dédiée, une fois les versions en vigueur archivées en production.
--
-- 3. `public.archives_comptes` — la preuve d'un contrat payé, copiée avant la suppression d'un compte (l'archivage et
--    le déclencheur de suppression relèvent du lot « comptes »). Aucune clé vers `accounts`, pour survivre au compte.
--    La colonne de l'organisation s'appelle `organisation_id_origine`, pas `organization_id` : ce nom ferait poser par
--    `poser_gardes_abonnement()` la garde de lecture seule, qui refuserait l'archivage d'un compte gelé.
--    Lecture : super-administrateur permanent avec second facteur (`is_permanent_super_admin()`). Écriture : clé de
--    service. Deux durées distinctes, calculées par la base à l'insertion et figées sur la ligne :
--    · la preuve du contrat (identité, acceptations, dates d'abonnement) : dix ans après la fin du dernier abonnement
--      payé (code de la consommation, L. 213-1 ; décision du 23/10) ;
--    · chaque facture : six ans après sa date d'émission (livre des procédures fiscales, L. 102 B ; l'éditeur n'est
--      pas commerçant, décision du 23/10). Les factures se retirent une à une à leur terme
--      (`purger_archives_comptes`), la ligne au terme de la preuve, une fois ses factures retirées.
--    Un compte qui n'a jamais payé n'a pas d'archive (sa preuve part avec lui) : `fin_dernier_abonnement_paye` est
--    obligatoire. `purger_archives_comptes()` n'est appelée par aucune tâche : le lot de conservation la branchera.
--
-- Rejouable : IF NOT EXISTS, CREATE OR REPLACE, DROP … IF EXISTS ; `search_path = ''` ; aucune donnée existante
-- réécrite ; `fermer_fonctions_a_anon()` en fin. `accepter_cgu(text, text)` n'est remplacée que si sa définition est
-- celle de 20260927148000 (sinon arrêt, en nommant la fonction).
-- Retour : supabase/retours-arriere/20261024090000_versions_conditions_et_archives_comptes.retour.sql (dans la
-- chaîne « Ordre complet », dernier des retours du plan de conformité, bien que rien ici ne cite `aujourdhui_paris()`).

-- Finitions du 24/10 (relecture transverse, point 6) : aucun verrou attendu plus de dix secondes. Le chantier envoie le
-- lot dans une seule transaction : la limite posée ici couvre toutes les migrations qui suivent ; seule, elle couvre ce
-- fichier. Un verrou refusé fait échouer la migration (rien n'est appliqué) au lieu de faire attendre les inscriptions.
do $verrou$ begin perform set_config('lock_timeout', '10s', true); end $verrou$;

-- ── 1. Versions archivées des conditions ────────────────────────────────────────────────────────────────────────

create table if not exists public.versions_conditions (
  document text not null check (document in ('conditions_clients', 'conditions_artisans')),
  version text not null check (length(version) between 1 and 40),
  date_effet date not null,
  nature text not null check (nature in ('substantielle', 'technique')),
  publiee_le timestamptz not null default now(),
  texte_html text not null check (length(texte_html) between 1 and 2000000),
  identite_editeur jsonb not null check (jsonb_typeof(identite_editeur) = 'object'),
  empreinte_sha256 text not null check (empreinte_sha256 ~ '^[0-9a-f]{64}$'),
  resume_modifications text not null check (length(btrim(resume_modifications)) between 1 and 4000),
  primary key (document, version)
);
alter table public.versions_conditions enable row level security;

drop policy if exists versions_conditions_lecture_publique on public.versions_conditions;
create policy versions_conditions_lecture_publique on public.versions_conditions
  for select to anon, authenticated using (true);

-- Les droits par défaut du schéma accordent tout à chacun : on repart de rien (TRUNCATE compris, que la RLS ignore).
revoke all on public.versions_conditions from public, anon, authenticated, service_role;
grant select on public.versions_conditions to anon, authenticated;
grant select, insert on public.versions_conditions to service_role;

-- L'empreinte se recalcule à l'insertion : celle qui est fournie doit être celle du texte, au caractère près.
create or replace function public.versions_conditions_empreinte()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_calculee text := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(new.texte_html, 'UTF8')), 'hex');
begin
  if new.empreinte_sha256 is null then
    new.empreinte_sha256 := v_calculee;
  elsif new.empreinte_sha256 <> v_calculee then
    raise exception 'Empreinte SHA-256 différente du texte archivé' using errcode = '22023';
  end if;
  -- L'heure de l'archivage est celle du serveur, jamais celle de l'appelant.
  new.publiee_le := now();
  return new;
end $$;
revoke execute on function public.versions_conditions_empreinte() from public, anon, authenticated;

drop trigger if exists versions_conditions_empreinte on public.versions_conditions;
create trigger versions_conditions_empreinte
  before insert on public.versions_conditions
  for each row execute function public.versions_conditions_empreinte();

-- Ajout seul, comme acceptations_cgu (20260927148000), sans l'exception de cascade : rien ne pointe vers une version.
create or replace function public.versions_conditions_ajout_seul()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Une version archivée des conditions ne se modifie ni ne se supprime' using errcode = '42501';
end $$;
revoke execute on function public.versions_conditions_ajout_seul() from public, anon, authenticated;

drop trigger if exists versions_conditions_immuables on public.versions_conditions;
create trigger versions_conditions_immuables
  before update or delete on public.versions_conditions
  for each row execute function public.versions_conditions_ajout_seul();
drop trigger if exists versions_conditions_sans_vidage on public.versions_conditions;
create trigger versions_conditions_sans_vidage
  before truncate on public.versions_conditions
  for each statement execute function public.versions_conditions_ajout_seul();

comment on table public.versions_conditions is
  'Versions publiées des conditions (HTML de la page publiée, identité de l''éditeur, empreinte SHA-256 du HTML recalculée par la base). Ajout seul (24/10/2026, plan de conformité R12).';

-- Le texte sans sa présentation : les attributs class et style retirés, comme `formeDeReference` côté code
-- (lib/conditions-versions.ts ; tests/versions-conditions-base.test.ts vérifie l'égalité). React échappe les guillemets
-- dans les textes : seul un vrai attribut a cette forme.
create or replace function public.versions_conditions_sans_presentation(p_texte text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.regexp_replace(p_texte, ' (class|style)="[^"]*"', '', 'g')
$$;
revoke all on function public.versions_conditions_sans_presentation(text) from public, anon, authenticated;
grant execute on function public.versions_conditions_sans_presentation(text) to service_role;

-- L'archivage par l'action serveur (clé de service) : insère la version si elle manque ; si elle existe, compare les
-- empreintes. Une même version avec une autre empreinte n'est JAMAIS réécrite : elle est refusée et consignée dans
-- tech_log (noms des champs d'identité qui diffèrent, jamais leurs valeurs), et l'action alerte le relais. Sauf si
-- seule la présentation diffère (relecture adverse du 24/10, M2) : même texte sans ses classes ni ses styles, après un
-- déploiement purement visuel ; l'archive garde sa présentation d'origine, rien n'est consigné ni alerté.
create or replace function public.archiver_version_conditions(
  p_document text,
  p_version text,
  p_date_effet date,
  p_nature text,
  p_texte_html text,
  p_identite_editeur jsonb,
  p_empreinte_sha256 text,
  p_resume_modifications text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calculee text;
  v_archivee public.versions_conditions%rowtype;
  v_champs text[];
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  if p_texte_html is null then
    raise exception 'Texte des conditions absent' using errcode = '22023';
  end if;
  v_calculee := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_texte_html, 'UTF8')), 'hex');
  if p_empreinte_sha256 is distinct from v_calculee then
    raise exception 'Empreinte SHA-256 différente du texte archivé' using errcode = '22023';
  end if;

  insert into public.versions_conditions
    (document, version, date_effet, nature, texte_html, identite_editeur, empreinte_sha256, resume_modifications)
  values
    (p_document, p_version, p_date_effet, p_nature, p_texte_html, p_identite_editeur, v_calculee, p_resume_modifications)
  on conflict (document, version) do nothing;
  if found then
    return jsonb_build_object('statut', 'archivee', 'empreinte_sha256', v_calculee);
  end if;

  select * into v_archivee from public.versions_conditions v where v.document = p_document and v.version = p_version;
  if v_archivee.empreinte_sha256 = v_calculee then
    return jsonb_build_object('statut', 'deja_archivee', 'empreinte_sha256', v_calculee, 'publiee_le', v_archivee.publiee_le);
  end if;
  if public.versions_conditions_sans_presentation(v_archivee.texte_html) = public.versions_conditions_sans_presentation(p_texte_html) then
    return jsonb_build_object(
      'statut', 'presentation_differente',
      'empreinte_sha256', v_archivee.empreinte_sha256,
      'empreinte_publiee', v_calculee,
      'publiee_le', v_archivee.publiee_le);
  end if;

  select coalesce(array_agg(c.cle order by c.cle), '{}') into v_champs
    from (select k.key as cle from jsonb_each(v_archivee.identite_editeur) k
          union
          select k.key from jsonb_each(coalesce(p_identite_editeur, '{}'::jsonb)) k) c
   where v_archivee.identite_editeur -> c.cle is distinct from coalesce(p_identite_editeur, '{}'::jsonb) -> c.cle;
  insert into public.tech_log (evenement, details)
  values ('conditions_version_divergente', jsonb_build_object(
    'document', p_document, 'version', p_version,
    'empreinte_archivee', v_archivee.empreinte_sha256, 'empreinte_publiee', v_calculee,
    'champs_identite_modifies', to_jsonb(v_champs)));
  return jsonb_build_object(
    'statut', 'empreinte_differente',
    'empreinte_sha256', v_archivee.empreinte_sha256,
    'empreinte_publiee', v_calculee,
    'publiee_le', v_archivee.publiee_le,
    'champs_identite_modifies', to_jsonb(v_champs));
end $$;
revoke all on function public.archiver_version_conditions(text, text, date, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.archiver_version_conditions(text, text, date, text, text, jsonb, text, text)
  to service_role;

-- ── 2. Acceptations : document et empreinte ─────────────────────────────────────────────────────────────────────

alter table public.acceptations_cgu add column if not exists document text not null default 'conditions_clients';
alter table public.acceptations_cgu add column if not exists empreinte_sha256 text;
alter table public.acceptations_cgu drop constraint if exists acceptations_cgu_document_connu;
alter table public.acceptations_cgu add constraint acceptations_cgu_document_connu
  check (document in ('conditions_clients', 'conditions_artisans', 'regles_invites'));
alter table public.acceptations_cgu drop constraint if exists acceptations_cgu_empreinte_hex;
alter table public.acceptations_cgu add constraint acceptations_cgu_empreinte_hex
  check (empreinte_sha256 is null or empreinte_sha256 ~ '^[0-9a-f]{64}$');
create index if not exists acceptations_cgu_document_version_idx on public.acceptations_cgu (document, version);

comment on column public.acceptations_cgu.document is
  'Document accepté : conditions_clients, conditions_artisans ou regles_invites (24/10/2026). Les lignes antérieures sont des acceptations des conditions clients.';
comment on column public.acceptations_cgu.empreinte_sha256 is
  'Empreinte de la version archivée (versions_conditions) au moment de l''acceptation, posée par la base ; nulle si la version n''était pas encore archivée.';

-- L'empreinte vient de l'archive, jamais de l'appelant. Aucune version archivée : nulle, et l'acceptation passe quand
-- même (le contrôle de /admin/sante la signale).
create or replace function public.acceptations_cgu_empreinte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.empreinte_sha256 := (select v.empreinte_sha256 from public.versions_conditions v
                            where v.document = new.document and v.version = new.version);
  return new;
end $$;
revoke execute on function public.acceptations_cgu_empreinte() from public, anon, authenticated;

drop trigger if exists acceptations_cgu_empreinte_archivee on public.acceptations_cgu;
create trigger acceptations_cgu_empreinte_archivee
  before insert on public.acceptations_cgu
  for each row execute function public.acceptations_cgu_empreinte();

-- accepter_cgu prend le document. L'ancienne signature (text, text) disparaît : la garder ferait de tout appel à deux
-- arguments un appel ambigu entre les deux fonctions. N'est remplacée que la définition connue de 20260927148000.
do $remplacement$
declare v_def text;
begin
  if to_regprocedure('public.accepter_cgu(text, text)') is null then return; end if;
  v_def := pg_get_functiondef('public.accepter_cgu(text, text)'::regprocedure);
  if strpos(v_def, $a$case when p_source in ('espace_proprietaire', 'compte') then p_source else 'compte' end$a$) = 0
     or strpos(v_def, $a$insert into public.acceptations_cgu (account_id, version, source)$a$) = 0 then
    raise exception 'accepter_cgu(text, text) : définition inattendue, remplacement refusé';
  end if;
  drop function public.accepter_cgu(text, text);
end $remplacement$;

create or replace function public.accepter_cgu(
  p_version text,
  p_source text default 'compte',
  p_document text default 'conditions_clients'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if p_version is null or btrim(p_version) = '' or length(p_version) > 40 then
    raise exception 'Version des conditions invalide' using errcode = '22023';
  end if;
  if p_document is null or p_document not in ('conditions_clients', 'conditions_artisans', 'regles_invites') then
    raise exception 'Document des conditions invalide' using errcode = '22023';
  end if;
  -- L'ouverture d'un espace propriétaire fait accepter les conditions clients, rien d'autre.
  if p_source = 'espace_proprietaire' and p_document <> 'conditions_clients' then
    raise exception 'Document des conditions invalide pour un espace propriétaire' using errcode = '22023';
  end if;
  insert into public.acceptations_cgu (account_id, version, source, document)
  values (v_uid, btrim(p_version),
          case when p_source in ('espace_proprietaire', 'compte') then p_source else 'compte' end,
          p_document);
end $$;
revoke execute on function public.accepter_cgu(text, text, text) from public, anon;
grant execute on function public.accepter_cgu(text, text, text) to authenticated;

-- Le contrôle affiché sur /admin/sante : les acceptations dont la version n'est pas archivée (les règles des espaces
-- invités n'ont pas de version archivée : hors du contrôle, comme elles seront hors de la future clé étrangère).
create or replace function public.acceptations_sans_version_archivee()
returns table (document text, version text, acceptations bigint, premiere timestamptz, derniere timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' and not public.is_super_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
    select a.document, a.version, count(*), min(a.acceptee_le), max(a.acceptee_le)
      from public.acceptations_cgu a
     where a.document <> 'regles_invites'
       and not exists (select 1 from public.versions_conditions v
                        where v.document = a.document and v.version = a.version)
     group by a.document, a.version
     order by a.document, a.version;
end $$;
revoke all on function public.acceptations_sans_version_archivee() from public, anon;
grant execute on function public.acceptations_sans_version_archivee() to authenticated, service_role;

-- ── 3. Archives des comptes ─────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.archives_comptes (
  id uuid primary key default gen_random_uuid(),
  account_id_origine uuid not null,
  organisation_id_origine uuid,
  email text check (email is null or length(email) <= 320),
  stripe_customer_id text check (stripe_customer_id is null or length(stripe_customer_id) <= 255),
  acceptations jsonb not null default '[]'::jsonb check (jsonb_typeof(acceptations) = 'array'),
  debut_abonnement date,
  fin_dernier_abonnement_paye date not null,
  factures jsonb not null default '[]'::jsonb check (jsonb_typeof(factures) = 'array'),
  archive_le timestamptz not null default now(),
  preuve_conservee_jusqu_au date not null,
  factures_conservees_jusqu_au date,
  factures_purgees_le timestamptz,
  constraint archives_comptes_une_par_compte_et_organisation
    unique nulls not distinct (account_id_origine, organisation_id_origine)
);
create index if not exists archives_comptes_preuve_idx on public.archives_comptes (preuve_conservee_jusqu_au);
alter table public.archives_comptes enable row level security;

drop policy if exists archives_comptes_lecture_superviseur on public.archives_comptes;
create policy archives_comptes_lecture_superviseur on public.archives_comptes
  for select to authenticated using ((select public.is_permanent_super_admin()));

revoke all on public.archives_comptes from public, anon, authenticated, service_role;
grant select on public.archives_comptes to authenticated;
grant select, insert, update, delete on public.archives_comptes to service_role;

comment on table public.archives_comptes is
  'Preuve des contrats payés, copiée avant la suppression d''un compte : 10 ans après la fin du dernier abonnement payé ; chaque facture 6 ans après son émission (24/10/2026, plan de conformité R12/R15 ; décisions du 23/10). Lecture : super-administrateur permanent (second facteur). Écriture : clé de service.';
comment on column public.archives_comptes.factures is
  'Tableau JSON des factures payées ; chaque élément porte au moins « emise_le » (AAAA-MM-JJ). Retirées une à une six ans après leur émission.';

-- Les échéances se calculent à l'insertion, jamais fournies par l'appelant.
create or replace function public.archives_comptes_echeances()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_derniere date;
begin
  if exists (select 1 from jsonb_array_elements(new.factures) e
              where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'emise_le', '') !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'Chaque facture archivée porte sa date d''émission (emise_le, AAAA-MM-JJ)' using errcode = '22023';
  end if;
  select max((e ->> 'emise_le')::date) into v_derniere from jsonb_array_elements(new.factures) e;
  new.archive_le := now();
  -- Preuve d'un contrat conclu par voie électronique : dix ans (code de la consommation, L. 213-1, D. 213-1 et
  -- D. 213-2), comptés de la fin du dernier abonnement payé (plan du 23/10, choix 5 ; décision du 23/10).
  -- À relire par le juriste (source non ouverte le 23/10/2026).
  new.preuve_conservee_jusqu_au := (new.fin_dernier_abonnement_paye + interval '10 years')::date;
  -- Factures et pièces justificatives : six ans à compter de leur date (livre des procédures fiscales, L. 102 B ;
  -- éditeur non commerçant, décision du 23/10). Échéance de la plus récente ; chacune se retire à la sienne.
  -- À relire par le juriste (source non ouverte le 23/10/2026).
  new.factures_conservees_jusqu_au := (v_derniere + interval '6 years')::date;
  new.factures_purgees_le := null;
  return new;
end $$;
revoke execute on function public.archives_comptes_echeances() from public, anon, authenticated;

drop trigger if exists archives_comptes_echeances on public.archives_comptes;
create trigger archives_comptes_echeances
  before insert on public.archives_comptes
  for each row execute function public.archives_comptes_echeances();

-- Ce que la clé de service peut encore faire d'une archive : en retirer les factures arrivées à leur terme, et la
-- supprimer au terme de la preuve, une fois ses factures retirées. Rien d'autre, même pour le propriétaire de la table.
create or replace function public.archives_comptes_garde()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Les archives de comptes ne se vident pas' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if old.preuve_conservee_jusqu_au >= v_jour or jsonb_array_length(old.factures) > 0 then
      raise exception 'Une archive de compte ne se supprime qu''au terme de sa conservation (preuve jusqu''au %, % facture(s) encore conservée(s))',
        old.preuve_conservee_jusqu_au, jsonb_array_length(old.factures) using errcode = '42501';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - 'factures' - 'factures_purgees_le') is distinct from (to_jsonb(old) - 'factures' - 'factures_purgees_le') then
    raise exception 'Une archive de compte ne se modifie pas' using errcode = '42501';
  end if;
  -- La date de purge est celle de la base, posée au retrait d'une facture et à lui seul (relecture adverse du 24/10,
  -- M4 : elle prenait n'importe quelle valeur).
  if new.factures is not distinct from old.factures then
    if new.factures_purgees_le is distinct from old.factures_purgees_le then
      raise exception 'Une archive de compte ne se modifie pas' using errcode = '42501';
    end if;
    return new;
  end if;
  new.factures_purgees_le := now();
  -- Chaque facture gardée l'est à l'identique, sans copie de plus ; chaque facture retirée est arrivée au terme de ses
  -- six ans. Les factures se comptent (M4) : deux copies identiques sont deux factures, aucune ne part avant son terme.
  if exists (select 1
               from (select n.e, count(*) as c from jsonb_array_elements(new.factures) n(e) group by n.e) nouvelles
               left join (select o.e, count(*) as c from jsonb_array_elements(old.factures) o(e) group by o.e) anciennes
                 on anciennes.e = nouvelles.e
              where anciennes.c is null or nouvelles.c > anciennes.c)
     or exists (select 1
                  from (select o.e, count(*) as c from jsonb_array_elements(old.factures) o(e) group by o.e) anciennes
                  left join (select n.e, count(*) as c from jsonb_array_elements(new.factures) n(e) group by n.e) nouvelles
                    on nouvelles.e = anciennes.e
                 where coalesce(nouvelles.c, 0) < anciennes.c
                   and ((anciennes.e ->> 'emise_le')::date + interval '6 years')::date >= v_jour) then
    raise exception 'Seules les factures arrivées au terme de leur conservation se retirent d''une archive' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.archives_comptes_garde() from public, anon, authenticated;

drop trigger if exists archives_comptes_garde on public.archives_comptes;
create trigger archives_comptes_garde
  before update or delete on public.archives_comptes
  for each row execute function public.archives_comptes_garde();
drop trigger if exists archives_comptes_sans_vidage on public.archives_comptes;
create trigger archives_comptes_sans_vidage
  before truncate on public.archives_comptes
  for each statement execute function public.archives_comptes_garde();

-- La purge, séparée pour les factures (six ans, une à une) et pour la preuve (dix ans). Appelée par aucune tâche à ce
-- jour : le lot de conservation la branchera sur appliquer_retention, avec ses règles.
create or replace function public.purger_archives_comptes()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_factures bigint;
  v_archives bigint;
begin
  update public.archives_comptes a
     set factures = coalesce((select jsonb_agg(x.e order by x.rang)
                                from jsonb_array_elements(a.factures) with ordinality x(e, rang)
                               where ((x.e ->> 'emise_le')::date + interval '6 years')::date >= v_jour), '[]'::jsonb),
         factures_purgees_le = now()
   where exists (select 1 from jsonb_array_elements(a.factures) e
                  where ((e ->> 'emise_le')::date + interval '6 years')::date < v_jour);
  get diagnostics v_factures = row_count;
  delete from public.archives_comptes a
   where a.preuve_conservee_jusqu_au < v_jour and jsonb_array_length(a.factures) = 0;
  get diagnostics v_archives = row_count;
  return jsonb_build_object('archives_comptes_factures_retirees', v_factures, 'archives_comptes_supprimees', v_archives);
end $$;
revoke all on function public.purger_archives_comptes() from public, anon, authenticated;
grant execute on function public.purger_archives_comptes() to service_role;

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
