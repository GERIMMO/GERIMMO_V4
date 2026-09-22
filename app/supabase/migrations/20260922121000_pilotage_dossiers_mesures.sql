-- Prochaines étapes dérivées des dossiers réels. Aucune signature, dépense,
-- clôture ou qualification n'est déduite d'une simple autorisation générique.
alter table public.orchestration_cases add column if not exists lien_action text;

create or replace function public.actualiser_orchestration()
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if (select auth.role()) is distinct from 'service_role'
     and not coalesce(public.is_permanent_super_admin(),false) then
    raise exception 'Réservé à la supervision';
  end if;
  if not pg_try_advisory_xact_lock(72192212) then return 0; end if;
  with attendus as (
    select b.organization_id,'bail'::text dossier_type,b.id dossier_id,
      case when b.etat::text='termine' then 'restitution_'||coalesce(r.statut,'a_preparer') else b.etat::text end etape,
      case b.etat::text when 'brouillon' then
        case when b.document_signe is null then 'Compléter le bail et réunir les signatures' else 'Vérifier le dossier puis activer le bail' end
        when 'preavis' then 'Préparer la sortie, l’état des lieux et le dépôt de garantie'
        when 'termine' then case when r.id is null then 'Vérifier et préparer la restitution du dépôt de garantie'
          when r.statut='en_cours' then 'Vérifier les retenues et finaliser le décompte de sortie'
          else 'Vérifier le solde et confirmer l’envoi du décompte de sortie' end
        else 'Suivre les échéances, les paiements et les documents du bail' end prochaine_action,
      case when b.etat::text='actif' then 'automatique' else 'humaine' end mode,
      case when b.etat::text='actif' then 'en_attente' else 'a_faire' end etat,
      case when r.date_remise_cles+(r.delai_mois||' months')::interval < current_date and r.envoye_le is null then 'urgente' else 'normale' end priorite,
      '/agence/'||b.organization_id||'/baux/'||b.id||case when b.etat::text='termine' then '#restitution' else '' end lien_action,
      null::text exception_message
    from public.baux b left join public.restitutions r on r.bail_id=b.id and r.organization_id=b.organization_id
    where b.etat::text<>'termine' or r.id is null or r.statut<>'finalise' or r.envoye_le is null
    union all
    select i.organization_id,'incident',i.id,i.etat::text,
      case
        when a.attendu then 'Décider le dépassement demandé avant de poursuivre les travaux'
        when i.etat::text in ('declare','rouvert') then 'Qualifier le problème et déterminer la prise en charge'
        when i.etat::text='qualifie' then
          case when exists(select 1 from public.incident_devis d where d.incident_id=i.id and d.statut::text='depose' and d.valide_jusqu_au>=current_date) then 'Comparer les devis valides reçus et choisir l’artisan'
            when exists(select 1 from public.incident_sollicitations s join public.incident_consultations c on c.id=s.consultation_id where s.incident_id=i.id and s.statut::text='envoyee' and c.statut::text='ouverte') then 'Attendre les devis demandés aux artisans'
            else 'Ouvrir la consultation et demander des devis valides' end
        when i.etat::text='termine' then 'Vérifier le compte rendu et décider la clôture'
        else 'Suivre le rendez-vous, les travaux et le compte rendu' end,
      'humaine',
      case when a.attendu then 'bloque' when i.etat::text in ('declare','rouvert','qualifie','termine') then 'a_faire' else 'en_attente' end,
      case when i.urgence::text='urgente' then 'urgente' else 'normale' end,
      '/agence/'||i.organization_id||'/incidents?sel='||i.id,
      case when a.attendu then 'Un dépassement attend une décision. Ne pas poursuivre les travaux supplémentaires avant l’accord.'
        when i.urgence::text='urgente' then 'Incident urgent : vérifier immédiatement les mesures de protection.' end
    from public.incidents i cross join lateral (
      select exists(select 1 from public.devis_avenants a join public.incident_interventions v on v.id=a.intervention_id
        where v.incident_id=i.id and a.statut='a_decider' and v.statut::text not in ('annulee','refusee')) attendu
    ) a where i.etat::text<>'clos'
    union all
    select d.organization_id,'document',d.id,coalesce(d.external_status,'signature_manuelle'),
      case when d.external_status in ('declined','expired','canceled','rejected') then 'Vérifier la signature interrompue et décider d’un nouvel envoi'
        when d.external_status='done' then 'Vérifier l’archivage du document signé et de sa preuve'
        when d.prestataire='manuel' then 'Attendre le retour signé et contrôler le document'
        else 'Suivre la signature et classer le document signé' end,
      case when d.external_status in ('declined','expired','canceled','rejected') or d.prestataire='manuel' then 'humaine' else 'automatique' end,
      case when d.external_status in ('declined','expired','canceled','rejected') then 'bloque' else 'en_attente' end,'normale',
      '/agence/'||d.organization_id||'/documents?sel='||d.document_id,
      case when d.external_status in ('declined','expired','canceled','rejected') then 'Cette demande ne peut plus aboutir en l’état. Vérifier le motif avant de solliciter à nouveau le signataire.' end
    from public.demandes_signature d join public.documents doc on doc.id=d.document_id and doc.organization_id=d.organization_id and doc.purged_at is null
    where d.signee_le is null and not exists(select 1 from public.demandes_signature suivante
      where suivante.organization_id=d.organization_id and suivante.document_id=d.document_id and suivante.person_id=d.person_id
        and (suivante.demandee_le>d.demandee_le or (suivante.demandee_le=d.demandee_le and suivante.id>d.id)))
    union all
    select r.organization_id,'rapport',r.id,
      case when r.statut='a_valider' then 'a_valider' when not preuve.accepte then 'envoi_a_verifier' else 'versement_a_verifier' end,
      case when r.statut='a_valider' then 'Vérifier et transmettre le compte rendu mensuel au propriétaire'
        when not preuve.accepte then 'Vérifier l’envoi du compte rendu validé et le reprendre si nécessaire'
        else 'Vérifier et enregistrer le versement du propriétaire' end,
      'humaine','a_faire','normale',
      '/agence/'||r.organization_id||'/comptabilite#rapport-'||r.id,
      case when r.statut='envoye' and not preuve.accepte then 'Le rapport est figé, mais aucune acceptation par le service d’envoi n’est enregistrée. Vérifier avant de renvoyer.'
        when preuve.accepte then 'L’e-mail a été accepté par le service d’envoi. La réception par le propriétaire n’est pas confirmée.' end
    from public.rapports_gestion r cross join lateral (
      select exists(select 1 from public.tech_log t where t.evenement='remise_rapport_mensuel'
        and t.details->>'organization_id'=r.organization_id::text and t.details->>'rapport_id'=r.id::text
        and t.details->>'resultat'='accepte_prestataire') accepte
    ) preuve
    where r.statut='a_valider' or not preuve.accepte
      or (r.net<>0 and (r.versement_montant is null or r.versement_date is null or abs(r.versement_montant-r.net)>0.01))
  ), clos as (
    update public.orchestration_cases c set etat='termine',updated_at=now()
    where c.dossier_type in ('bail','incident','document','rapport') and c.etat<>'termine'
      and not exists(select 1 from attendus a where a.organization_id=c.organization_id and a.dossier_type=c.dossier_type and a.dossier_id=c.dossier_id)
    returning c.id
  )
  insert into public.orchestration_cases(organization_id,dossier_type,dossier_id,etape,prochaine_action,mode,etat,priorite,lien_action,exception_message)
  select organization_id,dossier_type,dossier_id,etape,prochaine_action,mode,etat,priorite,lien_action,exception_message from attendus
  on conflict(organization_id,dossier_type,dossier_id) do update set
    etape=excluded.etape,prochaine_action=excluded.prochaine_action,mode=excluded.mode,
    etat=excluded.etat,priorite=excluded.priorite,lien_action=excluded.lien_action,
    exception_message=excluded.exception_message,
    autorisee_le=null,autorisee_par=null,autorisation_demandee=null,updated_at=now()
  where (orchestration_cases.etape,orchestration_cases.prochaine_action,orchestration_cases.mode,orchestration_cases.etat,orchestration_cases.priorite,orchestration_cases.exception_message)
    is distinct from (excluded.etape,excluded.prochaine_action,excluded.mode,excluded.etat,excluded.priorite,excluded.exception_message);
  get diagnostics n=row_count;
  return n;
end $$;
revoke all on function public.actualiser_orchestration() from public,anon;
grant execute on function public.actualiser_orchestration() to authenticated,service_role;

-- Un capteur par résultat métier effectivement enregistré. On ne compte ni
-- lectures de pages ni écritures techniques en cascade comme travail humain.
create or replace function public.mesurer_resultat_metier()
returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new); ancien jsonb; origine text; action text; domaine text;
  dossier uuid; genre text; nb_messages integer:=0; cle text;
begin
  if (select auth.role())='service_role' then origine:='automatique';
  elsif (select auth.uid()) is not null then origine:='humaine';
  else return new; end if; -- une origine inconnue reste non mesurée
  if tg_op='UPDATE' then ancien:=to_jsonb(old); end if;
  if tg_table_name in ('quittances','appels_loyer') then
    if j->>'email_envoye_at' is null or ancien->>'email_envoye_at' is not null then return new; end if;
    action:=case tg_table_name when 'quittances' then 'Quittance transmise' else 'Avis de loyer transmis' end;
    domaine:='message'; nb_messages:=1; genre:='bail'; dossier:=(j->>'bail_id')::uuid;
    cle:=tg_table_name||':'||(j->>'id')||':premier_envoi';
  elsif tg_table_name='intervention_rappels' then
    action:='Rappel de rendez-vous transmis'; domaine:='message'; nb_messages:=1;
    genre:='intervention'; dossier:=(j->>'intervention_id')::uuid; cle:='rappel:'||(j->>'id');
  elsif tg_table_name='baux' then
    if tg_op='UPDATE' and j->>'etat' is not distinct from ancien->>'etat' then return new; end if;
    action:='Étape du bail enregistrée'; domaine:='location'; genre:='bail'; dossier:=new.id;
    cle:='bail:'||new.id||':'||(j->>'etat')||':'||coalesce(j->>'updated_at',now()::text);
  elsif tg_table_name='incident_evenements' then
    if j->>'type' not in ('declaration','qualification','contestation','cloture','reouverture','attribution') then return new; end if;
    action:='Étape de l’incident enregistrée'; domaine:='incident'; genre:='incident'; dossier:=(j->>'incident_id')::uuid;
    cle:='incident_evenement:'||(j->>'id');
  elsif tg_table_name='encaissements' then
    action:='Paiement enregistré'; domaine:='finance'; genre:='bail'; dossier:=(j->>'bail_id')::uuid;
    cle:='encaissement:'||(j->>'id');
  else return new; end if;
  insert into public.automation_events(organization_id,origine,domaine,action,dossier_type,dossier_id,messages_envoyes,actor_account_id,sans_appel,cle_unique,details)
  values((j->>'organization_id')::uuid,origine,domaine,action,genre,dossier,nb_messages,(select auth.uid()),null,cle,
    jsonb_build_object('source','resultat_metier','clics_mesures',false)) on conflict(cle_unique) do nothing;
  return new;
end $$;
revoke all on function public.mesurer_resultat_metier() from public,anon,authenticated;
create trigger mesure_bail after insert or update of etat on public.baux for each row execute function public.mesurer_resultat_metier();
create trigger mesure_incident after insert on public.incident_evenements for each row execute function public.mesurer_resultat_metier();
create trigger mesure_encaissement after insert on public.encaissements for each row execute function public.mesurer_resultat_metier();
create trigger mesure_quittance after update of email_envoye_at on public.quittances for each row execute function public.mesurer_resultat_metier();
create trigger mesure_appel after update of email_envoye_at on public.appels_loyer for each row execute function public.mesurer_resultat_metier();
create trigger mesure_rappel after insert on public.intervention_rappels for each row execute function public.mesurer_resultat_metier();

-- Aucun indicateur de clic ou d'appel n'est inventé : seuls les dossiers dont
-- la résolution sans appel a été explicitement confirmée sont comptés.
create table public.dossier_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  incident_id uuid not null,
  appel_necessaire boolean not null,
  note text not null check(length(btrim(note)) between 5 and 1000),
  cree_par uuid not null references public.accounts(id),
  created_at timestamptz not null default now(),
  unique(incident_id),
  foreign key(incident_id,organization_id) references public.incidents(id,organization_id)
);
create index dossier_contacts_org_idx on public.dossier_contacts(organization_id);
create index dossier_contacts_auteur_idx on public.dossier_contacts(cree_par);
alter table public.dossier_contacts enable row level security;
create policy dossier_contacts_lecture on public.dossier_contacts for select to authenticated using(
  public.is_super_admin() or organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
revoke all on public.dossier_contacts from public,anon,authenticated;
grant select on public.dossier_contacts to authenticated;
create function public.confirmer_bilan_contact(p_incident uuid,p_appel boolean,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
  select organization_id into org from public.incidents where id=p_incident and etat='clos';
  if org is null or not coalesce((public.is_super_admin() or org in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))),false) then raise exception 'Dossier clos inaccessible'; end if;
  if p_appel is null then raise exception 'Précisez si un appel a été nécessaire'; end if;
  insert into public.dossier_contacts(organization_id,incident_id,appel_necessaire,note,cree_par)
  values(org,p_incident,p_appel,btrim(p_note),(select auth.uid()))
  on conflict(incident_id) do update set appel_necessaire=excluded.appel_necessaire,note=excluded.note,cree_par=excluded.cree_par,created_at=now();
end $$;
revoke all on function public.confirmer_bilan_contact(uuid,boolean,text) from public,anon;
grant execute on function public.confirmer_bilan_contact(uuid,boolean,text) to authenticated;

-- File qualité: refus explicite de déclarer un code publié sans résultat des
-- contrôles et une révision vérifiable. Les autorisations sont liées à cette révision.
create or replace function public.garder_proposition_developpement()
returns trigger language plpgsql set search_path='' as $$
begin
  new.revision:=lower(nullif(btrim(new.revision),''));
  if new.revision is not null and new.revision !~ '^[0-9a-f]{40}$' then
    raise exception 'La révision doit être la référence complète de la version contrôlée';
  end if;
  if jsonb_typeof(new.rapport_controles) is distinct from 'object' then
    raise exception 'Le compte rendu des contrôles doit être structuré';
  end if;
  if new.rapport_controles->>'resultat'='reussi' and
     (new.revision is null or new.rapport_controles->>'revision' is distinct from new.revision) then
    raise exception 'Les contrôles réussis doivent porter sur cette révision exacte';
  end if;
  if tg_op='UPDATE' and
     (new.revision,new.solution_proposee,new.risque,new.rapport_controles,new.autorisation_requise)
       is distinct from
     (old.revision,old.solution_proposee,old.risque,old.rapport_controles,old.autorisation_requise) then
    new.autorisee_le:=null; new.autorisee_par:=null;
  end if;
  if new.statut='publiee' and
     (new.revision is null
      or new.rapport_controles->>'resultat' is distinct from 'reussi'
      or new.rapport_controles->>'revision' is distinct from new.revision
      or (new.autorisation_requise and (new.autorisee_le is null or new.autorisee_par is null))) then
    raise exception 'Publication impossible : la révision, ses contrôles réussis et l’accord requis doivent être enregistrés';
  end if;
  new.updated_at:=now();
  return new;
end $$;
revoke all on function public.garder_proposition_developpement() from public,anon,authenticated;
create trigger developpement_controles before insert or update on public.development_proposals
for each row execute function public.garder_proposition_developpement();

insert into public.development_proposals(source,source_id,titre,probleme,risque,statut)
select 'retour utilisateur',r.id,r.titre,r.description,
  case r.gravite when 'N1' then 'critique' when 'N2' then 'moyen' else 'faible' end,'a_etudier'
from public.retours_utilisateurs r where r.nature in ('bug','idee') and r.etat in ('nouveau','en_examen','en_cours','retenue')
  and not exists(select 1 from public.development_proposals p where p.source_id=r.id);

select public.actualiser_orchestration() where (select auth.role())='service_role';

create index dossier_contacts_incident_organisation_idx on public.dossier_contacts(incident_id,organization_id);
