-- Liste d'attente des agences de gestion locative (décision du dirigeant du 20 octobre 2026).
--
-- Constat. La V1 publique (13/10) s'adresse aux propriétaires bailleurs et aux SCI ; les agences de gestion sont hors du
-- site public (code et espace /agence conservés), sans aucun moyen de se déclarer intéressées avant l'ouverture de leur
-- offre. La table public.liste_attente (créée hors dépôt le 29/09 pour les visiteurs du site, entrée au dépôt et bornée le
-- 19/10 par 20261019120000) ne porte ni le nom de l'agence, ni l'interlocuteur, ni la tranche de lots gérés, ni le suivi
-- d'un recontact : elle ne peut pas servir à cet usage.
--
-- Décision du 20/10 : le dirigeant veut une liste d'attente des agences, DISTINCTE de liste_attente du 29/09 dont le sort
-- reste à décider. Une agence s'y inscrit depuis le site vitrine (page /agences) ; rien ne lui est envoyé (aucun e-mail de
-- confirmation) ; le dirigeant la recontacte lui-même depuis la console (/admin/liste-attente) et note le suivi (statut,
-- date de contact). Aucun prix ni aucune date d'ouverture ne sont annoncés.
--
-- Ce qui est posé :
--   · la table public.liste_attente_agences : id, email, agence (nom de l'agence), contact (nom de la personne), telephone,
--     code_postal, nb_lots (quatre tranches), message, source (adresse de la page qui a écrit), statut (en_attente,
--     contactee, convertie, retiree), contactee_le, created_at ;
--   · des bornes CHECK, VALIDÉES à la pose (table nouvelle, donc vide) : e-mail au format usuel, ≤ 254 caractères, une seule
--     arobase, ni blanc ASCII ni caractère de contrôle, ni blanc Unicode (espace insécable U+00A0, espaces typographiques
--     U+1680 et U+2000–U+200B, séparateurs U+2028/U+2029, U+202F, U+205F, U+3000, marque d'ordre des octets U+FEFF — la
--     classe [[:space:]] ne couvre que les blancs ASCII en C.UTF-8 ; mêmes caractères littéraux que liste_attente_email_borne) ;
--     agence et contact ≤ 120 caractères, non vides une fois les blancs retirés, sans caractère de contrôle (le saut de
--     ligne est donc refusé) ; telephone null ou ≤ 40, non vide, sans contrôle ; code_postal : cinq chiffres ; nb_lots dans
--     les quatre tranches ; message null ou ≤ 1000, non vide une fois les blancs retirés, sans caractère de contrôle SAUF
--     le saut de ligne (seul champ libre de plusieurs lignes) ; source null ou ≤ 80, non vide, sans contrôle ; statut dans
--     les quatre états. « Non vide une fois les blancs retirés » est tenu par btrim et \S, qui ne connaissent que les blancs
--     ASCII : une valeur faite uniquement de blancs Unicode (U+00A0, U+3000…) n'est pas arrêtée par ces bornes ; l'action
--     serveur, qui retire ces blancs (trim JavaScript) avant de valider, la refuse en amont — la base n'est ici qu'une défense
--     en profondeur, comme pour liste_attente_biens_borne (20261019120000) ;
--   · un index unique sur lower(email) : une agence, une adresse ; le doublon à casse différente est refusé (l'action
--     serveur répond au doublon par le message de succès : aucune révélation) ; un index (created_at desc) pour le comptage
--     de l'heure glissante ;
--   · un PLAFOND D'INSERTION tenu par la base, sur le modèle exact de liste_attente_limiter (20261019120000) : le déclencheur
--     liste_attente_agences_limiter refuse au-delà de 30 inscriptions par heure glissante, toutes adresses confondues, sous
--     verrou transactionnel. Seuil technique, pas règle métier (aucune page du wiki ne fixe de volume d'inscriptions) ; il
--     s'applique à tous les rôles, clé de service comprise, et son refus arrive à l'écran en français ;
--   · le déclencheur diagnostic_artisan_lecture, comme sur toute table de public depuis le 12/10 (poser_gardes_diagnostic_artisan
--     n'a énuméré que les tables qui existaient alors : chaque table nouvelle le pose elle-même, comme M2 le 19/10) ;
--   · RLS activée. anon : AUCUN droit, ni de table ni de colonne. authenticated : lecture, et mise à jour des deux seules
--     colonnes de suivi (statut, contactee_le), sous les politiques liste_attente_agences_select_sa et
--     liste_attente_agences_update_sa (super-administrateur, modèle demandes_devis_select_sa/_update_sa) ; AUCUN droit
--     d'insertion pour anon ni authenticated : l'insertion passe par l'action serveur et la clé de service, après le pot de
--     miel et la validation (décision X02, 20261014400000). service_role : lecture, insertion, modification, suppression ;
--   · un commentaire de table qui date l'origine (20/10/2026) ; un bloc de CONTRÔLE qui s'arrête si un droit manque ou dépasse,
--     si une politique, un déclencheur ou un index manque, ou si les dix bornes CHECK ne sont pas toutes posées et validées
--     (`create table if not exists` ne reposerait pas une borne absente d'une table homonyme préexistante).
--
-- Pas de règle retention_rules : la durée de conservation d'une inscription (et le sort des agences contactées ou converties)
-- est à décider par le dirigeant et le DPO ; la décision sera consignée, pas inventée ici.
--
-- Aucune ligne lue ni réécrite. Une seule fonction, nouvelle (liste_attente_agences_limiter). Rejouable : `if not exists`,
-- `drop … if exists`, `create or replace`, revoke/grant sans effet la seconde fois.
-- Retour : supabase/retours-arriere/20261020120000_liste_attente_agences.retour.sql (refuse, sans rien modifier, dès que la
-- table contient une inscription : décision du dirigeant requise).

do $verrou$ begin perform set_config('lock_timeout', '10s', true); end $verrou$;

-- ── 1. La table et ses bornes ────────────────────────────────────────────────────────────────────────────────────────
-- Les blancs Unicode hors ASCII (U+00A0, U+1680, U+2000 à U+200B, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF) sont
-- écrits en caractères littéraux dans la classe de liste_attente_agences_email_borne (fichier UTF-8, chaîne standard),
-- recopiés de liste_attente_email_borne (20261019120000). La classe des caractères de contrôle, refusés dans tous les champs
-- — le saut de ligne excepté, admis dans message seulement —, est écrite avec la syntaxe d'échappement E'…' : U+0001–U+0009,
-- U+000B–U+001F, U+007F.
create table if not exists public.liste_attente_agences (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  agence text not null,
  contact text not null,
  telephone text,
  code_postal text not null,
  nb_lots text not null,
  message text,
  source text,
  statut text not null default 'en_attente',
  contactee_le timestamptz,
  created_at timestamptz not null default now(),
  constraint liste_attente_agences_email_format check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  constraint liste_attente_agences_email_borne check (
    length(email) <= 254
    and email ~ '^[^@]+@[^@]+$'
    and email !~ '[[:space:][:cntrl:]]'
    and email !~ '[   -​    　﻿]'
  ),
  constraint liste_attente_agences_agence_borne check (
    length(agence) <= 120 and length(btrim(agence)) >= 1 and agence !~ '[[:cntrl:]]'
  ),
  constraint liste_attente_agences_contact_borne check (
    length(contact) <= 120 and length(btrim(contact)) >= 1 and contact !~ '[[:cntrl:]]'
  ),
  constraint liste_attente_agences_telephone_borne check (
    telephone is null or (length(telephone) <= 40 and length(btrim(telephone)) >= 1 and telephone !~ '[[:cntrl:]]')
  ),
  constraint liste_attente_agences_code_postal_format check (code_postal ~ '^[0-9]{5}$'),
  constraint liste_attente_agences_nb_lots_check check (nb_lots in ('moins_de_50', '50_a_199', '200_a_499', '500_et_plus')),
  -- Non vide une fois les blancs retirés (saut de ligne compris : c'est le seul champ où il est admis).
  constraint liste_attente_agences_message_borne check (
    message is null or (length(message) <= 1000 and message ~ '\S' and message !~ E'[\x01-\x09\x0B-\x1F\x7F]')
  ),
  constraint liste_attente_agences_source_borne check (
    source is null or (length(source) <= 80 and length(btrim(source)) >= 1 and source !~ '[[:cntrl:]]')
  ),
  constraint liste_attente_agences_statut_check check (statut in ('en_attente', 'contactee', 'convertie', 'retiree'))
);

alter table public.liste_attente_agences enable row level security;

-- Une agence, une adresse : le doublon à casse différente est refusé.
create unique index if not exists liste_attente_agences_email_lower_idx on public.liste_attente_agences (lower(email));
-- Le comptage de l'heure glissante lit cet index plutôt que la table entière.
create index if not exists liste_attente_agences_recent_idx on public.liste_attente_agences (created_at desc);

-- ── 2. Le plafond d'insertion, tenu par la base (modèle exact : liste_attente_limiter, 20261019120000) ──────────────
-- Le déclencheur n'est pas une RPC : une fonction `returns trigger` ne s'appelle pas par /rest/v1/rpc, et son droit
-- d'exécution n'est vérifié qu'à la création du déclencheur — on le retire donc à tous les rôles.
create or replace function public.liste_attente_agences_limiter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_total integer;
begin
  -- Une seule insertion compte à la fois : sans ce verrou, cent envois simultanés liraient tous « zéro inscription dans l'heure ».
  perform pg_advisory_xact_lock(hashtext('public.liste_attente_agences'));

  select count(*) into v_total from public.liste_attente_agences l
  where l.created_at > now() - interval '1 hour';
  if v_total >= 30 then
    raise exception 'Le formulaire reçoit beaucoup d''inscriptions en ce moment : réessayez dans une heure.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.liste_attente_agences_limiter() from public, anon, authenticated;

drop trigger if exists liste_attente_agences_limiter on public.liste_attente_agences;
create trigger liste_attente_agences_limiter
  before insert on public.liste_attente_agences
  for each row execute function public.liste_attente_agences_limiter();

-- ── 3. Le déclencheur de diagnostic, comme sur toute table de public depuis le 12/10 ─────────────────────────────────
drop trigger if exists diagnostic_artisan_lecture on public.liste_attente_agences;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.liste_attente_agences
  for each row execute function public.refuser_mutation_diagnostic_artisan();

-- ── 4. Droits et politiques ──────────────────────────────────────────────────────────────────────────────────────────
-- `revoke all` retire aussi les droits par colonne que les privilèges par défaut accordent à toute table nouvelle.
-- anon : rien. authenticated : lecture, et mise à jour des deux colonnes de suivi seulement — sous politique
-- super-administrateur (un compte connecté ordinaire ne voit aucune ligne et n'en modifie aucune). Aucune insertion pour
-- l'un ni l'autre : l'action serveur écrit avec la clé de service (décision X02).
revoke all on table public.liste_attente_agences from public, anon, authenticated;
grant select on table public.liste_attente_agences to authenticated;
grant update (statut, contactee_le) on table public.liste_attente_agences to authenticated;
grant select, insert, update, delete on table public.liste_attente_agences to service_role;

-- Modèle : demandes_devis_select_sa / demandes_devis_update_sa (20260909190000).
drop policy if exists liste_attente_agences_select_sa on public.liste_attente_agences;
create policy liste_attente_agences_select_sa on public.liste_attente_agences
  for select to authenticated using ((select public.is_super_admin()));
drop policy if exists liste_attente_agences_update_sa on public.liste_attente_agences;
create policy liste_attente_agences_update_sa on public.liste_attente_agences
  for update to authenticated using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

comment on table public.liste_attente_agences is
  'Liste d''attente des agences de gestion locative, inscrites depuis le site vitrine (créée le 20/10/2026 sur décision du dirigeant ; distincte de liste_attente du 29/09). Écrite par l''action serveur (clé de service) après le pot de miel et la validation ; lue et suivie (statut, contactee_le) par le super-administrateur. Plafond : liste_attente_agences_limiter.';

-- ── 5. Contrôle : on s'arrête plutôt que de taire un droit de trop ou de moins ───────────────────────────────────────
do $controle$
begin
  if has_any_column_privilege('anon', 'public.liste_attente_agences', 'SELECT')
     or has_any_column_privilege('anon', 'public.liste_attente_agences', 'INSERT')
     or has_any_column_privilege('anon', 'public.liste_attente_agences', 'UPDATE')
     or has_any_column_privilege('anon', 'public.liste_attente_agences', 'REFERENCES')
     or has_table_privilege('anon', 'public.liste_attente_agences', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') then
    raise exception 'liste_attente_agences : anon garde un droit';
  end if;
  if has_any_column_privilege('authenticated', 'public.liste_attente_agences', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.liste_attente_agences', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.liste_attente_agences', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') then
    raise exception 'liste_attente_agences : authenticated garde un droit autre que la lecture et la mise à jour du suivi (statut, contactee_le)';
  end if;
  if exists (select 1 from pg_attribute a
              where a.attrelid = 'public.liste_attente_agences'::regclass and a.attnum > 0 and not a.attisdropped
                and a.attname not in ('statut', 'contactee_le')
                and has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE')) then
    raise exception 'liste_attente_agences : authenticated modifie une colonne autre que statut et contactee_le';
  end if;
  if not has_table_privilege('authenticated', 'public.liste_attente_agences', 'SELECT')
     or not has_column_privilege('authenticated', 'public.liste_attente_agences', 'statut', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.liste_attente_agences', 'contactee_le', 'UPDATE') then
    raise exception 'liste_attente_agences : la lecture ou la mise à jour du suivi (statut, contactee_le) manque à authenticated (console du super-administrateur)';
  end if;
  if not (has_table_privilege('service_role', 'public.liste_attente_agences', 'SELECT')
          and has_table_privilege('service_role', 'public.liste_attente_agences', 'INSERT')
          and has_table_privilege('service_role', 'public.liste_attente_agences', 'UPDATE')
          and has_table_privilege('service_role', 'public.liste_attente_agences', 'DELETE')) then
    raise exception 'liste_attente_agences : la clé de service doit lire, insérer, modifier et supprimer';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.liste_attente_agences'::regclass) <> 2
     or not exists (select 1 from pg_policy where polrelid = 'public.liste_attente_agences'::regclass and polname = 'liste_attente_agences_select_sa' and polcmd = 'r')
     or not exists (select 1 from pg_policy where polrelid = 'public.liste_attente_agences'::regclass and polname = 'liste_attente_agences_update_sa' and polcmd = 'w') then
    raise exception 'liste_attente_agences : deux politiques attendues (liste_attente_agences_select_sa, liste_attente_agences_update_sa)';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.liste_attente_agences'::regclass and polcmd in ('a', '*')) then
    raise exception 'liste_attente_agences : aucune politique d''insertion attendue (l''insertion passe par la clé de service, décision X02)';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.liste_attente_agences'::regclass) then
    raise exception 'liste_attente_agences : la sécurité par ligne doit être activée';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.liste_attente_agences'::regclass and tgname = 'liste_attente_agences_limiter' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid = 'public.liste_attente_agences'::regclass and tgname = 'diagnostic_artisan_lecture' and not tgisinternal) then
    raise exception 'liste_attente_agences : un déclencheur manque (liste_attente_agences_limiter, diagnostic_artisan_lecture)';
  end if;
  if has_function_privilege('anon', 'public.liste_attente_agences_limiter()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.liste_attente_agences_limiter()', 'EXECUTE') then
    raise exception 'liste_attente_agences : la fonction de plafond ne doit pas être exécutable par anon ni authenticated';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'liste_attente_agences'
                  and indexname = 'liste_attente_agences_email_lower_idx' and indexdef like 'CREATE UNIQUE INDEX%')
     or not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'liste_attente_agences'
                      and indexname = 'liste_attente_agences_recent_idx') then
    raise exception 'liste_attente_agences : un index manque (liste_attente_agences_email_lower_idx unique, liste_attente_agences_recent_idx)';
  end if;
  -- `create table if not exists` ne reposerait pas une borne manquante sur une table homonyme préexistante : les dix CHECK, validées.
  if (select count(*) from pg_constraint where conrelid = 'public.liste_attente_agences'::regclass and contype = 'c' and convalidated) <> 10 then
    raise exception 'liste_attente_agences : dix contraintes CHECK validées attendues';
  end if;
end $controle$;

-- Convention de toute migration : les fonctions de public sont fermées à anon (liste_attente_agences_limiter comprise).
select public.fermer_fonctions_a_anon();
