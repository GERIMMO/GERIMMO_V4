-- Décision X19 (fiche SA-10, audit du 13 octobre 2026) : une limite quotidienne réglable des appels payants à l'IA, et
-- l'arrêt d'urgence consulté avant CHAQUE appel payant, gestes manuels compris.
--
-- CONSTAT (hypothèse SA-10 vérifiée dans le code le 15/10/2026). Sept chemins appellent un modèle payant (OpenAI) :
--   tâches planifiées : l'étude des actualités de la veille, la rédaction d'un post à partir d'une actualité et le visuel
--     du post. Elles consultaient l'arrêt d'urgence (clés « veille » et « marketing ») mais AUCUNE limite ;
--   gestes : l'analyse du brief et la rédaction assistée d'un article (console), la proposition de devis d'un artisan,
--     le lancement de l'atelier de corrections (console, modèle appelé par GitHub). Ni arrêt d'urgence, ni limite.
--   La seule limite était celle du compte chez le fournisseur. La tâche « territoire » n'appelle aucun modèle.
--
-- CORRECTION.
--   · ia_plafond_reglage : une seule ligne, la limite d'appels par jour de Paris (50 par défaut, de 0 à 1 000 ; 0 coupe
--     tous les appels payants), réglée par le superviseur permanent dans « Relais en mon absence ».
--   · ia_appels_jour : un compteur par jour de Paris (public.aujourdhui_paris()) : appels accordés, appels refusés.
--   · reserver_appel_ia(usage) : appelée par l'application JUSTE AVANT chaque appel payant. Elle consulte l'arrêt
--     d'urgence (supervision_arrets, clés existantes : « global », et la clé de l'usage quand il en a une), puis réserve
--     une place sous la limite. Rend 'accorde' (l'appel part, il est compté), 'arret' ou 'plafond' (il ne part pas).
--     ATOMIQUE : la place se prend par une mise à jour conditionnelle de la ligne du jour (« appels < limite ») ; deux
--     appels simultanés se rangent derrière le verrou de cette ligne et le second relit la valeur du premier : la limite
--     n'est jamais dépassée.
--   · regler_plafond_ia(limite) : réservée au superviseur permanent (double vérification), journalisée dans
--     supervision_operations. Le compteur du jour n'est pas remis à zéro.
--
--   usage              clé d'arrêt (en plus de « global »)
--   veille             veille
--   redaction_veille   marketing
--   visuel_marketing   marketing
--   article            marketing
--   brief              —
--   devis              —
--   atelier            —
--   (miroir : USAGES_IA dans app/src/lib/plafond-ia.ts ; le test tests/plafond-appels-ia-base.test.ts les compare)
--
-- Migration ADDITIVE : deux tables nouvelles, deux fonctions nouvelles ; aucune fonction existante n'est modifiée, aucune
-- ligne existante n'est touchée, aucune donnée financière. Elle se rejoue sans effet : tables « if not exists », réglage
-- posé seulement s'il manque (jamais écrasé), fonctions nouvelles en « create or replace », droits reposés à l'identique.
-- Retour arrière : app/supabase/retours-arriere/20261014730000_plafond_appels_ia.retour.sql.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

-- ── 1. Le réglage ──────────────────────────────────────────────────────────
create table if not exists public.ia_plafond_reglage (
  singleton boolean primary key default true check (singleton),
  plafond_jour integer not null default 50 check (plafond_jour between 0 and 1000),
  modifie_par uuid references public.accounts(id),
  modifie_le timestamptz not null default now()
);
comment on table public.ia_plafond_reglage is
  'Limite quotidienne des appels payants à l''IA (jour de Paris), réglée par le superviseur permanent. Décision X19 (SA-10).';
comment on column public.ia_plafond_reglage.plafond_jour is
  'Nombre d''appels payants à l''IA permis par jour de Paris : 50 par défaut, de 0 (aucun appel) à 1 000.';
-- Index couvrant de la clé étrangère (garde « chaque clé étrangère publique dispose d'un index couvrant »).
create index if not exists ia_plafond_reglage_modifie_par_idx on public.ia_plafond_reglage (modifie_par);

-- Posée seulement si elle manque : un rejeu ne ramène jamais la limite choisie au défaut.
insert into public.ia_plafond_reglage (singleton) values (true) on conflict (singleton) do nothing;

-- ── 2. Le compteur du jour ─────────────────────────────────────────────────
create table if not exists public.ia_appels_jour (
  jour date primary key,
  appels integer not null default 0 check (appels >= 0),
  refus integer not null default 0 check (refus >= 0)
);
comment on table public.ia_appels_jour is
  'Appels payants à l''IA par jour de Paris : accordés (partis, comptés même en échec) et refusés pour limite atteinte. Décision X19 (SA-10).';

-- ── 3. Droits : lecture par le superviseur permanent, écriture par les seules fonctions ci-dessous ──
do $droits$
declare n text;
begin
  foreach n in array array['ia_plafond_reglage', 'ia_appels_jour'] loop
    execute format('alter table public.%I enable row level security', n);
    execute format('drop policy if exists supervision_lecture on public.%I', n);
    execute format('create policy supervision_lecture on public.%I for select to authenticated using (public.is_permanent_super_admin())', n);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', n);
    execute format('grant select on public.%I to authenticated, service_role', n);
  end loop;
end $droits$;

-- ── 4. La réservation, juste avant chaque appel payant ─────────────────────
create or replace function public.reserver_appel_ia(p_usage text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cle text;
  v_jour date := public.aujourdhui_paris();
  v_plafond integer;
begin
  -- Le traitement (client de service) ou un superviseur doublement vérifié : un compte ordinaire épuiserait la limite
  -- de tous.
  if auth.role() is distinct from 'service_role' and public.is_super_admin() is not true then
    raise exception 'Accès réservé au traitement ou à la supervision';
  end if;
  if p_usage is null or p_usage not in ('veille', 'redaction_veille', 'visuel_marketing', 'article', 'brief', 'devis', 'atelier') then
    raise exception 'Usage de l''IA inconnu';
  end if;
  v_cle := case p_usage
             when 'veille' then 'veille'
             when 'redaction_veille' then 'marketing'
             when 'visuel_marketing' then 'marketing'
             when 'article' then 'marketing'
           end;
  -- L'arrêt d'urgence d'abord : sous arrêt, rien n'est compté.
  if exists (select 1 from public.supervision_arrets a where a.arrete and (a.cle = 'global' or a.cle = v_cle)) then
    return 'arret';
  end if;
  select r.plafond_jour into v_plafond from public.ia_plafond_reglage r where r.singleton;
  if v_plafond is null then
    -- Réglage absent : par prudence, aucun appel (l'application le dit « contrôle indisponible »).
    raise exception 'Limite des appels à l''IA non réglée';
  end if;
  insert into public.ia_appels_jour (jour) values (v_jour) on conflict (jour) do nothing;
  -- La place se prend ici, ou pas du tout : la condition est relue sous le verrou de la ligne.
  update public.ia_appels_jour set appels = appels + 1 where jour = v_jour and appels < v_plafond;
  if found then
    return 'accorde';
  end if;
  update public.ia_appels_jour set refus = refus + 1 where jour = v_jour;
  return 'plafond';
end;
$$;
comment on function public.reserver_appel_ia(text) is
  'Décision X19 (SA-10) : à appeler juste avant chaque appel payant à l''IA. Consulte l''arrêt d''urgence puis réserve une place sous la limite du jour de Paris, atomiquement. Rend accorde, arret ou plafond.';
revoke all on function public.reserver_appel_ia(text) from public, anon, authenticated, service_role;
grant execute on function public.reserver_appel_ia(text) to authenticated, service_role;

-- ── 5. Le réglage par le superviseur permanent ─────────────────────────────
create or replace function public.regler_plafond_ia(p_plafond integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_precedent integer;
begin
  if public.is_permanent_super_admin() is not true then
    raise exception 'Supervision permanente et double vérification requises';
  end if;
  if p_plafond is null or p_plafond < 0 or p_plafond > 1000 then
    raise exception 'Indiquez une limite de 0 à 1 000 appels par jour';
  end if;
  select r.plafond_jour into v_precedent from public.ia_plafond_reglage r where r.singleton for update;
  insert into public.ia_plafond_reglage (singleton, plafond_jour, modifie_par, modifie_le)
  values (true, p_plafond, auth.uid(), now())
  on conflict (singleton) do update
    set plafond_jour = excluded.plafond_jour, modifie_par = excluded.modifie_par, modifie_le = excluded.modifie_le;
  insert into public.supervision_operations (objet, action, auteur, details)
  values (null, 'plafond_ia', auth.uid(), jsonb_build_object('plafond', p_plafond, 'precedent', v_precedent));
end;
$$;
comment on function public.regler_plafond_ia(integer) is
  'Décision X19 (SA-10) : le superviseur permanent (double vérification) règle la limite quotidienne des appels payants à l''IA (0 à 1 000). Journalisé dans supervision_operations.';
revoke all on function public.regler_plafond_ia(integer) from public, anon, authenticated, service_role;
grant execute on function public.regler_plafond_ia(integer) to authenticated;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();
