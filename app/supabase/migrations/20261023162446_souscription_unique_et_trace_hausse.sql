-- Facturation, audit du 23/10/2026 : défauts A01 et A02 (P1).
--
-- A01 — DOUBLE ABONNEMENT. Deux demandes de souscription quasi simultanées (deux onglets) passaient toutes deux le
-- contrôle « abonnement ou page de paiement déjà ouverts » (verifierAucuneSouscriptionVivante, src/lib/stripe.ts) : il
-- LIT l'existant chez Stripe avant de créer la page, sans rien réserver. Chacune ouvrait une page Stripe utilisable.
-- Ce qui est posé :
--   · la table public.intentions_souscription : UNE intention « en_cours » par organisation, imposée par l'index unique
--     partiel intentions_souscription_une_en_cours ; chaque intention garde sa page Stripe (identifiant, adresse), sa
--     durée (expire_le = expiration de la page) et, une fois close, son motif (expiree, abandonnee, remplacee, aboutie,
--     echec) : l'historique des tentatives reste lisible ;
--   · intention_souscription_reserver : sous verrou consultatif par organisation, clôt l'intention expirée (ou dont la
--     page n'a pas été posée dans le délai de préparation), puis rend l'intention en cours (reprise = vrai) ou en crée
--     une. Le code partage alors la même page (clé d'idempotence Stripe « souscription:<intention> ») ;
--   · intention_souscription_poser : enregistre la page de l'intention, seulement si elle est encore en cours et non
--     expirée (une demande attardée ne peut pas rattacher sa page à une intention reprise) ;
--   · intention_souscription_terminer : clôt l'intention (page remplacée, souscription aboutie, échec, page expirée).
--   La détection de doublon après paiement du webhook (`[stripe webhook][double-souscription]`) reste le filet.
--
-- A02 — HAUSSE REFUSÉE. L'échéancier Stripe (baisse ou périodicité programmée) était libéré avant la hausse et restait
-- retiré si la carte était refusée, avec « rien n'a été modifié » à l'écran. Le code le recrée désormais à l'identique ;
-- s'il ne le peut pas, il marque l'échéance à recalculer (abonnement_changements_a_recalculer, déjà existante) et trace
-- les étapes : abonnement_hausse_tracer écrit UNE ligne d'audit (action abonnement_hausse_non_appliquee) avec l'issue et
-- les étapes externes (nom d'étape, résultat, identifiant Stripe, message d'erreur court : ni carte ni coordonnée).
--
-- LECTURE SEULE DES COMPTES SUSPENDUS. Comme `abonnements` et `abonnement_evenements`, la nouvelle table est une table
-- d'abonnement : c'est par elle qu'un compte gelé (essai échu, impayé) se rouvre. La garde `abonnement_<table>` y
-- refuserait toute écriture sans compte identifié (la clé de service) : la souscription deviendrait impossible pour
-- ceux qui doivent souscrire. Elle est donc ajoutée à la liste « jamais gardées » de poser_gardes_abonnement()
-- (remplacement à compte exact, qui accepte la forme déjà convertie et s'arrête en nommant la fonction sinon) ; le test
-- tests/abonnement-lecture-seule.test.ts la nomme dans la même liste.
--
-- Droits : RLS activée, AUCUN droit pour anon ni authenticated (table et fonctions) ; clé de service seulement (les
-- actions serveur appellent après la vérification des droits du responsable par mon_client_stripe). Aucune donnée
-- existante lue ni réécrite. Rejouable. Retour : supabase/retours-arriere/20261023162446_souscription_unique_et_trace_hausse.retour.sql.

do $verrou$ begin perform set_config('lock_timeout', '10s', true); end $verrou$;

-- ── 1. La table des intentions de souscription ───────────────────────────────────────────────────────────────────────
create table if not exists public.intentions_souscription (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  empreinte text not null,
  statut text not null default 'en_cours',
  stripe_session_id text,
  url text,
  cree_le timestamptz not null default date_trunc('second', clock_timestamp()),
  expire_le timestamptz not null,
  close_le timestamptz,
  motif text,
  constraint intentions_souscription_empreinte_format check (empreinte ~ '^[0-9a-f]{64}$'),
  constraint intentions_souscription_statut_check check (statut in ('en_cours', 'terminee')),
  constraint intentions_souscription_motif_check check (
    motif is null or motif in ('expiree', 'abandonnee', 'remplacee', 'aboutie', 'echec')
  ),
  constraint intentions_souscription_cloture check ((statut = 'terminee') = (close_le is not null and motif is not null)),
  constraint intentions_souscription_session_format check (
    stripe_session_id is null or stripe_session_id ~ '^cs_[A-Za-z0-9_]{1,250}$'
  ),
  constraint intentions_souscription_url_format check (
    url is null or (url ~ '^https://[^[:space:][:cntrl:]]+$' and length(url) <= 2048)
  ),
  constraint intentions_souscription_page_complete check ((stripe_session_id is null) = (url is null)),
  constraint intentions_souscription_duree check (expire_le > cree_le and expire_le <= cree_le + interval '24 hours')
);

alter table public.intentions_souscription enable row level security;

-- UNE intention en cours par organisation : la garantie, même si un appel passait sans le verrou.
create unique index if not exists intentions_souscription_une_en_cours
  on public.intentions_souscription (organization_id) where statut = 'en_cours';
create index if not exists intentions_souscription_historique
  on public.intentions_souscription (organization_id, cree_le desc);

-- Comme toute table de public depuis le 12/10 : la session de diagnostic artisan ne la modifie pas.
drop trigger if exists diagnostic_artisan_lecture on public.intentions_souscription;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.intentions_souscription
  for each row execute function public.refuser_mutation_diagnostic_artisan();
-- Rattrapage d'un rejeu après retour : une garde de lecture seule posée entre-temps est retirée (voir l'en-tête).
drop trigger if exists abonnement_intentions_souscription on public.intentions_souscription;

revoke all on table public.intentions_souscription from public, anon, authenticated;
grant select, insert, update, delete on table public.intentions_souscription to service_role;

comment on table public.intentions_souscription is
  'Défaut A01 (audit du 23/10/2026) : une seule intention de souscription en cours par organisation, et sa page de paiement Stripe. Écrite par les fonctions intention_souscription_* (clé de service). Aucune donnée bancaire.';

-- ── 2. Réserver ──────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.intention_souscription_reserver(
  p_org uuid, p_empreinte text, p_duree_minutes integer, p_preparation_secondes integer default 120)
returns table (intention uuid, empreinte text, stripe_session_id text, url text,
               cree_le timestamptz, expire_le timestamptz, reprise boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.intentions_souscription;
  v_maintenant timestamptz := clock_timestamp();
begin
  if p_org is null or p_empreinte is null or p_empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Demande de souscription invalide';
  end if;
  -- Stripe accepte une expiration de 30 min à 24 h après la création de la page.
  if p_duree_minutes is null or p_duree_minutes < 31 or p_duree_minutes > 1440
     or p_preparation_secondes is null or p_preparation_secondes < 10 or p_preparation_secondes > 900 then
    raise exception 'Durée de réservation invalide';
  end if;
  -- Deux onglets de la même organisation s'attendent ici l'un l'autre.
  perform pg_catalog.pg_advisory_xact_lock(623101, pg_catalog.hashtext(p_org::text));
  -- La place se libère d'elle-même : page expirée, ou préparation interrompue (aucune page posée à temps).
  update public.intentions_souscription i
     set statut = 'terminee', close_le = v_maintenant,
         motif = case when i.expire_le <= v_maintenant then 'expiree' else 'abandonnee' end
   where i.organization_id = p_org and i.statut = 'en_cours'
     and (i.expire_le <= v_maintenant
          or (i.stripe_session_id is null
              and i.cree_le <= v_maintenant - make_interval(secs => p_preparation_secondes)));
  select * into v from public.intentions_souscription i where i.organization_id = p_org and i.statut = 'en_cours';
  if found then
    return query select v.id, v.empreinte, v.stripe_session_id, v.url, v.cree_le, v.expire_le, true;
    return;
  end if;
  insert into public.intentions_souscription (organization_id, empreinte, cree_le, expire_le)
  values (p_org, p_empreinte, date_trunc('second', v_maintenant),
          date_trunc('second', v_maintenant) + make_interval(mins => p_duree_minutes))
  returning * into v;
  return query select v.id, v.empreinte, v.stripe_session_id, v.url, v.cree_le, v.expire_le, false;
end;
$$;

-- ── 3. Poser la page ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.intention_souscription_poser(p_org uuid, p_intention uuid, p_session text, p_url text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if p_session is null or p_session !~ '^cs_[A-Za-z0-9_]{1,250}$'
     or p_url is null or p_url !~ '^https://[^[:space:][:cntrl:]]+$' or length(p_url) > 2048 then
    raise exception 'Page de paiement invalide';
  end if;
  update public.intentions_souscription i
     set stripe_session_id = p_session, url = p_url
   where i.id = p_intention and i.organization_id = p_org and i.statut = 'en_cours'
     and i.expire_le > clock_timestamp()
     and (i.stripe_session_id is null or i.stripe_session_id = p_session);
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

-- ── 4. Clore ─────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.intention_souscription_terminer(p_org uuid, p_intention uuid, p_motif text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if p_motif is null or p_motif not in ('expiree', 'remplacee', 'aboutie', 'echec') then
    raise exception 'Motif de fin invalide';
  end if;
  -- « echec » vient de la demande qui a pris la réservation et n'a pas obtenu de page : si un autre onglet, qui la
  -- partageait, a entre-temps posé la page, elle reste en cours (le client la tient peut-être déjà).
  update public.intentions_souscription i
     set statut = 'terminee', motif = p_motif, close_le = clock_timestamp()
   where i.id = p_intention and i.organization_id = p_org and i.statut = 'en_cours'
     and (p_motif <> 'echec' or i.stripe_session_id is null);
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

-- ── 5. A02 : la trace d'une hausse refusée qui a touché à l'échéancier ───────────────────────────────────────────────
create or replace function public.abonnement_hausse_tracer(p_org uuid, p_issue text, p_etapes jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare e jsonb;
begin
  if p_org is null or p_issue is null
     or p_issue not in ('echeancier_restaure', 'echeancier_a_reprogrammer', 'hausse_incertaine') then
    raise exception 'Issue de hausse invalide';
  end if;
  if p_etapes is null or jsonb_typeof(p_etapes) <> 'array' or jsonb_array_length(p_etapes) > 20
     or length(p_etapes::text) > 8000 then
    raise exception 'Étapes de hausse invalides';
  end if;
  for e in select * from jsonb_array_elements(p_etapes) loop
    if jsonb_typeof(e) <> 'object' or (e - array['etape', 'ok', 'objet', 'erreur']) <> '{}'::jsonb
       or coalesce(e->>'etape', '') not in ('lecture_souscription', 'preparation_lignes', 'lecture_echeancier',
            'liberation_echeancier', 'mise_a_jour', 'relecture_souscription', 'recreation_echeancier',
            'reprogrammation_echeancier')
       or jsonb_typeof(e->'ok') is distinct from 'boolean'
       or (e ? 'objet' and coalesce(e->>'objet', '') !~ '^(sub|sub_sched)_[A-Za-z0-9_]{1,200}$')
       or (e ? 'erreur' and (jsonb_typeof(e->'erreur') <> 'string' or length(e->>'erreur') > 200)) then
      raise exception 'Étape de hausse invalide';
    end if;
  end loop;
  insert into public.audit_log (organization_id, action, details)
  values (p_org, 'abonnement_hausse_non_appliquee', jsonb_build_object('issue', p_issue, 'etapes', p_etapes));
end;
$$;

revoke all on function public.intention_souscription_reserver(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.intention_souscription_poser(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.intention_souscription_terminer(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.abonnement_hausse_tracer(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.intention_souscription_reserver(uuid, text, integer, integer) to service_role;
grant execute on function public.intention_souscription_poser(uuid, uuid, text, text) to service_role;
grant execute on function public.intention_souscription_terminer(uuid, uuid, text) to service_role;
grant execute on function public.abonnement_hausse_tracer(uuid, text, jsonb) to service_role;

-- ── 6. La table reste hors de la garde de lecture seule, comme `abonnements` ─────────────────────────────────────────
do $exclusion$
declare
  d text;
  ancien text := $a$'automation_events', 'orchestration_cases', 'orchestration_history'];$a$;
  nouveau text := $n$'automation_events', 'orchestration_cases', 'orchestration_history',
                           -- A01 (23/10/2026) : la réservation de la page de paiement d'un compte gelé.
                           'intentions_souscription'];$n$;
begin
  select pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure) into d;
  if strpos(d, $q$'intentions_souscription'$q$) = 0 then
    if (length(d) - length(replace(d, ancien, ''))) / length(ancien) <> 1 then
      raise exception 'poser_gardes_abonnement : liste « jamais gardées » inattendue (ancre A01 absente ou multiple)';
    end if;
    execute replace(d, ancien, nouveau);
  end if;
end $exclusion$;

-- ── 7. Contrôle : on s'arrête plutôt que de taire un droit de trop ou de moins ───────────────────────────────────────
do $controle$
declare f text;
begin
  if has_table_privilege('anon', 'public.intentions_souscription', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     or has_any_column_privilege('anon', 'public.intentions_souscription', 'SELECT, INSERT, UPDATE, REFERENCES')
     or has_table_privilege('authenticated', 'public.intentions_souscription', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     or has_any_column_privilege('authenticated', 'public.intentions_souscription', 'SELECT, INSERT, UPDATE, REFERENCES') then
    raise exception 'intentions_souscription : anon ou authenticated garde un droit';
  end if;
  if not (has_table_privilege('service_role', 'public.intentions_souscription', 'SELECT')
          and has_table_privilege('service_role', 'public.intentions_souscription', 'INSERT')
          and has_table_privilege('service_role', 'public.intentions_souscription', 'UPDATE')) then
    raise exception 'intentions_souscription : la clé de service doit lire, insérer et modifier';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.intentions_souscription'::regclass) then
    raise exception 'intentions_souscription : la sécurité par ligne doit être activée';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'intentions_souscription'
                  and indexname = 'intentions_souscription_une_en_cours' and indexdef like 'CREATE UNIQUE INDEX%'
                  and indexdef like '%WHERE (statut = ''en_cours''::text)%') then
    raise exception 'intentions_souscription : index unique partiel intentions_souscription_une_en_cours absent';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'public.intentions_souscription'::regclass and contype = 'c' and convalidated) <> 8 then
    raise exception 'intentions_souscription : huit contraintes CHECK validées attendues';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.intentions_souscription'::regclass
                  and tgname = 'diagnostic_artisan_lecture' and not tgisinternal) then
    raise exception 'intentions_souscription : déclencheur diagnostic_artisan_lecture absent';
  end if;
  foreach f in array array['public.intention_souscription_reserver(uuid,text,integer,integer)',
                           'public.intention_souscription_poser(uuid,uuid,text,text)',
                           'public.intention_souscription_terminer(uuid,uuid,text)',
                           'public.abonnement_hausse_tracer(uuid,text,jsonb)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception '% : exécution réservée à la clé de service', f;
    end if;
  end loop;
  if strpos(pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure), $q$'intentions_souscription'$q$) = 0 then
    raise exception 'poser_gardes_abonnement : intentions_souscription absente de la liste « jamais gardées »';
  end if;
end $controle$;

select public.fermer_fonctions_a_anon();
