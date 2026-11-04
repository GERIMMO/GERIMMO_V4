-- Ajout compatible avec les incidents existants ; la date constatée ne remplace jamais la date de création.
alter table public.incidents add column titre text check(length(titre)<=150), add column date_signalement date,
 add column commande_declaration uuid unique;
create function public.declarer_incident_bien_simple(p_org uuid,p_bien uuid,p_lot uuid,p_titre text,p_date date,p_note text,p_commande uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;begin
 if not(p_org in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
  or public.lot_hors_portefeuille(p_org,p_lot) then raise exception 'Accès refusé';end if;
 if not exists(select 1 from public.lots where id=p_lot and bien_id=p_bien and organization_id=p_org and etat<>'archive') then raise exception 'Logement inaccessible dans ce bien';end if;
 if p_commande is null or nullif(trim(p_titre),'') is null or length(p_titre)>150 or length(coalesce(p_note,''))>5000 or p_date is null or p_date>public.aujourdhui_paris() then raise exception 'Vérifiez le titre, la date et la note';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_commande::text,0));
 select id into v_id from public.incidents where commande_declaration=p_commande and organization_id=p_org and lot_id=p_lot;
 if found then return v_id;end if;
 v_id:=public.ouvrir_incident_agence(p_org,p_lot,'autre',trim(p_titre)||case when nullif(trim(p_note),'') is null then '' else E'\n'||trim(p_note) end,null,null,'normale',null);
 update public.incidents set titre=trim(p_titre),date_signalement=p_date,commande_declaration=p_commande where id=v_id;
 return v_id;
end;$$;
revoke all on function public.declarer_incident_bien_simple(uuid,uuid,uuid,text,date,text,uuid) from public,anon;
grant execute on function public.declarer_incident_bien_simple(uuid,uuid,uuid,text,date,text,uuid) to authenticated;

-- Le filtre de bien est strict : les pièces sans rattachement restent dans la vue globale.
-- SECURITY INVOKER : les droits et le portefeuille s'appliquent aussi aux sous-requêtes.
create function public.documents_du_bien(p_org uuid,p_bien uuid,p_lots uuid[] default null)
returns setof public.documents language sql stable set search_path='' as $$
 select d.* from public.documents_courants(p_org,p_lots) d where exists(
 select 1 from public.biens bi where bi.id=p_bien and bi.organization_id=p_org and (
  exists(select 1 from public.document_liens dl where dl.document_id=d.id and (
   (dl.entite='lot' and dl.entite_id in(select l.id from public.lots l where l.bien_id=bi.id))
   or(dl.entite='bail' and dl.entite_id in(select b.id from public.baux b join public.lots l on l.id=b.lot_id where l.bien_id=bi.id))
   or(dl.entite='incident' and dl.entite_id in(select i.id from public.incidents i join public.lots l on l.id=i.lot_id where l.bien_id=bi.id))
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
