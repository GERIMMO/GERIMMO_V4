-- Les incidents doivent suivre le portefeuille de leur lot.
-- Recette du 13/09 : un agent ne voyait pas le lot d'un collègue mais lisait
-- son incident et pouvait en changer l'imputation, retenir un devis, fixer
-- un rendez-vous ou annuler une mission. Les politiques et RPC du module 8
-- contrôlaient l'agence, sans reprendre le périmètre de l'agent du 09/09.
--
-- On conserve lots_de_mon_portefeuille : mandats de l'agent + lots qu'il a
-- créés et qu'aucun mandat ne couvre. Aucun dossier ni état métier ne change.

-- 1. Résoudre l'objet jusqu'au lot, sans dépendre des RLS de ses parents.
create or replace function public.incident_hors_portefeuille(p_org uuid, p_incident uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.est_agent_restreint(p_org) and not exists (
    select 1 from public.incidents i
    where i.id = p_incident and i.organization_id = p_org
      and not public.lot_hors_portefeuille(p_org, i.lot_id)
  );
$$;
create or replace function public.intervention_hors_portefeuille(p_org uuid, p_intervention uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.est_agent_restreint(p_org) and not exists (
    select 1 from public.incident_interventions i
    where i.id = p_intervention and i.organization_id = p_org
      and not public.incident_hors_portefeuille(p_org, i.incident_id)
  );
$$;
create or replace function public.consultation_hors_portefeuille(p_org uuid, p_consultation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.est_agent_restreint(p_org) and not exists (
    select 1 from public.incident_consultations c
    where c.id = p_consultation and c.organization_id = p_org
      and not public.incident_hors_portefeuille(p_org, c.incident_id)
  );
$$;
create or replace function public.devis_hors_portefeuille(p_org uuid, p_devis uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.est_agent_restreint(p_org) and not exists (
    select 1 from public.incident_devis d
    where d.id = p_devis and d.organization_id = p_org
      and not public.incident_hors_portefeuille(p_org, d.incident_id)
  );
$$;
revoke execute on function public.incident_hors_portefeuille(uuid,uuid),
  public.intervention_hors_portefeuille(uuid,uuid),
  public.consultation_hors_portefeuille(uuid,uuid),
  public.devis_hors_portefeuille(uuid,uuid) from public, anon;
grant execute on function public.incident_hors_portefeuille(uuid,uuid),
  public.intervention_hors_portefeuille(uuid,uuid),
  public.consultation_hors_portefeuille(uuid,uuid),
  public.devis_hors_portefeuille(uuid,uuid) to authenticated;

-- 2. Ajouter une restriction, sans élargir les politiques existantes.
create policy incidents_agent_portefeuille on public.incidents
  as restrictive for select to authenticated
  using (not public.lot_hors_portefeuille(organization_id, lot_id));
do $$
declare t text;
begin
  foreach t in array array[
    'incident_evenements', 'incident_consultations', 'incident_sollicitations',
    'incident_devis', 'incident_interventions'
  ] loop
    execute format('create policy %I on public.%I as restrictive for select to authenticated
      using (not public.incident_hors_portefeuille(organization_id, incident_id))',
      t || '_agent_portefeuille', t);
  end loop;
  foreach t in array array[
    'intervention_creneaux', 'intervention_comptes_rendus', 'intervention_photos',
    'artisan_evaluations'
  ] loop
    execute format('create policy %I on public.%I as restrictive for select to authenticated
      using (not public.intervention_hors_portefeuille(organization_id, intervention_id))',
      t || '_agent_portefeuille', t);
  end loop;
end $$;

-- 3. Les écritures directes sont déjà interdites ; les gestes d'agence
-- passent par ces RPC SECURITY DEFINER. Ajouter une garde AVANT leur corps
-- actuel conserve toutes leurs transitions, validations et effets de bord.
-- On repart de la définition installée pour ne pas recopier une version
-- antérieure d'une règle métier. Chaque signature et l'ancre sont vérifiées.
-- Les RPC personnelles locataire/artisan restent intactes : un artisan peut
-- aussi être agent dans une agence sans perdre l'accès à ses propres missions.
do $$
declare r record; v_definition text; v_corps text; v_nouveau text;
begin
  for r in select * from (values
    ('public.ouvrir_incident_agence(uuid,uuid,text,text,text,text,public.incident_urgence)',
      'public.lot_hors_portefeuille(p_org, p_lot)'),
    ('public.qualifier_incident(uuid,uuid,public.incident_imputation,text)',
      'public.incident_hors_portefeuille(p_org, p_incident)'),
    ('public.attribuer_incident(uuid,uuid,uuid)',
      'public.incident_hors_portefeuille(p_org, p_incident)'),
    ('public.cloturer_incident(uuid,uuid,public.incident_cloture,text)',
      'public.incident_hors_portefeuille(p_org, p_incident)'),
    ('public.rouvrir_incident(uuid,uuid,text)',
      'public.incident_hors_portefeuille(p_org, p_incident)'),
    ('public.joindre_photo_incident(uuid,uuid,text,text,bigint,text)',
      'public.incident_hors_portefeuille(p_org, p_incident)'),
    ('public.ouvrir_consultation(uuid,uuid,public.artisan_metier,public.nature_travaux,boolean,integer)',
      'public.incident_hors_portefeuille(p_org, p_incident)'),
    ('public.solliciter_artisan(uuid,uuid,uuid)',
      'public.consultation_hors_portefeuille(p_org, p_consultation)'),
    ('public.retenir_devis(uuid,uuid)',
      'public.devis_hors_portefeuille(p_org, p_devis)'),
    ('public.fixer_creneau_arbitrage(uuid,uuid,timestamptz,timestamptz,text)',
      'public.intervention_hors_portefeuille(p_org, p_intervention)'),
    ('public.reviser_imputation_apres_diagnostic(uuid,uuid,public.incident_imputation,text)',
      'public.incident_hors_portefeuille(p_org, p_incident)'),
    ('public.annuler_mission(uuid,uuid,text)',
      'public.intervention_hors_portefeuille(p_org, p_intervention)'),
    ('public.evaluer_artisan_gerant(uuid,uuid,smallint,smallint,smallint,text)',
      'public.intervention_hors_portefeuille(p_org, p_intervention)')
  ) as gardes(signature, condition) loop
    select pg_get_functiondef(p.oid), p.prosrc into v_definition, v_corps
    from pg_proc p join pg_language l on l.oid = p.prolang
    where p.oid = r.signature::regprocedure and l.lanname = 'plpgsql' and p.prosecdef;
    if v_corps is null or v_corps !~ E'\nbegin\n' then
      raise exception 'Garde portefeuille : définition inattendue pour %', r.signature;
    end if;
    v_nouveau := regexp_replace(v_corps, E'\nbegin\n',
      E'\nbegin\n  -- Périmètre incident de l''agent (recette 13/09).\n  if ' || r.condition ||
      E' then\n    raise exception ''Ce dossier est hors de votre portefeuille'' using errcode = ''42501'';\n  end if;\n');
    if v_nouveau = v_corps then
      raise exception 'Garde portefeuille non ajoutée pour %', r.signature;
    end if;
    execute replace(v_definition, v_corps, v_nouveau);
  end loop;
end $$;

-- 4. La file d'évaluations est une lecture SECURITY DEFINER : elle doit
-- filtrer elle-même le lot, comme les autres projections du portefeuille.
create or replace function public.interventions_a_evaluer(p_org uuid)
returns table (
  intervention_id uuid, incident_id uuid, incident_numero text, artisan_id uuid,
  raison_sociale text, terminee_le timestamptz, lot_nom text
)
language sql stable security definer set search_path = '' as $$
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
$$;

-- Les alertes d'incident ne sont pas des alertes générales pour toute l'agence.
create or replace function public.alerte_dans_portefeuille(p_org uuid, p_details jsonb)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_details ? 'incident_id' then not public.incident_hors_portefeuille(p_org, (p_details->>'incident_id')::uuid)
    when p_details ? 'intervention_id' then not public.intervention_hors_portefeuille(p_org, (p_details->>'intervention_id')::uuid)
    when p_details ? 'consultation_id' then not public.consultation_hors_portefeuille(p_org, (p_details->>'consultation_id')::uuid)
    when p_details ? 'devis_id' then not public.devis_hors_portefeuille(p_org, (p_details->>'devis_id')::uuid)
    when p_details ? 'bail_id' then not public.bail_hors_portefeuille(p_org, (p_details->>'bail_id')::uuid)
    when p_details ? 'lot_id' then not public.lot_hors_portefeuille(p_org, (p_details->>'lot_id')::uuid)
    when p_details ? 'person_id' then not public.person_hors_portefeuille(p_org, (p_details->>'person_id')::uuid)
    else true
  end;
$$;

-- Une ancienne assignation personnelle ne rend pas le dossier lisible après
-- transfert de son mandat. La règle précédente « assignée à moi » reste vraie
-- pour les alertes générales, mais ne contourne plus le lot d'un incident.
create policy alerts_incident_agent_portefeuille on public.alerts
  as restrictive for all to authenticated
  using (
    not public.est_agent_restreint(organization_id)
    or not (details ?| array['incident_id','intervention_id','consultation_id','devis_id'])
    or public.alerte_dans_portefeuille(organization_id, details)
  )
  with check (
    not public.est_agent_restreint(organization_id)
    or not (details ?| array['incident_id','intervention_id','consultation_id','devis_id'])
    or public.alerte_dans_portefeuille(organization_id, details)
  );

-- Une photo ou un devis relié à l'incident devient lisible par son agent,
-- sans rendre les pièces du collègue visibles. Les autres liens sont conservés.
create or replace function public.document_dans_portefeuille(p_org uuid, p_doc uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.document_liens dl
    where dl.document_id = p_doc and (
      (dl.entite = 'lot' and not public.lot_hors_portefeuille(p_org, dl.entite_id))
      or (dl.entite = 'bail' and not public.bail_hors_portefeuille(p_org, dl.entite_id))
      or (dl.entite = 'personne' and not public.person_hors_portefeuille(p_org, dl.entite_id))
      or (dl.entite = 'mandat' and not public.mandat_hors_portefeuille(p_org, dl.entite_id))
      or (dl.entite = 'incident' and not public.incident_hors_portefeuille(p_org, dl.entite_id))
    )
  );
$$;

-- Le modèle « écriture par RPC uniquement » est une condition de ce correctif.
-- Refuser l'application si les permissions ont divergé, plutôt que laisser
-- une voie directe contourner les gardes des fonctions ci-dessus.
do $$
declare t text; privilege text;
begin
  foreach t in array array[
    'incidents', 'incident_evenements', 'incident_consultations',
    'incident_sollicitations', 'incident_devis', 'incident_interventions',
    'intervention_creneaux', 'intervention_comptes_rendus',
    'intervention_photos', 'artisan_evaluations'
  ] loop
    foreach privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
      if has_table_privilege('authenticated', 'public.' || t, privilege) then
        raise exception 'Écriture directe inattendue : %.% pour authenticated', t, privilege;
      end if;
    end loop;
  end loop;
  if has_function_privilege('authenticated',
    'public.incident_creer(uuid,uuid,uuid,uuid,public.incident_canal,text,text,text,text,public.incident_urgence,uuid)', 'EXECUTE') then
    raise exception 'La fonction interne incident_creer ne doit pas être exposée';
  end if;
end $$;
