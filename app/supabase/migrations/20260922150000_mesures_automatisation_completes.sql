-- Résultats métier complémentaires, sans journaliser le contenu des documents/messages.
create function public.mesurer_resultat_complementaire()
returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new); origine text; domaine text; action text; cle text; messages integer:=0;
begin
 if (select auth.role())='service_role' then origine:='automatique';
 elsif (select auth.uid()) is not null then origine:='humaine';
 else return new; end if;
 case tg_table_name
 when 'documents' then
   if new.purged_at is not null then return new; end if;
   domaine:='document';action:='Document classé';
 when 'demandes_signature' then
   if new.signee_le is null or old.signee_le is not null then return new; end if;
   domaine:='document';action:='Retour signé classé';
 when 'incident_devis' then domaine:='incident';action:='Devis reçu';
 when 'devis_avenants' then
   if tg_op='UPDATE' and new.statut is not distinct from old.statut then return new; end if;
   domaine:='incident';action:=case when tg_op='INSERT' then 'Avenant demandé' else 'Avenant décidé' end;
 when 'intervention_comptes_rendus' then domaine:='incident';action:='Compte rendu reçu';
 when 'etats_des_lieux' then
   if new.signe_le is null or old.signe_le is not null then return new; end if;
   domaine:='location';action:='État des lieux signé';
 when 'messages' then domaine:='message';action:='Message déposé sur le site';messages:=1;
 else return new;
 end case;
 cle:='mesure:'||tg_table_name||':'||(j->>'id')||':'||action;
 insert into public.automation_events(organization_id,origine,domaine,action,cle_unique,actor_account_id,messages_envoyes,details)
 values((j->>'organization_id')::uuid,origine,domaine,action,cle,(select auth.uid()),messages,jsonb_build_object('source','resultat_metier'))
 on conflict(cle_unique) do nothing;
 return new;
end $$;
revoke all on function public.mesurer_resultat_complementaire() from public,anon,authenticated;
create trigger mesure_document after insert on public.documents for each row execute function public.mesurer_resultat_complementaire();
create trigger mesure_signature after update of signee_le on public.demandes_signature for each row execute function public.mesurer_resultat_complementaire();
create trigger mesure_devis after insert on public.incident_devis for each row execute function public.mesurer_resultat_complementaire();
create trigger mesure_avenant after insert or update of statut on public.devis_avenants for each row execute function public.mesurer_resultat_complementaire();
create trigger mesure_compte_rendu after insert on public.intervention_comptes_rendus for each row execute function public.mesurer_resultat_complementaire();
create trigger mesure_edl after update of signe_le on public.etats_des_lieux for each row execute function public.mesurer_resultat_complementaire();
create trigger mesure_message after insert on public.messages for each row execute function public.mesurer_resultat_complementaire();

-- Une réponse agrégée évite de tronquer les totaux à la limite de lignes de l'API.
-- SECURITY INVOKER : les politiques de chaque table restent applicables.
create function public.mesures_automatisation(p_org uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 with mesures as (
  select * from public.automation_events where created_at>=now()-interval '30 days'
    and (p_org is null or organization_id=p_org)
 ), contacts as (
  select * from public.dossier_contacts where created_at>=now()-interval '30 days'
    and (p_org is null or organization_id=p_org)
 ), mois_sans_clic as (
  -- Un seul clic d'envoi groupé, jamais un clic par PDF. Mois terminés uniquement.
  -- Toute quittance non envoyée, manuelle ou sans trace exclut le mois entier.
  select q.organization_id,date_trunc('month',a.periode) mois from public.quittances q
  join public.appels_loyer a on a.id=q.appel_id and a.organization_id=q.organization_id
  left join public.automation_events e on e.organization_id=q.organization_id
    and e.cle_unique='quittances:'||q.id::text||':premier_envoi'
  where (p_org is null or q.organization_id=p_org) and a.periode<date_trunc('month',now())::date
  group by q.organization_id,date_trunc('month',a.periode)
  having bool_and(q.email_envoye_at is not null and e.origine is not distinct from 'automatique')
    and min(e.created_at)>=now()-interval '30 days'
 ), organisations as (
  select m.organization_id,o.name nom,count(*) filter(where m.origine='automatique') automatiques,
    count(*) filter(where m.origine='humaine') humaines,sum(m.messages_envoyes) messages
  from mesures m left join public.organizations o on o.id=m.organization_id group by m.organization_id,o.name
 ), domaines as (
  select domaine,count(*) filter(where origine='automatique') automatiques,
    count(*) filter(where origine='humaine') humaines from mesures group by domaine
 )
 select jsonb_build_object(
  'automatiques',(select count(*) from mesures where origine='automatique'),
  'humaines',(select count(*) from mesures where origine='humaine'),
  'messages',(select coalesce(sum(messages_envoyes),0) from mesures),
  'sans_appel',(select count(*) from contacts where not appel_necessaire),
  'avec_appel',(select count(*) from contacts where appel_necessaire),
  'clics_minimum',(select count(*) from mois_sans_clic),
  'organisations',coalesce((select jsonb_agg(to_jsonb(o) order by o.nom) from organisations o),'[]'::jsonb),
  'domaines',coalesce((select jsonb_agg(to_jsonb(d) order by d.domaine) from domaines d),'[]'::jsonb)
 );
$$;
revoke all on function public.mesures_automatisation(uuid) from public,anon;
grant execute on function public.mesures_automatisation(uuid) to authenticated;
