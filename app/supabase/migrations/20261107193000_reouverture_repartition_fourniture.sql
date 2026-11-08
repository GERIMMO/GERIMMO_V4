-- Correction d'une répartition qui n'a pas encore produit de document ou d'écriture.
create function public.rouvrir_repartition_fourniture(p_org uuid,p_repartition uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.repartitions_fourniture; c public.contrats_fourniture; f public.factures_fourniture;
begin
 select f0.* into f from public.factures_fourniture f0 join public.repartitions_fourniture r0 on r0.facture_id=f0.id
 where r0.id=p_repartition and r0.organization_id=p_org and f0.organization_id=p_org for update of f0;
 select * into r from public.repartitions_fourniture where id=p_repartition and organization_id=p_org for update;
 select * into c from public.contrats_fourniture where id=f.contrat_id and organization_id=p_org;
 if r.id is null or not consommations_interne.gerant(p_org,c.bien_id,c.lot_id) or not public.org_ecriture_ouverte(p_org) then raise exception 'Accès refusé'; end if;
 if r.statut='brouillon' then return; end if;
 if exists(select 1 from public.documents_repartition_fourniture where repartition_id=r.id)
 then raise exception 'Un PDF a déjà été préparé pour cette répartition. Sa correction nécessite une version rectificative ; les documents existants sont conservés.'; end if;
 if exists(select 1 from public.paiements_factures_fourniture where facture_id=f.id)
 or exists(select 1 from public.brouillons_regularisation_fourniture d where d.organization_id=p_org and d.source->'factures' @> jsonb_build_array(jsonb_build_object('repartition_id',r.id)))
 then raise exception 'Cette répartition est déjà utilisée dans les comptes ou une régularisation. Une correction comptable est nécessaire ; les données existantes sont conservées.'; end if;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),p_org,'repartition_fourniture_rouverte',jsonb_build_object('repartition_id',r.id,'avant',to_jsonb(r)));
 update public.repartitions_fourniture set statut='brouillon',validee_le=null,validee_par=null where id=r.id;
end $$;
revoke all on function public.rouvrir_repartition_fourniture(uuid,uuid) from public,anon;
grant execute on function public.rouvrir_repartition_fourniture(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
