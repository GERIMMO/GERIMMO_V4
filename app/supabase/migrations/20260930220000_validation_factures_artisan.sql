alter table public.incident_evenements drop constraint if exists incident_evenements_type_check;
alter table public.incident_evenements add constraint incident_evenements_type_check
  check (type = any (array[
    'declaration', 'qualification', 'contestation', 'cloture', 'reouverture',
    'attribution', 'photo', 'consultation', 'sollicitation', 'devis',
    'selection_devis', 'mission_confiee', 'mission_acceptee', 'mission_refusee',
    'creneaux_proposes', 'creneau_retenu', 'arbitrage_creneau',
    'intervention_demarree', 'compte_rendu', 'revision_imputation', 'evaluation',
    'creneaux_refuses', 'facture_deposee', 'facture_validee'
  ]::text[]));

-- La facture reste à traiter indépendamment de la clôture technique.
alter table public.intervention_factures
  add column if not exists validee_le timestamptz,
  add column if not exists validee_par uuid references public.accounts(id),
  add column if not exists decision_motif text,
  add column if not exists imputation_validee text;
create index if not exists intervention_factures_validee_par_idx on public.intervention_factures(validee_par);

create or replace function public.valider_facture_artisan(p_org uuid, p_facture uuid, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
declare f record; i record;
begin
  if auth.uid() is null or not (p_org in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into f from public.intervention_factures where id=p_facture and organization_id=p_org for update;
  if not found or public.intervention_hors_portefeuille(p_org,f.intervention_id) then raise exception 'Accès refusé'; end if;
  if f.validee_le is not null then return; end if;
  select inc.* into i from public.incidents inc join public.incident_interventions iv on iv.incident_id=inc.id
    where iv.id=f.intervention_id and inc.organization_id=p_org for update of inc;
  if i.imputation is null or i.etat in ('declare','rouvert') or i.imputation_contestation is not null then
    raise exception 'Décidez d’abord qui prend la dépense en charge et traitez la contestation éventuelle';
  end if;
  if exists(select 1 from public.alerts where organization_id=p_org and statut='ouverte'
    and details->>'incident_id'=i.id::text and type='incident_imputation_a_reviser') then
    raise exception 'Examinez d’abord la cause signalée par l’artisan';
  end if;
  if length(btrim(coalesce(p_motif,''))) not between 1 and 4000 then
    raise exception 'Indiquez le résultat de votre contrôle de la facture';
  end if;
  update public.intervention_factures set validee_le=now(), validee_par=auth.uid(),
    decision_motif=btrim(p_motif), imputation_validee=i.imputation::text where id=f.id;
  insert into public.incident_evenements(organization_id,incident_id,type,acteur_account_id,details)
    values(p_org,i.id,'facture_validee',auth.uid(),jsonb_build_object('facture_id',f.id,'numero',f.numero,
      'montant_ttc_cents',f.montant_ttc_cents,'imputation',i.imputation,'motif',btrim(p_motif)));
  update public.alerts set statut='fermee',closed_at=now(),closed_by=auth.uid(),closed_action='Facture contrôlée et validée'
    where organization_id=p_org and type='facture_artisan_a_valider' and details->>'facture_id'=f.id::text and statut='ouverte';
end; $$;
revoke all on function public.valider_facture_artisan(uuid,uuid,text) from public,anon;
grant execute on function public.valider_facture_artisan(uuid,uuid,text) to authenticated;

-- Une clôture d'incident ne vaut jamais validation de facture.
create or replace function public.garder_alerte_facture_ouverte()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.type='facture_artisan_a_valider' and old.statut='ouverte' and new.statut='fermee'
    and exists(select 1 from public.intervention_factures f where f.id::text=old.details->>'facture_id'
      and f.organization_id=old.organization_id and f.validee_le is null) then
    return old;
  end if;
  return new;
end; $$;
revoke all on function public.garder_alerte_facture_ouverte() from public,anon,authenticated;
drop trigger if exists garder_alerte_facture_ouverte on public.alerts;
create trigger garder_alerte_facture_ouverte before update on public.alerts for each row execute function public.garder_alerte_facture_ouverte();

-- Rétablir les alertes que l'ancienne clôture technique avait masquées.
update public.alerts a set statut='ouverte',closed_at=null,closed_by=null,closed_action=null
where a.type='facture_artisan_a_valider' and a.statut='fermee'
  and exists(select 1 from public.intervention_factures f where f.id::text=a.details->>'facture_id'
    and f.organization_id=a.organization_id and f.validee_le is null);
