-- D46-B, suite : l'E-MAIL IMMÉDIAT des urgences du relais (décision du dirigeant du 15/10/2026, « envoi immédiat pour
-- les urgences »). Il s'ajoute à l'e-mail quotidien de 5 h (20261014810000), qui reste en place.
--
-- CE QUI EST UNE URGENCE (relevé dans le code, rien d'inventé). Une urgence du relais est une alerte interne du mode
-- vacances, c'est-à-dire une ligne NOUVELLE de `supervision_alertes_internes`. Une seule fonction en écrit :
-- `signaler_urgence_vacances`, appelée
--   · par `traiter_vacances` : un responsable qui perd son habilitation (clé `responsable_non_habilite`), un passage
--     des équipes « à reprendre » ou « interrompu » (clé `passage:<id>`), une lecture autorisée bloquée (clé `tache:<id>`) ;
--   · par la console (« Signaler une urgence interne », geste d'un superviseur permanent, clé libre).
-- CE QUI N'EN EST PAS : l'escalade d'une alerte déjà posée (un changement de statut, pas une alerte nouvelle), les tâches
-- planifiées en échec ou absentes, l'arrêt d'urgence actif. Ils restent dans l'e-mail de 5 h.
--
-- CETTE MIGRATION pose la partie « base » ; l'envoi vit dans le serveur (src/lib/relais-urgences-envoi.ts). Il part de
-- l'endroit même où l'urgence vient d'être posée, juste après la transaction qui la pose : chaque passage de mission
-- (/api/cron/equipes, après `traiter_vacances`), le passage de 5 h (/api/cron/relais), et les deux gestes de la console
-- qui en posent (« Actualiser », « Signaler une urgence interne »). Aucune tâche pg_cron, aucune entrée Vercel ajoutée.
--   1. `relais_urgences` : la file. Une ligne « à envoyer » par alerte nouvelle, posée par un déclencheur AFTER INSERT sur
--      `supervision_alertes_internes`. Le dédoublonnage est celui de l'alerte : `signaler_urgence_vacances` n'insère rien
--      quand (plan, clé) existe déjà (« on conflict do nothing »), le déclencheur ne se déclenche donc pas. La ligne ne
--      porte que la NATURE (calculée depuis la clé ; jamais le titre, que la console laisse écrire librement) et l'heure.
--      Le déclencheur ne fait qu'une insertion ; une erreur y est rattrapée (simple avertissement) : la transaction qui pose
--      l'alerte ne peut ni échouer ni attendre à cause de l'e-mail. L'e-mail de 5 h relit les alertes elles-mêmes : une
--      urgence que la file aurait manquée y figure quand même.
--   2. `relais_urgences_envois` : un envoi = un e-mail (une fois par adresse) qui regroupe les urgences en attente. Il est
--      figé à sa création (mêmes urgences, même contenu) : sa reprise réutilise les mêmes clés d'envoi, et le fournisseur
--      ne renvoie pas ce qu'il a déjà accepté.
--   3. `prendre_urgences_relais(p_plafond)` : sous un verrou consultatif (deux appels simultanés ne prennent jamais les
--      mêmes urgences), reprend d'abord un envoi inachevé (échec, envoi partiel, ou passe coupée depuis plus de 10 minutes ;
--      trois tentatives au plus, puis l'envoi est abandonné et ses urgences restent au rappel de 5 h), sinon crée un envoi
--      avec les urgences en attente (50 au plus), SAUF si le plafond anti-rafale est atteint : 6 envois créés dans l'heure
--      glissante. Le surplus reste « à envoyer » : il part groupé dans l'envoi suivant, ou dans l'e-mail de 5 h. Jamais perdu.
--   4. `terminer_urgences_relais(...)` : écrit le résultat d'un envoi (nombres seulement).
--   5. `urgences_relais_recentes()` : pour l'e-mail de 5 h, les urgences des dernières 24 h (nature, heure, sort de leur
--      e-mail immédiat), y compris celles déjà envoyées. `urgences_relais_au_quotidien(p_alertes)` : après un e-mail de 5 h
--      parti vers toutes les adresses, les urgences qu'il a reprises alors qu'elles attendaient encore ne repartent plus
--      en e-mail immédiat.
--
-- L'ARRÊT D'URGENCE ne coupe pas cet e-mail, comme celui de 5 h (même règle, justifiée dans src/lib/relais-alerte-envoi.ts) :
-- c'est une alerte au dirigeant, sans effet sur les utilisateurs ; aucune de ces fonctions ne lit `supervision_arrets`.
--
-- Aucune donnée existante n'est touchée, aucune fonction existante n'est modifiée, aucune tâche pg_cron n'est ajoutée. Un
-- déclencheur est ajouté sur `supervision_alertes_internes` (il ne fait qu'insérer dans la file). Les alertes déjà posées
-- avant cette migration ne sont pas mises en file : elles ne font partir aucun e-mail immédiat.
-- Rejouable : tables `if not exists`, politiques retirées puis reposées, fonctions `create or replace`, déclencheur posé
-- seulement s'il est absent.
-- Retour arrière : app/supabase/retours-arriere/20261014811000_relais_urgences_immediates.retour.sql.

-- ── 1. Les envois immédiats ──────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.relais_urgences_envois (
  id uuid primary key default gen_random_uuid(),
  statut text not null default 'en_cours'
    check (statut in ('en_cours', 'a_reprendre', 'envoye', 'abandonne')),
  tentatives integer not null default 1 check (tentatives between 1 and 3),
  urgences integer not null default 0 check (urgences between 0 and 50),
  destinataires integer not null default 0 check (destinataires between 0 and 20),
  envoyes integer not null default 0 check (envoyes between 0 and 20),
  commence_le timestamptz not null default now(),
  essaye_le timestamptz not null default now(),
  termine_le timestamptz
);
comment on table public.relais_urgences_envois is
  'Les e-mails immédiats des urgences du relais (D46-B, 15/10/2026) : un envoi regroupe des urgences, figé à sa création. Nombres seulement, jamais d''adresse ni de texte. Sert au plafond anti-rafale (6 envois créés par heure glissante).';
create index if not exists relais_urgences_envois_commence_idx on public.relais_urgences_envois (commence_le);

alter table public.relais_urgences_envois enable row level security;
drop policy if exists supervision_lecture on public.relais_urgences_envois;
create policy supervision_lecture on public.relais_urgences_envois
  for select to authenticated using (public.is_permanent_super_admin());
-- Personne n'écrit directement : seules les fonctions ci-dessous.
revoke all on public.relais_urgences_envois from public, anon, authenticated, service_role;
grant select on public.relais_urgences_envois to authenticated;

-- ── 2. La file des urgences ──────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.relais_urgences (
  alerte_id uuid primary key references public.supervision_alertes_internes(id) on delete cascade,
  nature text not null
    check (nature in ('responsable_non_habilite', 'passage_a_reprendre', 'lecture_bloquee', 'signalement_manuel')),
  posee_le timestamptz not null,
  statut text not null default 'a_envoyer'
    check (statut in ('a_envoyer', 'en_envoi', 'envoyee', 'quotidien', 'non_envoyee')),
  envoi_id uuid references public.relais_urgences_envois(id),
  traitee_le timestamptz,
  constraint relais_urgences_envoi_coherent check ((statut in ('en_envoi', 'envoyee', 'non_envoyee')) = (envoi_id is not null))
);
comment on table public.relais_urgences is
  'File de l''e-mail immédiat des urgences du relais (D46-B, 15/10/2026) : une ligne par alerte interne nouvelle, posée par déclencheur. Nature et heure seulement, jamais le titre de l''alerte.';
create index if not exists relais_urgences_attente_idx on public.relais_urgences (posee_le) where statut = 'a_envoyer';
create index if not exists relais_urgences_envoi_idx on public.relais_urgences (envoi_id);

alter table public.relais_urgences enable row level security;
drop policy if exists supervision_lecture on public.relais_urgences;
create policy supervision_lecture on public.relais_urgences
  for select to authenticated using (public.is_permanent_super_admin());
revoke all on public.relais_urgences from public, anon, authenticated, service_role;
grant select on public.relais_urgences to authenticated;

-- ── 3. La nature d'une urgence, depuis sa clé (jamais depuis son titre) ──────────────────────────────────────────────
create or replace function public.nature_urgence_relais(p_cle text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p_cle = 'responsable_non_habilite' then 'responsable_non_habilite'
           when p_cle ~ '^passage:[0-9a-fA-F-]{36}$' then 'passage_a_reprendre'
           when p_cle ~ '^tache:[0-9a-fA-F-]{36}$' then 'lecture_bloquee'
           else 'signalement_manuel'
         end;
$$;
revoke all on function public.nature_urgence_relais(text) from public, anon, authenticated, service_role;

-- ── 4. Le déclencheur : une alerte nouvelle entre dans la file ──────────────────────────────────────────────────────
create or replace function public.relais_urgence_a_envoyer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Une insertion, rien d'autre : ni lecture d'adresse, ni appel extérieur. Une erreur ici ne doit pas empêcher l'alerte
  -- d'être posée : elle est rattrapée (l'e-mail de 5 h relit les alertes elles-mêmes).
  begin
    insert into public.relais_urgences(alerte_id, nature, posee_le)
    values (new.id, public.nature_urgence_relais(new.cle), new.cree_le)
    on conflict (alerte_id) do nothing;
  exception when others then
    raise warning 'Relais : une urgence n''a pas pu être mise en file d''envoi immédiat (%).', sqlstate;
  end;
  return null;
end;
$$;
revoke all on function public.relais_urgence_a_envoyer() from public, anon, authenticated, service_role;

do $relais$
begin
  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.supervision_alertes_internes'::regclass
                    and tgname = 'relais_urgence_a_envoyer' and not tgisinternal) then
    create trigger relais_urgence_a_envoyer
      after insert on public.supervision_alertes_internes
      for each row execute function public.relais_urgence_a_envoyer();
  end if;
end $relais$;

-- ── 5. Prendre un envoi ──────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.prendre_urgences_relais(p_plafond integer default 6)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_plafond integer := greatest(1, least(coalesce(p_plafond, 6), 60));
  v_envoi public.relais_urgences_envois;
  v_reprise boolean := false;
  v_attente integer;
  v_recents integer;
  v_pris integer;
  v_urgences jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' and public.is_permanent_super_admin() is not true then
    raise exception 'Accès refusé';
  end if;
  -- Deux appels simultanés (deux missions, une mission et la console) passent l'un après l'autre.
  perform pg_advisory_xact_lock(hashtextextended('relais_urgences', 0));

  -- Décision D48 : six mois pour les registres d'exécution. Une urgence qui attend encore n'est jamais effacée.
  delete from public.relais_urgences
   where statut in ('envoyee', 'quotidien', 'non_envoyee') and traitee_le < now() - interval '6 months';
  delete from public.relais_urgences_envois e
   where e.statut in ('envoye', 'abandonne') and e.commence_le < now() - interval '6 months'
     and not exists (select 1 from public.relais_urgences u where u.envoi_id = e.id);

  -- Une passe coupée trois fois : l'envoi est abandonné, ses urgences restent au rappel de l'e-mail de 5 h.
  with abandonnes as (
    update public.relais_urgences_envois
       set statut = 'abandonne', termine_le = now()
     where tentatives >= 3
       and (statut = 'a_reprendre' or (statut = 'en_cours' and essaye_le < now() - interval '10 minutes'))
    returning id
  )
  update public.relais_urgences set statut = 'non_envoyee', traitee_le = now()
   where envoi_id in (select id from abandonnes);

  -- La reprise d'abord : le même envoi, les mêmes urgences, donc les mêmes clés d'envoi.
  select * into v_envoi from public.relais_urgences_envois
   where tentatives < 3
     and (statut = 'a_reprendre' or (statut = 'en_cours' and essaye_le < now() - interval '10 minutes'))
   order by commence_le
   limit 1
   for update;
  if found then
    update public.relais_urgences_envois
       set statut = 'en_cours', tentatives = tentatives + 1, essaye_le = now(), termine_le = null
     where id = v_envoi.id
    returning * into v_envoi;
    v_reprise := true;
  else
    select count(*) into v_attente from public.relais_urgences where statut = 'a_envoyer';
    if v_attente = 0 then
      return jsonb_build_object('pris', false, 'motif', 'rien', 'en_attente', 0);
    end if;
    -- Le plafond anti-rafale : les envois CRÉÉS dans l'heure glissante (une reprise ne compte pas : elle ne fait pas
    -- partir de second message chez qui l'a déjà reçu).
    select count(*) into v_recents from public.relais_urgences_envois where commence_le > now() - interval '1 hour';
    if v_recents >= v_plafond then
      return jsonb_build_object('pris', false, 'motif', 'plafond', 'en_attente', v_attente, 'envois_dans_l_heure', v_recents);
    end if;
    insert into public.relais_urgences_envois default values returning * into v_envoi;
    update public.relais_urgences
       set statut = 'en_envoi', envoi_id = v_envoi.id
     where statut = 'a_envoyer'
       and alerte_id in (select alerte_id from public.relais_urgences where statut = 'a_envoyer'
                          order by posee_le, alerte_id limit 50);
    get diagnostics v_pris = row_count;
    update public.relais_urgences_envois set urgences = v_pris where id = v_envoi.id returning * into v_envoi;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('nature', u.nature, 'posee_le', u.posee_le) order by u.posee_le, u.alerte_id), '[]'::jsonb)
    into v_urgences
    from public.relais_urgences u
   where u.envoi_id = v_envoi.id;
  select count(*) into v_attente from public.relais_urgences where statut = 'a_envoyer';
  return jsonb_build_object(
    'pris', true, 'envoi', v_envoi.id, 'tentative', v_envoi.tentatives, 'reprise', v_reprise,
    'urgences', v_urgences, 'en_attente', v_attente
  );
end;
$$;
comment on function public.prendre_urgences_relais(integer) is
  'Prend un envoi de l''e-mail immédiat des urgences du relais : reprise d''un envoi inachevé, ou nouvel envoi des urgences en attente sous le plafond par heure glissante. Traitement ou superviseur permanent.';
revoke all on function public.prendre_urgences_relais(integer) from public, anon, authenticated;
grant execute on function public.prendre_urgences_relais(integer) to authenticated, service_role;

-- ── 6. Le résultat d'un envoi ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.terminer_urgences_relais(p_envoi uuid, p_destinataires integer, p_envoyes integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_envoi public.relais_urgences_envois;
  v_destinataires integer := greatest(0, least(coalesce(p_destinataires, 0), 20));
  v_envoyes integer := greatest(0, least(coalesce(p_envoyes, 0), 20));
  v_statut text;
begin
  if (select auth.role()) is distinct from 'service_role' and public.is_permanent_super_admin() is not true then
    raise exception 'Accès refusé';
  end if;
  select * into v_envoi from public.relais_urgences_envois where id = p_envoi and statut = 'en_cours' for update;
  if not found then
    -- Déjà clos (ou repris par un autre appel après 10 minutes) : on ne réécrit rien.
    return jsonb_build_object('termine', false);
  end if;
  v_statut := case
                when v_destinataires > 0 and v_envoyes >= v_destinataires then 'envoye'
                when v_envoi.tentatives >= 3 then 'abandonne'
                else 'a_reprendre'
              end;
  update public.relais_urgences_envois
     set statut = v_statut, destinataires = v_destinataires, envoyes = least(v_envoyes, v_destinataires), termine_le = now()
   where id = p_envoi;
  if v_statut in ('envoye', 'abandonne') then
    update public.relais_urgences
       set statut = case v_statut when 'envoye' then 'envoyee' else 'non_envoyee' end, traitee_le = now()
     where envoi_id = p_envoi;
  end if;
  return jsonb_build_object('termine', true, 'statut', v_statut);
end;
$$;
comment on function public.terminer_urgences_relais(uuid, integer, integer) is
  'Écrit le résultat d''un envoi immédiat des urgences du relais (nombres seulement). Un envoi incomplet reste à reprendre, trois tentatives au plus. Traitement ou superviseur permanent.';
revoke all on function public.terminer_urgences_relais(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.terminer_urgences_relais(uuid, integer, integer) to authenticated, service_role;

-- ── 7. Le rappel de l'e-mail de 5 h ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.urgences_relais_recentes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_liste jsonb;
  v_total integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement';
  end if;
  -- Les alertes elles-mêmes (pas la file) : une urgence que la file aurait manquée est rappelée aussi. Jamais le titre.
  select count(*) into v_total from public.supervision_alertes_internes a where a.cree_le > now() - interval '24 hours';
  select coalesce(jsonb_agg(jsonb_build_object(
           'alerte', r.id,
           'nature', public.nature_urgence_relais(r.cle),
           'posee_le', r.cree_le,
           'email', case r.statut
                      when 'envoyee' then 'envoye'
                      when 'en_envoi' then 'en_cours'
                      when 'a_envoyer' then 'en_attente'
                      when 'quotidien' then 'quotidien'
                      when 'non_envoyee' then 'echec'
                      else 'hors_file'
                    end) order by r.cree_le desc, r.id), '[]'::jsonb)
    into v_liste
    from (select a.id, a.cle, a.cree_le, u.statut
            from public.supervision_alertes_internes a
            left join public.relais_urgences u on u.alerte_id = a.id
           where a.cree_le > now() - interval '24 hours'
           order by a.cree_le desc, a.id
           limit 50) r;
  return jsonb_build_object('urgences', v_liste, 'total', v_total);
end;
$$;
comment on function public.urgences_relais_recentes() is
  'Les urgences du relais posées dans les dernières 24 h, pour le rappel de l''e-mail de 5 h : nature, heure, sort de l''e-mail immédiat (jamais le titre). Traitement seulement.';
revoke all on function public.urgences_relais_recentes() from public, anon, authenticated;
grant execute on function public.urgences_relais_recentes() to service_role;

create or replace function public.urgences_relais_au_quotidien(p_alertes uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('relais_urgences', 0));
  update public.relais_urgences
     set statut = 'quotidien', traitee_le = now()
   where alerte_id = any(coalesce(p_alertes, '{}'::uuid[])) and statut = 'a_envoyer';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.urgences_relais_au_quotidien(uuid[]) is
  'Après un e-mail de 5 h parti vers toutes les adresses : les urgences qu''il a reprises alors qu''elles attendaient leur e-mail immédiat (plafond atteint) ne repartent plus. Traitement seulement.';
revoke all on function public.urgences_relais_au_quotidien(uuid[]) from public, anon, authenticated;
grant execute on function public.urgences_relais_au_quotidien(uuid[]) to service_role;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();
