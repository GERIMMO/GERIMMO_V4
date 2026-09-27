-- AUDIT SÉCURITÉ DU 27/09 — MINEUR : VUE `regulatory_watch_published`.
--
-- La vue appartenait à `postgres` sans `security_invoker` : elle contournait
-- la RLS de `regulatory_watch` (alerte Supabase « Security Definer View »,
-- niveau ERROR) et rendait chaque fiche publiée à TOUT compte connecté, sans
-- appliquer le champ `publics` (un locataire lisait une fiche destinée aux
-- agences). Aucune donnée d'agence n'était exposée.
--
-- LA CORRECTION, sans rien changer aux écrans qui lisent la vue :
--  · une table de diffusion `regulatory_watch_diffusion` ne porte QUE les neuf
--    colonnes relues (jamais `etude`, `valide_par`, `analyse_*`) des fiches au
--    statut « publie » ; un déclencheur la tient à jour depuis
--    `regulatory_watch` (publication, modification, retrait) ;
--  · sa RLS applique `publics` : chacun ne lit que les fiches destinées à l'un
--    de ses publics (`mes_publics_veille()` : admin d'agence et agent →
--    agence ; propriétaire en direct ou mandant → bailleur ; locataire →
--    locataire ; artisan → artisan ; supervision → tous) ;
--  · la vue `regulatory_watch_published` est recréée en `security_invoker`
--    sur cette table : même nom, mêmes colonnes, plus de contournement.
-- La table `regulatory_watch` elle-même reste réservée à la supervision.
--
-- Idempotent : IF NOT EXISTS, CREATE OR REPLACE, DROP … IF EXISTS.

create table if not exists public.regulatory_watch_diffusion (
  id uuid primary key references public.regulatory_watch(id) on delete cascade,
  titre text not null,
  resume text,
  action_conseillee text,
  publics text[] not null default '{}',
  source_nom text not null,
  source_url text not null,
  application_le date,
  valide_le timestamptz
);
alter table public.regulatory_watch_diffusion enable row level security;

create or replace function public.mes_publics_veille()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then array[]::text[]
    when public.is_super_admin() then array['artisan','bailleur','agence','locataire']
    else coalesce((
      select array_agg(distinct p) from (
        select case m.role
                 when 'admin_agence' then 'agence'
                 when 'agent' then 'agence'
                 when 'proprietaire_direct' then 'bailleur'
                 when 'proprietaire_mandant' then 'bailleur'
                 when 'locataire' then 'locataire'
                 when 'artisan' then 'artisan'
               end as p
        from public.memberships m
        where m.account_id = (select auth.uid()) and m.status = 'active'
        union all
        select 'artisan' where public.mon_artisan_id() is not null
      ) x where p is not null), array[]::text[])
  end
$$;

revoke execute on function public.mes_publics_veille() from public, anon;
grant execute on function public.mes_publics_veille() to authenticated;

drop policy if exists regulatory_watch_diffusion_lecture on public.regulatory_watch_diffusion;
create policy regulatory_watch_diffusion_lecture on public.regulatory_watch_diffusion
  for select to authenticated
  using (publics && (select public.mes_publics_veille()));

revoke all on public.regulatory_watch_diffusion from public, anon, authenticated;
grant select on public.regulatory_watch_diffusion to authenticated;
grant select on public.regulatory_watch_diffusion to service_role;

create or replace function public.diffuser_veille()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.regulatory_watch_diffusion where id = old.id;
    return old;
  end if;
  if new.statut = 'publie' then
    insert into public.regulatory_watch_diffusion
      (id, titre, resume, action_conseillee, publics, source_nom, source_url, application_le, valide_le)
    values (new.id, new.titre, new.resume, new.action_conseillee, new.publics, new.source_nom,
            new.source_url, new.application_le, new.valide_le)
    on conflict (id) do update set
      titre = excluded.titre, resume = excluded.resume, action_conseillee = excluded.action_conseillee,
      publics = excluded.publics, source_nom = excluded.source_nom, source_url = excluded.source_url,
      application_le = excluded.application_le, valide_le = excluded.valide_le;
  else
    delete from public.regulatory_watch_diffusion where id = new.id;
  end if;
  return new;
end $$;

revoke execute on function public.diffuser_veille() from public, anon, authenticated;

drop trigger if exists regulatory_watch_diffusion_sync on public.regulatory_watch;
create trigger regulatory_watch_diffusion_sync
  after insert or update or delete on public.regulatory_watch
  for each row execute function public.diffuser_veille();

-- Reprise de l'existant.
insert into public.regulatory_watch_diffusion
  (id, titre, resume, action_conseillee, publics, source_nom, source_url, application_le, valide_le)
select id, titre, resume, action_conseillee, publics, source_nom, source_url, application_le, valide_le
from public.regulatory_watch where statut = 'publie'
on conflict (id) do update set
  titre = excluded.titre, resume = excluded.resume, action_conseillee = excluded.action_conseillee,
  publics = excluded.publics, source_nom = excluded.source_nom, source_url = excluded.source_url,
  application_le = excluded.application_le, valide_le = excluded.valide_le;
delete from public.regulatory_watch_diffusion d
 where not exists (select 1 from public.regulatory_watch w where w.id = d.id and w.statut = 'publie');

create or replace view public.regulatory_watch_published with (security_invoker = true, security_barrier = true) as
  select id, titre, resume, action_conseillee, publics, source_nom, source_url, application_le, valide_le
  from public.regulatory_watch_diffusion;
alter view public.regulatory_watch_published set (security_invoker = true, security_barrier = true);

revoke all on public.regulatory_watch_published from public, anon, authenticated;
grant select on public.regulatory_watch_published to authenticated;

comment on view public.regulatory_watch_published is
  'Fiches de veille publiées, filtrées par public (RLS de regulatory_watch_diffusion). security_invoker (audit 27/09).';

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
