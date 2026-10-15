-- Décision X15 (REP-02, relevé du 13 octobre 2026) : mémoriser l'envoi de l'e-mail d'urgence.
--
-- Problème. Quand un locataire déclare un incident URGENT, l'action serveur envoie un e-mail immédiat au
-- gestionnaire. Cet e-mail n'était envoyé qu'à la première exécution (`rejoue = false`). Si la première
-- tentative créait l'incident puis s'arrêtait avant l'e-mail (action interrompue pendant l'envoi des photos,
-- réponse de la base perdue après l'enregistrement), la reprise de la même tentative (même clé de commande,
-- `rejoue = true`) sautait l'e-mail, et rien ne gardait la trace de son envoi : ni la reprise ni une tâche ne
-- pouvait le renvoyer. L'alerte « Incident urgent à qualifier » reste dans l'espace du gestionnaire, mais le
-- courriel immédiat (sécurité des personnes) était perdu.
--
-- Correction (option « mémoriser l'envoi » de la décision) :
--   · une colonne facultative `commandes_incidents_locataire.notifie_le` : l'instant où l'e-mail d'urgence est
--     parti pour cette tentative (NULL tant qu'il n'est pas parti) ;
--   · `declarer_mon_incident_reprise` dit aussi `notifie` (vrai si l'e-mail est déjà parti) : l'action envoie
--     l'e-mail à la première exécution comme à la reprise TANT QUE `notifie` est faux ;
--   · `marquer_incident_urgent_notifie(org, commande)` : le locataire déclarant (et lui seul) mémorise l'envoi,
--     une seule fois. L'action l'appelle APRÈS un envoi réussi : en cas d'échec de la mémorisation, la reprise
--     renverra l'e-mail (un doublon vaut mieux qu'une urgence non signalée).
--
-- Migration ADDITIVE et rejouable. Aucune ligne existante n'est réécrite : les tentatives déjà enregistrées gardent
-- `notifie_le` à NULL ; une reprise de l'une d'elles renverrait l'e-mail une fois, ce qui ne se produit qu'en
-- rejouant EXACTEMENT la même tentative (même clé de commande, tirée par le formulaire ouvert).
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

alter table public.commandes_incidents_locataire add column if not exists notifie_le timestamptz;

comment on column public.commandes_incidents_locataire.notifie_le is
  'Instant où l''e-mail d''urgence au gestionnaire est parti pour cette tentative (NULL : pas encore parti). Décision X15 (REP-02).';

create or replace function public.declarer_mon_incident_reprise(p_org uuid,p_commande uuid,p_categorie text,p_description text,p_piece text,p_anciennete text,p_urgence public.incident_urgence)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.commandes_incidents_locataire; v_id uuid; v_requete jsonb;
begin
 if auth.uid() is null or p_commande is null or not(p_org in(select public.org_ids_avec_roles(array['locataire']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 v_requete:=jsonb_build_array(p_categorie,nullif(trim(p_description),''),nullif(trim(p_piece),''),nullif(trim(p_anciennete),''),p_urgence);
 perform pg_advisory_xact_lock(hashtextextended(p_commande::text,131000));
 select * into v from public.commandes_incidents_locataire where id=p_commande;
 if found then
  if v.account_id<>auth.uid() or v.organization_id<>p_org then raise exception 'Accès refusé'; end if;
  if v.requete<>v_requete then raise exception 'Cette tentative est déjà enregistrée avec une autre saisie. Retrouvez le signalement dans vos demandes.'; end if;
  -- Décision X15 (REP-02) du 14/10 : la reprise dit si le gestionnaire a déjà été prévenu par e-mail.
  return jsonb_build_object('incident_id',v.incident_id,'rejoue',true,'notifie',v.notifie_le is not null);
 end if;
 v_id:=public.declarer_mon_incident(p_org,p_categorie,p_description,p_piece,p_anciennete,p_urgence);
 insert into public.commandes_incidents_locataire(id,organization_id,account_id,requete,incident_id) values(p_commande,p_org,auth.uid(),v_requete,v_id);
 return jsonb_build_object('incident_id',v_id,'rejoue',false,'notifie',false);
end $$;
revoke all on function public.declarer_mon_incident_reprise(uuid,uuid,text,text,text,text,public.incident_urgence) from public,anon;
grant execute on function public.declarer_mon_incident_reprise(uuid,uuid,text,text,text,text,public.incident_urgence) to authenticated;

-- Le locataire déclarant mémorise que l'e-mail d'urgence est parti. Vrai la première fois, faux ensuite
-- (déjà mémorisé, ou tentative qui n'est pas la sienne : même refus d'accès que la déclaration elle-même).
create or replace function public.marquer_incident_urgent_notifie(p_org uuid,p_commande uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_nb integer;
begin
 if auth.uid() is null or p_commande is null or not(p_org in(select public.org_ids_avec_roles(array['locataire']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 update public.commandes_incidents_locataire set notifie_le=now()
  where id=p_commande and account_id=auth.uid() and organization_id=p_org and notifie_le is null;
 get diagnostics v_nb = row_count;
 return v_nb>0;
end $$;
revoke all on function public.marquer_incident_urgent_notifie(uuid,uuid) from public,anon;
grant execute on function public.marquer_incident_urgent_notifie(uuid,uuid) to authenticated;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();
