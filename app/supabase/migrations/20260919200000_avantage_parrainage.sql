-- L'AVANTAGE DU PARRAINAGE — ce que gagnent le parrain et le filleul.
--
-- La mécanique (« qui a amené qui ») est posée depuis le 19/09 ; elle ne
-- touchait volontairement ni à l'essai ni à l'abonnement, faute d'un montant
-- décidé. Le voici, et il se dit en une phrase : **un mois pour vous, un mois
-- pour lui**.
--
--  · LE FILLEUL, tout de suite : son essai passe de quatorze à TRENTE jours,
--    au moment où il entre le code. C'est la seule raison pour laquelle il
--    demandera un code à quelqu'un plutôt que de s'inscrire tout seul.
--
--  · LE PARRAIN, quand le filleul devient CLIENT PAYANT — pas à son
--    inscription. Récompenser une inscription, c'est payer des organisations
--    fictives ouvertes avec son propre code ; récompenser une conversion, non.
--    Le parrain reçoit un mois :
--      – encore en essai → trente jours d'essai de plus, appliqués aussitôt ;
--      – déjà payant → un AVOIR de son mensuel courant, porté à son solde
--        client Stripe et déduit de sa prochaine facture par la tâche
--        planifiée. « Un mois » vaut donc ce qu'il paie, sans barème à tenir.
--
-- POURQUOI UN REGISTRE PLUTÔT QU'UN SIMPLE `update`. Un avantage accordé est
-- un engagement : il faut pouvoir dire lequel, pour quel filleul, quand, et
-- s'il a été honoré. Une ligne par avantage, unique par (parrainage, nature) —
-- c'est cette unicité qui empêche de récompenser deux fois la même conversion,
-- y compris si l'organisation repasse par `active` après une suspension.

-- ------------------------------------------------------------
-- 1. Le registre
-- ------------------------------------------------------------
create table if not exists public.avantages_parrainage (
  id uuid primary key default gen_random_uuid(),
  parrainage_id uuid not null references public.parrainages (id),
  beneficiaire_organization_id uuid not null references public.organizations (id),
  nature text not null check (nature in ('essai_filleul', 'essai_parrain', 'avoir_parrain')),
  jours integer,
  montant_cents bigint,
  etat text not null default 'a_appliquer'
    check (etat in ('a_appliquer', 'applique', 'sans_objet')),
  applique_le timestamptz,
  reference_externe text,
  created_at timestamptz not null default now()
);
comment on table public.avantages_parrainage is
  'Ce que le parrainage a rapporte, a qui, et si c''est honore. Une ligne par (parrainage, nature) : c''est l''unicite qui empeche de recompenser deux fois.';

create unique index if not exists avantages_parrainage_une_fois
  on public.avantages_parrainage (parrainage_id, nature);
create index if not exists avantages_parrainage_beneficiaire_idx
  on public.avantages_parrainage (beneficiaire_organization_id);
-- La tâche planifiée ne balaie que ce qui attend : index partiel.
create index if not exists avantages_parrainage_en_attente_idx
  on public.avantages_parrainage (created_at)
  where etat = 'a_appliquer';

alter table public.avantages_parrainage enable row level security;

-- Lecture : les membres de l'organisation bénéficiaire, et la supervision.
-- Personne n'écrit ici à la main — les fonctions s'en chargent.
drop policy if exists avantages_parrainage_select on public.avantages_parrainage;
create policy avantages_parrainage_select on public.avantages_parrainage
  for select to authenticated
  using (
    public.is_super_admin()
    or beneficiaire_organization_id in (
      select public.org_ids_avec_roles(array['admin_agence', 'agent', 'proprietaire_direct']::public.membership_role[])
    )
  );
grant select on public.avantages_parrainage to authenticated;
revoke insert, update, delete on public.avantages_parrainage from authenticated;

-- ------------------------------------------------------------
-- 2. Les deux durées, en un seul endroit
-- ------------------------------------------------------------
-- Un essai ordinaire dure quatorze jours (ouverture d'organisation et
-- inscription propriétaire). Le filleul en obtient trente AU TOTAL, le parrain
-- trente EN PLUS. Les deux se disent « un mois » ; ce sont les seuls chiffres
-- du dispositif, et ils vivent ici.
create or replace function public.parrainage_jours_filleul() returns integer
  language sql immutable set search_path = '' as $$ select 30 $$;
create or replace function public.parrainage_jours_parrain() returns integer
  language sql immutable set search_path = '' as $$ select 30 $$;
revoke execute on function public.parrainage_jours_filleul() from public, anon;
revoke execute on function public.parrainage_jours_parrain() from public, anon;
grant execute on function public.parrainage_jours_filleul() to authenticated;
grant execute on function public.parrainage_jours_parrain() to authenticated;

-- ------------------------------------------------------------
-- 3. L'avantage du filleul : appliqué à l'instant du rattachement
-- ------------------------------------------------------------
create or replace function public.parrainage_avantage_filleul(p_parrainage uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filleul uuid;
  v_statut public.organization_status;
  v_essai date;
  v_cible date := current_date + public.parrainage_jours_filleul();
begin
  select p.filleul_organization_id into v_filleul
  from public.parrainages p where p.id = p_parrainage;
  if v_filleul is null then return; end if;

  select o.status, o.essai_fin into v_statut, v_essai
  from public.organizations o where o.id = v_filleul;

  -- Une organisation déjà payante (agence ouverte avec contrat signé) n'a pas
  -- d'essai à rallonger : l'avantage est sans objet, et on le DIT plutôt que
  -- de laisser croire qu'il a été accordé.
  if v_statut <> 'essai' then
    insert into public.avantages_parrainage
      (parrainage_id, beneficiaire_organization_id, nature, jours, etat, applique_le)
    values (p_parrainage, v_filleul, 'essai_filleul', 0, 'sans_objet', now())
    on conflict (parrainage_id, nature) do nothing;
    return;
  end if;

  -- `greatest` : on ne raccourcit jamais un essai déjà plus long.
  perform set_config('gerimmo.systeme', 'on', true);
  update public.organizations
     set essai_fin = greatest(coalesce(v_essai, v_cible), v_cible), updated_at = now()
   where id = v_filleul;
  perform set_config('gerimmo.systeme', '', true);

  insert into public.avantages_parrainage
    (parrainage_id, beneficiaire_organization_id, nature, jours, etat, applique_le)
  values (p_parrainage, v_filleul, 'essai_filleul',
          public.parrainage_jours_filleul(), 'applique', now())
  on conflict (parrainage_id, nature) do nothing;
end $$;
revoke execute on function public.parrainage_avantage_filleul(uuid) from public, anon, authenticated;

-- Le rattachement accorde désormais l'avantage du filleul dans la foulée :
-- même transaction, donc un code accepté et un essai non rallongé ne peuvent
-- pas coexister.
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

  perform public.parrainage_avantage_filleul(v_id);
  return v_id;
end $$;
revoke execute on function public.enregistrer_parrainage(uuid, text) from public, anon;

-- ------------------------------------------------------------
-- 4. L'avantage du parrain : à la CONVERSION du filleul
-- ------------------------------------------------------------
create or replace function public.parrainage_recompenser(p_filleul uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parrainage uuid;
  v_parrain uuid;
  v_statut public.organization_status;
  v_essai date;
  v_mensuel bigint;
begin
  select p.id, p.parrain_organization_id into v_parrainage, v_parrain
  from public.parrainages p where p.filleul_organization_id = p_filleul;
  if v_parrainage is null then return; end if;

  -- Déjà récompensé : une organisation qui repasse par `active` après une
  -- suspension ne rapporte pas un second mois.
  if exists (
    select 1 from public.avantages_parrainage a
    where a.parrainage_id = v_parrainage and a.nature in ('essai_parrain', 'avoir_parrain')
  ) then
    return;
  end if;

  select o.status, o.essai_fin into v_statut, v_essai
  from public.organizations o where o.id = v_parrain;
  if v_statut is null or v_statut = 'archivee' then return; end if;

  if v_statut = 'essai' then
    perform set_config('gerimmo.systeme', 'on', true);
    update public.organizations
       set essai_fin = greatest(coalesce(v_essai, current_date), current_date)
                       + public.parrainage_jours_parrain(),
           updated_at = now()
     where id = v_parrain;
    perform set_config('gerimmo.systeme', '', true);

    insert into public.avantages_parrainage
      (parrainage_id, beneficiaire_organization_id, nature, jours, etat, applique_le)
    values (v_parrainage, v_parrain, 'essai_parrain',
            public.parrainage_jours_parrain(), 'applique', now())
    on conflict (parrainage_id, nature) do nothing;
  else
    -- Un mois vaut ce qu'il paie : le mensuel courant, figé au moment où
    -- l'avantage est acquis. Sans abonnement chiffré, il n'y a rien à créditer
    -- et on l'inscrit comme tel plutôt que de promettre un avoir vide.
    select a.montant_mensuel_cents into v_mensuel
    from public.abonnements a where a.organization_id = v_parrain;

    insert into public.avantages_parrainage
      (parrainage_id, beneficiaire_organization_id, nature, montant_cents, etat, applique_le)
    values (v_parrainage, v_parrain, 'avoir_parrain', coalesce(v_mensuel, 0),
            case when coalesce(v_mensuel, 0) > 0 then 'a_appliquer' else 'sans_objet' end,
            case when coalesce(v_mensuel, 0) > 0 then null else now() end)
    on conflict (parrainage_id, nature) do nothing;
  end if;

  insert into public.audit_log (organization_id, action, details)
  values (v_parrain, 'avantage_parrainage',
          jsonb_build_object('filleul', p_filleul, 'parrainage', v_parrainage));
end $$;
revoke execute on function public.parrainage_recompenser(uuid) from public, anon, authenticated;

create or replace function public.organizations_parrainage_conversion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    perform public.parrainage_recompenser(new.id);
  end if;
  return null;
end $$;
-- Une fonction déclencheur ne s'appelle pas, et ne doit pas pouvoir être
-- accrochée à une table forgée (audit du 10/09).
revoke execute on function public.organizations_parrainage_conversion() from public, anon, authenticated;

drop trigger if exists organizations_parrainage_conversion_trg on public.organizations;
create trigger organizations_parrainage_conversion_trg
  after update of status on public.organizations
  for each row execute function public.organizations_parrainage_conversion();

-- ------------------------------------------------------------
-- 5. Ce que la tâche planifiée vient chercher
-- ------------------------------------------------------------
create or replace function public.avantages_parrainage_a_appliquer()
returns table (
  avantage_id uuid,
  organization_id uuid,
  organisation text,
  montant_cents bigint,
  stripe_customer_id text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.beneficiaire_organization_id, o.name, a.montant_cents, ab.stripe_customer_id
  from public.avantages_parrainage a
  join public.organizations o on o.id = a.beneficiaire_organization_id
  left join public.abonnements ab on ab.organization_id = a.beneficiaire_organization_id
  where a.etat = 'a_appliquer' and a.nature = 'avoir_parrain' and a.montant_cents > 0
  order by a.created_at
  limit 200;
$$;
revoke execute on function public.avantages_parrainage_a_appliquer() from public, anon, authenticated;
grant execute on function public.avantages_parrainage_a_appliquer() to service_role;
comment on function public.avantages_parrainage_a_appliquer() is
  'Les avoirs de parrainage qui attendent d''etre portes au solde Stripe. Reserve aux taches planifiees.';

create or replace function public.avantage_parrainage_solde(p_avantage uuid, p_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.avantages_parrainage
     set etat = 'applique', applique_le = now(),
         reference_externe = nullif(btrim(coalesce(p_reference, '')), '')
   where id = p_avantage and etat = 'a_appliquer';
end $$;
revoke execute on function public.avantage_parrainage_solde(uuid, text) from public, anon, authenticated;
grant execute on function public.avantage_parrainage_solde(uuid, text) to service_role;
comment on function public.avantage_parrainage_solde(uuid, text) is
  'Marque un avoir de parrainage comme porte au solde client, avec sa reference Stripe.';

-- La garde d'abonnement se repose sur toutes les tables, comme après chaque
-- migration.
select public.poser_gardes_abonnement();

-- Et aucune fonction de `public` ne reste exécutable par `anon`.
select public.fermer_fonctions_a_anon();
