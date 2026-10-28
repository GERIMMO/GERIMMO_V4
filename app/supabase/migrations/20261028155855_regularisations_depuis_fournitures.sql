-- Réutiliser les parts déjà affectées : aucun second prorata année/chambre.
create table public.brouillons_regularisation_fourniture (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 bail_id uuid not null, annee integer not null check(annee between 1970 and 2200),
 source jsonb not null, empreinte text not null,
 regularisation_id uuid unique references public.regularisations_charges(id),
 created_by uuid not null references public.accounts(id), created_at timestamptz not null default now(),
 unique(bail_id,annee), foreign key(bail_id,organization_id) references public.baux(id,organization_id)
);
create index brouillons_regul_fourniture_org on public.brouillons_regularisation_fourniture(organization_id);
create index brouillons_regul_fourniture_bail on public.brouillons_regularisation_fourniture(bail_id,organization_id);
create index brouillons_regul_fourniture_auteur on public.brouillons_regularisation_fourniture(created_by);
alter table public.brouillons_regularisation_fourniture enable row level security;
revoke all on public.brouillons_regularisation_fourniture from public,anon,authenticated;
grant select on public.brouillons_regularisation_fourniture to authenticated;
create policy brouillon_fourniture_lecture on public.brouillons_regularisation_fourniture for select to authenticated
 using(organization_id in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[])) and not public.bail_hors_portefeuille(organization_id,bail_id));
create trigger traversee_lecture_seule before insert or update or delete on public.brouillons_regularisation_fourniture for each row execute function support_interne.garder_ecriture_traversee();
create trigger diagnostic_artisan_lecture before insert or update or delete on public.brouillons_regularisation_fourniture for each row execute function public.refuser_mutation_diagnostic_artisan();

create function consommations_interne.source_regularisation(p_org uuid,p_bail uuid,p_annee integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.baux; l public.lots; bi public.biens; v_factures jsonb; v_reel numeric; v_provisions numeric; v_personne text; v_ligne record; v_debut date; v_fin date; v_segments jsonb:='[]';
begin
 select * into b from public.baux where id=p_bail and organization_id=p_org for update;
 select * into l from public.lots where id=b.lot_id and organization_id=p_org;
 select * into bi from public.biens where id=l.bien_id and organization_id=p_org;
 if b.id is null or not consommations_interne.gerant(p_org,l.bien_id,l.id) or not public.org_ecriture_ouverte(p_org) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if b.charges_mode is distinct from 'provision' then raise exception 'Ce bail ne prévoit pas de provisions régularisables'; end if;
 if b.etat not in('actif','preavis','termine') then raise exception 'Le bail doit être en cours ou terminé'; end if;
 if p_annee is null or p_annee<1970 or p_annee>extract(year from public.aujourdhui_paris()) then raise exception 'Choisissez un exercice commencé'; end if;
 if b.date_debut>make_date(p_annee,12,31) or b.date_fin<make_date(p_annee,1,1) then raise exception 'Le bail ne couvre pas cet exercice'; end if;
 -- Les postes du syndic peuvent déjà inclure les mêmes fournitures. Aucun
 -- cumul implicite tant que leurs pièces n'ont pas été rapprochées.
 if exists(select 1 from public.appels_charges a where a.lot_id=l.id and a.exercice=p_annee) then raise exception 'Des appels du syndic existent pour cet exercice. Utilisez la régularisation du syndic après rapprochement des factures pour éviter un double compte'; end if;
 -- Les consommations sont mesurées entre deux index : la borne finale est
 -- exclusive. Les lignes validées ont déjà les parts réelles de chaque segment.
 -- Seule une ligne qui traverse le 1er janvier sans index intermédiaire bloque.
 for v_ligne in
  select r.id,r.empreinte,r.source->>'mode' mode,f.id facture_id,f.document_id,f.reference,c.fournisseur,
   f.periode_debut,f.periode_fin,d.purged_at,x.periode_debut segment_debut,x.periode_fin segment_fin,x.montant_cents
  from public.repartitions_fourniture r join public.factures_fourniture f on f.id=r.facture_id and f.organization_id=p_org
  join public.contrats_fourniture c on c.id=f.contrat_id join public.documents d on d.id=f.document_id
  cross join lateral jsonb_to_recordset(r.lignes) x(bail_id uuid,lot_id uuid,recuperable boolean,montant_cents bigint,periode_debut date,periode_fin date)
  where r.organization_id=p_org and r.statut='validee' and x.bail_id=b.id and x.lot_id=l.id and x.recuperable
  order by f.periode_debut,r.id,x.periode_debut,x.periode_fin
 loop
  v_debut:=case when v_ligne.mode='consommations' then coalesce(v_ligne.segment_debut,v_ligne.periode_debut) else v_ligne.periode_debut end;
  v_fin:=case when v_ligne.mode='consommations' then coalesce(v_ligne.segment_fin,v_ligne.periode_fin)-1 else v_ligne.periode_fin end;
  if v_debut>make_date(p_annee,12,31) or v_fin<make_date(p_annee,1,1) then continue; end if;
  if v_debut<make_date(p_annee,1,1) or v_fin>make_date(p_annee,12,31) then
   raise exception 'Une part de facture couvre deux années sans ventilation vérifiée au 1er janvier. Complétez les index et les segments avant la régularisation : aucun prorata de consommation ne sera inventé';
  end if;
  if v_ligne.purged_at is not null then raise exception 'Un justificatif de facture n’est plus disponible'; end if;
  v_segments:=v_segments||jsonb_build_array(jsonb_build_object('repartition_id',v_ligne.id,'empreinte',v_ligne.empreinte,'facture_id',v_ligne.facture_id,'document_id',v_ligne.document_id,'reference',v_ligne.reference,'fournisseur',v_ligne.fournisseur,'debut',v_debut,'fin',v_fin,'montant_cents',v_ligne.montant_cents));
 end loop;
 select jsonb_agg(jsonb_build_object('repartition_id',s.repartition_id,'empreinte',s.empreinte,'facture_id',s.facture_id,'document_id',s.document_id,'reference',s.reference,'fournisseur',s.fournisseur,'debut',s.debut,'fin',s.fin,'montant_cents',s.cents,'segments',s.segments) order by s.debut,s.repartition_id),sum(s.cents)::numeric/100
 into v_factures,v_reel from (
  select x.repartition_id,x.empreinte,x.facture_id,x.document_id,x.reference,x.fournisseur,min(x.debut) debut,max(x.fin) fin,sum(x.montant_cents)::bigint cents,
   jsonb_agg(jsonb_build_object('debut',x.debut,'fin',x.fin,'montant_cents',x.montant_cents) order by x.debut,x.fin) segments
  from jsonb_to_recordset(v_segments) x(repartition_id uuid,empreinte text,facture_id uuid,document_id uuid,reference text,fournisseur text,debut date,fin date,montant_cents bigint)
  group by x.repartition_id,x.empreinte,x.facture_id,x.document_id,x.reference,x.fournisseur
 )s;
 if v_factures is null then raise exception 'Aucun décompte validé et récupérable pour ce bail sur cet exercice'; end if;
 v_provisions:=public.provisions_charges_annee(b.id,p_annee);
 select concat_ws(' ',p.prenom,p.nom) into v_personne from public.persons p where p.id=b.locataire_principal and p.organization_id=p_org;
 return jsonb_build_object('annee',p_annee,'bail',jsonb_build_object('id',b.id,'date_debut',b.date_debut,'date_fin',b.date_fin,'chambre_id',b.chambre_id,'charges_mode',b.charges_mode),
  'locataire',v_personne,'logement',l.nom,'adresse',concat_ws(', ',bi.address_line1,concat_ws(' ',bi.postal_code,bi.city)),
  'factures',v_factures,'charges_reelles',v_reel,'provisions',v_provisions,'ecart',round(v_provisions-v_reel,2));
end $$;
revoke all on function consommations_interne.source_regularisation(uuid,uuid,integer) from public,anon,authenticated,service_role;

create function consommations_interne.preparer_regularisation(p_org uuid,p_bail uuid,p_annee integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_source jsonb; v_id uuid;
begin
 v_source:=consommations_interne.source_regularisation(p_org,p_bail,p_annee);
 if exists(select 1 from public.regularisations_charges where bail_id=p_bail and annee=p_annee) then raise exception 'Cet exercice a déjà été régularisé. Aucune seconde récupération n’est possible'; end if;
 insert into public.brouillons_regularisation_fourniture(organization_id,bail_id,annee,source,empreinte,created_by)
 values(p_org,p_bail,p_annee,v_source,encode(sha256(convert_to(v_source::text,'UTF8')),'hex'),auth.uid())
 on conflict(bail_id,annee) do update set source=excluded.source,empreinte=excluded.empreinte,created_by=excluded.created_by,created_at=now()
 returning id into v_id;
 return v_id;
end $$;
revoke all on function consommations_interne.preparer_regularisation(uuid,uuid,integer) from public,anon;
grant execute on function consommations_interne.preparer_regularisation(uuid,uuid,integer) to authenticated;
create function public.preparer_regularisation_fourniture(p_org uuid,p_bail uuid,p_annee integer)
returns uuid language sql security invoker set search_path='' as $$ select consommations_interne.preparer_regularisation(p_org,p_bail,p_annee); $$;
revoke all on function public.preparer_regularisation_fourniture(uuid,uuid,integer) from public,anon;
grant execute on function public.preparer_regularisation_fourniture(uuid,uuid,integer) to authenticated;

create function consommations_interne.emettre_regularisation(p_org uuid,p_brouillon uuid,p_empreinte text,p_complet boolean,p_exercice_en_cours boolean,p_etaler boolean,p_storage_path text,p_mime text,p_taille bigint,p_fichier_empreinte text)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.brouillons_regularisation_fourniture; v_source jsonb; v_doc uuid; v_id uuid; v_ecart numeric; v_reel numeric; v_prov numeric; v_tardive boolean; v_etalement jsonb; v_base numeric; v_k integer; v_premier date;
begin
 select * into d from public.brouillons_regularisation_fourniture where id=p_brouillon and organization_id=p_org;
 if d.id is null then raise exception 'Accès refusé'; end if;
 v_source:=consommations_interne.source_regularisation(p_org,d.bail_id,d.annee);
 select * into d from public.brouillons_regularisation_fourniture where id=p_brouillon for update;
 if d.regularisation_id is not null then return d.regularisation_id; end if;
 if d.empreinte is distinct from p_empreinte or v_source is distinct from d.source then raise exception 'Des factures, provisions ou données du bail ont changé. Recalculez et relisez le brouillon'; end if;
 if p_complet is distinct from true then raise exception 'Confirmez que toutes les charges de l’exercice figurent dans le décompte'; end if;
 if make_date(d.annee,12,31)>=public.aujourdhui_paris() and p_exercice_en_cours is distinct from true then raise exception 'L’exercice n’est pas terminé. Une confirmation explicite est nécessaire'; end if;
 if exists(select 1 from public.regularisations_charges where bail_id=d.bail_id and annee=d.annee) then raise exception 'Cet exercice a déjà été régularisé'; end if;
 v_reel:=(d.source->>'charges_reelles')::numeric;v_prov:=(d.source->>'provisions')::numeric;v_ecart:=round(v_prov-v_reel,2);
 if v_ecart<0 and make_date(d.annee,12,31)<(public.aujourdhui_paris()-interval '3 years')::date then raise exception 'Exercice prescrit : aucun complément ne peut être réclamé au-delà de trois ans'; end if;
 v_tardive:=public.aujourdhui_paris()>make_date(d.annee+1,12,31);
 if coalesce(p_etaler,false) then
  if not v_tardive or v_ecart>=0 then raise exception 'L’étalement exige un complément et une régularisation tardive'; end if;
  v_base:=trunc(-v_ecart*100/12)/100;v_premier:=(date_trunc('month',public.aujourdhui_paris())+interval '1 month')::date;v_etalement:='[]';
  for v_k in 1..12 loop v_etalement:=v_etalement||jsonb_build_array(jsonb_build_object('rang',v_k,'echeance',(v_premier+((v_k-1)||' months')::interval)::date,'montant',case when v_k<12 then v_base else round(-v_ecart-v_base*11,2) end));end loop;
 end if;
 v_doc:=public.creer_fiche_justificatif(p_org,'Décompte annuel de charges '||d.annee,p_storage_path,p_mime,p_taille,p_fichier_empreinte);
 insert into public.regularisations_charges(organization_id,bail_id,annee,provisions,charges_reelles,ecart,justificatif_document,note,tardive,etalement_12_mois)
 values(p_org,d.bail_id,d.annee,v_prov,v_reel,v_ecart,v_doc,'Parts de factures validées déjà affectées au bail : aucun nouveau prorata. Brouillon '||d.id,v_tardive,v_etalement) returning id into v_id;
 insert into public.document_liens(organization_id,document_id,entite,entite_id) values(p_org,v_doc,'bail',d.bail_id) on conflict do nothing;
 -- Le catalogue locataire liste ses pièces personnelles. Le lien au bail
 -- autorise la lecture du fichier ; ces liens rendent aussi la pièce trouvable.
 insert into public.document_liens(organization_id,document_id,entite,entite_id)
 select p_org,v_doc,'personne',p.id from public.persons p where p.organization_id=p_org and (
  p.id=(select b.locataire_principal from public.baux b where b.id=d.bail_id)
  or exists(select 1 from public.bail_personnes bp where bp.bail_id=d.bail_id and bp.person_id=p.id and bp.role='colocataire')) on conflict do nothing;
 update public.brouillons_regularisation_fourniture set regularisation_id=v_id where id=d.id;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),p_org,'regularisation_fourniture_emise',jsonb_build_object('brouillon_id',d.id,'regularisation_id',v_id,'empreinte',d.empreinte));
 return v_id;
end $$;
revoke all on function consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text) from public,anon;
grant execute on function consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text) to authenticated;
create function public.emettre_regularisation_fourniture(p_org uuid,p_brouillon uuid,p_empreinte text,p_complet boolean,p_exercice_en_cours boolean,p_etaler boolean,p_storage_path text,p_mime text,p_taille bigint,p_fichier_empreinte text)
returns uuid language sql security invoker set search_path='' as $$ select consommations_interne.emettre_regularisation(p_org,p_brouillon,p_empreinte,p_complet,p_exercice_en_cours,p_etaler,p_storage_path,p_mime,p_taille,p_fichier_empreinte); $$;
revoke all on function public.emettre_regularisation_fourniture(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text) from public,anon;
grant execute on function public.emettre_regularisation_fourniture(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text) to authenticated;
