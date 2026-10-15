-- D46-B, suite (décision du dirigeant du 15/10/2026, « envoi immédiat pour les urgences ») — LE PASSAGE FRÉQUENT.
--
-- LE CONSTAT DES RELECTEURS. L'e-mail immédiat (20261014811000) part juste après le passage qui POSE une urgence. Or une
-- urgence n'est constatée (`traiter_vacances`) qu'au passage d'une mission, et toutes les tâches Vercel de vercel.json
-- tournent une fois par jour, le matin (le plan Vercel ne permet vraisemblablement pas mieux) : un événement de
-- l'après-midi n'était constaté, et son e-mail parti, qu'au passage du lendemain matin, jusqu'à environ 18 h plus tard.
--
-- LA CORRECTION, sur le modèle de la parution marketing (20261007100000 : pg_cron + pg_net + jeton généré en base) :
--   1. `declencheur_relais_urgences` : le jeton (64 caractères hexadécimaux, généré ici, jamais saisi, jamais affiché),
--      l'adresse du site (reprise de `declencheur_marketing`), l'interrupteur, l'heure du dernier appel de pg_cron et
--      celle du dernier passage reçu par le serveur.
--   2. `declencher_relais_urgences()` : appelée par pg_cron toutes les 10 minutes, jour et nuit (tâche `relais-urgences`,
--      « */10 * * * * »). Elle appelle par pg_net la route /api/cron/relais?mode=urgences avec ce jeton. Elle ne lit AUCUN
--      arrêt d'urgence (règle du lot : l'alerte au dirigeant n'est pas coupée par l'arrêt, qui fait partie de ce qu'elle
--      signale). Sans pg_net, ou interrupteur coupé, elle ne fait rien et ne lève rien : l'e-mail de 5 h reste le filet.
--   3. La route (serveur, lib/relais-urgences-envoi.ts) ne fait que deux choses : `traiter_vacances()` (constater), puis
--      vider la file de l'e-mail immédiat. File vide : aucun appel au service d'e-mail. Elle consigne son passage
--      (`consigner_passage_urgences_relais`). Délai réel maximal entre l'événement et l'e-mail, en marche normale :
--      10 minutes (l'écart entre deux passages) plus le passage lui-même (moins d'une minute), soit 11 minutes.
--   4. LE RECENSEMENT. `supervision_taches_arret` dit « quelle clé d'arrêt arrête quelle tâche » et son prédicat
--      `tache_planifiee_autorisee` y lit que l'arrêt « global » arrête TOUTES ses tâches : y inscrire ce passage dirait
--      que l'arrêt le coupe. Il est recensé à part, dans `supervision_taches_hors_arret` (tâche, motif) : les tâches
--      pg_cron que l'arrêt ne couvre pas, à dessein. Les deux tables ensemble recensent toutes les tâches pg_cron
--      (tests/arret-taches-planifiees.test.ts) ; il y en a désormais dix.
--   5. LA SENTINELLE de 5 h (`sentinelle_relais`, 20261014810000) attend aussi les tâches de ce recensement : retirée de
--      pg_cron, celle-ci est signalée « plus programmée » ; en échec ou pas passée à l'heure, comme les autres. Et parce
--      que pg_net n'attend pas la réponse du serveur, être passée à l'heure ne suffit pas : sans passage reçu par le
--      serveur depuis 30 minutes (trois passages manqués), elle est signalée « sans passage ».
--
-- TROIS PETITES CORRECTIONS DE LA RELECTURE (même lot) :
--   6. une clé saisie à la main qui imite une clé du système (« responsable_non_habilite », « passage:… », « tache:… »)
--      ne change plus le texte de l'e-mail : seule une alerte posée pendant `traiter_vacances` (lu dans la pile d'appel,
--      `urgence_constatee_par_le_relais`) garde la nature de sa clé ; toute autre est « signalée à la main » ;
--   7. le rappel de 5 h (`urgences_relais_recentes`) ne présente plus « en cours d'envoi » un e-mail immédiat en échec
--      (envoi à reprendre, ou passe coupée depuis plus de 10 minutes) : il dit « en échec, nouvel essai » ; une alerte
--      hors file dont la clé imite celle du système n'y reçoit pas de nature : « une urgence du relais », sans plus ;
--   8. un envoi resté sans urgence (ses urgences ont disparu) est clos « abandonné », sans e-mail et sans destinataire
--      (`clore_envoi_urgences_vide`) : jamais consigné comme « envoyé ».
--
-- Aucune donnée existante n'est réécrite (seules les lignes de file créées APRÈS cette migration reçoivent la nature
-- corrigée). Les fonctions de 20261014810000 et 20261014811000 sont modifiées EN RELISANT leur définition en vigueur
-- (pg_get_functiondef), par blocs balisés « >> » / « << », sur le modèle de 20261013120000 : la marque est cherchée
-- d'abord (rejeu sans effet), puis l'ancre, exigée exactement une fois (sinon la migration s'arrête, rien ne subsiste).
-- Rejouable : tables `if not exists`, lignes `on conflict do nothing`, politiques retirées puis reposées, fonctions
-- `create or replace`, `cron.schedule` sous un nom connu (mise à jour, jamais de doublon).
-- Retour arrière : app/supabase/retours-arriere/20261014812000_relais_urgences_passage_frequent.retour.sql.

-- ── 1. Le recensement des tâches que l'arrêt ne couvre pas ─────────────────────────────────────────────────────────
create table if not exists public.supervision_taches_hors_arret (
  tache text primary key check (length(tache) between 3 and 80),
  motif text not null check (length(motif) between 10 and 500)
);
comment on table public.supervision_taches_hors_arret is
  'Les tâches pg_cron que l''arrêt d''urgence ne couvre PAS, à dessein, et pourquoi. Avec supervision_taches_arret, recense toutes les tâches pg_cron (la sentinelle du relais les attend toutes).';
insert into public.supervision_taches_hors_arret (tache, motif) values
  ('relais-urgences', 'Passage des urgences du relais (D46-B) : alerte au dirigeant, sans effet sur les utilisateurs ; l''arrêt d''urgence fait partie de ce qu''elle signale.')
on conflict (tache) do nothing;

alter table public.supervision_taches_hors_arret enable row level security;
drop policy if exists supervision_lecture on public.supervision_taches_hors_arret;
create policy supervision_lecture on public.supervision_taches_hors_arret
  for select to authenticated using (public.is_permanent_super_admin());
-- Écrite par cette migration seulement, comme supervision_taches_arret.
revoke all on public.supervision_taches_hors_arret from public, anon, authenticated, service_role;
grant select on public.supervision_taches_hors_arret to authenticated, service_role;

-- ── 2. Le déclencheur et son jeton ──────────────────────────────────────────────────────────────────────────────────
create table if not exists public.declencheur_relais_urgences (
  singleton boolean primary key default true check (singleton),
  jeton text not null check (jeton ~ '^[0-9a-f]{64}$'),
  site_url text not null default 'https://www.gerimmo.app' check (site_url ~ '^https://[a-z0-9.-]+$'),
  actif boolean not null default true,
  dernier_appel_le timestamptz,
  dernier_passage_le timestamptz,
  modifie_le timestamptz not null default now()
);
comment on table public.declencheur_relais_urgences is
  'Le passage des urgences du relais (D46-B) : jeton généré en base (jamais saisi ni affiché), adresse du site, interrupteur, dernier appel de pg_cron, dernier passage reçu par le serveur.';
-- 64 caractères hexadécimaux sans pgcrypto (absent du banc CI) : deux UUID aléatoires, comme le jeton du marketing (distinct).
-- L'adresse du site est celle du déclencheur marketing, qui appelle déjà le même site.
insert into public.declencheur_relais_urgences (singleton, jeton, site_url)
  select true, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
         coalesce((select m.site_url from public.declencheur_marketing m where m.singleton), 'https://www.gerimmo.app')
on conflict (singleton) do nothing;

alter table public.declencheur_relais_urgences enable row level security;
-- Aucun rôle ne lit ni n'écrit la table : seules les fonctions ci-dessous (le jeton ne sort que vers le traitement).
revoke all on public.declencheur_relais_urgences from public, anon, authenticated, service_role;

-- Le jeton, pour la route du serveur (client de service seulement).
create or replace function public.jeton_declencheur_relais_urgences()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.jeton from public.declencheur_relais_urgences d where d.singleton and (select auth.role()) = 'service_role';
$$;
comment on function public.jeton_declencheur_relais_urgences() is
  'Le jeton du passage des urgences du relais, pour la route /api/cron/relais?mode=urgences. Traitement seulement.';
revoke all on function public.jeton_declencheur_relais_urgences() from public, anon, authenticated;
grant execute on function public.jeton_declencheur_relais_urgences() to service_role;

-- Le passage reçu par le serveur (lu par la sentinelle : pg_net n'attend pas la réponse).
create or replace function public.consigner_passage_urgences_relais()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement';
  end if;
  update public.declencheur_relais_urgences set dernier_passage_le = now() where singleton;
end;
$$;
comment on function public.consigner_passage_urgences_relais() is
  'Consigne le dernier passage des urgences du relais reçu par le serveur (après le constat). Traitement seulement.';
revoke all on function public.consigner_passage_urgences_relais() from public, anon, authenticated;
grant execute on function public.consigner_passage_urgences_relais() to service_role;

-- Appelée par pg_cron toutes les 10 minutes. AUCUN contrôle d'arrêt d'urgence, à dessein (voir l'en-tête).
create or replace function public.declencher_relais_urgences()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d public.declencheur_relais_urgences;
begin
  select * into d from public.declencheur_relais_urgences where singleton;
  if not found or not d.actif then
    return;
  end if;
  -- Sans pg_net, rien à appeler : l'e-mail de 5 h et les passages des missions restent le filet.
  if not exists (select from pg_catalog.pg_extension where extname = 'pg_net') then
    return;
  end if;
  -- Pas deux appels à moins de 4 minutes (un lancement à la main en plus de pg_cron) ; la file est de toute façon
  -- protégée par son verrou : deux passages qui se chevauchent n'envoient jamais deux fois la même urgence.
  if d.dernier_appel_le is not null and d.dernier_appel_le > now() - interval '4 minutes' then
    return;
  end if;
  update public.declencheur_relais_urgences set dernier_appel_le = now() where singleton;
  perform net.http_get(
    url := d.site_url || '/api/cron/relais?mode=urgences',
    headers := jsonb_build_object('authorization', 'Bearer ' || d.jeton),
    timeout_milliseconds := 30000);
end;
$$;
comment on function public.declencher_relais_urgences() is
  'Tâche pg_cron « relais-urgences » (toutes les 10 minutes) : appelle par pg_net le passage des urgences du relais. Ne lit aucun arrêt d''urgence (alerte au dirigeant).';
revoke all on function public.declencher_relais_urgences() from public, anon, authenticated, service_role;

do $relais$
begin
  if exists (select from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net';
  end if;
end $relais$;

-- ── 3. La pile d'appel : une urgence constatée par le relais, ou signalée à la main ─────────────────────────────────
-- Vrai seulement quand `traiter_vacances` est dans la pile : c'est le seul appelant de `signaler_urgence_vacances` qui
-- écrit les clés du système. La console appelle `signaler_urgence_vacances` directement, avec une clé libre.
create or replace function public.urgence_constatee_par_le_relais()
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_pile text;
begin
  get diagnostics v_pile = pg_context;
  return coalesce(v_pile, '') ~ '(^|\n)PL/pgSQL function (public\.)?traiter_vacances\(\) line ';
end;
$$;
comment on function public.urgence_constatee_par_le_relais() is
  'Interne au relais : vrai si l''appel en cours vient de traiter_vacances (pile d''appel). Fermée à tous les rôles.';
revoke all on function public.urgence_constatee_par_le_relais() from public, anon, authenticated, service_role;

-- Clé imitée (6) : la ligne de file d'une alerte qui ne vient pas de traiter_vacances est un signalement manuel.
do $correctif$
declare
  v_def text;
  v_ancre text := E'    on conflict (alerte_id) do nothing;\n';
begin
  select pg_get_functiondef('public.relais_urgence_a_envoyer()'::regprocedure) into v_def;
  if position('-- >> Relais 15/10 (clé imitée)' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Relais 15/10 (relais_urgence_a_envoyer) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, v_ancre || $bloc$    -- >> Relais 15/10 (clé imitée)
    -- Une clé saisie à la main qui imite une clé du système ne change pas le texte de l'e-mail : seule une alerte posée
    -- pendant traiter_vacances garde la nature de sa clé ; toute autre est un signalement fait à la main.
    if not public.urgence_constatee_par_le_relais() then
      update public.relais_urgences set nature = 'signalement_manuel'
       where alerte_id = new.id and nature <> 'signalement_manuel';
    end if;
    -- << Relais 15/10 (clé imitée)
$bloc$);
  execute v_def;
end $correctif$;
revoke all on function public.relais_urgence_a_envoyer() from public, anon, authenticated, service_role;

-- ── 4. Le rappel de 5 h dit vrai (7) ────────────────────────────────────────────────────────────────────────────────
do $correctif$
declare
  v_def text;
  v_ancre text := E'  return jsonb_build_object(''urgences'', v_liste, ''total'', v_total);\n';
begin
  select pg_get_functiondef('public.urgences_relais_recentes()'::regprocedure) into v_def;
  if position('-- >> Relais 15/10 (rappel exact)' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Relais 15/10 (urgences_relais_recentes) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $bloc$  -- >> Relais 15/10 (rappel exact)
  -- La nature est celle de la file (clé imitée : « signalée à la main ») ; hors file, une clé qui ressemble à celle du
  -- système ne suffit pas à l'affirmer : « inconnue » (« une urgence du relais »). Un e-mail immédiat dont l'envoi est à
  -- reprendre (échec pour au moins une adresse) ou coupé depuis plus de 10 minutes n'est jamais dit « en cours ».
  select coalesce(jsonb_agg(
           case
             when u.alerte_id is null then
               e.v || jsonb_build_object('nature', case when e.v->>'nature' = 'signalement_manuel' then 'signalement_manuel' else 'inconnue' end)
             else
               e.v || jsonb_build_object(
                 'nature', u.nature,
                 'email', case
                            when u.statut = 'en_envoi'
                                 and (env.statut = 'a_reprendre'
                                      or (env.statut = 'en_cours' and env.essaye_le < now() - interval '10 minutes'))
                              then 'echec_reprise'
                            else e.v->>'email'
                          end)
           end order by e.n), '[]'::jsonb)
    into v_liste
    from jsonb_array_elements(v_liste) with ordinality as e(v, n)
    left join public.relais_urgences u on u.alerte_id = (e.v->>'alerte')::uuid
    left join public.relais_urgences_envois env on env.id = u.envoi_id;
  -- << Relais 15/10 (rappel exact)
$bloc$ || v_ancre);
  execute v_def;
end $correctif$;
revoke all on function public.urgences_relais_recentes() from public, anon, authenticated;
grant execute on function public.urgences_relais_recentes() to service_role;

-- ── 5. Un envoi sans urgence n'est jamais « envoyé » (8) ────────────────────────────────────────────────────────────
create or replace function public.clore_envoi_urgences_vide(p_envoi uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_envoi public.relais_urgences_envois;
begin
  if (select auth.role()) is distinct from 'service_role' and public.is_permanent_super_admin() is not true then
    raise exception 'Accès refusé';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('relais_urgences', 0));
  select * into v_envoi from public.relais_urgences_envois where id = p_envoi and statut = 'en_cours' for update;
  if not found then
    return jsonb_build_object('termine', false);
  end if;
  -- Il porte encore des urgences : ce n'est pas un envoi vide (il sera repris, puis abandonné et rappelé à 5 h).
  if exists (select 1 from public.relais_urgences where envoi_id = p_envoi) then
    return jsonb_build_object('termine', false, 'motif', 'urgences');
  end if;
  update public.relais_urgences_envois
     set statut = 'abandonne', urgences = 0, destinataires = 0, envoyes = 0, termine_le = now()
   where id = p_envoi;
  return jsonb_build_object('termine', true, 'statut', 'abandonne');
end;
$$;
comment on function public.clore_envoi_urgences_vide(uuid) is
  'Clôt sans e-mail un envoi immédiat resté sans urgence (« abandonné », zéro destinataire) : jamais « envoyé ». Traitement ou superviseur permanent.';
revoke all on function public.clore_envoi_urgences_vide(uuid) from public, anon, authenticated;
grant execute on function public.clore_envoi_urgences_vide(uuid) to authenticated, service_role;

-- ── 6. La sentinelle attend ce passage et le juge à son passage reçu (5) ────────────────────────────────────────────
do $correctif$
declare
  v_def text;
  v_ancre_attendues text := 'public.supervision_taches_arret t) a';
  v_ancre_etat text := E'      v_taches := v_taches || jsonb_build_array(';
begin
  select pg_get_functiondef('public.sentinelle_relais()'::regprocedure) into v_def;
  if position('/* >> Relais 15/10 (tâches hors arrêt) */' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancre_attendues, ''))) <> length(v_ancre_attendues) then
    raise exception 'Relais 15/10 (sentinelle_relais) : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  if (length(v_def) - length(replace(v_def, v_ancre_etat, ''))) <> length(v_ancre_etat) then
    raise exception 'Relais 15/10 (sentinelle_relais) : définition inattendue (ancre 2 absente ou répétée)';
  end if;
  -- Les tâches attendues : celles que l'arrêt couvre, et celles qu'il ne couvre pas.
  v_def := replace(v_def, v_ancre_attendues,
    'public.supervision_taches_arret t /* >> Relais 15/10 (tâches hors arrêt) */ union select h.tache from public.supervision_taches_hors_arret h /* << Relais 15/10 (tâches hors arrêt) */) a');
  v_def := replace(v_def, v_ancre_etat, $bloc$      -- >> Relais 15/10 (passage reçu)
      -- pg_net appelle le serveur sans attendre sa réponse : passer à l'heure ne suffit pas. Sans passage reçu par le
      -- serveur depuis 30 minutes (trois passages manqués : pg_net, adresse du site ou jeton), la tâche est signalée.
      if v_etat = 'ok' and r.nom = 'relais-urgences'
         and not exists (select 1 from public.declencheur_relais_urgences d
                          where d.singleton and d.dernier_passage_le > v_maintenant - interval '30 minutes') then
        v_etat := 'sans_passage';
      end if;
      -- << Relais 15/10 (passage reçu)
$bloc$ || v_ancre_etat);
  execute v_def;
end $correctif$;
revoke all on function public.sentinelle_relais() from public, anon, authenticated;
grant execute on function public.sentinelle_relais() to service_role;

-- ── 7. La tâche pg_cron ─────────────────────────────────────────────────────────────────────────────────────────────
select cron.schedule('relais-urgences', '*/10 * * * *', $$select public.declencher_relais_urgences()$$);

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();
