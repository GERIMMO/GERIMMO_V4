-- Pouvoir limité au contrat indiqué. Les coordonnées sont relues dans l'annuaire à chaque préparation.
create table public.representations_bail (
 bail_id uuid not null references public.baux(id),
 societe_id uuid not null references public.persons(id),
 personne_id uuid not null references public.persons(id),
 justificatif_id uuid not null references public.documents(id),
 empreinte_justificatif text not null,
 fin_validite date,
 confirme_par uuid not null,
 confirme_le timestamptz not null default now(),
 primary key (bail_id,societe_id),
 check (societe_id <> personne_id)
);
alter table public.representations_bail enable row level security;
revoke all on public.representations_bail from public, anon, authenticated;
grant select on public.representations_bail to authenticated;
create policy lecture_gestionnaire on public.representations_bail for select to authenticated using (
 exists(select 1 from public.baux b join public.lots l on l.id=b.lot_id where b.id=bail_id
 and exists(select from public.memberships m where m.account_id=auth.uid() and m.organization_id=b.organization_id and m.role='proprietaire_direct' and m.status='active')
 and consommations_interne.gerant(b.organization_id,l.bien_id,l.id))
);

create function public.designer_representant_bail(p_bail uuid,p_societe uuid,p_personne uuid,p_justificatif uuid,p_fin date)
returns void language plpgsql security definer set search_path='' as $$
declare b public.baux; lot public.lots;
begin
 select * into b from public.baux where id=p_bail for update;
 select * into lot from public.lots where id=b.lot_id;
 if b.id is null or not coalesce(consommations_interne.gerant(b.organization_id,lot.bien_id,b.lot_id),false)
 or not exists(select from public.memberships m where m.account_id=auth.uid() and m.organization_id=b.organization_id and m.role='proprietaire_direct' and m.status='active')
 then raise exception 'Bail inaccessible' using errcode='42501'; end if;
 if b.etat <> 'brouillon' or b.document_signe is not null or exists(select from public.bail_signature_circuits c where c.bail_id=b.id and c.etat in ('preparation','en_cours','a_verifier','termine'))
 then raise exception 'Le bail est déjà signé ou un circuit est engagé.'; end if;
 if not exists(select from public.detentions d join public.persons s on s.id=d.person_id
 where d.organization_id=b.organization_id and d.lot_id=b.lot_id and s.organization_id=b.organization_id and s.id=p_societe
 and s.archived_at is null and s.qualite in ('SCI','SCI familiale','Personne morale')
 and d.date_debut<=public.aujourdhui_paris() and (d.date_fin is null or d.date_fin>=public.aujourdhui_paris()))
 then raise exception 'Cette société ne détient pas ce logement.'; end if;
 if p_personne is null and p_justificatif is null then
 delete from public.representations_bail where bail_id=b.id and societe_id=p_societe;
 else
 if p_fin < public.aujourdhui_paris() or not exists(select from public.persons p where p.id=p_personne and p.organization_id=b.organization_id
 and p.archived_at is null and coalesce(p.qualite,'Personne physique')='Personne physique' and nullif(trim(p.prenom),'') is not null)
 or p_personne=b.locataire_principal or exists(select from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=p_personne and bp.date_depart is null)
 then raise exception 'Vérifiez la personne physique, son rôle et la date du pouvoir.'; end if;
 if not exists(select from public.documents j join public.document_liens d on d.document_id=j.id and d.organization_id=j.organization_id
 where j.id=p_justificatif and j.organization_id=b.organization_id and d.entite='personne' and d.entite_id=p_societe and j.purged_at is null and j.type in ('justificatif','mandat') and j.mime_type='application/pdf' and j.empreinte is not null and (j.expire_le is null or j.expire_le>=public.aujourdhui_paris()) and not exists(select from public.documents newer where newer.remplace_id=j.id))
 then raise exception 'Joignez un justificatif PDF du pouvoir à la fiche de la société.'; end if;
 insert into public.representations_bail values(b.id,p_societe,p_personne,p_justificatif,(select empreinte from public.documents where id=p_justificatif),p_fin,auth.uid(),now())
 on conflict(bail_id,societe_id) do update set personne_id=excluded.personne_id,justificatif_id=excluded.justificatif_id,empreinte_justificatif=excluded.empreinte_justificatif,fin_validite=excluded.fin_validite,confirme_par=excluded.confirme_par,confirme_le=excluded.confirme_le;
 end if;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),b.organization_id,'representation_bail',jsonb_build_object('bail',b.id,'societe',p_societe,'representant',p_personne,'justificatif',p_justificatif));
end $$;
revoke all on function public.designer_representant_bail(uuid,uuid,uuid,uuid,date) from public,anon;
grant execute on function public.designer_representant_bail(uuid,uuid,uuid,uuid,date) to authenticated;
create function public.representants_actifs_bail(p_bail uuid)
returns table(societe_id uuid,personne_id uuid,nom text,prenom text,email text,telephone text,justificatif_id uuid,empreinte text,confirme_le timestamptz)
language sql stable security invoker set search_path='' as $$
select r.societe_id,p.id,p.nom::text,p.prenom::text,p.email::text,p.telephone::text,j.id,j.empreinte::text,r.confirme_le
from public.representations_bail r join public.baux b on b.id=r.bail_id
join public.persons p on p.id=r.personne_id and p.organization_id=b.organization_id
join public.persons s on s.id=r.societe_id and s.organization_id=b.organization_id
join public.documents j on j.id=r.justificatif_id and j.organization_id=b.organization_id
where r.bail_id=p_bail and p.archived_at is null and s.archived_at is null and s.qualite in ('SCI','SCI familiale','Personne morale')
and coalesce(p.qualite,'Personne physique')='Personne physique'
and p.id is distinct from b.locataire_principal
and not exists(select from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=p.id and bp.date_depart is null)
and (r.fin_validite is null or r.fin_validite>=public.aujourdhui_paris())
and j.purged_at is null and j.mime_type='application/pdf' and j.type in ('justificatif','mandat') and j.empreinte=r.empreinte_justificatif and (j.expire_le is null or j.expire_le>=public.aujourdhui_paris()) and not exists(select from public.documents newer where newer.remplace_id=j.id)
and exists(select from public.detentions d where d.lot_id=b.lot_id and d.organization_id=b.organization_id and d.person_id=s.id and d.date_debut<=public.aujourdhui_paris() and (d.date_fin is null or d.date_fin>=public.aujourdhui_paris()))
and exists(select from public.document_liens l where l.document_id=j.id and l.organization_id=b.organization_id and l.entite='personne' and l.entite_id=s.id)
$$;
revoke all on function public.representants_actifs_bail(uuid) from public,anon;
grant execute on function public.representants_actifs_bail(uuid) to authenticated;
-- L'acquisition du circuit et la modification du pouvoir prennent le même verrou de bail.
create function public.controler_pouvoir_envoi_bail() returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.baux; s record;
begin
 if new.modele<>'bail' or new.etat<>'preparation' then return new; end if;
 select * into strict b from public.baux where id=new.bail_id and organization_id=new.organization_id for update;
 for s in select distinct p.id from public.detentions d join public.persons p on p.id=d.person_id and p.organization_id=d.organization_id
 where d.organization_id=b.organization_id and d.lot_id=b.lot_id and p.qualite in ('SCI','SCI familiale','Personne morale')
 and d.date_debut<=public.aujourdhui_paris() and (d.date_fin is null or d.date_fin>=public.aujourdhui_paris())
 loop
 if not exists(select from public.representants_actifs_bail(b.id) r, jsonb_array_elements(new.signataires) x
 where r.societe_id=s.id and x->>'qualite'='Propriétaire' and x->>'personId'=r.personne_id::text
 and x->'representation'->>'societeId'=s.id::text and x->'representation'->>'justificatifId'=r.justificatif_id::text
 and x->'representation'->>'empreinte'=r.empreinte and (x->'representation'->>'confirmeLe')::timestamptz=r.confirme_le
 and lower(trim(r.email))=lower(trim(x->>'email'))) then raise exception 'Pouvoir modifié : préparez à nouveau le bail avant tout envoi.'; end if;
 end loop;
 return new;
end $$;
revoke all on function public.controler_pouvoir_envoi_bail() from public,anon,authenticated;
create trigger controler_pouvoir_envoi_bail before insert or update of etat on public.bail_signature_circuits for each row execute function public.controler_pouvoir_envoi_bail();
notify pgrst,'reload schema';
