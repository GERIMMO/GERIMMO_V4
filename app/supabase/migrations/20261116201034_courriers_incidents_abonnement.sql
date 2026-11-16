-- Un seul courrier par étape et épisode, même après changement d'adresse ou de jour.
create unique index courriel_incident_abonnement_episode on public.courriels_durables
 (organization_id,(contexte_metier->>'type'),(contexte_metier->>'id'),
  (coalesce(contexte_metier->>'episode','')),(coalesce(contexte_metier->>'palier','')),
  (coalesce(contexte_metier->>'etape','')),(coalesce(contexte_metier->>'copie','')))
 where contexte_metier->>'type' in ('relance_abonnement','resiliation_impaye','retractation_abonnement');

create function public.preuve_fin_impaye(p_org uuid,p_subscription text,p_episode date,p_fin timestamptz)
returns table(facture text,montant bigint,destinataire text,organisation text)
language sql stable security definer set search_path='' as $$
 select m.contexte_metier->>'facture',(m.contexte_metier->>'montant')::bigint,c.destinataire,c.organisation
 from public.abonnements a
 cross join lateral public.abonnement_courrier_contexte(a.organization_id,true) c
 join public.courriels_durables m on m.organization_id=c.organization_id
 join public.audit_log l on l.organization_id=m.organization_id and l.action='relance_paiement_envoyee'
   and l.details->>'message'=m.fournisseur_id and l.details->>'en_defaut_depuis'=p_episode::text and l.details->>'palier'='0'
 where a.organization_id=p_org and a.stripe_subscription_id=p_subscription and a.stripe_statut='canceled'
 and a.paiement_en_defaut_depuis=p_episode and a.resiliation_impaye_notifiee_le is null and not coalesce(a.annulation_demandee,false)
 and c.destinataire is not null and c.cgu_version is not null and m.etat='livre' and m.finalisation_etat='terminee'
 and m.contexte_metier->>'type'='relance_abonnement' and m.contexte_metier->>'id'=p_subscription
 and m.contexte_metier->>'palier'='0' and m.contexte_metier->>'episode'=p_episode::text
 and (p_fin at time zone 'Europe/Paris')::date >= (m.contexte_metier->>'resiliable')::date
 and p_fin>=(l.details->>'envoyee_le')::timestamptz+interval '720 hours' and p_fin<=now();
$$;

-- La mise en demeure peut être préparée plusieurs jours après le défaut. Conserver sa première date annoncée
-- pour les reprises ; le délai effectif reste au moins trente jours après sa livraison attestée.
create function public.echeance_mise_en_demeure(p_org uuid,p_subscription text,p_episode date) returns date
language sql stable security definer set search_path='' as $$
 select coalesce(
   (select (m.contexte_metier->>'resiliable')::date from public.courriels_durables m
    where m.organization_id=p_org and m.contexte_metier->>'type'='relance_abonnement'
    and m.contexte_metier->>'id'=p_subscription and m.contexte_metier->>'episode'=p_episode::text
    and m.contexte_metier->>'palier'='0'),
   greatest(public.aujourdhui_paris(),p_episode)+30)
 from public.abonnements a where a.organization_id=p_org and a.stripe_subscription_id=p_subscription
 and a.paiement_en_defaut_depuis=p_episode and a.stripe_statut in ('past_due','unpaid');
$$;
revoke all on function public.echeance_mise_en_demeure(uuid,text,date) from public,anon,authenticated;
grant execute on function public.echeance_mise_en_demeure(uuid,text,date) to service_role;

alter function public.empreinte_metier_courriel(uuid,jsonb) rename to empreinte_avant_incident_contrat;
create function public.empreinte_metier_courriel(p_org uuid,p_contexte jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare
 c alias for p_contexte; a public.abonnements; r public.retractations_abonnement;
 contrat record; preuve record; adresse text; h text;
begin
 if coalesce(c->>'type','') not in ('relance_abonnement','resiliation_impaye','retractation_abonnement') then
  return public.empreinte_avant_incident_contrat(p_org,c);
 end if;
 if not exists(select from public.organizations where id=p_org and status in ('essai','active','suspendue')) then return null; end if;
 if c->>'type'='retractation_abonnement' then
  select * into r from public.retractations_abonnement where id=(c->>'id')::uuid and organization_id=p_org;
  if not found or r.nature is distinct from c->>'nature'
    or not exists(select from public.organizations o where o.id=p_org and o.name=c->>'organisation')
    or date_trunc('milliseconds',r.declaree_le) is distinct from (c->>'declaree')::timestamptz
    or encode(sha256(convert_to(r.texte_declaration,'UTF8')),'hex') is distinct from c->>'declaration' then return null; end if;
  select u.email into adresse from auth.users u join public.memberships m on m.account_id=u.id
   where u.id=r.declaree_par and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
   and m.organization_id=p_org and m.status='active' and m.role in ('admin_agence','proprietaire_direct')
   ; -- Seule l'adresse vérifiée du déclarant encore habilité autorise l'envoi.
  if c->>'etape'='reception' then
    if r.executee_le is not null then return null; end if;
  elsif c->>'etape' in ('copie','execution') then
    if r.executee_le is null or r.montant_rembourse_cents is distinct from (c->>'montant')::bigint
     or (c->>'essaiFin' is not null and not exists(select from public.organizations o where o.id=p_org and o.essai_fin=(c->>'essaiFin')::date and o.essai_fin>=public.aujourdhui_paris()))
     or ((c->>'passage')::boolean is true and not exists(select from public.abonnements b where b.organization_id=p_org
       and b.stripe_subscription_id=r.subscription_id and b.periodicite='mensuel' and b.montant_periode_cents=(c->>'mensualite')::bigint))
     or coalesce(r.passage_effectue,false) is distinct from coalesce((c->>'passage')::boolean,false)
     or (c->>'etape'='copie') is distinct from (r.accuse_envoye_le is not null)
     or (c->>'etape'='copie') is distinct from (nullif(c->>'copie','') is not null) then return null; end if;
  else return null; end if;
 else
  select * into a from public.abonnements where organization_id=p_org and stripe_subscription_id=c->>'id';
  if not found or a.paiement_en_defaut_depuis is null or a.paiement_en_defaut_depuis is distinct from (c->>'episode')::date then return null; end if;
  if c->>'type'='relance_abonnement' then
   select * into contrat from public.abonnement_courrier_contexte(p_org,true);
   if a.stripe_statut is null or a.stripe_statut not in ('past_due','unpaid')
    or contrat.cgu_version is null or contrat.cgu_version not in ('2026-10-24','2026-11-15') or contrat.cgu_version is distinct from c->>'version'
    or (c->>'facture') !~ '^in_[A-Za-z0-9_]+$' or c->>'facture' is null
    or (c->>'montant')::bigint<=0 or contrat.montant_periode_cents is distinct from (c->>'montant')::bigint
    or a.periodicite is distinct from c->>'periodicite' or a.relances_paiement is distinct from (c->>'palier')::smallint
    or (a.relances_paiement=0 and public.echeance_mise_en_demeure(p_org,a.stripe_subscription_id,a.paiement_en_defaut_depuis) is distinct from (c->>'resiliable')::date)
    or (not a.premiere_facture_payee) is distinct from (c->>'premier')::boolean then return null; end if;
   if not exists(select from public.abonnements_a_relancer(500) d where d.organization_id=p_org and d.palier=a.relances_paiement) then return null; end if;
   adresse:=contrat.destinataire;
  else
   select * into preuve from public.preuve_fin_impaye(p_org,c->>'id',(c->>'episode')::date,(c->>'fin')::timestamptz);
   if not found or preuve.facture is distinct from c->>'facture' or jsonb_build_array(preuve.facture) is distinct from c->'annulees' then return null; end if;
   adresse:=preuve.destinataire;
  end if;
 end if;
 h:=encode(sha256(convert_to(lower(btrim(adresse)),'UTF8')),'hex');
 if h is null or h is distinct from c->>'destinataire' then return null; end if;
 return encode(sha256(convert_to(jsonb_build_array(p_org,c,h)::text,'UTF8')),'hex');
end $$;

alter function public.finaliser_courriel_metier(text) rename to finaliser_avant_incident_contrat;
create function public.finaliser_courriel_metier(p_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables; c jsonb; ok boolean:=true;
begin
 select * into m from public.courriels_durables where id=p_id for update;
 c:=m.contexte_metier;
 if coalesce(c->>'type','') not in ('relance_abonnement','resiliation_impaye','retractation_abonnement') then
  return public.finaliser_avant_incident_contrat(p_id);
 end if;
 if m.etat not in ('accepte','livre') or nullif(m.fournisseur_id,'') is null then return false; end if;
 if m.finalisation_etat='terminee' then return true; end if;
 if c->>'type'='relance_abonnement' then
  -- La livraison du premier avertissement permet d'appliquer la restriction. Un rebond ne le permet pas.
  if c->>'palier'='0' and m.etat<>'livre' then return false; end if;
  perform 1 from public.abonnements a where a.organization_id=m.organization_id and a.stripe_subscription_id=c->>'id'
   and a.paiement_en_defaut_depuis=(c->>'episode')::date and a.stripe_statut in ('past_due','unpaid')
   and a.relances_paiement=(c->>'palier')::smallint for update;
  if found then
   ok:=public.abonnement_relance_consigner(m.organization_id,(c->>'palier')::int,m.fournisseur_id,(c->>'premier')::boolean);
  else
   -- Livraison tardive après régularisation : conserver la preuve, ne pas rouvrir l'impayé.
   insert into public.courriels_evenements(courrier_id,etat) values(p_id,'episode_impaye_termine');
  end if;
 elsif c->>'type'='resiliation_impaye' then
  ok:=public.abonnement_resiliation_impaye_notifiee(m.organization_id,c->>'id',m.fournisseur_id,c->'annulees');
 elsif c->>'etape'='execution' then
  ok:=public.retractation_accuse_envoye((c->>'id')::uuid,m.fournisseur_id);
 end if;
 if ok then
  update public.courriels_durables set finalisation_etat='terminee',motif=null where id=p_id;
  insert into public.courriels_evenements(courrier_id,etat) values(p_id,'finalisation_terminee');
 end if;
 return ok;
end $$;

revoke all on function public.empreinte_avant_incident_contrat(uuid,jsonb),public.empreinte_metier_courriel(uuid,jsonb),
 public.finaliser_avant_incident_contrat(text),public.finaliser_courriel_metier(text),public.preuve_fin_impaye(uuid,text,date,timestamptz)
 from public,anon,authenticated,service_role;
grant execute on function public.finaliser_courriel_metier(text),public.preuve_fin_impaye(uuid,text,date,timestamptz) to service_role;

-- Le webhook ne constitue pas l'unique occasion de constater une clôture Stripe.
create function public.resiliations_impaye_a_rapprocher()
returns table(organization_id uuid,subscription text,episode date)
language sql stable security definer set search_path='' as $$
 select a.organization_id,a.stripe_subscription_id,a.paiement_en_defaut_depuis
 from public.abonnements a where a.stripe_statut='canceled' and a.paiement_en_defaut_depuis is not null
 and a.stripe_subscription_id is not null and a.resiliation_impaye_notifiee_le is null
 and not coalesce(a.annulation_demandee,false)
 and not exists(select from public.retractations_abonnement r where r.organization_id=a.organization_id
   and r.subscription_id=a.stripe_subscription_id and r.nature='abonnement')
 order by a.paiement_en_defaut_depuis,a.organization_id;
$$;
revoke all on function public.resiliations_impaye_a_rapprocher() from public,anon,authenticated;
grant execute on function public.resiliations_impaye_a_rapprocher() to service_role;

-- Les dossiers qui sortent de la fenêtre d'envoi ou arrivent au terme de la mise en demeure exigent une décision.
create function public.dossiers_impayes_a_decider()
returns table(organization_id uuid,subscription text,episode date,motif text)
language sql stable security definer set search_path='' as $$
 select a.organization_id,a.stripe_subscription_id,a.paiement_en_defaut_depuis,
 case when a.relances_paiement=0 then 'premier_avis_absent' else 'decision_apres_mise_en_demeure' end
 from public.abonnements a where a.stripe_statut in ('unpaid','past_due') and a.stripe_subscription_id is not null and
 ((not a.premiere_facture_payee and a.relances_paiement=0 and a.paiement_en_defaut_depuis<public.aujourdhui_paris()-2)
 or exists(select from public.courriels_durables m join public.audit_log l on l.organization_id=m.organization_id
 and l.action='relance_paiement_envoyee' and l.details->>'message'=m.fournisseur_id
 where m.organization_id=a.organization_id and m.etat='livre' and m.finalisation_etat='terminee'
 and m.contexte_metier->>'type'='relance_abonnement' and m.contexte_metier->>'id'=a.stripe_subscription_id
 and m.contexte_metier->>'palier'='0' and m.contexte_metier->>'episode'=a.paiement_en_defaut_depuis::text
 and (l.details->>'envoyee_le')::timestamptz<=now()-interval '720 hours'));
$$;
revoke all on function public.dossiers_impayes_a_decider() from public,anon,authenticated;
grant execute on function public.dossiers_impayes_a_decider() to service_role;

-- invoice.paid peut parvenir sans customer.subscription.updated. Seul l'événement réservé autorise la
-- régularisation, après vérification Stripe de la dernière facture et de la souscription toujours active.
-- Point d'écriture commun au webhook et au rapprochement serveur. Les deux observations
-- verrouillent le même abonnement. Une réponse tardive ne remplace jamais une version plus récente.
create function public.regulariser_facture_prouvee(p_org uuid,p_customer text,p_subscription text,
 p_facture text,p_version text,p_montant bigint,p_event_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.abonnements; version text; o public.organizations;
begin
 select * into a from public.abonnements where stripe_customer_id=p_customer and stripe_subscription_id=p_subscription
 and (p_org is null or organization_id=p_org) for update;
 if not found or a.paiement_en_defaut_depuis is null or a.stripe_statut not in ('past_due','unpaid') then return null; end if;
 select xmin::text into version from public.abonnements where organization_id=a.organization_id;
 if p_version is null then return to_jsonb(version); end if;
 if version is distinct from p_version then raise exception 'Le dossier a changé, relire le règlement' using errcode='40001'; end if;
 if coalesce(p_montant,0)<=0 or coalesce(p_facture,'') !~ '^in_[A-Za-z0-9_]{1,200}$' then raise exception 'Montant réglé invalide'; end if;
 select * into strict o from public.organizations where id=a.organization_id for update;
 -- Conserver un archivage ou une suspension administrative : le règlement rétablit seulement l'accès commercial.
 if o.status='suspendue' and not exists(select from public.audit_log l where l.id=(
   select j.id from public.audit_log j where j.organization_id=o.id and j.action in ('abonnement_statut','organisation_suspendue','organisation_archivee','organisation_reactivee')
   order by j.created_at desc,j.id desc limit 1) and l.action='abonnement_statut' and l.details->>'souscription'=a.stripe_subscription_id
   and l.details->>'stripe' in ('past_due','unpaid') and l.details->>'apres'='suspendue') then
   update public.abonnements set stripe_statut='active',paiement_en_defaut_depuis=null,relances_paiement=0,derniere_relance_le=null,updated_at=now()
    where organization_id=o.id;
   insert into public.audit_log(organization_id,action,details) values(o.id,'paiement_regularise',
    jsonb_build_object('en_defaut_depuis',a.paiement_en_defaut_depuis,'suspension_conservee',true));
 else
   perform public.abonnement_appliquer(a.stripe_customer_id,a.stripe_subscription_id,'active',a.quantite,a.periode_fin,a.annulation_demandee);
 end if;
 insert into public.audit_log(organization_id,action,details) values(o.id,'regularisation_facture_confirmee',
   jsonb_strip_nulls(jsonb_build_object('source',case when p_event_id is null then 'api_stripe' else 'evenement_stripe' end,
   'evenement',p_event_id,'facture',p_facture,'souscription',a.stripe_subscription_id,'montant_cents',p_montant)));
 return to_jsonb(o.id);
end $$;
revoke all on function public.regulariser_facture_prouvee(uuid,text,text,text,text,bigint,text) from public,anon,authenticated,service_role;

-- Lecture par l'API Stripe avec la clé serveur ; aucun identifiant d'événement webhook n'est fabriqué.
create function public.stripe_rapprocher_facture_payee(p_org uuid,p_customer text,p_subscription text,
 p_facture text,p_version text,p_montant bigint)
returns jsonb language sql security definer set search_path='' as $$
 select public.regulariser_facture_prouvee(p_org,p_customer,p_subscription,p_facture,p_version,p_montant,null)
 where p_org is not null and p_customer is not null and p_subscription is not null;
$$;
revoke all on function public.stripe_rapprocher_facture_payee(uuid,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.stripe_rapprocher_facture_payee(uuid,text,text,text,text,bigint) to service_role;

alter function public.stripe_evenement_appliquer(text,uuid,text,jsonb) rename to stripe_evenement_appliquer_avant_regularisation;
create function public.stripe_evenement_appliquer(p_event_id text,p_jeton uuid,p_action text,p_params jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.abonnement_evenements; a public.abonnements;
begin
 -- Sérialiser les deux sources d'une même régularisation : deux événements distincts ont deux réservations.
 if p_action='abonnement_appliquer' then
  perform 1 from public.abonnement_evenements where stripe_event_id=p_event_id and verrou_jeton=p_jeton for update;
  if found then
   select * into a from public.abonnements where stripe_customer_id=p_params->>'p_customer' for update;
   -- Un statut actif seul ne démontre pas que les factures antérieures sont réglées.
   -- Le règlement vérifié par le webhook de facture ou le contrôle périodique lèvera l'impayé.
   if found and a.paiement_en_defaut_depuis is not null and a.stripe_subscription_id=p_params->>'p_subscription'
     and p_params->>'p_statut' in ('active','trialing') then
     raise exception 'La régularisation exige une preuve de règlement du contrat' using errcode='40001';
   end if;
   if found and p_params->>'p_statut' in ('past_due','unpaid') and p_params->>'p_facture_en_defaut' is not null
   and exists(select from public.audit_log j where j.organization_id=a.organization_id and j.action='regularisation_facture_confirmee'
    and j.details->>'facture'=p_params->>'p_facture_en_defaut' and j.details->>'souscription'=p_params->>'p_subscription')
   then raise exception 'État Stripe antérieur au règlement vérifié, relire la souscription' using errcode='40001'; end if;
  end if;
 end if;
 if p_action not in ('abonnement_defaut_a_regulariser','abonnement_regulariser_facture') or p_action is null then
  return public.stripe_evenement_appliquer_avant_regularisation(p_event_id,p_jeton,p_action,p_params);
 end if;
 select * into e from public.abonnement_evenements where stripe_event_id=p_event_id for update;
 if not found or p_jeton is null or e.verrou_jeton is distinct from p_jeton or e.traite_le is not null
 or e.verrou_jusqua is null or e.verrou_jusqua<=clock_timestamp() or e.type<>'invoice.paid'
 or p_params->>'p_facture' is distinct from e.charge->>'objet'
 or p_params->>'p_customer' is distinct from e.charge->>'client' then raise exception 'Preuve de règlement invalide'; end if;
 if p_action='abonnement_regulariser_facture' and nullif(p_params->>'p_version','') is null then raise exception 'Version du règlement absente'; end if;
 return public.regulariser_facture_prouvee(null,p_params->>'p_customer',p_params->>'p_subscription',e.charge->>'objet',
   case when p_action='abonnement_regulariser_facture' then p_params->>'p_version' end,(p_params->>'p_montant')::bigint,p_event_id);
end $$;
revoke all on function public.stripe_evenement_appliquer_avant_regularisation(text,uuid,text,jsonb),
 public.stripe_evenement_appliquer(text,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.stripe_evenement_appliquer(text,uuid,text,jsonb) to service_role;
