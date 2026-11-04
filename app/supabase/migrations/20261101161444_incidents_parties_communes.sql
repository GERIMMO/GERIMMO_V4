-- Les parties communes sont rattachées au bien, sans attribuer un bail ni un locataire.
alter table public.incidents alter column lot_id drop not null;
alter table public.incidents add column bien_id uuid,
 add constraint incidents_bien_meme_org_fk foreign key(bien_id,organization_id) references public.biens(id,organization_id),
 add constraint incidents_contexte_requis check(lot_id is not null or bien_id is not null);
create function public.verifier_contexte_incident_bien()
returns trigger language plpgsql set search_path='' as $$
declare v_bien uuid;begin
 if new.lot_id is not null then
  select bien_id into v_bien from public.lots where id=new.lot_id and organization_id=new.organization_id;
  if v_bien is null or(new.bien_id is not null and new.bien_id<>v_bien) then raise exception 'Le logement et le bâtiment de cet incident ne correspondent pas';end if;
  new.bien_id:=v_bien;
 elsif new.bail_id is not null or new.declarant_person_id is not null then raise exception 'Un incident des parties communes ne s’attribue pas au bail d’un locataire';end if;
 return new;
end;$$;
revoke all on function public.verifier_contexte_incident_bien() from public,anon,authenticated;
create trigger verifier_contexte_incident_bien before insert or update of lot_id,bien_id,bail_id,declarant_person_id,organization_id on public.incidents for each row execute function public.verifier_contexte_incident_bien();
update public.incidents i set bien_id=l.bien_id from public.lots l where l.id=i.lot_id and i.bien_id is null;
create index incidents_bien_historique on public.incidents(bien_id,created_at desc) where bien_id is not null;
create or replace function public.declarer_incident_bien_simple(p_org uuid,p_bien uuid,p_lot uuid,p_titre text,p_date date,p_note text,p_commande uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_numero text;begin
 if not(p_org in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé';end if;
 if not exists(select 1 from public.biens where id=p_bien and organization_id=p_org and archived_at is null) then raise exception 'Bien inaccessible';end if;
 if p_lot is not null then
  if public.lot_hors_portefeuille(p_org,p_lot) or not exists(select 1 from public.lots where id=p_lot and bien_id=p_bien and organization_id=p_org and etat<>'archive') then raise exception 'Logement inaccessible dans ce bien';end if;
 elsif not exists(select 1 from public.memberships m where m.organization_id=p_org and m.account_id=auth.uid() and m.role='proprietaire_direct' and m.status='active') then raise exception 'Choisissez le logement concerné';end if;
 if p_commande is null or nullif(trim(p_titre),'') is null or length(p_titre)>150 or length(coalesce(p_note,''))>5000 or p_date is null or p_date>public.aujourdhui_paris() then raise exception 'Vérifiez le titre, la date et la note';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_commande::text,0));
 select id into v_id from public.incidents where commande_declaration=p_commande and organization_id=p_org and lot_id is not distinct from p_lot and bien_id=p_bien;
 if found then return v_id;end if;
 if p_lot is not null then
  v_id:=public.ouvrir_incident_agence(p_org,p_lot,'autre',trim(p_titre)||case when nullif(trim(p_note),'') is null then '' else E'\n'||trim(p_note) end,null,null,'normale',null);
  update public.incidents set titre=trim(p_titre),date_signalement=p_date,commande_declaration=p_commande,bien_id=p_bien where id=v_id;
 else
  v_numero:=public.incident_prochain_numero(p_org);
  insert into public.incidents(organization_id,bien_id,numero,canal,categorie,titre,description,date_signalement,commande_declaration,created_by)
  values(p_org,p_bien,v_numero,'agence','autre',trim(p_titre),trim(p_titre)||case when nullif(trim(p_note),'') is null then '' else E'\n'||trim(p_note) end,p_date,p_commande,auth.uid()) returning id into v_id;
  insert into public.incident_evenements(organization_id,incident_id,type,acteur_account_id,details) values(p_org,v_id,'declaration',auth.uid(),jsonb_build_object('bien_id',p_bien,'parties_communes',true));
  insert into public.alerts(organization_id,type,criticite,titre,details) values(p_org,'incident_a_qualifier','normale','Incident du bâtiment — '||trim(p_titre),jsonb_build_object('incident_id',v_id,'bien_id',p_bien));
 end if;
 return v_id;
end;$$;
revoke all on function public.declarer_incident_bien_simple(uuid,uuid,uuid,text,date,text,uuid) from public,anon;
grant execute on function public.declarer_incident_bien_simple(uuid,uuid,uuid,text,date,text,uuid) to authenticated;

create or replace function public.documents_du_bien(p_org uuid,p_bien uuid,p_lots uuid[] default null)
returns setof public.documents language sql stable set search_path='' as $$
 select d.* from public.documents_courants(p_org,p_lots) d where exists(
 select 1 from public.biens bi where bi.id=p_bien and bi.organization_id=p_org and (
  exists(select 1 from public.document_liens dl where dl.document_id=d.id and (
   (dl.entite='lot' and dl.entite_id in(select l.id from public.lots l where l.bien_id=bi.id))
   or(dl.entite='bail' and dl.entite_id in(select b.id from public.baux b join public.lots l on l.id=b.lot_id where l.bien_id=bi.id))
   or(dl.entite='incident' and dl.entite_id in(select i.id from public.incidents i left join public.lots l on l.id=i.lot_id where (l.bien_id=bi.id or i.bien_id=bi.id)))
   or(dl.entite='personne' and dl.entite_id in(
    select b.locataire_principal from public.baux b join public.lots l on l.id=b.lot_id where l.bien_id=bi.id
    union select bp.person_id from public.bail_personnes bp join public.baux b on b.id=bp.bail_id join public.lots l on l.id=b.lot_id where l.bien_id=bi.id))))
  or exists(select 1 from public.diagnostics dg where dg.document_id=d.id and (dg.bien_id=bi.id or dg.lot_id in(select l.id from public.lots l where l.bien_id=bi.id)))
  or exists(select 1 from public.baux b join public.lots l on l.id=b.lot_id where l.bien_id=bi.id and(d.id=b.document_signe or d.id=b.reglement_copropriete))
  or exists(select 1 from public.factures_fourniture f join public.contrats_fourniture c on c.id=f.contrat_id where c.bien_id=bi.id and f.document_id=d.id)
 ));
$$;
revoke all on function public.documents_du_bien(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.documents_du_bien(uuid,uuid,uuid[]) to authenticated,service_role;

create index incidents_bien_organisation_fk on public.incidents(bien_id,organization_id);
