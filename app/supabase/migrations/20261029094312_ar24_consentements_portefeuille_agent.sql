-- Les droits d'agence ne remplacent jamais le portefeuille attribué à l'agent.
-- Les retours anticipés d'une commande AR24 doivent suivre la même frontière
-- que la lecture du bail, avant toute lecture ou verrouillage de cette commande.
do $portefeuille$
declare
 definition text;
 ancienne text;
 nouvelle text;
 signature text;
begin
 for signature,ancienne,nouvelle in values
 ('public.preparer_recommande_ar24(uuid,uuid,uuid,text,text,jsonb,integer,text,uuid)',
  'select * into b from public.baux where id=p_bail and organization_id=p_org for update;',
  'select * into b from public.baux where id=p_bail and organization_id=p_org and not public.bail_hors_portefeuille(p_org,p_bail) for update; -- AR24 portefeuille 20261029'),
 ('public.reserver_recommande_ar24(uuid,uuid,text,text,integer)',
  'select baux.* into b from public.baux join public.recommandes_ar24 commande on commande.bail_id=baux.id where commande.id=p_id and commande.organization_id=p_org for update of baux;',
  'select baux.* into b from public.baux join public.recommandes_ar24 commande on commande.bail_id=baux.id where commande.id=p_id and commande.organization_id=p_org and not public.bail_hors_portefeuille(p_org,baux.id) for update of baux; -- AR24 portefeuille 20261029')
 loop
  select pg_catalog.pg_get_functiondef(signature::regprocedure) into definition;
  if position('-- AR24 portefeuille 20261029' in definition)>0 then continue; end if;
  if (length(definition)-length(replace(definition,ancienne,'')))<>length(ancienne) then
   raise exception 'Définition AR24 inattendue pour % : contrôle du portefeuille à vérifier.',signature;
  end if;
  execute replace(definition,ancienne,nouvelle);
 end loop;
end $portefeuille$;

drop policy if exists recommande_ar24_agent_portefeuille on public.recommandes_ar24;
create policy recommande_ar24_agent_portefeuille on public.recommandes_ar24
 as restrictive for select to authenticated
 using (not public.bail_hors_portefeuille(organization_id,bail_id));

-- Un locataire conserve la lecture et le retrait de ses propres accords,
-- y compris après sa sortie ou s'il possède aussi un rôle d'agent.
drop policy if exists consentements_documents_agent_portefeuille on public.consentements_documents_locataire;
create policy consentements_documents_agent_portefeuille on public.consentements_documents_locataire
 as restrictive for select to authenticated
 using (person_id=public.ma_personne_consentements_locataire(organization_id)
        or not public.person_hors_portefeuille(organization_id,person_id));

-- Défense des mutations, y compris les fonctions SECURITY DEFINER : un agent
-- ne peut réserver ni modifier le courrier d'un mandat retiré de son portefeuille.
drop trigger if exists garde_portefeuille_agent on public.recommandes_ar24;
create trigger garde_portefeuille_agent before insert or update or delete on public.recommandes_ar24
 for each row execute function public.garde_portefeuille_agent();

revoke all on function public.preparer_recommande_ar24(uuid,uuid,uuid,text,text,jsonb,integer,text,uuid) from public,anon;
revoke all on function public.reserver_recommande_ar24(uuid,uuid,text,text,integer) from public,anon;
grant execute on function public.preparer_recommande_ar24(uuid,uuid,uuid,text,text,jsonb,integer,text,uuid),
 public.reserver_recommande_ar24(uuid,uuid,text,text,integer) to authenticated;
notify pgrst,'reload schema';
