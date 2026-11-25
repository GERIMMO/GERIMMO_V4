-- RETOUR ARRIÈRE de 20261122220000_incident_bien_categorie_urgence.sql (audit palier 1, P1-19 : la déclaration
-- d'incident depuis la fiche du bien demande la catégorie et l'urgence).
--
-- Rend à `declarer_incident_bien_simple` sa signature à sept arguments et son corps d'avant, celui de la migration
-- 20261101161444 : catégorie « autre » et urgence « normale » pour tout incident déclaré depuis la fiche du bien.
-- Rien n'est effacé : les incidents déjà déclarés gardent leur catégorie, leur urgence, leur alerte et leur historique.
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente : le formulaire de la fiche du bien envoie
-- la catégorie et l'urgence, que la fonction d'avant ne connaît pas. À JOUER AVANT le retour de 20261101161444, qui ne
-- retire que la signature à sept arguments, et avant celui de 20261014500000 (la fonction cite le jour de Paris).
-- Atomique et rejouable.
do $retour$
begin
  drop function if exists public.declarer_incident_bien_simple(uuid, uuid, uuid, text, date, text, uuid, text, public.incident_urgence);
  execute $ancienne$
create or replace function public.declarer_incident_bien_simple(p_org uuid,p_bien uuid,p_lot uuid,p_titre text,p_date date,p_note text,p_commande uuid)
returns uuid language plpgsql security definer set search_path='' as $f$
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
end;$f$;
$ancienne$;
  revoke all on function public.declarer_incident_bien_simple(uuid, uuid, uuid, text, date, text, uuid) from public, anon;
  grant execute on function public.declarer_incident_bien_simple(uuid, uuid, uuid, text, date, text, uuid) to authenticated;
  delete from supabase_migrations.schema_migrations where version = '20261122220000';
end $retour$;
notify pgrst, 'reload schema';
