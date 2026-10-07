-- FENÊTRE DE VETO DU MARKETING (constat du 06/10/2026).
--
-- Depuis le 22/09, un article passait de « brouillon » à « publiee » et
-- partait sur Facebook dans la même minute, sans relecture. Désormais :
--  1. la veille à `heure_preparation_paris` (18 h), la mission prépare le post
--     du lendemain (texte + visuel) et le passe en « programmee », avec
--     l'instant exact de parution `programmee_pour` (calculé à l'heure de
--     Paris, donc juste au passage à l'heure d'hiver) ;
--  2. le superviseur est alerté (décision du point du matin + e-mail) et peut
--     publier maintenant, modifier, reporter ou refuser ;
--  3. sans geste de sa part, la mission de diffusion publie à l'instant prévu ;
--  4. `validation_obligatoire` (désactivé par défaut) impose un « valider »
--     ou « publier maintenant » explicite ;
--  5. un texte contenant encore « [[à compléter » ne peut JAMAIS être
--     programmé ni publié : contrainte sur la table, pas seulement l'écran ;
--  6. le déclencheur à la minute vient de pg_cron + pg_net (jeton généré en
--     base, jamais saisi par un humain) : Vercel ne garantit pas l'heure.
-- La veille publique se filtre sur des mots-clés modifiables par le
-- superviseur (`veille_mots_inclus` / `veille_mots_exclus`).

-- ── 1. Statuts et colonnes ────────────────────────────────────────────────
alter table public.publications drop constraint if exists publications_statut_check;
alter table public.publications add constraint publications_statut_check
  check (statut in ('proposition','brouillon','planifiee','programmee','publiee','reportee','refusee','archivee'));
alter table public.publications
  add column if not exists programmee_pour timestamptz,
  add column if not exists valide_par uuid references public.accounts(id),
  add column if not exists valide_le timestamptz,
  add column if not exists reporte_motif text check (reporte_motif is null or length(reporte_motif) <= 1000);
create index if not exists publications_programmees_idx on public.publications(programmee_pour) where statut = 'programmee';
-- Toute clé étrangère porte un index couvrant (tests/schema-performance-securite).
create index if not exists publications_valide_par_idx on public.publications(valide_par);
comment on column public.publications.programmee_pour is
  'Instant exact de parution d''un post « programmee » (heure de Paris convertie en timestamptz). Null hors programmation.';

-- Un texte à trous ne paraît jamais : ni sur le site, ni sur Facebook.
create or replace function public.publication_incomplete(p_titre text, p_chapo text, p_corps text, p_facebook text)
returns boolean language sql immutable parallel safe set search_path = '' as $$
  select position('[[à compléter' in lower(concat_ws(' ', p_titre, p_chapo, p_corps, p_facebook))) > 0
      or position('[[a compléter' in lower(concat_ws(' ', p_titre, p_chapo, p_corps, p_facebook))) > 0
      or position('[[a completer' in lower(concat_ws(' ', p_titre, p_chapo, p_corps, p_facebook))) > 0;
$$;
revoke all on function public.publication_incomplete(text, text, text, text) from public, anon;
grant execute on function public.publication_incomplete(text, text, text, text) to authenticated, service_role;
alter table public.publications drop constraint if exists publications_complete_avant_parution;
alter table public.publications add constraint publications_complete_avant_parution
  check (statut not in ('programmee', 'publiee') or not public.publication_incomplete(titre, chapo, corps, facebook_texte));

-- ── 2. Réglages ───────────────────────────────────────────────────────────
alter table public.marketing_reglages
  add column if not exists validation_obligatoire boolean not null default false,
  add column if not exists heure_preparation_paris smallint not null default 18 check (heure_preparation_paris between 0 and 23),
  add column if not exists veille_mots_inclus text[] not null default array[
    'logement','location','locatif','locative','colocation','loyer','bail','baux','locataire','propriétaire','bailleur',
    'copropriété','copropriétaire','charges locatives','charges récupérables','régularisation des charges','syndic',
    'dpe','diagnostic','amiante','plomb','termites','performance énergétique','passoire thermique','rénovation énergétique','maprimerénov',
    'décence','décent','indécent','apl','aide au logement','habitation','hlm','logement social','expulsion','trêve hivernale','impayé',
    'dépôt de garantie','état des lieux','meublé','visale','immobilier','immobilière','taxe foncière','taxe d''habitation',
    'encadrement des loyers','irl','indice de référence des loyers','zone tendue','préavis','congé','assurance habitation',
    'artisan','bâtiment','travaux','chantier','plomberie','électricité','chauffage','devis','garantie décennale','rc pro',
    'revenus fonciers','lmnp','micro-foncier','déficit foncier','plus-value immobilière','ifi','crédit immobilier','taux d''usure'
  ]::text[],
  add column if not exists veille_mots_exclus text[] not null default array[
    'décarbonation','plan de décarbonation','micro-entreprise','micro-entrepreneur','auto-entrepreneur','chiffre d''affaires',
    'salarié','cpf','formation professionnelle','carburant','vente au déballage','consommateurs','neuroatypique','allocation d''activité',
    'assiette sociale','cotisations sociales','urssaf','retraite','chômage','marchés publics','export','douane'
  ]::text[];
alter table public.marketing_reglages drop constraint if exists marketing_reglages_mots_bornes;
alter table public.marketing_reglages add constraint marketing_reglages_mots_bornes
  check (cardinality(veille_mots_inclus) between 1 and 300 and cardinality(veille_mots_exclus) <= 300);
comment on column public.marketing_reglages.validation_obligatoire is
  'Vrai : aucun post ne part sans « valider » ou « publier maintenant » du superviseur. Faux (défaut) : le post part à l''heure prévue sauf refus ou report.';

-- ── 3. L'heure de Paris, calculée en base ─────────────────────────────────
-- (jour, heure) à Paris → instant universel. 2026-10-26 09:00 Paris vaut
-- 08:00 UTC ; la veille du changement d'heure, 07:00 UTC. Rien à régler.
create or replace function public.instant_paris(p_jour date, p_heure integer)
returns timestamptz language sql stable parallel safe set search_path = '' as $$
  select (p_jour::timestamp + make_interval(hours => p_heure)) at time zone 'Europe/Paris';
$$;
revoke all on function public.instant_paris(date, integer) from public, anon;
grant execute on function public.instant_paris(date, integer) to authenticated, service_role;

-- ── 4. Programmer, décider, publier ───────────────────────────────────────
-- Réservée au traitement : passe un brouillon illustré en « programmee ».
create or replace function public.programmer_publication_marketing(p_id uuid, p_pour timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v public.publications%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'Réservé au traitement marketing'; end if;
  if p_pour is null then raise exception 'Instant de parution requis'; end if;
  select * into v from public.publications where id = p_id for update;
  if not found then return false; end if;
  if public.publication_incomplete(v.titre, v.chapo, v.corps, v.facebook_texte) then
    raise exception 'Article incomplet : des passages « à compléter » subsistent, il ne peut pas être programmé';
  end if;
  update public.publications set statut = 'programmee', programmee_pour = p_pour, valide_par = null, valide_le = null,
    reporte_motif = null, refus_motif = null
  where id = p_id and statut in ('brouillon', 'planifiee') and marketing_jour is not null
    and image_empreinte is not null and facebook_image_url is not null
    and exists (select from public.marketing_reglages where singleton and actif);
  return found;
end $$;
revoke all on function public.programmer_publication_marketing(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.programmer_publication_marketing(uuid, timestamptz) to service_role;

-- Le geste du superviseur : valider, publier maintenant, reporter, refuser.
-- Chaque geste est journalisé (audit_log + tech_log) et solde la décision du
-- point du matin qui le portait.
create or replace function public.decider_publication_marketing(p_id uuid, p_action text, p_motif text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.publications%rowtype; v_motif text := left(nullif(btrim(coalesce(p_motif, '')), ''), 1000);
begin
  if public.is_permanent_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
  if p_action not in ('valider', 'publier_maintenant', 'reporter', 'refuser') then raise exception 'Geste inconnu'; end if;
  select * into v from public.publications where id = p_id for update;
  if not found then raise exception 'Article introuvable'; end if;
  if v.statut <> 'programmee' then raise exception 'Seul un post programmé se décide ici (état actuel : %)', v.statut; end if;
  if p_action in ('reporter', 'refuser') and coalesce(length(v_motif), 0) < 3 then raise exception 'Un report ou un refus se motive'; end if;
  if p_action = 'valider' then
    update public.publications set valide_par = (select auth.uid()), valide_le = now() where id = p_id;
  elsif p_action = 'publier_maintenant' then
    update public.publications set valide_par = (select auth.uid()), valide_le = now(), programmee_pour = now() where id = p_id;
  elsif p_action = 'reporter' then
    update public.publications set statut = 'reportee', programmee_pour = null, valide_par = null, valide_le = null, reporte_motif = v_motif where id = p_id;
  else
    update public.publications set statut = 'refusee', programmee_pour = null, valide_par = null, valide_le = null, refus_motif = v_motif where id = p_id;
  end if;
  update public.decisions_du_matin set statut = 'sans_objet', decide_par = (select auth.uid()), decide_le = now(), motif = coalesce(v_motif, p_action)
   where source = 'publication' and source_id = p_id and statut = 'en_attente';
  insert into public.audit_log(account_id, action, details)
   values ((select auth.uid()), 'publication_marketing_' || p_action, jsonb_build_object('publication', p_id, 'titre', left(v.titre, 160), 'motif', v_motif, 'programmee_pour', v.programmee_pour));
  insert into public.tech_log(account_id, evenement, details)
   values ((select auth.uid()), 'decision_marketing', jsonb_build_object('publication', p_id, 'action', p_action, 'motif', v_motif));
end $$;
revoke all on function public.decider_publication_marketing(uuid, text, text) from public, anon;
grant execute on function public.decider_publication_marketing(uuid, text, text) to authenticated;

-- Les posts dont l'heure est venue (lecture du traitement).
create or replace function public.publications_marketing_echues()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.publications p
   where p.statut = 'programmee' and p.programmee_pour <= now()
     and (select auth.role()) = 'service_role'
   order by p.programmee_pour;
$$;
revoke all on function public.publications_marketing_echues() from public, anon, authenticated;
grant execute on function public.publications_marketing_echues() to service_role;

-- La parution automatique ne concerne plus que les posts programmés et échus.
-- `p_manuel` : « publier maintenant » du superviseur, qui vaut même quand la
-- diffusion automatique est en pause.
drop function if exists public.publier_article_automatique(uuid);
create function public.publier_article_automatique(p_id uuid, p_manuel boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'Réservé au traitement marketing'; end if;
  update public.publications p set statut = 'publiee', publie_le = coalesce(publie_le, now())
   where p.id = p_id and p.statut = 'programmee' and p.programmee_pour <= now()
     and p.marketing_jour is not null and p.image_empreinte is not null and p.facebook_image_url is not null
     and not public.publication_incomplete(p.titre, p.chapo, p.corps, p.facebook_texte)
     and exists (select from public.marketing_reglages r where r.singleton and r.actif and r.diffusion_version = 1
                   and (p_manuel or r.publication_automatique)
                   and (not r.validation_obligatoire or p.valide_le is not null))
     and not exists (select from public.regulatory_watch v where v.id = p.veille_source_id and v.statut = 'ecarte');
  return found;
end $$;
revoke all on function public.publier_article_automatique(uuid, boolean) from public, anon, authenticated;
grant execute on function public.publier_article_automatique(uuid, boolean) to service_role;

-- Ce que la préparation doit produire maintenant, s'il y a lieu :
--  - la veille au soir (dès `heure_preparation_paris`) : le post du lendemain ;
--  - rattrapage le jour même, de 12 h avant à 3 h après l'heure de parution,
--    si rien n'a été préparé la veille (incident) : parution une heure après
--    la préparation, pour garder une fenêtre de veto.
-- Un brouillon encore sans visuel compte comme « à préparer » (reprise) ; un
-- post programmé, paru, reporté ou refusé ferme le créneau.
create or replace function public.cible_preparation_marketing()
returns table (jour date, rang integer, parution timestamptz, rattrapage boolean)
language sql stable security definer set search_path = '' as $$
  with r as (select * from public.marketing_reglages where singleton and actif and (select auth.role()) = 'service_role'),
       j as (select (now() at time zone 'Europe/Paris')::date as aujourdhui),
       libre as (select d.jour from (values ((select aujourdhui from j)), ((select aujourdhui + 1 from j))) as d(jour)
                 where not exists (select from public.publications p where p.marketing_jour = d.jour and p.statut not in ('brouillon', 'planifiee')))
  select l.jour, array_position(r.jours_semaine, extract(isodow from l.jour)::smallint) - 1 as rang,
         case when l.jour = j.aujourdhui then greatest(public.instant_paris(l.jour, r.heure_paris), now() + interval '1 hour')
              else public.instant_paris(l.jour, r.heure_paris) end as parution,
         l.jour = j.aujourdhui as rattrapage
    from r, j, libre l
   where extract(isodow from l.jour)::smallint = any(r.jours_semaine)
     and ((l.jour = j.aujourdhui + 1 and now() >= public.instant_paris(j.aujourdhui, r.heure_preparation_paris))
       or (l.jour = j.aujourdhui and now() between public.instant_paris(l.jour, r.heure_paris) - interval '12 hours'
                                               and public.instant_paris(l.jour, r.heure_paris) + interval '3 hours'))
   order by l.jour limit 1;
$$;
revoke all on function public.cible_preparation_marketing() from public, anon, authenticated;
grant execute on function public.cible_preparation_marketing() to service_role;

create or replace function public.preparation_marketing_due()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select from public.cible_preparation_marketing());
$$;
revoke all on function public.preparation_marketing_due() from public, anon, authenticated;
grant execute on function public.preparation_marketing_due() to service_role;

-- L'adresse du superviseur permanent, pour l'e-mail de veto (traitement seul).
create or replace function public.email_superviseur_permanent()
returns text language sql stable security definer set search_path = '' as $$
  select a.email from public.memberships m join public.accounts a on a.id = m.account_id
   where m.organization_id is null and m.role = 'super_admin' and m.status = 'active'
     and (select auth.role()) = 'service_role'
   order by m.created_at limit 1;
$$;
revoke all on function public.email_superviseur_permanent() from public, anon, authenticated;
grant execute on function public.email_superviseur_permanent() to service_role;

-- ── 5. Déclencheur à la minute : pg_cron + pg_net ─────────────────────────
-- Le jeton est généré ici et lu par le serveur (service_role) pour
-- authentifier l'appel ; personne ne le saisit, personne ne le voit.
create table if not exists public.declencheur_marketing (
  singleton boolean primary key default true check (singleton),
  jeton text not null check (length(jeton) = 64),
  site_url text not null default 'https://www.gerimmo.app' check (site_url ~ '^https://[a-z0-9.-]+$'),
  actif boolean not null default true,
  dernier_appel_le timestamptz,
  modifie_le timestamptz not null default now()
);
-- 64 caractères hexadécimaux sans pgcrypto (absent du banc CI) : deux UUID aléatoires.
insert into public.declencheur_marketing(singleton, jeton)
  values (true, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) on conflict (singleton) do nothing;
alter table public.declencheur_marketing enable row level security;
revoke all on public.declencheur_marketing from public, anon, authenticated;
grant all on public.declencheur_marketing to service_role;

create or replace function public.jeton_declencheur_marketing()
returns text language sql stable security definer set search_path = '' as $$
  select jeton from public.declencheur_marketing where singleton and (select auth.role()) = 'service_role';
$$;
revoke all on function public.jeton_declencheur_marketing() from public, anon, authenticated;
grant execute on function public.jeton_declencheur_marketing() to service_role;

-- Appelée par pg_cron toutes les cinq minutes : n'émet une requête HTTP que
-- s'il y a quelque chose à faire (un post échu, ou la préparation du soir).
create or replace function public.declencher_marketing()
returns void language plpgsql security definer set search_path = '' as $$
declare d public.declencheur_marketing%rowtype; v_du boolean;
begin
  select * into d from public.declencheur_marketing where singleton;
  if not found or not d.actif then return; end if;
  select exists (select from public.publications p where p.statut = 'programmee' and p.programmee_pour <= now())
      or public.preparation_marketing_due() into v_du;
  if not v_du then return; end if;
  if not exists (select from pg_catalog.pg_extension where extname = 'pg_net') then return; end if;
  -- Pas plus d'un appel toutes les quatre minutes : l'appel précédent peut
  -- encore tourner (préparation du visuel, jusqu'à trois minutes).
  if d.dernier_appel_le is not null and d.dernier_appel_le > now() - interval '4 minutes' then return; end if;
  update public.declencheur_marketing set dernier_appel_le = now() where singleton;
  perform net.http_get(
    url := d.site_url || '/api/cron/equipes?mission=marketing',
    headers := jsonb_build_object('authorization', 'Bearer ' || d.jeton),
    timeout_milliseconds := 15000);
end $$;
revoke all on function public.declencher_marketing() from public, anon, authenticated;

do $$
begin
  if exists (select from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net';
  end if;
end $$;
select cron.schedule('marketing-declencheur', '*/5 5-19 * * *', $$select public.declencher_marketing()$$);

-- ── 6. Garde-fous habituels ───────────────────────────────────────────────
select public.fermer_fonctions_a_anon();
