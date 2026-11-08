create table public.reglages_avis_decompte(
 bail_id uuid primary key, organization_id uuid not null, automatique boolean not null default false,
 foreign key(bail_id,organization_id) references public.baux(id,organization_id) on delete cascade
);
alter table public.reglages_avis_decompte enable row level security;
revoke all on public.reglages_avis_decompte from public,anon,authenticated;
grant select,insert,update on public.reglages_avis_decompte to authenticated;
create policy gerer_avis on public.reglages_avis_decompte for all to authenticated
 using(exists(select 1 from public.baux b join public.lots l on l.id=b.lot_id where b.id=bail_id
 and b.organization_id=reglages_avis_decompte.organization_id and consommations_interne.gerant(b.organization_id,l.bien_id,l.id)))
 with check(public.org_ecriture_ouverte(organization_id) and exists(select 1 from public.baux b join public.lots l on l.id=b.lot_id where b.id=bail_id
 and b.organization_id=reglages_avis_decompte.organization_id and consommations_interne.gerant(b.organization_id,l.bien_id,l.id)));
create trigger traversee_lecture_seule before insert or update or delete on public.reglages_avis_decompte for each row execute function support_interne.garder_ecriture_traversee();
create trigger diagnostic_artisan_lecture before insert or update or delete on public.reglages_avis_decompte for each row execute function public.refuser_mutation_diagnostic_artisan();
alter table public.brouillons_regularisation_fourniture add column avis_le timestamptz,
  add constraint avis_sur_decompte_valide check (avis_le is null or regularisation_id is not null);

-- Le PDF et sa régularisation doivent exister dans la même transaction.
create function consommations_interne.avis_apres_validation() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.regularisation_id is null and new.regularisation_id is not null and
    exists(select 1 from public.reglages_avis_decompte where bail_id=new.bail_id and organization_id=new.organization_id and automatique)
  then new.avis_le := now(); end if;
  return new;
end $$;
create trigger avis_apres_validation before update of regularisation_id on public.brouillons_regularisation_fourniture
for each row execute function consommations_interne.avis_apres_validation();

create function consommations_interne.notifier_decompte(p_org uuid,p_id uuid) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare t timestamptz;
begin
 update public.brouillons_regularisation_fourniture d set avis_le=coalesce(d.avis_le,now())
 from public.baux b join public.lots l on l.id=b.lot_id and l.organization_id=b.organization_id
 where d.id=p_id and d.organization_id=p_org and b.id=d.bail_id and b.organization_id=p_org
 and d.regularisation_id is not null and public.org_ecriture_ouverte(p_org)
 and consommations_interne.gerant(p_org,l.bien_id,l.id)
 returning d.avis_le into t;
 if t is null then raise exception 'Décompte validé inaccessible'; end if;
 return t;
end $$;
create function public.notifier_decompte(p_org uuid,p_id uuid) returns timestamptz
language sql security invoker set search_path='' as $$select consommations_interne.notifier_decompte(p_org,p_id)$$;
create function consommations_interne.mes_avis_decompte(p_org uuid)
returns table(document_id uuid, annee integer, avis_le timestamptz)
language sql stable security definer set search_path='' as $$
 select r.justificatif_document,d.annee,d.avis_le from public.brouillons_regularisation_fourniture d
 join public.regularisations_charges r on r.id=d.regularisation_id and r.organization_id=d.organization_id and r.bail_id=d.bail_id
 where d.organization_id=p_org and d.avis_le is not null
 and exists(select 1 from public.mes_pieces_locataire(p_org) p where p.document_id=r.justificatif_document)
 order by d.avis_le desc;
$$;
create function public.mes_avis_decompte(p_org uuid) returns table(document_id uuid,annee integer,avis_le timestamptz)
language sql stable security invoker set search_path='' as $$select * from consommations_interne.mes_avis_decompte(p_org)$$;
revoke all on function consommations_interne.notifier_decompte(uuid,uuid), public.notifier_decompte(uuid,uuid),
 consommations_interne.mes_avis_decompte(uuid), public.mes_avis_decompte(uuid) from public,anon;
grant execute on function consommations_interne.notifier_decompte(uuid,uuid), public.notifier_decompte(uuid,uuid),
 consommations_interne.mes_avis_decompte(uuid), public.mes_avis_decompte(uuid) to authenticated;

-- Enrichir le cliché du calcul existant, sans recalculer la part individuelle.
alter function consommations_interne.source_regularisation(uuid,uuid,integer) rename to source_regularisation_montants;
create function consommations_interne.source_regularisation(p_org uuid,p_bail uuid,p_annee integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; noms text; factures jsonb;
begin
 s := consommations_interne.source_regularisation_montants(p_org,p_bail,p_annee);
 select string_agg(distinct concat_ws(' ',p.prenom,p.nom),', ') into noms
 from public.baux b join public.detentions d on d.lot_id=b.lot_id and d.organization_id=b.organization_id and d.date_fin is null
 join public.persons p on p.id=d.person_id and p.organization_id=b.organization_id where b.id=p_bail and b.organization_id=p_org;
 select jsonb_agg(f.val || jsonb_build_object('methode',r.motif,'index',(
   select coalesce(jsonb_agg(distinct m.val),'[]'::jsonb) from jsonb_array_elements(r.lignes) l(val)
   join jsonb_array_elements(r.source->'compteurs') m(val) on m.val->>'id'=l.val->>'compteur_id'
    and m.val->>'periode_debut'=l.val->>'periode_debut' and m.val->>'periode_fin'=l.val->>'periode_fin'
   where l.val->>'bail_id'=p_bail::text and extract(year from (l.val->>'periode_debut')::date)=p_annee
 )) order by f.ord) into factures from jsonb_array_elements(s->'factures') with ordinality f(val,ord)
 join public.repartitions_fourniture r on r.id=(f.val->>'repartition_id')::uuid and r.organization_id=p_org;
 return s || jsonb_build_object('bailleur',noms,'factures',factures);
end $$;
revoke all on function consommations_interne.source_regularisation(uuid,uuid,integer) from public,anon,authenticated,service_role;
-- Réglage géré par une opération dédiée. Le contrôle d’abonnement reste en place.
revoke insert,update on public.reglages_avis_decompte from authenticated;
create function consommations_interne.regler_avis(p_org uuid,p_bail uuid,p_actif boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_actif is null or not public.org_ecriture_ouverte(p_org) or not exists(
 select 1 from public.baux b join public.lots l on l.id=b.lot_id and l.organization_id=b.organization_id
 where b.id=p_bail and b.organization_id=p_org and consommations_interne.gerant(p_org,l.bien_id,l.id)
 ) then raise exception 'Accès refusé' using errcode='42501'; end if;
 insert into public.reglages_avis_decompte(bail_id,organization_id,automatique) values(p_bail,p_org,p_actif)
 on conflict(bail_id) do update set automatique=excluded.automatique;
 return p_actif;
end $$;
create function public.regler_avis_decompte(p_org uuid,p_bail uuid,p_actif boolean)
returns boolean language sql security invoker set search_path='' as $$select consommations_interne.regler_avis(p_org,p_bail,p_actif)$$;
revoke all on function consommations_interne.regler_avis(uuid,uuid,boolean),public.regler_avis_decompte(uuid,uuid,boolean) from public,anon;
grant execute on function consommations_interne.regler_avis(uuid,uuid,boolean),public.regler_avis_decompte(uuid,uuid,boolean) to authenticated;
create function consommations_interne.demander_index_facture(p_org uuid,p_facture uuid,p_compteur uuid,p_jour date)
returns void language plpgsql security definer set search_path='' as $$
declare m public.compteurs_consommation; f public.factures_fourniture; c public.contrats_fourniture;
begin
 select * into m from public.compteurs_consommation where id=p_compteur and organization_id=p_org for update;
 if m.id is null or not consommations_interne.gerant(p_org,m.bien_id,m.lot_id) or not public.org_ecriture_ouverte(p_org) then raise exception 'Accès refusé'; end if;
 select * into f from public.factures_fourniture where organization_id=p_org and id=p_facture;
 select * into c from public.contrats_fourniture where organization_id=p_org and id=f.contrat_id;
 if c.id is null or c.bien_id<>m.bien_id or (c.lot_id is not null and c.lot_id is distinct from m.lot_id)
 or not (c.categorie='eau' and m.type in ('eau_froide','eau_chaude') or c.categorie='electricite_commune' and m.type='electricite' or c.categorie=m.type)
 or p_jour is null or p_jour not in (f.periode_debut,f.periode_fin) or p_jour>public.aujourdhui_paris()
 then raise exception 'Vérifiez le compteur et la période de la facture'; end if;
 if not m.actif or m.lot_id is null or not exists(
 select 1 from public.baux b join public.persons p on p.id=m.personne_referente and p.organization_id=p_org
 join public.memberships a on a.account_id=p.account_id and a.organization_id=p_org and a.role='locataire' and a.status='active'
 where b.id=m.bail_referent and b.organization_id=p_org and b.lot_id=m.lot_id and b.etat in ('actif','preavis')
 and p_jour between b.date_debut and coalesce(b.date_fin,'infinity'::date)
 and (b.locataire_principal=p.id or exists(select 1 from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=p.id and bp.role='colocataire' and bp.date_depart is null)))
 then raise exception 'Aucun locataire autorisé pour ce relevé'; end if;
 if p_jour<=m.date_index_initial or exists(select 1 from public.releves_consommation where compteur_id=m.id and date_releve>=p_jour)
 then raise exception 'Pour un index historique, saisissez le relevé justifié depuis la fiche du compteur'; end if;
 if exists(select 1 from public.demandes_releves where compteur_id=m.id and echeance=p_jour and bail_id=m.bail_referent and personne_id=m.personne_referente and statut='attendue') then return; end if;
 if exists(select 1 from public.demandes_releves where compteur_id=m.id and (statut='attendue' or echeance=p_jour)) then raise exception 'Une demande existe déjà pour ce compteur. Vérifiez son suivi'; end if;
 insert into public.demandes_releves(organization_id,compteur_id,bail_id,personne_id,echeance)
 values(p_org,m.id,m.bail_referent,m.personne_referente,p_jour);
end $$;
create function public.demander_index_facture(p_org uuid,p_facture uuid,p_compteur uuid,p_jour date)
returns void language sql security invoker set search_path='' as $$select consommations_interne.demander_index_facture(p_org,p_facture,p_compteur,p_jour)$$;
revoke all on function consommations_interne.demander_index_facture(uuid,uuid,uuid,date), public.demander_index_facture(uuid,uuid,uuid,date) from public,anon;
grant execute on function consommations_interne.demander_index_facture(uuid,uuid,uuid,date), public.demander_index_facture(uuid,uuid,uuid,date) to authenticated;
-- Le contrôle final doit utiliser le même rattachement et les mêmes index que le brouillon.
create function consommations_interne.verifier_compteurs_principaux() returns trigger
language plpgsql set search_path='' as $$
declare debut date; fin date; mesure record; bilan jsonb := '[]';
begin
 if new.source->>'mode' <> 'consommations' then return new; end if;
 debut := (new.source->'facture'->>'periode_debut')::date;
 fin := (new.source->'facture'->>'periode_fin')::date;
 for mesure in
  with compteurs as (
   select distinct (v->>'compteur_id')::uuid id from jsonb_array_elements(new.lignes) v
  ), groupes as (
   select enfant.compteur_principal_id id, array_agg(enfant.id order by enfant.id) enfants,
    sum(rf.index_releve-coalesce(rd.index_releve,case when enfant.date_index_initial=debut then enfant.index_initial end)) quantite
   from compteurs x join public.compteurs_consommation enfant on enfant.id=x.id and enfant.organization_id=new.organization_id
   left join public.releves_consommation rd on rd.compteur_id=x.id and rd.date_releve=debut
   left join public.releves_consommation rf on rf.compteur_id=x.id and rf.date_releve=fin
   where enfant.compteur_principal_id is not null group by enfant.compteur_principal_id
  )
  select g.*,coalesce(rd.index_releve,case when m.date_index_initial=debut then m.index_initial end) a,rf.index_releve b
  from groupes g join public.compteurs_consommation m on m.id=g.id and m.organization_id=new.organization_id
  left join public.releves_consommation rd on rd.compteur_id=g.id and rd.date_releve=debut
  left join public.releves_consommation rf on rf.compteur_id=g.id and rf.date_releve=fin order by g.id
 loop
  if mesure.a is null or mesure.b is null or mesure.b-mesure.a<mesure.quantite then
    raise exception 'Vérifiez les index du compteur principal et des divisionnaires'; end if;
  bilan := bilan || jsonb_build_array(to_jsonb(mesure));
 end loop;
 if tg_op='UPDATE' and new.statut='validee' and bilan<>coalesce(old.source->'principaux','[]'::jsonb)
 then raise exception 'Le rattachement ou le relevé principal a changé. Recalculez la répartition'; end if;
 if bilan<>'[]'::jsonb then new.source:=new.source||jsonb_build_object('principaux',bilan); end if;
 return new;
end $$;
create trigger avant_empreinte_principaux before insert or update on public.repartitions_fourniture
 for each row execute function consommations_interne.verifier_compteurs_principaux();
alter table public.brouillons_regularisation_fourniture add column consulte_le timestamptz;
create function consommations_interne.tracer_acces_decompte() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.action='consultation' and new.account_id=auth.uid() then
  update public.brouillons_regularisation_fourniture d set consulte_le=new.created_at
  from public.regularisations_charges r
  where r.id=d.regularisation_id and r.organization_id=new.organization_id and r.justificatif_document=new.document_id
    and d.consulte_le is null and d.avis_le is not null
    and exists(select 1 from public.document_liens dl join public.persons p on p.id=dl.entite_id and p.organization_id=new.organization_id
      join public.memberships m on m.account_id=p.account_id and m.organization_id=p.organization_id and m.role='locataire' and m.status in('active','inactive')
      where dl.organization_id=new.organization_id and dl.entite='personne' and dl.document_id=new.document_id and p.account_id=new.account_id);
 end if;
 return new;
end $$;
revoke all on function consommations_interne.tracer_acces_decompte() from public,anon,authenticated;
create trigger acces_decompte after insert on public.acces_pieces_log for each row execute function consommations_interne.tracer_acces_decompte();
