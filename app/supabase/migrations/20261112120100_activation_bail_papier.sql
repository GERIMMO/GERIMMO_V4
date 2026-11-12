-- Sous les droits de l'appelant. Le rattachement et les effets de l'activation
-- réussissent ensemble. Un second dépôt ne remplace pas le contrat du premier.
create function public.activer_bail_papier(p_org uuid, p_bail uuid, p_document uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.documents d where d.organization_id=p_org and d.id=p_document
    and d.type='bail' and d.mime_type='application/pdf' and d.purged_at is null
  ) then raise exception 'PDF du bail inaccessible'; end if;
  update public.baux set document_signe=p_document
  where organization_id=p_org and id=p_bail and etat='brouillon'
    and (document_signe is null or document_signe=p_document);
  if not found then raise exception 'Ce bail a changé. Rechargez sa fiche.'; end if;
  if exists (select 1 from public.bail_signature_circuits where bail_id=p_bail and modele='bail'
    and (document_signe=p_document or (not essai and etat in ('preparation','en_cours','a_verifier','termine'))))
  then raise exception 'Utilisez le suivi de la signature électronique de ce bail.'; end if;
  perform public.activer_bail(p_bail);
end;
$$;
revoke all on function public.activer_bail_papier(uuid,uuid,uuid) from public, anon;
grant execute on function public.activer_bail_papier(uuid,uuid,uuid) to authenticated;
