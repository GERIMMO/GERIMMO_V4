CREATE OR REPLACE FUNCTION public.ouvrir_consultation(p_org uuid, p_incident uuid, p_metier artisan_metier, p_nature nature_travaux, p_devis_unique_assume boolean DEFAULT false, p_validite_jours integer DEFAULT 30)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid; b uuid; d record;
begin
 if auth.uid() is null then raise exception 'Accès refusé.' using errcode='42501'; end if;
 v:=public.ouvrir_consultation_interne(p_org,p_incident,p_metier,p_nature,p_devis_unique_assume,p_validite_jours);
 select l.bien_id into b from public.incidents i join public.lots l on l.id=i.lot_id where i.id=p_incident and i.organization_id=p_org;
 select * into d from public.reseau_disponibilite(p_org,b,p_metier,p_nature);
 if d.nb_contacts=0 and d.etat<>'ouverte' then
  if d.etat='adresse_incomplete' then raise exception 'Complétez l’adresse du bien et confirmez sa commune avant de rechercher un artisan du réseau.'; end if;
  raise exception 'Aucun artisan du réseau n’est actuellement disponible pour ce métier et ces travaux dans cette zone.';
 end if;
 return v;
end $function$;
CREATE OR REPLACE FUNCTION public.solliciter_artisan(p_org uuid, p_consultation uuid, p_artisan uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c record; b record; contact boolean; v uuid; code_commune text;
begin
 if public.consultation_hors_portefeuille(p_org,p_consultation) then raise exception 'Ce dossier est hors de votre portefeuille' using errcode='42501'; end if;
 if auth.uid() is null or not(p_org in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé.' using errcode='42501'; end if;
 select * into c from public.incident_consultations where id=p_consultation and organization_id=p_org for update;
 if not found then raise exception 'Mise en concurrence introuvable.'; end if;
 select bi.* into b from public.incidents i join public.lots l on l.id=i.lot_id join public.biens bi on bi.id=l.bien_id where i.id=c.incident_id for share of bi;
 contact:=public.reseau_contact_dans_zone(p_org,p_artisan,b.postal_code);
 if not contact then
  if b.commune_insee is null then raise exception 'Complétez l’adresse du bien et confirmez sa commune.'; end if;
  perform 1 from public.artisans where id=p_artisan for share;
  if not public.reseau_artisan_eligible(p_artisan,b.commune_insee,c.metier)
   or not exists(select 1 from public.artisan_zones z where z.artisan_id=p_artisan and public.zone_artisan_couvre(z.code_postal,b.postal_code))
  then raise exception 'Cet artisan du réseau n’est plus disponible pour ce métier dans cette commune. Aucun professionnel n’a été sollicité.'; end if;
  code_commune:=b.commune_insee;
 end if;
 v:=public.solliciter_artisan_interne(p_org,p_consultation,p_artisan);
 update public.incident_sollicitations set origine_reseau=case when contact then 'carnet' else 'reseau' end,
  commune_reseau=code_commune where id=v;
 return v;
end $function$;
CREATE OR REPLACE FUNCTION public.solliciter_artisan_interne(p_org uuid, p_consultation uuid, p_artisan uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c record; v_code_postal text; v_nb integer; v_sollicitation uuid; v_account uuid;
begin
  -- Périmètre incident de l'agent (recette 13/09).
  if public.consultation_hors_portefeuille(p_org, p_consultation) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into c from public.incident_consultations
  where id = p_consultation and organization_id = p_org for update;
  if not found then raise exception 'Mise en concurrence introuvable'; end if;
  if c.statut <> 'ouverte' then
    raise exception 'Cette mise en concurrence est close';
  end if;

  select b.postal_code into v_code_postal
  from public.incidents i join public.lots l on l.id = i.lot_id
  join public.biens b on b.id = l.bien_id
  where i.id = c.incident_id and i.organization_id = p_org;

  if not public.artisan_affectable(p_artisan, p_org, c.metier, c.nature_travaux, case when public.reseau_contact_dans_zone(p_org,p_artisan,v_code_postal) then v_code_postal else null end) then
    -- Le message nomme la raison : sans elle, l'agent ne sait pas quoi corriger.
    if public.decennale_requise(c.nature_travaux)
       and not public.artisan_decennale_valide(p_artisan) then
      raise exception 'Artisan écarté : ces travaux exigent une décennale valide (RM-8.2.9), la sienne ne l''est pas';
    end if;
    if not exists (select 1 from public.artisan_metiers am
                   where am.artisan_id = p_artisan and am.metier = c.metier) then
      raise exception 'Artisan écarté : ce n''est pas son métier (RM-8.3)';
    end if;
    raise exception 'Artisan écarté : profil non validé par la plateforme, en liste noire, hors zone, ou non rattaché à votre agence';
  end if;

  select count(*) into v_nb from public.incident_sollicitations s
  where s.consultation_id = p_consultation
    -- Décision D18 du 14/10 (livraison 2) : une demande en révision tient sa place ; une demande refusée l'a rendue.
    and s.statut in ('envoyee', 'devis_depose', 'retenue', 'revision_demandee');
  if v_nb >= 2 then
    raise exception 'Deux artisans au maximum sollicités en parallèle (RM-9.1.1)';
  end if;

  insert into public.incident_sollicitations
    (organization_id, consultation_id, incident_id, artisan_id, created_by)
  values (p_org, p_consultation, c.incident_id, p_artisan, (select auth.uid()))
  returning id into v_sollicitation;

  -- L'adhésion ne donne AUCUN droit sur les données de l'agence (voir règle 3
  -- du préambule) : elle sert uniquement à faire apparaître l'agence dans
  -- /espaces. `do nothing` parce qu'un compte n'a qu'une adhésion par agence —
  -- si l'artisan y est déjà connu autrement, on ne l'écrase pas.
  select a.account_id into v_account from public.artisans a where a.id = p_artisan;
  if v_account is not null then
    insert into public.memberships (account_id, organization_id, role)
    values (v_account, p_org, 'artisan') on conflict do nothing;
  end if;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, c.incident_id, 'sollicitation', (select auth.uid()),
          jsonb_build_object('sollicitation_id', v_sollicitation, 'artisan_id', p_artisan));
  return v_sollicitation;
exception when unique_violation then
  raise exception 'Cet artisan est déjà sollicité sur cette mise en concurrence';
end;
$function$;
notify pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.mes_sollicitations()
 RETURNS TABLE(sollicitation_id uuid, organization_id uuid, agence_nom text, incident_numero text, categorie text, description text, urgence incident_urgence, metier artisan_metier, nature_travaux nature_travaux, decennale_requise boolean, code_postal text, ville text, envoyee_le timestamp with time zone, statut sollicitation_statut, valide_jusqu_au date, montant_ttc_cents bigint, decision_motif text, version integer, revision_motif text, revision_avant date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Décision D18 du 14/10 (livraison 1) : decision_motif, le motif de la décision prise sur son devis.
  -- Décision D18 du 14/10 (livraison 2) : la DERNIÈRE version de son devis ; revision_motif et revision_avant quand
  -- une révision lui est demandée. Jamais le devis d'un concurrent : filtré par mon_artisan_id().
  select s.id, s.organization_id, o.name, i.numero, i.categorie, i.description,
         i.urgence, c.metier, c.nature_travaux, c.decennale_requise,
         b.postal_code, b.city, s.envoyee_le, s.statut,
         d.valide_jusqu_au, d.montant_ttc_cents,
         d.decision_motif,
         d.version,
         case when d.decision = 'revision' then d.decision_motif end,
         s.revision_avant
  from public.incident_sollicitations s
  join public.incident_consultations c on c.id = s.consultation_id
  join public.incidents i on i.id = s.incident_id
  join public.lots l on l.id = i.lot_id
  join public.biens b on b.id = l.bien_id
  join public.organizations o on o.id = s.organization_id
  left join lateral (
    select d0.* from public.incident_devis d0 where d0.sollicitation_id = s.id
    order by d0.version desc limit 1
  ) d on true
  where s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  -- Comparaison par le texte : corps vérifié à la création, valeur nouvelle non encore utilisable dans le lot.
  order by (s.statut::text in ('envoyee', 'revision_demandee')) desc, s.envoyee_le desc;
$function$;
CREATE OR REPLACE FUNCTION public.mon_agenda_artisan(p_du timestamp with time zone DEFAULT NULL::timestamp with time zone, p_au timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(intervention_id uuid, organization_id uuid, agence_nom text, incident_numero text, statut intervention_statut, debut_prevu timestamp with time zone, fin_prevue timestamp with time zone, categorie text, description text, urgence incident_urgence, piece text, nature_travaux nature_travaux, adresse text, code_postal text, ville text, lot_nom text, etage text, occupant_nom text, occupant_prenom text, occupant_telephone text, montant_ttc_cents bigint, compte_rendu_depose boolean, photo_apres_deposee boolean, creneaux_en_attente integer, dates_locataire_en_attente integer, montant_plafond_cents bigint, montant_final_cents bigint, facture_deposee boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    i.id, i.organization_id, o.name, inc.numero, i.statut,
    i.debut_prevu, i.fin_prevue,
    inc.categorie, inc.description, inc.urgence, inc.piece, i.nature_travaux,
    b.address_line1, b.postal_code, b.city, l.nom, l.etage,
    -- Ni avant l'acceptation, ni après la fin : le contact de l'occupant n'est
    -- lisible que pendant la mission vivante.
    case when i.statut in ('acceptee','planifiee','en_cours') then pe.nom end,
    case when i.statut in ('acceptee','planifiee','en_cours') then pe.prenom end,
    case when i.statut in ('acceptee','planifiee','en_cours') then pe.telephone end,
    d.montant_ttc_cents,
    exists (select 1 from public.intervention_comptes_rendus cr where cr.intervention_id = i.id),
    exists (select 1 from public.intervention_photos ip
            where ip.intervention_id = i.id and ip.moment = 'apres'),
    (select count(*)::integer from public.intervention_creneaux cr
      where cr.intervention_id = i.id and cr.statut = 'propose'
        and cr.propose_par = 'artisan'),
    (select count(*)::integer from public.intervention_creneaux cr
      where cr.intervention_id = i.id and cr.statut = 'propose'
        and cr.propose_par = 'locataire' and cr.debut > now()),
    public.plafond_intervention(i.id),
    (select cr.montant_final_cents from public.intervention_comptes_rendus cr
      where cr.intervention_id = i.id limit 1),
    exists (select 1 from public.intervention_factures f where f.intervention_id = i.id)
  from public.incident_interventions i
  join public.incidents inc on inc.id = i.incident_id
  join public.lots l on l.id = inc.lot_id
  join public.biens b on b.id = l.bien_id
  join public.organizations o on o.id = i.organization_id
  left join public.incident_devis d on d.id = i.devis_id
  left join public.baux ba on ba.id = inc.bail_id
  left join public.persons pe on pe.id = ba.locataire_principal
  where i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and i.statut in ('proposee', 'acceptee', 'planifiee', 'en_cours', 'terminee')
    and (p_du is null or i.debut_prevu is null or i.debut_prevu >= p_du)
    and (p_au is null or i.debut_prevu is null or i.debut_prevu < p_au)
  order by i.debut_prevu nulls first, i.confiee_le;
$function$;
CREATE OR REPLACE FUNCTION public.interventions_a_evaluer(p_org uuid)
 RETURNS TABLE(intervention_id uuid, incident_id uuid, incident_numero text, artisan_id uuid, raison_sociale text, terminee_le timestamp with time zone, lot_nom text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select i.id, i.incident_id, inc.numero, i.artisan_id, a.raison_sociale,
         i.terminee_le, l.nom
  from public.incident_interventions i
  join public.incidents inc on inc.id = i.incident_id
  join public.lots l on l.id = inc.lot_id
  join public.artisans a on a.id = i.artisan_id
  where i.organization_id = p_org
    and p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and not public.lot_hors_portefeuille(p_org, inc.lot_id)
    and i.statut = 'terminee'
    and not exists (select 1 from public.artisan_evaluations e
                    where e.intervention_id = i.id and e.source = 'gerant')
  order by i.terminee_le;
$function$;
notify pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.lire_devis_structure(p_sollicitation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.incident_devis%rowtype; resultat jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Accès refusé'; end if;
  -- Décision D18 du 14/10 (livraison 2) : plusieurs versions par demande, la dernière fait foi.
  select * into d from public.incident_devis where sollicitation_id=p_sollicitation order by version desc limit 1;
  if d.id is null then raise exception 'Accès refusé'; end if;
  -- Coalesce obligatoire : une identité artisan absente ne doit pas court-circuiter le refus.
  if not coalesce(public.is_super_admin() or d.artisan_id=public.mon_artisan_id() or
    (d.organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
      and not public.incident_hors_portefeuille(d.organization_id,d.incident_id)),false) then raise exception 'Accès refusé'; end if;
  select jsonb_build_object('id',d.id,'description',d.description,'lignes',d.lignes,
    'montant_ht_cents',d.montant_ht_cents,'montant_tva_cents',d.montant_tva_cents,'montant_ttc_cents',d.montant_ttc_cents,
    'diagnostic',d.diagnostic,'delai_intervention',d.delai_intervention,'duree_estimee',d.duree_estimee,
    'contraintes',d.contraintes,'observations',d.observations,'statut',d.statut,
    'depose_le',d.depose_le,'valide_jusqu_au',d.valide_jusqu_au,
    'artisan_nom',a.raison_sociale,'artisan_siret',a.siret,'artisan_telephone',a.telephone,
    'artisan_email',a.email,'agence_nom',o.name,'incident_numero',i.numero,
    'commune',b.city,'code_postal',b.postal_code)
  into resultat from public.artisans a join public.organizations o on o.id=d.organization_id
    join public.incidents i on i.id=d.incident_id and i.organization_id=d.organization_id
    join public.lots l on l.id=i.lot_id and l.organization_id=d.organization_id
    join public.biens b on b.id=l.bien_id and b.organization_id=d.organization_id
    where a.id=d.artisan_id;
  insert into public.audit_log(account_id,organization_id,action,details)
    values((select auth.uid()),d.organization_id,'devis_document_consulte',jsonb_build_object('devis_id',d.id));
  return resultat;
end $function$;
CREATE OR REPLACE FUNCTION public.lire_devis_pdf_version(p_sollicitation uuid, p_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.incident_devis%rowtype; resultat jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Accès refusé'; end if;
  -- Décision D18 du 14/10 (livraison 2) : plusieurs versions par demande, la dernière fait foi.
  select * into d from public.incident_devis where sollicitation_id=p_sollicitation and (p_version is null or version=p_version) order by version desc limit 1;
  if d.id is null then raise exception 'Accès refusé'; end if;
  -- Coalesce obligatoire : une identité artisan absente ne doit pas court-circuiter le refus.
  if not coalesce(public.is_super_admin() or d.artisan_id=public.mon_artisan_id() or
    (d.organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
      and not public.incident_hors_portefeuille(d.organization_id,d.incident_id)),false) then raise exception 'Accès refusé'; end if;
  select jsonb_build_object('id',d.id,'description',d.description,'lignes',d.lignes,
    'montant_ht_cents',d.montant_ht_cents,'montant_tva_cents',d.montant_tva_cents,'montant_ttc_cents',d.montant_ttc_cents,
    'diagnostic',d.diagnostic,'delai_intervention',d.delai_intervention,'duree_estimee',d.duree_estimee,
    'contraintes',d.contraintes,'observations',d.observations,'statut',d.statut,
    'depose_le',d.depose_le,'valide_jusqu_au',d.valide_jusqu_au,
    'artisan_nom',a.raison_sociale,'artisan_siret',a.siret,'artisan_telephone',a.telephone,
    'artisan_email',a.email,'agence_nom',o.name,'incident_numero',i.numero,
    'commune',b.city,'code_postal',b.postal_code)
  into resultat from public.artisans a join public.organizations o on o.id=d.organization_id
    join public.incidents i on i.id=d.incident_id and i.organization_id=d.organization_id
    join public.lots l on l.id=i.lot_id and l.organization_id=d.organization_id
    join public.biens b on b.id=l.bien_id and b.organization_id=d.organization_id
    where a.id=d.artisan_id;
  insert into public.audit_log(account_id,organization_id,action,details)
    values((select auth.uid()),d.organization_id,'devis_document_consulte',jsonb_build_object('devis_id',d.id));
  return resultat || jsonb_build_object('version',d.version,'reference_id',d.id,
    'pdf_bucket','documents','pdf_path',(select doc.storage_path from public.documents doc where doc.id=d.document_id and doc.organization_id=d.organization_id),
    'pdf_sha',(select doc.empreinte from public.documents doc where doc.id=d.document_id and doc.organization_id=d.organization_id));
end $function$;
CREATE OR REPLACE FUNCTION public.rendez_vous_a_rappeler(p_limite integer DEFAULT 200)
 RETURNS TABLE(intervention_id uuid, organization_id uuid, echeance text, destinataire text, adresse text, prenom text, emetteur text, artisan text, lot text, adresse_bien text, debut_prevu timestamp with time zone, fin_prevue timestamp with time zone, incident_numero text, categorie text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Réservée à la tâche planifiée (service_role, sans identité) et au super
  -- admin : elle traverse TOUTES les organisations.
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'rendez_vous_a_rappeler: reserve a la tache de rappel';
  end if;

  return query
  with rdv as (
    select i.id, i.organization_id, i.debut_prevu, i.fin_prevue,
           o.name as emetteur, a.raison_sociale, a.email as email_artisan,
           inc.numero, inc.categorie,
           l.nom as lot_nom,
           coalesce(b.address_line1, '') as adresse_bien,
           loc.email as email_locataire, loc.prenom as prenom_locataire,
           -- La veille, ou sept jours avant : des dates exactes, lues à Paris.
           case
             when (i.debut_prevu at time zone 'Europe/Paris')::date
                  = (now() at time zone 'Europe/Paris')::date + 1 then 'veille'
             when (i.debut_prevu at time zone 'Europe/Paris')::date
                  = (now() at time zone 'Europe/Paris')::date + 7 then 'j7'
           end as quand
    from public.incident_interventions i
    join public.organizations o on o.id = i.organization_id
    join public.artisans a on a.id = i.artisan_id
    join public.incidents inc on inc.id = i.incident_id
    join public.lots l on l.id = inc.lot_id
    join public.biens b on b.id = l.bien_id
    left join public.baux ba on ba.id = inc.bail_id
    left join public.persons loc
           on loc.id = coalesce(ba.locataire_principal, inc.declarant_person_id)
    where i.debut_prevu is not null
      and i.statut in ('acceptee', 'planifiee')
      -- Une organisation suspendue n'écrit plus en son nom.
      and public.org_ecriture_ouverte(i.organization_id)
  ),
  -- Une ligne par destinataire : l'adresse fausse de l'un ne prive pas
  -- l'autre de son rappel.
  cible as (
    select r.*, 'locataire' as qui, r.email_locataire as ou, r.prenom_locataire as p
      from rdv r
    union all
    select r.*, 'artisan' as qui, r.email_artisan as ou, null::text as p
      from rdv r
  )
  select c.id, c.organization_id, c.quand, c.qui, c.ou, c.p, c.emetteur,
         c.raison_sociale, c.lot_nom, c.adresse_bien, c.debut_prevu, c.fin_prevue,
         c.numero, c.categorie
  from cible c
  where c.quand is not null
    and c.ou is not null and length(btrim(c.ou)) > 0
    and not exists (
      select 1 from public.intervention_rappels r
      where r.intervention_id = c.id
        and r.echeance = c.quand::public.rappel_echeance
        and r.destinataire = c.qui::public.rappel_destinataire
        and (r.debut_prevu is null or r.debut_prevu = c.debut_prevu) -- Décision D22 (LOC-21)
    )
  order by c.debut_prevu, c.id
  limit greatest(1, least(p_limite, 500));
end;
$function$;
notify pgrst, 'reload schema';
