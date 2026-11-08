-- Complète les protections transversales des nouvelles tables de factures.
revoke all on function consommations_interne.avis_apres_validation(), consommations_interne.verifier_compteurs_principaux() from public,anon,authenticated;
select public.poser_gardes_abonnement();
create index on public.compteurs_consommation(compteur_principal_id,organization_id,bien_id,type,unite,principal_commun);
create index on public.documents_repartition_fourniture(document_id,organization_id);
create index on public.documents_repartition_fourniture(bail_id,organization_id);
create index on public.factures_automatiques(autorise_par);
create index on public.factures_automatiques(id,organization_id);
create index on public.factures_automatiques(organization_id);
create index on public.factures_demandes_releves(facture_id,organization_id);
create index on public.reglages_avis_decompte(bail_id,organization_id);
create or replace function public.diffuser_pdf_repartition(p_org uuid,p_repartition uuid,p_bail uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare d public.documents_repartition_fourniture; b public.baux; l public.lots; date_envoi timestamptz;
begin
 select * into d from public.documents_repartition_fourniture where organization_id=p_org and repartition_id=p_repartition and bail_id=p_bail for update;
 select * into b from public.baux where organization_id=p_org and id=p_bail;
 select * into l from public.lots where organization_id=p_org and id=b.lot_id;
 if auth.uid() is null or d.id is null or b.id is null or not public.org_ecriture_ouverte(p_org) or not consommations_interne.gerant(p_org,l.bien_id,l.id)
 then raise exception 'Accès refusé'; end if;
 if not exists(select 1 from public.documents where id=d.document_id and organization_id=p_org and purged_at is null)
 then raise exception 'PDF indisponible'; end if;
 if d.envoye_le is not null then return d.envoye_le; end if;
 perform public.partager_document_locataire(p_org,d.document_id,true);
 date_envoi:=now();
 update public.documents_repartition_fourniture set envoye_le=date_envoi where id=d.id;
 return date_envoi;
end $$;
