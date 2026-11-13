-- Historique prospectif. Aucun motif interne, PDF périmé ou envoi externe.
create table public.rectifications_quittances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bail_id uuid not null references public.baux(id) on delete cascade,
  personne_id uuid not null references public.persons(id) on delete cascade,
  document_origine uuid not null,
  periode date not null,
  montant_precedent numeric not null,
  etait_quittance boolean not null,
  retire boolean not null,
  rectifie_le timestamptz not null default now()
);
create index rectifications_quittances_destinataire on public.rectifications_quittances(organization_id,personne_id,rectifie_le desc);
create index rectifications_quittances_bail on public.rectifications_quittances(bail_id);
alter table public.rectifications_quittances enable row level security;
revoke all on public.rectifications_quittances from public, anon, authenticated;
-- Lecture uniquement via une projection limitée, y compris pour un ancien locataire autorisé.
create function public.mes_rectifications_quittances(p_org uuid)
returns table(id uuid, periode date, montant_precedent numeric, etait_quittance boolean, retire boolean, rectifie_le timestamptz)
language sql stable security definer set search_path='' as $$
  select r.id,r.periode,r.montant_precedent,r.etait_quittance,r.retire,r.rectifie_le
  from public.rectifications_quittances r
  join public.persons p on p.id=r.personne_id and p.organization_id=r.organization_id
  join public.baux b on b.id=r.bail_id and b.organization_id=r.organization_id
  where r.organization_id=p_org and p.account_id=(select auth.uid())
    and b.etat in ('actif','preavis','termine')
    and exists(select from public.memberships m where m.organization_id=p_org and m.account_id=p.account_id and m.role='locataire' and m.status in ('active','inactive'))
    and (p.id=b.locataire_principal or exists(select from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=p.id and bp.role='colocataire'))
  order by r.rectifie_le desc,r.id
$$;
revoke all on function public.mes_rectifications_quittances(uuid) from public,anon;
grant execute on function public.mes_rectifications_quittances(uuid) to authenticated;

-- Figer les bénéficiaires lors de la première émission. Pour un document antérieur
-- à cette migration, aucun historique personnel n'est déduit de la composition actuelle.
create table public.destinataires_rectifications_quittance (
  quittance_id uuid not null references public.quittances(id) on delete cascade,
  personne_id uuid not null references public.persons(id) on delete cascade,
  primary key (quittance_id, personne_id)
);
create index destinataires_rectifications_personne on public.destinataires_rectifications_quittance(personne_id);
alter table public.destinataires_rectifications_quittance enable row level security;
revoke all on public.destinataires_rectifications_quittance from public,anon,authenticated;

create function public.figer_destinataires_rectification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.destinataires_rectifications_quittance(quittance_id,personne_id)
  select new.id,p.id from public.baux b join public.persons p on p.organization_id=b.organization_id
  where b.id=new.bail_id and b.organization_id=new.organization_id and
    (p.id=b.locataire_principal or exists (
      select from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=p.id
        and bp.role='colocataire' and (bp.date_depart is null or bp.date_depart >= new.date_emission)
    ));
  return null;
end $$;
revoke all on function public.figer_destinataires_rectification() from public,anon,authenticated,service_role;
create trigger figer_destinataires_rectification after insert on public.quittances
for each row execute function public.figer_destinataires_rectification();

create function public.tracer_rectification_quittance() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (old.est_quittance,old.montant) is not distinct from (new.est_quittance,new.montant) then return new; end if;
  insert into public.rectifications_quittances(organization_id,bail_id,personne_id,document_origine,periode,montant_precedent,etait_quittance,retire)
  select b.organization_id,b.id,p.id,old.id,a.periode,old.montant,old.est_quittance,tg_op='DELETE'
  from public.baux b join public.appels_loyer a on a.bail_id=b.id and a.organization_id=b.organization_id
  join public.destinataires_rectifications_quittance dr on dr.quittance_id=old.id
  join public.persons p on p.id=dr.personne_id and p.organization_id=b.organization_id
  where b.id=old.bail_id and b.organization_id=old.organization_id and a.id=old.appel_id;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.tracer_rectification_quittance() from public,anon,authenticated,service_role;
create trigger tracer_rectification_quittance before update of est_quittance,montant or delete on public.quittances
for each row execute function public.tracer_rectification_quittance();

create index rectifications_quittances_personne on public.rectifications_quittances(personne_id);
-- Poser les trois gardes sur la nouvelle table uniquement. Une réinstallation
-- globale changerait aussi les droits des opérations commerciales existantes.
create trigger abonnement_rectifications_quittances before insert or update or delete on public.rectifications_quittances
for each row execute function public.refuser_ecriture_si_fermee();
create trigger traversee_lecture_seule before insert or update or delete on public.rectifications_quittances
for each row execute function support_interne.garder_ecriture_traversee();
create trigger diagnostic_artisan_lecture before insert or update or delete on public.rectifications_quittances
for each row execute function public.refuser_mutation_diagnostic_artisan();
