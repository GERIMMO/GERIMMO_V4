-- Le parrainage : savoir qui a amené qui — la mécanique, pas l'avantage.
--
-- POURQUOI (wiki : « Expansion territoriale autonome », « Parrainage », 19/09).
-- Gerimmo n'a pas le droit de démarcher des particuliers ; pour eux, le seul
-- moteur de croissance est la recommandation — et elle ne se mesure, ni ne se
-- récompense, que si l'on sait qui a amené qui. Ce que gagnent le parrain et le
-- filleul n'est PAS décidé (montant : porteur du projet) ; cette migration ne
-- touche donc ni à l'essai ni à l'abonnement. L'avantage viendra dans sa propre
-- migration, sur cette mécanique.
--
-- CE QU'ELLE POSE.
--  · organizations.code_parrainage : huit caractères hexadécimaux en capitales,
--    engendrés à la création par un déclencheur qui boucle jusqu'à l'unicité ;
--    les organisations déjà là en reçoivent un. Un code ne dit rien de
--    l'organisation, ne se devine pas, et se dicte sans O ni I ambigus.
--  · parrainages : un parrain au plus par filleul (unique), jamais soi-même
--    (contrainte), lecture par les membres des deux organisations et la
--    supervision, écriture UNIQUEMENT par la fonction — la table n'a pas de
--    colonne organization_id (elle en lie deux), c'est la politique qui tient
--    le cloisonnement.
--  · enregistrer_parrainage(filleul, code) : réservée aux membres actifs du
--    filleul (ou à la supervision, qui ouvre les agences) ; refuse un code mal
--    formé, inconnu ou d'une organisation archivée, l'auto-parrainage, et un
--    second parrain — mais rend le même parrainage si on la rappelle avec le
--    même code (l'ouverture d'un espace peut être rejouée).

-- ------------------------------------------------------------
-- 1. Le code, sur l'organisation
-- ------------------------------------------------------------
alter table public.organizations add column if not exists code_parrainage text;
comment on column public.organizations.code_parrainage is
  'Code de parrainage (8 caractères hexadécimaux, capitales), unique, engendré à la création.';

create or replace function public.engendrer_code_parrainage()
returns text
language sql
volatile
set search_path = ''
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;
revoke execute on function public.engendrer_code_parrainage() from public, anon, authenticated;

-- Les organisations existantes : un code chacune, unique, une par une.
do $$
declare
  v_org uuid;
  v_code text;
begin
  for v_org in select id from public.organizations where code_parrainage is null loop
    loop
      v_code := public.engendrer_code_parrainage();
      exit when not exists (select 1 from public.organizations o where o.code_parrainage = v_code);
    end loop;
    update public.organizations set code_parrainage = v_code where id = v_org;
  end loop;
end $$;

alter table public.organizations alter column code_parrainage set not null;
create unique index if not exists organizations_code_parrainage_idx
  on public.organizations (code_parrainage);

create or replace function public.organizations_poser_code_parrainage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code_parrainage is null then
    loop
      new.code_parrainage := public.engendrer_code_parrainage();
      exit when not exists (
        select 1 from public.organizations o where o.code_parrainage = new.code_parrainage
      );
    end loop;
  end if;
  return new;
end $$;

-- Une fonction déclencheur ne s'appelle pas, et ne doit pas pouvoir être
-- accrochée à une table forgée par un rôle de l'application (audit du
-- 10/09) : personne d'autre que son propriétaire n'a EXECUTE dessus.
revoke execute on function public.organizations_poser_code_parrainage() from public, anon, authenticated;

drop trigger if exists organizations_code_parrainage_trg on public.organizations;
create trigger organizations_code_parrainage_trg
  before insert on public.organizations
  for each row execute function public.organizations_poser_code_parrainage();

-- ------------------------------------------------------------
-- 2. Qui a amené qui
-- ------------------------------------------------------------
create table if not exists public.parrainages (
  id uuid primary key default gen_random_uuid(),
  parrain_organization_id uuid not null references public.organizations (id),
  filleul_organization_id uuid not null unique references public.organizations (id),
  code text not null,
  created_at timestamptz not null default now(),
  constraint parrainages_pas_soi_meme check (parrain_organization_id <> filleul_organization_id)
);
comment on table public.parrainages is
  'Qui a amené qui : un parrain au plus par organisation filleule. Écrit par enregistrer_parrainage seulement.';
create index if not exists parrainages_parrain_idx on public.parrainages (parrain_organization_id);

alter table public.parrainages enable row level security;

-- Lecture : les membres du parrain, ceux du filleul, la supervision.
drop policy if exists parrainages_select on public.parrainages;
create policy parrainages_select on public.parrainages
  for select to authenticated
  using (
    public.is_super_admin()
    or parrain_organization_id in (
      select public.org_ids_avec_roles(array['admin_agence', 'agent', 'proprietaire_direct']::public.membership_role[])
    )
    or filleul_organization_id in (
      select public.org_ids_avec_roles(array['admin_agence', 'agent', 'proprietaire_direct']::public.membership_role[])
    )
  );
grant select on public.parrainages to authenticated;
revoke insert, update, delete on public.parrainages from authenticated;

-- ------------------------------------------------------------
-- 3. Le geste
-- ------------------------------------------------------------
create or replace function public.enregistrer_parrainage(p_filleul uuid, p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_parrain uuid;
  v_existant public.parrainages%rowtype;
  v_id uuid;
begin
  -- Le droit : un membre actif du filleul, ou la supervision.
  if not (
    public.is_super_admin()
    or exists (
      select 1 from public.memberships m
      where m.account_id = (select auth.uid())
        and m.organization_id = p_filleul
        and m.status = 'active'
    )
  ) then
    raise exception 'enregistrer_parrainage: reserve aux membres de l''organisation filleule';
  end if;

  if v_code !~ '^[0-9A-F]{8}$' then
    raise exception 'Code de parrainage invalide.';
  end if;

  select o.id into v_parrain
  from public.organizations o
  where o.code_parrainage = v_code and o.status <> 'archivee';
  if v_parrain is null then
    raise exception 'Code de parrainage inconnu.';
  end if;
  if v_parrain = p_filleul then
    raise exception 'Une organisation ne peut pas se parrainer elle-meme.';
  end if;

  select * into v_existant from public.parrainages where filleul_organization_id = p_filleul;
  if found then
    if v_existant.parrain_organization_id = v_parrain then
      return v_existant.id;
    end if;
    raise exception 'Cette organisation a deja un parrain.';
  end if;

  insert into public.parrainages (parrain_organization_id, filleul_organization_id, code)
  values (v_parrain, p_filleul, v_code)
  returning id into v_id;
  return v_id;
end $$;
comment on function public.enregistrer_parrainage(uuid, text) is
  'Rattache une organisation filleule a son parrain par son code. Un parrain au plus ; rappel idempotent avec le meme code.';
revoke execute on function public.enregistrer_parrainage(uuid, text) from public, anon;

-- La garde d'abonnement se repose sur toutes les tables, comme après chaque
-- migration ; parrainages n'a pas d'organization_id et n'en reçoit pas.
select public.poser_gardes_abonnement();

-- Et aucune fonction de `public` ne reste exécutable par `anon` : la fermeture
-- est rejouable, et le test de surface publique exige qu'elle close chaque
-- migration qui crée ou refait une fonction.
select public.fermer_fonctions_a_anon();
