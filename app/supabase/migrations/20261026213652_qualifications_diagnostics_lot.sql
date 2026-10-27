-- Les obligations gaz/électricité dépendent de l'installation, pas de l'âge
-- du bâtiment. Une réponse durable évite de reposer la question à chaque visite.
create table public.qualifications_diagnostics_lot (
  organization_id uuid not null references public.organizations(id),
  lot_id uuid not null,
  type text not null check (type in ('electricite', 'gaz')),
  situation text not null check (situation in ('plus_15_ans', 'date_connue', 'absente', 'inconnue')),
  date_installation date,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.accounts(id),
  primary key (organization_id, lot_id, type),
  constraint qualifications_diagnostics_lot_meme_org_fk
    foreign key (lot_id, organization_id) references public.lots(id, organization_id) on delete cascade,
  constraint qualifications_diagnostics_absence_gaz check (situation <> 'absente' or type = 'gaz'),
  constraint qualifications_diagnostics_date_coherente check (
    (situation = 'date_connue' and date_installation is not null)
    or (situation <> 'date_connue' and date_installation is null)
  ),
  constraint qualifications_diagnostics_date_passee check (
    date_installation is null or (date_installation >= date '1800-01-01'
      and date_installation <= (current_timestamp at time zone 'Europe/Paris')::date)
  )
);

create index qualifications_diagnostics_lot_idx on public.qualifications_diagnostics_lot(lot_id, organization_id);
create index qualifications_diagnostics_auteur_idx on public.qualifications_diagnostics_lot(updated_by);

-- Le client ne choisit ni l'auteur ni la date de sa déclaration.
create function public.tracer_qualification_diagnostic()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
-- Le déclencheur fonctionne sans accorder son exécution directe aux clients.
revoke all on function public.tracer_qualification_diagnostic() from public, anon, authenticated;
create trigger qualifications_diagnostics_trace before insert or update
  on public.qualifications_diagnostics_lot for each row
  execute function public.tracer_qualification_diagnostic();

alter table public.qualifications_diagnostics_lot enable row level security;
revoke all on public.qualifications_diagnostics_lot from public, anon, authenticated;
grant select, insert, update on public.qualifications_diagnostics_lot to authenticated;

create policy qualifications_diagnostics_lecture on public.qualifications_diagnostics_lot
  for select to authenticated using (
    (exists (select 1 from public.memberships m
      where m.organization_id = qualifications_diagnostics_lot.organization_id
        and m.account_id = (select auth.uid()) and m.status = 'active'
        and m.role in ('admin_agence', 'agent', 'proprietaire_direct'))
      or (select public.is_super_admin()))
    and not public.lot_hors_portefeuille(organization_id, lot_id)
  );
-- Une traversée superadmin reste en lecture seule. On n'utilise donc pas ici
-- org_ids_avec_roles(), dont le repli inclut toutes les organisations pour ce rôle.
create policy qualifications_diagnostics_ajout on public.qualifications_diagnostics_lot
  for insert to authenticated with check (
    exists (select 1 from public.memberships m
      where m.organization_id = qualifications_diagnostics_lot.organization_id
        and m.account_id = (select auth.uid()) and m.status = 'active'
        and m.role in ('admin_agence', 'agent', 'proprietaire_direct'))
    and not public.lot_hors_portefeuille(organization_id, lot_id)
  );
create policy qualifications_diagnostics_modification on public.qualifications_diagnostics_lot
  for update to authenticated using (
    exists (select 1 from public.memberships m
      where m.organization_id = qualifications_diagnostics_lot.organization_id
        and m.account_id = (select auth.uid()) and m.status = 'active'
        and m.role in ('admin_agence', 'agent', 'proprietaire_direct'))
    and not public.lot_hors_portefeuille(organization_id, lot_id)
  ) with check (
    exists (select 1 from public.memberships m
      where m.organization_id = qualifications_diagnostics_lot.organization_id
        and m.account_id = (select auth.uid()) and m.status = 'active'
        and m.role in ('admin_agence', 'agent', 'proprietaire_direct'))
    and not public.lot_hors_portefeuille(organization_id, lot_id)
  );

-- Toute nouvelle table métier reprend le verrou commun d’abonnement.
select public.poser_gardes_abonnement();
