-- Deux événements de report. La source lie le rendez-vous, le véritable demandeur
-- et l'intervenant. Elle cesse d'être valide lors d'un nouveau report ou d'un départ.
create function public.source_report_courriel(p_org uuid,p_evenement text,p_objet uuid)
returns table(incident uuid, artisan uuid, personne uuid, source jsonb)
language sql stable security definer set search_path='' as $$
 select i.id,iv.artisan_id,p.id,jsonb_build_array(d.id,d.statut,iv.id,iv.artisan_id,p.id,iv.debut_prevu,iv.fin_prevue,d.creneau_accepte_id)
 from public.intervention_demandes_rdv d
 join public.incident_interventions iv on iv.id=d.intervention_id and iv.organization_id=d.organization_id
 join public.incidents i on i.id=iv.incident_id and i.organization_id=d.organization_id
 join public.organizations org on org.id=d.organization_id and org.status in ('active','essai')
 join public.baux b on b.id=i.bail_id and b.organization_id=d.organization_id
 join public.persons p on p.account_id=d.demandee_par and p.organization_id=d.organization_id and p.archived_at is null
 join public.memberships m on m.account_id=p.account_id and m.organization_id=d.organization_id and m.role='locataire' and m.status='active'
 where d.id=p_objet and d.organization_id=p_org and d.type='report' and i.etat<>'clos'
 and iv.statut='planifiee' and iv.debut_prevu>now() and b.etat in ('actif','preavis')
 and (exists(select from public.bail_personnes bp where bp.organization_id=p_org and bp.bail_id=b.id and bp.person_id=p.id
       and bp.role='colocataire' and (bp.date_depart is null or bp.date_depart>=public.aujourdhui_paris()))
   or (b.locataire_principal=p.id and not exists(select from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=p.id and bp.role='colocataire')))
 and ((p_evenement='rdv_report_demande' and d.statut='en_attente' and d.expire_le>now() and iv.debut_prevu=d.rdv_debut)
   or (p_evenement='rdv_report_accepte' and d.statut='acceptee' and exists(select from public.intervention_creneaux c
      where c.id=d.creneau_accepte_id and c.organization_id=p_org and c.intervention_id=iv.id and c.statut='retenu' and c.debut=iv.debut_prevu)));
$$;

alter function public.source_notification(uuid,text,uuid) rename to source_notification_avant_reports;
create function public.source_notification(p_org uuid,p_evenement text,p_objet uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_evenement in ('rdv_report_demande','rdv_report_accepte') then
  return (select r.source from public.source_report_courriel(p_org,p_evenement,p_objet) r);
 end if;
 return public.source_notification_avant_reports(p_org,p_evenement,p_objet);
end $$;

-- Le demandeur du devis, même si un autre membre gère l'incident. Si son droit
-- a pris fin, aucun devis ne part à un remplaçant implicite. Pour les anciennes
-- sollicitations anonymes, conserver le choix du responsable puis du gérant.
create function public.destinataire_avis_devis(p_org uuid,p_objet uuid) returns text
language sql stable security definer set search_path='' as $$
 select lower(btrim(u.email)) from public.incident_devis d
 join public.incident_sollicitations s on s.id=d.sollicitation_id and s.organization_id=d.organization_id
 join public.incidents i on i.id=d.incident_id and i.organization_id=d.organization_id and i.etat<>'clos'
 join public.memberships m on m.organization_id=d.organization_id and m.status='active'
 join auth.users u on u.id=m.account_id and u.email_confirmed_at is not null and u.deleted_at is null
   and (u.banned_until is null or u.banned_until<=now())
 where d.id=p_objet and d.organization_id=p_org and d.statut='depose'
 and (s.created_by is null or m.account_id=s.created_by)
 and (m.role in ('admin_agence','proprietaire_direct') or (s.created_by=m.account_id and m.role='agent' and (
   exists(select from public.mandats md join public.mandat_lignes ml on ml.mandat_id=md.id and ml.date_fin is null
     where md.organization_id=p_org and md.agent_account_id=m.account_id and ml.lot_id=i.lot_id and md.etat in ('brouillon','a_signer','actif','preavis'))
   or exists(select from public.lots l where l.id=i.lot_id and l.organization_id=p_org and l.created_by=m.account_id
     and not exists(select from public.mandats md join public.mandat_lignes ml on ml.mandat_id=md.id and ml.date_fin is null
       where md.organization_id=p_org and ml.lot_id=l.id and md.etat in ('brouillon','a_signer','actif','preavis'))))))
 order by (m.account_id=i.responsable_account_id) desc nulls last,m.account_id limit 1;
$$;
-- Le résolveur et sa réservation SKIP LOCKED restent communs à toutes les notifications.
do $extension$
declare definition text; ancre text := 'elsif n.evenement=''devis_recu'' then';
begin
 definition:=pg_get_functiondef('public.prendre_notification(uuid,uuid)'::regprocedure);
 if (length(definition)-length(replace(definition,ancre,''))) / length(ancre) <> 1 then
  raise exception 'La version du résolveur de notifications doit être vérifiée.';
 end if;
 definition:=replace(definition,ancre,$branche$elsif n.evenement in ('rdv_report_demande','rdv_report_accepte') then
  select r.incident,r.artisan,r.personne into incident,artisan,personne
  from public.source_report_courriel(n.organization_id,n.evenement,n.objet) r;
 $branche$ || ancre);
 ancre:='if n.role=''agence'' then';
 if (length(definition)-length(replace(definition,ancre,''))) / length(ancre) <> 1 then
  raise exception 'La sélection du destinataire de devis doit être vérifiée.';
 end if;
 execute replace(definition,ancre,$devis$if n.evenement='devis_recu' and n.role='agence' then
  dest:=public.destinataire_avis_devis(n.organization_id,n.objet);
 els$devis$ || ancre);

end $extension$;

create function public.capturer_report_courriel() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.type='report' and (tg_op='INSERT' or old.statut is distinct from new.statut) then
  if new.statut='en_attente' then
   perform public.capturer_notification(new.organization_id,'rdv_report_demande',new.id,'artisan');
  elsif new.statut='acceptee' then
   perform public.capturer_notification(new.organization_id,'rdv_report_accepte',new.id,'locataire');
  end if;
 end if;
 return new;
end $$;
-- La date de la mission et le créneau retenu sont à jour en fin de transaction.
create constraint trigger capture_report_courriel after insert or update on public.intervention_demandes_rdv
 deferrable initially deferred for each row execute function public.capturer_report_courriel();

alter function public.empreinte_metier_courriel(uuid,jsonb) rename to empreinte_avant_alertes_direction;
create function public.empreinte_metier_courriel(p_org uuid,p_contexte jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare
 categorie text:=p_contexte->>'categorie';
 cle text:=p_contexte->>'id';
 ev text:=p_contexte->>'evenement';
 dest text:=p_contexte->>'destinataire';
 membre uuid; contenu jsonb; n public.notification_intentions; r record;
begin
 if p_contexte->>'type'='alerte_direction' then
  if p_org is not null or p_contexte ? 'acteur' or p_contexte ? 'source' then return null; end if;
  select u.id into membre from public.memberships m join auth.users u on u.id=m.account_id
   where m.organization_id is null and m.role='super_admin' and m.status='active'
   and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
   and encode(sha256(convert_to(lower(btrim(u.email)),'UTF8')),'hex')=dest
   and (categorie<>'veto' or lower(btrim(u.email))=lower(btrim(public.email_superviseur_permanent()))) limit 1;
  if membre is null then return null; end if;
  case categorie
  when 'quotidienne' then
   if not exists(select from public.relais_alertes_envois where jour=public.aujourdhui_paris()
      and jour::text=cle and statut in ('en_cours','envoi_partiel','echec')) then return null; end if;
  when 'urgence' then
   if not exists(select from public.relais_urgences_envois where id=cle::uuid and statut in ('en_cours','a_reprendre')) then return null; end if;
  when 'veto' then
   if not exists(select from public.publications p cross join public.marketing_reglages m
     where p.id=cle::uuid and m.singleton and m.actif and public.verifier_arret_supervision('marketing')
     and p.statut='programmee' and p.programmee_pour>now() and p.programmee_pour=(p_contexte->>'parution')::timestamptz
     and m.validation_obligatoire=(p_contexte->>'validation')::boolean
     and encode(sha256(convert_to(concat_ws(chr(31),p.titre,coalesce(p.chapo,''),coalesce(p.facebook_texte,''),coalesce(p.facebook_image_url,'')),'UTF8')),'hex')=p_contexte->>'apercu')
    then return null; end if;
  when 'contrat' then
   if cle is null or cle !~ '^[0-9a-f]{64}$' then return null; end if;
  else return null;
  end case;
  contenu:=jsonb_build_array(membre,p_contexte);
 elsif p_contexte->>'type'='notification' and ev in ('rdv_report_demande','rdv_report_accepte','devis_recu') then
  select * into n from public.notification_intentions where id=(p_contexte->>'source')::uuid and organization_id=p_org
   and evenement=ev and objet=cle::uuid and role=p_contexte->>'role' and etat not in ('obsolete','a_verifier');
  if not found then return null; end if;
  if ev='devis_recu' then
   if n.role<>'agence' or not exists(select from public.organizations where id=p_org and status in ('active','essai'))
    or encode(sha256(convert_to(public.destinataire_avis_devis(p_org,n.objet),'UTF8')),'hex') is distinct from dest or dest is null then return null; end if;
   contenu:=public.source_notification(p_org,ev,n.objet);
   if contenu is null or encode(sha256(convert_to(contenu::text,'UTF8')),'hex')<>n.revision then return null; end if;
   return encode(sha256(convert_to(jsonb_build_array(contenu,n.revision,dest)::text,'UTF8')),'hex');
  end if;
  select * into r from public.source_report_courriel(p_org,ev,n.objet);
  if not found or encode(sha256(convert_to(r.source::text,'UTF8')),'hex')<>n.revision then return null; end if;
  if ev='rdv_report_demande' and n.role='artisan' then
   select u.id into membre from public.artisans a join auth.users u on u.id=a.account_id where a.id=r.artisan
    and a.statut_plateforme='valide' and a.blacklist_globale_le is null and lower(btrim(a.email))=lower(btrim(u.email))
    and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
    and encode(sha256(convert_to(lower(btrim(u.email)),'UTF8')),'hex')=dest;
  elsif ev='rdv_report_accepte' and n.role='locataire' then
   select u.id into membre from public.persons p join auth.users u on u.id=p.account_id where p.id=r.personne
    and p.organization_id=p_org and lower(btrim(p.email))=lower(btrim(u.email))
    and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
    and encode(sha256(convert_to(lower(btrim(u.email)),'UTF8')),'hex')=dest;
  end if;
  if membre is null then return null; end if;
  contenu:=jsonb_build_array(n.revision,membre,dest);
 else return public.empreinte_avant_alertes_direction(p_org,p_contexte);
 end if;
 return encode(sha256(convert_to(contenu::text,'UTF8')),'hex');
end $$;

alter function public.finaliser_courriel_metier(text) rename to finaliser_avant_alertes_direction;
create function public.finaliser_courriel_metier(p_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables;
begin
 select * into m from public.courriels_durables where id=p_id for update;
 if m.contexte_metier->>'type' is distinct from 'alerte_direction' then return public.finaliser_avant_alertes_direction(p_id); end if;
 if m.etat not in ('accepte','livre') or nullif(m.fournisseur_id,'') is null then return false; end if;
 if m.finalisation_etat='terminee' then return true; end if;
 update public.courriels_durables set finalisation_etat='terminee',motif=null where id=p_id;
 insert into public.courriels_evenements(courrier_id,etat) values(p_id,'finalisation_terminee');
 return true;
end $$;

revoke all on function public.destinataire_avis_devis(uuid,uuid),public.source_report_courriel(uuid,text,uuid),public.capturer_report_courriel(),
 public.source_notification_avant_reports(uuid,text,uuid),public.source_notification(uuid,text,uuid),
 public.empreinte_avant_alertes_direction(uuid,jsonb),public.finaliser_avant_alertes_direction(text),
 public.empreinte_metier_courriel(uuid,jsonb),public.finaliser_courriel_metier(text) from public, anon, authenticated, service_role;
grant execute on function public.source_notification(uuid,text,uuid),public.empreinte_metier_courriel(uuid,jsonb),
 public.finaliser_courriel_metier(text) to service_role;
