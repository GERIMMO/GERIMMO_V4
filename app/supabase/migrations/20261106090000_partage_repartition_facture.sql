-- Envoi informatif d'une facture répartie. Aucune écriture ni régularisation annuelle.
create table public.documents_repartition_fourniture (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 repartition_id uuid not null references public.repartitions_fourniture(id),
 bail_id uuid not null,
 document_id uuid not null,
 envoye_le timestamptz,
 unique(repartition_id,bail_id),
 foreign key(bail_id,organization_id) references public.baux(id,organization_id),
 foreign key(document_id,organization_id) references public.documents(id,organization_id)
);
alter table public.documents_repartition_fourniture enable row level security;
revoke all on public.documents_repartition_fourniture from public,anon,authenticated;
grant select on public.documents_repartition_fourniture to authenticated;
create policy lecture_gerant on public.documents_repartition_fourniture for select to authenticated using (
 exists(select 1 from public.baux b join public.lots l on l.id=b.lot_id and l.organization_id=b.organization_id
 where b.id=bail_id and b.organization_id=documents_repartition_fourniture.organization_id
 and consommations_interne.gerant(b.organization_id,l.bien_id,l.id))
);
create trigger traversee_lecture_seule before insert or update or delete on public.documents_repartition_fourniture
 for each row execute function support_interne.garder_ecriture_traversee();
create trigger diagnostic_artisan_lecture before insert or update or delete on public.documents_repartition_fourniture
 for each row execute function public.refuser_mutation_diagnostic_artisan();

create function public.enregistrer_pdf_repartition(
 p_org uuid,p_repartition uuid,p_bail uuid,p_empreinte text,p_storage_path text,p_taille bigint,p_fichier_empreinte text
) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.repartitions_fourniture; b public.baux; l public.lots; doc uuid;
begin
 select * into r from public.repartitions_fourniture where id=p_repartition and organization_id=p_org for update;
 select * into b from public.baux where id=p_bail and organization_id=p_org;
 select * into l from public.lots where id=b.lot_id and organization_id=p_org;
 if r.id is null or b.id is null or not public.org_ecriture_ouverte(p_org) or not consommations_interne.gerant(p_org,l.bien_id,l.id)
 then raise exception 'Accès refusé'; end if;
 if r.statut<>'validee' or r.empreinte<>p_empreinte then raise exception 'Répartition non validée ou modifiée'; end if;
 if not exists(select 1 from jsonb_array_elements(r.lignes) x where x->>'bail_id'=p_bail::text and (x->>'recuperable')::boolean)
 then raise exception 'Ce bail ne participe pas aux charges récupérables de cette facture'; end if;
 select document_id into doc from public.documents_repartition_fourniture where repartition_id=p_repartition and bail_id=p_bail;
 if doc is not null then return doc; end if;
 if p_storage_path is null or p_fichier_empreinte is null or p_taille is null or p_storage_path not like p_org::text||'/%' or p_fichier_empreinte !~ '^[a-f0-9]{64}$' or p_taille<=0
 then raise exception 'Fichier invalide'; end if;
 insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,deposited_by)
 values(p_org,'courrier','Répartition de facture · '||l.nom,p_storage_path,'application/pdf',p_taille,p_fichier_empreinte,auth.uid())
 returning id into doc;
 insert into public.document_liens(organization_id,document_id,entite,entite_id) values
 (p_org,doc,'organisation',p_org),(p_org,doc,'lot',l.id),(p_org,doc,'bail',b.id);
 insert into public.document_liens(organization_id,document_id,entite,entite_id)
 select p_org,doc,'personne',p.id from public.persons p where p.organization_id=p_org
 and (p.id=b.locataire_principal or exists(select 1 from public.bail_personnes bp where bp.bail_id=b.id and bp.organization_id=p_org and bp.person_id=p.id and bp.role='colocataire' and (bp.date_depart is null or bp.date_depart >= (select periode_debut from public.factures_fourniture where id=r.facture_id))))
 on conflict do nothing;
 insert into public.documents_repartition_fourniture(organization_id,repartition_id,bail_id,document_id)
 values(p_org,p_repartition,p_bail,doc);
 return doc;
end $$;

create function public.diffuser_pdf_repartition(p_org uuid,p_repartition uuid,p_bail uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare d public.documents_repartition_fourniture; b public.baux; l public.lots; date_envoi timestamptz;
begin
 select * into d from public.documents_repartition_fourniture where organization_id=p_org and repartition_id=p_repartition and bail_id=p_bail for update;
 select * into b from public.baux where organization_id=p_org and id=p_bail;
 select * into l from public.lots where organization_id=p_org and id=b.lot_id;
 if d.id is null or b.id is null or not public.org_ecriture_ouverte(p_org) or not consommations_interne.gerant(p_org,l.bien_id,l.id)
 then raise exception 'Accès refusé'; end if;
 if not exists(select 1 from public.documents where id=d.document_id and organization_id=p_org and purged_at is null)
 then raise exception 'PDF indisponible'; end if;
 if d.envoye_le is not null then return d.envoye_le; end if;
 perform public.partager_document_locataire(p_org,d.document_id,true);
 date_envoi:=now();
 update public.documents_repartition_fourniture set envoye_le=date_envoi where id=d.id;
 return date_envoi;
end $$;
revoke all on function public.enregistrer_pdf_repartition(uuid,uuid,uuid,text,text,bigint,text),
 public.diffuser_pdf_repartition(uuid,uuid,uuid) from public,anon;
grant execute on function public.enregistrer_pdf_repartition(uuid,uuid,uuid,text,text,bigint,text),
 public.diffuser_pdf_repartition(uuid,uuid,uuid) to authenticated;
