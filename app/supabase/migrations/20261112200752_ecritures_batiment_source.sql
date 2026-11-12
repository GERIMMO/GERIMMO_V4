-- La source commune peut être connue sans attribuer une dépense à un lot arbitraire.
alter table public.ecritures add column bien_source_id uuid,
  add column avis_fiscal_id uuid,
  add foreign key (bien_source_id, organization_id) references public.biens(id, organization_id),
  add foreign key (avis_fiscal_id, organization_id) references public.documents(id, organization_id),
  add check (avis_fiscal_id is null or (bien_source_id is not null and lot_id is null and categorie='Taxe foncière'));
create unique index ecritures_avis_bien_unique on public.ecritures(organization_id,bien_source_id,avis_fiscal_id) where avis_fiscal_id is not null;
create index ecritures_bien_source on public.ecritures(bien_source_id) where bien_source_id is not null;
create index ecritures_avis_document on public.ecritures(avis_fiscal_id) where avis_fiscal_id is not null;

-- Même contrôle sur les inserts directs et sur la RPC. Les montants et les
-- colonnes système gardent les permissions du journal en vigueur.
alter table public.ecritures add check ((bien_source_id is null) = (avis_fiscal_id is null));
create function public.verifier_source_avis_foncier() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if public.est_agent_restreint(new.organization_id) or
     not exists(select from public.biens where id=new.bien_source_id and organization_id=new.organization_id) or
     not exists(select from public.documents where id=new.avis_fiscal_id and organization_id=new.organization_id and type='justificatif' and purged_at is null) then
    raise exception 'Le bien ou son justificatif fiscal est inaccessible.';
  end if;
  return new;
end $$;
revoke all on function public.verifier_source_avis_foncier() from public,anon,authenticated;
create trigger verifier_source_avis_foncier before insert or update on public.ecritures for each row when (new.avis_fiscal_id is not null) execute function public.verifier_source_avis_foncier();
grant insert(bien_source_id,avis_fiscal_id) on public.ecritures to authenticated;

-- Les paiements existants ont déjà une provenance durable. Une seule ligne par écriture.
create view public.journal_par_bien with (security_invoker=true) as
select e.*,coalesce(e.bien_source_id,p.bien_id,l.bien_id) as bien_id
from public.ecritures e
left join public.ecritures_factures_fourniture f on f.ecriture_id=e.id
left join public.paiements_factures_fourniture p on p.id=f.paiement_id and p.organization_id=e.organization_id
left join public.lots l on l.id=e.lot_id and l.organization_id=e.organization_id;
revoke all on public.journal_par_bien from public,anon,authenticated;
grant select on public.journal_par_bien to authenticated;

create or replace function public.enregistrer_avis_foncier(p_org uuid,p_bien uuid,p_doc uuid,p_date date,p_annee integer,
  p_reference text,p_total bigint,p_teom bigint,p_frais bigint) returns void
language plpgsql security invoker set search_path='' as $$
declare nom_bien text; contrat uuid;
begin
  if not public.has_org_role(p_org,array['proprietaire_direct','admin_agence','agent']::public.membership_role[])
     or public.est_agent_restreint(p_org) then raise exception 'Accès refusé'; end if;
  -- Les trois tables contrôlent l’abonnement et la traversée en lecture seule à chaque écriture.
  if p_date is null or p_date>public.aujourdhui_paris() or p_annee is null or p_annee not between 2000 and extract(year from public.aujourdhui_paris())
    or nullif(btrim(p_reference),'') is null or p_total is null or p_teom is null or p_frais is null
    or p_total<=0 or least(p_teom,p_frais)<0 or p_total<p_teom+p_frais then raise exception 'Vérifiez la date et les montants de cet avis.'; end if;
  select nom into strict nom_bien from public.biens where id=p_bien and organization_id=p_org for update;
  if not exists(select from public.documents where id=p_doc and organization_id=p_org and purged_at is null and type='justificatif') then raise exception 'Justificatif inaccessible.'; end if;
  if exists(select from public.ecritures where organization_id=p_org and bien_source_id=p_bien and avis_fiscal_id=p_doc)
    or exists(select from public.factures_fourniture f join public.contrats_fourniture c on c.id=f.contrat_id
      where c.bien_id=p_bien and c.organization_id=p_org and c.categorie='teom' and (f.document_id=p_doc or f.reference=p_reference)) then
    raise exception 'Cet avis est déjà enregistré pour le bien.'; end if;
  if p_teom+p_frais>0 then
    select id into contrat from public.contrats_fourniture where organization_id=p_org and bien_id=p_bien and lot_id is null and categorie='teom' and actif order by created_at,id limit 1;
    if contrat is null then
      insert into public.contrats_fourniture(organization_id,bien_id,fournisseur,categorie,periodicite_mois,preavis_jours)
        values(p_org,p_bien,'Trésor public · taxe foncière','teom',12,0) returning id into contrat;
    end if;
    insert into public.factures_fourniture(organization_id,contrat_id,document_id,reference,periode_debut,periode_fin,total_cents,frais_fixes_cents,frais_gestion_cents)
      values(p_org,contrat,p_doc,p_reference,make_date(p_annee,1,1),make_date(p_annee,12,31),p_teom+p_frais,0,p_frais);
  end if;
  if p_total>p_teom+p_frais then
    insert into public.ecritures(organization_id,bien_source_id,avis_fiscal_id,categorie,sens,montant,date_piece,date_imputation,libelle)
      values(p_org,p_bien,p_doc,'Taxe foncière','depense',(p_total-p_teom-p_frais)::numeric/100,p_date,p_date,p_reference||' (hors TEOM) · '||nom_bien);
  end if;
end $$;
revoke all on function public.enregistrer_avis_foncier(uuid,uuid,uuid,date,integer,text,bigint,bigint,bigint) from public,anon;
grant execute on function public.enregistrer_avis_foncier(uuid,uuid,uuid,date,integer,text,bigint,bigint,bigint) to authenticated;
notify pgrst,'reload schema';
