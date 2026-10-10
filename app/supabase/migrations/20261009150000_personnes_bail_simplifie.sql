-- Étape Personnes : mutations atomiques, sous les RLS existantes.
create or replace function public.choisir_personne_bail(
  p_bail uuid, p_person uuid, p_role text, p_garant_de uuid default null,
  p_principal_attendu uuid default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare b public.baux%rowtype;
begin
  select * into b from public.baux where id = p_bail for update;
  if b.id is null or not (b.organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé.';
  end if;
  if b.etat <> 'brouillon' then raise exception 'Seul un bail en brouillon se corrige.'; end if;
  if b.locataire_principal is distinct from p_principal_attendu then raise exception 'Le locataire a changé depuis votre ouverture. Rechargez le dossier.'; end if;
  if p_role not in ('principal','colocataire','garant') then raise exception 'Choisissez un rôle proposé.'; end if;
  if not exists (select 1 from public.persons where id=p_person and organization_id=b.organization_id and archived_at is null) then
    raise exception 'Cette personne ne peut pas être sélectionnée.';
  end if;
  if exists (select 1 from public.detentions where lot_id=b.lot_id and person_id=p_person and date_fin is null) then
    raise exception 'Cette personne est déjà propriétaire du logement.';
  end if;
  if exists (select 1 from public.bail_personnes where bail_id=p_bail and person_id=p_person) then
    raise exception 'Cette personne figure déjà dans ce bail.';
  end if;
  if p_role='principal' then
    if b.locataire_principal is not distinct from p_person then return; end if;
    if exists (select 1 from public.bail_personnes where bail_id=p_bail and garant_de=b.locataire_principal) then
      raise exception 'Retirez d’abord les garants du locataire actuel avant de le remplacer.';
    end if;
    update public.baux set locataire_principal=p_person where id=p_bail;
  else
    if p_person=b.locataire_principal then raise exception 'Cette personne est déjà locataire principal.'; end if;
    if p_role='colocataire' and (b.type <> 'colocation' or b.chambre_id is not null) then
      raise exception 'Pour plusieurs locataires sur ce contrat, choisissez la colocation à l’étape Dates et montants.';
    end if;
    if p_role='garant' and (p_garant_de is null or not (p_garant_de=b.locataire_principal or exists (
      select 1 from public.bail_personnes where bail_id=p_bail and person_id=p_garant_de and role='colocataire' and date_depart is null
    ))) then raise exception 'Choisissez le locataire couvert par ce garant.'; end if;
    insert into public.bail_personnes(organization_id,bail_id,person_id,role,garant_de)
      values(b.organization_id,p_bail,p_person,p_role,case when p_role='garant' then p_garant_de end);
  end if;
end;
$$;
revoke all on function public.choisir_personne_bail(uuid,uuid,text,uuid,uuid) from public, anon;
grant execute on function public.choisir_personne_bail(uuid,uuid,text,uuid,uuid) to authenticated;

-- null = reprendre le propriétaire connecté, uniquement si aucune détention
-- n’existe. Sinon, chaque part doit être explicitement donnée par l’utilisateur.
create or replace function public.enregistrer_proprietaires_bail(
  p_bail uuid, p_proprietaires jsonb, p_attendus jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  b public.baux%rowtype; d public.detentions%rowtype; moi uuid;
  actuel jsonb; ligne record; part numeric; jour date := (now() at time zone 'Europe/Paris')::date;
begin
  select * into b from public.baux where id=p_bail for update;
  if b.id is null or not (b.organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé.';
  end if;
  if b.etat <> 'brouillon' then raise exception 'Seul un bail en brouillon se corrige.'; end if;
  perform 1 from public.lots where id=b.lot_id for update;
  perform 1 from public.detentions where lot_id=b.lot_id and date_fin is null for update;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'person_id',person_id,'quote_part',quote_part,'date_debut',date_debut) order by id),'[]'::jsonb)
    into actuel from public.detentions where lot_id=b.lot_id and date_fin is null;
  if p_proprietaires is null then
    if jsonb_array_length(actuel)>0 then return; end if;
    if not exists (select 1 from public.memberships where account_id=auth.uid() and organization_id=b.organization_id and status='active' and role='proprietaire_direct') then
      raise exception 'Seul le propriétaire connecté peut être repris automatiquement.';
    end if;
    select id into moi from public.persons where organization_id=b.organization_id and account_id=auth.uid() and archived_at is null;
    if moi is null then raise exception 'Complétez votre fiche propriétaire avant de la rattacher au logement.'; end if;
    p_proprietaires := jsonb_build_array(jsonb_build_object('person_id',moi,'quote_part',100));
  elsif actuel is distinct from p_attendus then
    raise exception 'La répartition a changé depuis votre ouverture. Rechargez le dossier avant d’enregistrer.';
  end if;
  if jsonb_typeof(p_proprietaires)<>'array' or jsonb_array_length(p_proprietaires)=0 then
    raise exception 'Ajoutez au moins un propriétaire.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_proprietaires) as x(person_id uuid,quote_part numeric)
      where person_id is null or quote_part is null or quote_part<=0 or quote_part>100 or quote_part<>round(quote_part,2))
    or (select sum(quote_part) from jsonb_to_recordset(p_proprietaires) as x(quote_part numeric))<>100 then
    raise exception 'Les parts de propriété doivent totaliser 100 %% (deux décimales maximum).';
  end if;
  if (select count(*)<>count(distinct person_id) from jsonb_to_recordset(p_proprietaires) as x(person_id uuid)) then
    raise exception 'Chaque propriétaire ne doit figurer qu’une fois.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_proprietaires) as x(person_id uuid)
    where not exists (select 1 from public.persons p where p.id=x.person_id and p.organization_id=b.organization_id and p.archived_at is null)) then
    raise exception 'Un propriétaire ne peut pas être sélectionné.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_proprietaires) as x(person_id uuid) where
    x.person_id=b.locataire_principal or exists (select 1 from public.bail_personnes where bail_id=p_bail and person_id=x.person_id)) then
    raise exception 'Un locataire ou un garant de ce bail ne peut pas aussi être propriétaire du logement.';
  end if;
  if exists (select 1 from public.detentions existante where existante.lot_id=b.lot_id and existante.date_fin is null
    and not exists (select 1 from jsonb_to_recordset(p_proprietaires) as x(person_id uuid) where x.person_id=existante.person_id)) then
    raise exception 'Pour retirer un propriétaire déjà enregistré, utilisez la fiche du lot.';
  end if;
  if exists (select 1 from public.detentions where lot_id=b.lot_id and date_fin is null and date_debut>jour) then
    raise exception 'Une propriété future est prévue. Ajustez ses dates depuis la fiche du lot.';
  end if;
  -- Clore les anciennes périodes avant les ajouts : les rapports passés restent
  -- justes et le total ne dépasse jamais 100 %, même pendant la transaction.
  for d in select * from public.detentions where lot_id=b.lot_id and date_fin is null loop
    select quote_part into part from jsonb_to_recordset(p_proprietaires) as x(person_id uuid,quote_part numeric) where x.person_id=d.person_id;
    if part<>d.quote_part then
      if d.date_debut<jour then
        update public.detentions set date_fin=jour-1 where id=d.id;
      elsif part<d.quote_part then
        update public.detentions set quote_part=part where id=d.id;
      end if;
    end if;
  end loop;
  for ligne in select * from jsonb_to_recordset(p_proprietaires) as x(person_id uuid,quote_part numeric) loop
    select * into d from public.detentions where lot_id=b.lot_id and person_id=ligne.person_id and date_fin is null;
    if d.id is null then
      insert into public.detentions(organization_id,lot_id,person_id,quote_part,date_debut)
        values(b.organization_id,b.lot_id,ligne.person_id,ligne.quote_part,jour);
    elsif d.quote_part<>ligne.quote_part then
      update public.detentions set quote_part=ligne.quote_part where id=d.id;
    end if;
  end loop;
end;
$$;
revoke all on function public.enregistrer_proprietaires_bail(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.enregistrer_proprietaires_bail(uuid,jsonb,jsonb) to authenticated;
