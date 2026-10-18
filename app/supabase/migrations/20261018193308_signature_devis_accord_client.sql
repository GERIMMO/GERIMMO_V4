-- Acceptation de l'offre artisan par ses clients, sur le circuit Zoho existant.
alter table public.bail_signature_circuits drop constraint bail_signature_circuits_modele_check;
alter table public.bail_signature_circuits add constraint bail_signature_circuits_modele_check check(modele in ('bail','avenant','cautionnement','edl','protocole_apurement','autorisation_travaux','devis_artisan'));
alter table public.bail_signature_circuits drop constraint bail_signature_circuits_signataires_check;
alter table public.bail_signature_circuits add constraint bail_signature_circuits_signataires_check check(jsonb_typeof(signataires)='array' and jsonb_array_length(signataires) between (case when modele='devis_artisan' then 1 else 2 end) and 100);
alter table public.bail_signature_circuits add column incident_id uuid;
alter table public.bail_signature_circuits add constraint signature_incident_org_fk foreign key(incident_id,organization_id) references public.incidents(id,organization_id);
create index signature_incident_org on public.bail_signature_circuits(incident_id,organization_id);
create unique index signature_devis_une_offre on public.bail_signature_circuits(incident_id)
 where modele='devis_artisan' and etat in ('pret','preparation','en_cours','a_verifier','termine');
alter table public.bail_signature_circuits add constraint signature_devis_cible check(modele<>'devis_artisan' or (bail_id is null and incident_id is not null and prestataire='zoho'));
alter table public.signature_budget add column devis_actif boolean not null default false;
create policy signature_devis_lecture on public.bail_signature_circuits for select to authenticated
 using(modele='devis_artisan' and public.has_org_role(organization_id,array['proprietaire_direct']::public.membership_role[]));

-- Lecture explicite côté propriétaire ; jamais une identité inventée pour l'entreprise.
create function public.lire_signature_devis(p_org uuid,p_devis uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.incident_devis; i public.incidents; doc public.documents; proprietaires jsonb;
begin
 if auth.uid() is null or not public.has_org_role(p_org,array['proprietaire_direct']::public.membership_role[]) then raise exception 'Accès refusé' using errcode='42501'; end if;
 select * into d from public.incident_devis where id=p_devis and organization_id=p_org;
 if not found then raise exception 'Devis inaccessible'; end if;
 if d.statut<>'depose' or d.valide_jusqu_au<(now() at time zone 'Europe/Paris')::date
   or exists(select 1 from public.incident_devis where sollicitation_id=d.sollicitation_id and version>d.version) then raise exception 'Cette offre est expirée ou a été remplacée. Demandez un devis à jour.'; end if;
 select * into i from public.incidents where id=d.incident_id and organization_id=p_org;
 if i.etat is distinct from 'qualifie' then raise exception 'Ce dossier n’est plus en attente d’affectation'; end if;
 select * into doc from public.documents where id=d.document_id and organization_id=p_org and purged_at is null;
 if doc.taille_octets>8388608 then raise exception 'Le PDF du devis dépasse 8 Mo. Demandez à l’artisan une version réduite avant la signature.'; end if;
 if doc.id is null or doc.mime_type<>'application/pdf' or doc.empreinte is null then raise exception 'L’artisan doit fournir son devis PDF validé avant votre signature'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nom',p.nom,'prenom',p.prenom,'email',p.email,'telephone',p.telephone,'qualite',p.qualite,'quote_part',t.quote_part) order by p.id),'[]'::jsonb) into proprietaires
 from public.detentions t join public.persons p on p.id=t.person_id and p.organization_id=p_org where t.lot_id=i.lot_id and t.date_fin is null;
 return jsonb_build_object('id',d.id,'incident_id',d.incident_id,'lot_id',i.lot_id,'version',d.version,'montant_ttc_cents',d.montant_ttc_cents,'valide_jusqu_au',d.valide_jusqu_au,'depose_le',d.depose_le,'expire_le',least((d.valide_jusqu_au+1)::timestamp at time zone 'Europe/Paris'-interval '1 second',now()+interval '30 days'),
  'artisan_nom',(select raison_sociale from public.artisans where id=d.artisan_id),'proprietaires',proprietaires,
  'document',jsonb_build_object('id',doc.id,'titre',doc.titre,'storage_path',doc.storage_path,'empreinte',doc.empreinte));
end $$;
revoke all on function public.lire_signature_devis(uuid,uuid) from public,anon;
grant execute on function public.lire_signature_devis(uuid,uuid) to authenticated;

-- Réservation : même ordre de verrous que retenir/refuser/réviser (incident puis devis).
do $$ declare f text; begin
 select pg_get_functiondef('public.reserver_envoi_signature_bail(uuid,uuid)'::regprocedure) into f;
 if strpos(f,'perform public.reserver_budget_signature(p_circuit);')=0 then raise exception 'Réservation signature inconnue'; end if;
 f:=replace(f,'perform public.reserver_budget_signature(p_circuit);',$code$
 if v.modele='devis_artisan' then
   perform 1 from public.incidents where id=v.incident_id and organization_id=v.organization_id and etat='qualifie' for update;
   if not found then raise exception 'Le dossier n’est plus en attente d’affectation'; end if;
   perform 1 from public.incident_devis d where d.id=v.cible_id and d.organization_id=v.organization_id and d.incident_id=v.incident_id and d.statut='depose'
     and d.valide_jusqu_au >= (now() at time zone 'Europe/Paris')::date
     and not exists(select 1 from public.incident_devis n where n.sollicitation_id=d.sollicitation_id and n.version>d.version)
     and exists(select 1 from jsonb_array_elements(v.annexes) a join public.documents doc on doc.id=d.document_id and doc.organization_id=d.organization_id where a->>'id'=doc.id::text and a->>'empreinte'=doc.empreinte and doc.purged_at is null)
     for update;
   if not found then raise exception 'Le devis a changé ou expiré. Préparez un nouvel accord'; end if;
   if not v.essai and not (select devis_actif from public.signature_budget where singleton) then raise exception 'La signature des devis est encore en préparation'; end if;
 end if;
 perform public.reserver_budget_signature(p_circuit);$code$);
 execute f;
end $$;

create function public.garder_devis_en_signature() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.bail_signature_circuits c where c.modele='devis_artisan' and c.cible_id=old.id and c.etat in ('preparation','en_cours','a_verifier','termine')) then
   if tg_op='DELETE' then raise exception 'Ce devis est engagé dans un circuit de signature'; end if;
   if exists(select 1 from public.bail_signature_circuits c where c.modele='devis_artisan' and c.cible_id=old.id and c.etat='termine')
      and new.statut='retenu' and old.statut='depose'
      and (to_jsonb(new)-'statut'-'retenu_le'-'retenu_par')=(to_jsonb(old)-'statut'-'retenu_le'-'retenu_par') then return new; end if;
   raise exception 'Annulez le circuit en cours avant de modifier le devis. Une offre déjà signée doit être conservée.';
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function public.garder_devis_en_signature() from public,anon,authenticated;
create trigger devis_signature_verrou before update or delete on public.incident_devis for each row execute function public.garder_devis_en_signature();

-- Après signature, confier la mission reste un clic explicite avec tous les contrôles métier existants.
do $$ declare f text; ancre text:='update public.incident_devis'||chr(10)||'  set statut = ''retenu'''; begin
 select pg_get_functiondef('public.retenir_devis(uuid,uuid)'::regprocedure) into f;
 if strpos(f,ancre)=0 then raise exception 'Sélection devis inconnue'; end if;
 f:=replace(f,ancre,$code$
 if exists(select 1 from public.bail_signature_circuits c where c.modele='devis_artisan' and c.incident_id=d.incident_id and c.etat in ('preparation','en_cours','a_verifier')) then raise exception 'Attendez la fin des signatures avant de confier la mission'; end if;
 if public.has_org_role(p_org,array['proprietaire_direct']::public.membership_role[])
   and ((select devis_actif from public.signature_budget where singleton) or exists(select 1 from public.bail_signature_circuits c where c.modele='devis_artisan' and c.incident_id=d.incident_id and c.etat in ('pret','termine'))) then
   if not exists(select 1 from public.bail_signature_circuits c where c.modele='devis_artisan' and c.cible_id=p_devis and c.etat='termine' and c.environnement='production' and not c.essai and c.document_signe is not null) then raise exception 'Signez ce devis et attendez l’archivage des preuves avant de confier la mission'; end if;
 end if;
 update public.incident_devis
  set statut = 'retenu'$code$);
 execute f;
end $$;

-- Anciennes demandes manuelles : historique préservé, aucun nouvel envoi.
create function public.refuser_nouvelle_signature_manuelle() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Pour un nouvel engagement, utilisez Signature Zoho dans la fiche du document. Les anciennes demandes restent consultables.'; end $$;
revoke all on function public.refuser_nouvelle_signature_manuelle() from public,anon,authenticated;
create trigger signature_manuelle_fin_nouveaux_envois before insert on public.demandes_signature for each row execute function public.refuser_nouvelle_signature_manuelle();

-- Accès au PDF signé et au certificat : uniquement l'artisan de cette offre et son propriétaire.
create function public.lire_signature_devis_archive(p_sollicitation uuid,p_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.incident_devis; c public.bail_signature_circuits; doc public.documents; preuve public.documents;
begin
 if auth.uid() is null then raise exception 'Accès refusé' using errcode='42501'; end if;
 select * into d from public.incident_devis where sollicitation_id=p_sollicitation and (p_version is null or version=p_version) order by version desc limit 1;
 if d.id is null or not coalesce(d.artisan_id=public.mon_artisan_id() or public.has_org_role(d.organization_id,array['proprietaire_direct']::public.membership_role[]),false) then raise exception 'Accès refusé' using errcode='42501'; end if;
 select * into c from public.bail_signature_circuits where modele='devis_artisan' and cible_id=d.id and organization_id=d.organization_id order by created_at desc limit 1;
 if c.id is null then return null; end if;
 select * into doc from public.documents where id=c.document_signe and organization_id=d.organization_id and purged_at is null;
 select * into preuve from public.documents where id=(c.signataires->0->>'preuveDocumentId')::uuid and organization_id=d.organization_id and purged_at is null;
 return jsonb_build_object('etat',c.etat,'essai',c.essai,'document_path',doc.storage_path,'document_hash',doc.empreinte,'preuve_path',preuve.storage_path,'preuve_hash',preuve.empreinte);
end $$;
revoke all on function public.lire_signature_devis_archive(uuid,integer) from public,anon;
grant execute on function public.lire_signature_devis_archive(uuid,integer) to authenticated;
