-- Rappels du tableau de bord : les appels contractuels font foi ; aucun nouvel échéancier.
-- Les réponses négatives ne sont jamais des encaissements ni des relances au locataire.
create table if not exists public.receptions_loyers_signalees (
  appel_id uuid primary key references public.appels_loyer(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  signale_le timestamptz not null default now(),
  account_id uuid references auth.users(id) on delete set null
);
create index if not exists receptions_loyers_organisation_idx on public.receptions_loyers_signalees(organization_id);
create index if not exists receptions_loyers_compte_idx on public.receptions_loyers_signalees(account_id);
alter table public.receptions_loyers_signalees enable row level security;
revoke all on public.receptions_loyers_signalees from anon,authenticated;
grant select on public.receptions_loyers_signalees to authenticated;
drop policy if exists reception_loyer_lecture on public.receptions_loyers_signalees;
create policy reception_loyer_lecture on public.receptions_loyers_signalees for select to authenticated
using (organization_id in (select public.org_ids_avec_roles(array['proprietaire_direct']::public.membership_role[])));

create or replace function public.rappels_loyers_proprietaire(p_org uuid)
returns table(appel_id uuid,bail_id uuid,lot_nom text,locataire text,periode date,date_echeance date,
  montant_du numeric,montant_couvert numeric,non_recu_signale_le timestamptz)
language sql stable security invoker set search_path='' as $$
  select e.appel_id,b.id,l.nom,
    nullif(concat_ws(' ',p.prenom,p.nom),''),e.periode,e.date_echeance,e.montant_du,e.montant_couvert,s.signale_le
  from public.baux b
  join public.organizations o on o.id=b.organization_id and o.type='proprietaire_direct'
  join public.lots l on l.id=b.lot_id and l.organization_id=p_org
  left join public.persons p on p.id=b.locataire_principal and p.organization_id=p_org
  cross join lateral public.etat_loyers_bail(b.id) e
  left join public.receptions_loyers_signalees s on s.appel_id=e.appel_id and s.organization_id=p_org
  where b.organization_id=p_org and b.etat in ('actif','preavis','termine')
    and p_org in (select public.org_ids_avec_roles(array['proprietaire_direct']::public.membership_role[]))
    and e.montant_couvert<e.montant_du
  order by e.date_echeance,e.periode,e.appel_id;
$$;
revoke all on function public.rappels_loyers_proprietaire(uuid) from public,anon;
grant execute on function public.rappels_loyers_proprietaire(uuid) to authenticated;

create or replace function public.declarer_reception_loyer(
  p_org uuid,p_appel uuid,p_reponse text,p_montant numeric,p_date date,p_mode text,p_cle uuid,p_reste_attendu numeric
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appels_loyer; b public.baux; deja public.encaissements; v_reste numeric; v_premier uuid; v_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.memberships m join public.organizations o on o.id=m.organization_id
    where m.organization_id=p_org and m.account_id=auth.uid() and m.role='proprietaire_direct'
      and m.status='active' and o.type='proprietaire_direct'
  ) or not coalesce(public.org_ecriture_ouverte(p_org),false) then raise exception 'Accès refusé.'; end if;
  if p_reponse is null or p_reponse not in ('recu','partiel','non_recu') or p_cle is null then
    raise exception 'Vérifiez votre réponse avant de l''enregistrer.';
  end if;
  select * into a from public.appels_loyer where id=p_appel and organization_id=p_org;
  if not found then raise exception 'Échéance inaccessible.'; end if;
  -- Même verrou que les insertions d'encaissements : deux onglets ne soldent jamais deux fois le même reste.
  select * into b from public.baux where id=a.bail_id and organization_id=p_org for update;
  if b.etat not in ('actif','preavis','termine') or a.date_echeance>public.aujourdhui_paris() then
    raise exception 'Cette échéance n''est pas encore à confirmer.';
  end if;
  select * into deja from public.encaissements where organization_id=p_org and cle_envoi=p_cle;
  if found then
    if deja.bail_id<>a.bail_id or deja.montant is distinct from p_montant
      or deja.date_paiement is distinct from p_date or deja.mode is distinct from p_mode then
      raise exception 'Cette demande a déjà été utilisée. Rechargez le tableau de bord.';
    end if;
    return jsonb_build_object('statut','deja_enregistre','bail_id',b.id,'montant',deja.montant);
  end if;
  select e.montant_du-e.montant_couvert into v_reste
    from public.etat_loyers_bail_brut(b.id) e where e.appel_id=p_appel;
  if v_reste is null or v_reste<=0 then return jsonb_build_object('statut','deja_solde','bail_id',b.id); end if;
  select e.appel_id into v_premier from public.etat_loyers_bail_brut(b.id) e
    where e.montant_couvert<e.montant_du order by e.periode,e.appel_id limit 1;
  if v_premier is distinct from p_appel then
    raise exception 'Un loyer plus ancien reste à régler. Actualisez le tableau de bord.';
  end if;
  if p_reste_attendu is null or p_reste_attendu is distinct from v_reste then
    raise exception 'Le montant a changé depuis votre dernière lecture. Actualisez le tableau de bord.';
  end if;
  if p_reponse='non_recu' then
    insert into public.receptions_loyers_signalees(appel_id,organization_id,account_id)
    values(p_appel,p_org,auth.uid()) on conflict(appel_id) do update
      set signale_le=now(),account_id=auth.uid()
      where (receptions_loyers_signalees.signale_le at time zone 'Europe/Paris')::date<>public.aujourdhui_paris();
    if found then
      insert into public.audit_log(organization_id,account_id,action,details)
      values(p_org,auth.uid(),'loyer_non_recu_signale',jsonb_build_object('appel_id',p_appel,'bail_id',b.id));
    end if;
    return jsonb_build_object('statut','non_recu','bail_id',b.id);
  end if;
  if p_montant is null or p_montant::text in ('NaN','Infinity','-Infinity') or p_montant<=0
    or p_montant<>round(p_montant,2) or p_montant>v_reste
    or (p_reponse='recu' and p_montant<>v_reste) or (p_reponse='partiel' and p_montant>=v_reste)
    or p_date is null or p_date>public.aujourdhui_paris() or p_date<date '1900-01-01'
    or p_mode is null or p_mode not in ('virement','cheque','especes','prelevement','autre') then
    raise exception 'Vérifiez le montant, la date et le mode du règlement reçu.';
  end if;
  insert into public.encaissements(organization_id,bail_id,montant,date_paiement,mode,cle_envoi,note)
    values(p_org,b.id,p_montant,p_date,p_mode,p_cle,'Réception déclarée depuis le tableau de bord') returning id into v_id;
  delete from public.receptions_loyers_signalees where appel_id=p_appel;
  insert into public.audit_log(organization_id,account_id,action,details)
    values(p_org,auth.uid(),'loyer_reception_confirmee',jsonb_build_object('appel_id',p_appel,'encaissement_id',v_id,'reponse',p_reponse));
  return jsonb_build_object('statut','enregistre','bail_id',b.id,'montant',p_montant);
end $$;
revoke all on function public.declarer_reception_loyer(uuid,uuid,text,numeric,date,text,uuid,numeric) from public,anon;
grant execute on function public.declarer_reception_loyer(uuid,uuid,text,numeric,date,text,uuid,numeric) to authenticated;
notify pgrst,'reload schema';
