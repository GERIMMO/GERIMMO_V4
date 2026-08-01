-- Sprint 5E : révision annuelle IRL. Clause requise ; formule loyer × IRL_n / IRL_réf ;
-- DPE F/G interdit (RM-3.8.6) ; prescription 1 an (RM-3.8.5) ; dépôt/provisions inchangés.
create table public.revisions_loyer (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bail_id uuid not null references public.baux (id) on delete cascade,
  date_effet date not null,
  ancien_loyer numeric not null,
  nouveau_loyer numeric not null,
  irl_reference numeric not null,
  irl_nouveau numeric not null,
  created_at timestamptz not null default now()
);
create index revisions_loyer_bail_idx on public.revisions_loyer (bail_id);
alter table public.revisions_loyer enable row level security;
create policy revisions_select on public.revisions_loyer for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

create function public.reviser_loyer(
  p_bail uuid, p_irl_reference numeric, p_irl_nouveau numeric, p_date_effet date
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_dpe text;
  v_nouveau numeric;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if not v.revision_irl then
    raise exception 'Ce bail n''a pas de clause de révision — aucune révision possible';
  end if;
  if v.loyer_hc is null then raise exception 'Le loyer n''est pas fixé'; end if;
  if p_irl_reference is null or p_irl_reference <= 0 or p_irl_nouveau is null or p_irl_nouveau <= 0 then
    raise exception 'Indices IRL (référence et nouveau) obligatoires';
  end if;

  select d.classe_dpe into v_dpe
  from public.diagnostics d
  where d.lot_id = v.lot_id and d.type = 'dpe' and d.archived_at is null
  order by d.date_realisation desc limit 1;
  if v_dpe in ('F', 'G') then
    raise exception 'Révision interdite : logement classé DPE % (passoire thermique, depuis 2022)', v_dpe;
  end if;

  if current_date > (p_date_effet + interval '1 year')::date then
    raise exception 'Révision prescrite : plus d''un an s''est écoulé depuis la date d''effet (RM-3.8.5)';
  end if;

  v_nouveau := round(v.loyer_hc * p_irl_nouveau / p_irl_reference, 2);
  insert into public.revisions_loyer
    (organization_id, bail_id, date_effet, ancien_loyer, nouveau_loyer, irl_reference, irl_nouveau)
  values (v.organization_id, p_bail, p_date_effet, v.loyer_hc, v_nouveau, p_irl_reference, p_irl_nouveau);
  update public.baux set loyer_hc = v_nouveau, updated_at = now() where id = p_bail;
  return v_nouveau;
end;
$$;
revoke execute on function public.reviser_loyer(uuid, numeric, numeric, date) from public, anon;
