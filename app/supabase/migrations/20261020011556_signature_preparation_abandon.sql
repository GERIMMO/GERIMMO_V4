-- Abandon certain avant le premier appel de création chez le prestataire.
-- Réservé au serveur : aucun rapprochement ambigu ne doit appeler cette fonction.
create or replace function public.abandonner_preparation_signature(p_circuit uuid, p_actor uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare c public.bail_signature_circuits;
begin
 select * into c from public.bail_signature_circuits where id=p_circuit for update;
 if not found then return false; end if;
 if not exists(select 1 from public.memberships m where m.account_id=p_actor
  and m.organization_id=c.organization_id and m.status='active' and m.role='proprietaire_direct') then
  raise exception 'Accès refusé' using errcode='42501';
 end if;
 if c.external_request_id is not null or c.external_document_id is not null or c.document_signe is not null then return false; end if;
 if c.etat='annule' and c.erreur='Préparation interrompue avant la création chez le prestataire. Préparez un nouveau PDF.' then
  return not exists(select 1 from public.signature_consommations where circuit_id=c.id);
 end if;
 if c.etat<>'preparation' then return false; end if;
 delete from public.signature_consommations where circuit_id=c.id;
 update public.bail_signature_circuits set etat='annule',updated_at=now(),
  erreur='Préparation interrompue avant la création chez le prestataire. Préparez un nouveau PDF.' where id=c.id;
 insert into public.audit_log(account_id,organization_id,action,details)
  values(p_actor,c.organization_id,'signature_preparation_abandonnee',jsonb_build_object('circuit_id',c.id));
 return true;
end $$;
revoke all on function public.abandonner_preparation_signature(uuid,uuid) from public,anon,authenticated;
grant execute on function public.abandonner_preparation_signature(uuid,uuid) to service_role;
select public.fermer_fonctions_a_anon();
