-- RETOUR ARRIÈRE de 20261014301000_ecart_rendez_vous_chronologie.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les
-- migrations d'origine SANS cette migration, puis recopiées ici par un générateur — aucune n'est écrite
-- à la main. Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014301000_ecart_rendez_vous_chronologie.retour.sql
--
-- RÉINTRODUIT le défaut ART-21 : démarrer, rendre compte ou facturer bien avant le rendez-vous confirmé ne laisse plus aucune trace d'écart à
-- la chronologie de l'incident (l'avertissement affiché à l'artisan, lui, est dans l'application).
-- NE DÉFAIT PAS les écarts déjà écrits dans `incident_evenements.details` (clés avant_rendez_vous, debut_prevu, ecart_minutes) : lignes d'audit
-- jamais supprimées, elles restent lisibles. Aucune donnée n'est modifiée par ce script.

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
-- Hors transaction, l'instruction démarre à l'instant même de sa transaction ; dans un lot, elle est plus tardive.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;

begin;
set local lock_timeout = '10s';

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public).
-- Rétablit la définition ANTÉRIEURE (reprise de la base reconstruite par les migrations d'origine) si, et
-- seulement si, la définition en vigueur porte la marque du correctif. Sans la marque, la fonction est
-- déjà revenue (rejeu) ou a été réécrite depuis : on n'y touche pas.
create function pg_temp.restaurer_fonction(p_signature text, p_marque text, p_definition text)
returns text language plpgsql as $retour_arriere$
declare v_oid regprocedure := to_regprocedure(p_signature); v_courante text;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', p_signature;
  end if;
  v_courante := pg_get_functiondef(v_oid);
  if position(p_marque in v_courante) = 0 then
    return p_signature || ' : marque du correctif absente, rien à faire';
  end if;
  execute p_definition;
  return p_signature || ' : définition antérieure rétablie';
end $retour_arriere$;

-- ART-21 (1/3)
select pg_temp.restaurer_fonction('public.demarrer_intervention(uuid)',
  $marque$Audit du 13/10 (ART-21)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.demarrer_intervention(p_intervention uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record;
begin
  select i.* into v from public.incident_interventions i
  where i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut not in ('acceptee', 'planifiee') then
    raise exception 'Cette mission ne démarre pas depuis l''état « % »', v.statut;
  end if;
  update public.incident_interventions
  set statut = 'en_cours', demarree_le = now() where id = p_intervention;
  update public.incidents set etat = 'en_cours'
  where id = v.incident_id and etat = 'affecte';
  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'intervention_demarree', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention));
end;
$function$
$definition_anterieure$);

-- ART-21 (2/3)
select pg_temp.restaurer_fonction('public.deposer_compte_rendu(uuid,text,text,public.incident_imputation,bigint,boolean)',
  $marque$Audit du 13/10 (ART-21)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.deposer_compte_rendu(p_intervention uuid, p_travaux text, p_cause_reelle text DEFAULT NULL::text, p_imputation_suggeree incident_imputation DEFAULT NULL::incident_imputation, p_montant_final_cents bigint DEFAULT NULL::bigint, p_nouvelle_intervention boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_cr uuid; v_numero text; v_imputation public.incident_imputation;
begin
  select i.* into v from public.incident_interventions i
  where i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut <> 'en_cours' then
    raise exception 'Démarrez l''intervention avant d''en rendre compte (état : %)', v.statut;
  end if;
  if length(trim(coalesce(p_travaux, ''))) = 0 then
    raise exception 'Dites ce que vous avez fait — le compte rendu conditionne la facturation';
  end if;
  if not exists (select 1 from public.intervention_photos ip
                 where ip.intervention_id = p_intervention and ip.moment = 'apres') then
    raise exception 'Ajoutez la photo du travail réalisé : sans elle, l''intervention ne peut pas être terminée (RM-7.5.2)';
  end if;

  insert into public.intervention_comptes_rendus
    (organization_id, intervention_id, artisan_id, travaux_realises,
     cause_reelle, imputation_suggeree, montant_final_cents,
     nouvelle_intervention_necessaire)
  values (v.organization_id, p_intervention, v.artisan_id, trim(p_travaux),
          nullif(trim(coalesce(p_cause_reelle, '')), ''), p_imputation_suggeree,
          p_montant_final_cents, coalesce(p_nouvelle_intervention, false))
  returning id into v_cr;

  update public.incident_interventions
  set statut = 'terminee', terminee_le = now() where id = p_intervention;

  select numero, imputation into v_numero, v_imputation
  from public.incidents where id = v.incident_id;
  update public.incidents set etat = 'termine'
  where id = v.incident_id and etat = 'en_cours';

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'compte_rendu', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention,
                             'cause_reelle', nullif(trim(coalesce(p_cause_reelle, '')), ''),
                             'imputation_suggeree', p_imputation_suggeree,
                             'montant_final_cents', p_montant_final_cents));

  -- RM-7.5.3 : « l'artisan est le seul à voir la cause réelle ». Une cause
  -- suggérée qui diffère de l'imputation posée ouvre l'alerte de révision.
  if p_imputation_suggeree is not null and p_imputation_suggeree is distinct from v_imputation then
    insert into public.alerts (organization_id, type, criticite, titre, details,
                               origine_type, origine_id)
    values (v.organization_id, 'incident_imputation_a_reviser', 'critique',
            'Imputation à réviser avant facturation — ' || v_numero,
            jsonb_build_object('incident_id', v.incident_id,
                               'lot_id', (select i2.lot_id from public.incidents i2
                                          where i2.id = v.incident_id),
                               'intervention_id', p_intervention,
                               'imputation_suggeree', p_imputation_suggeree,
                               'libelle', 'L''artisan signale une cause différente : '
                                          || trim(coalesce(p_cause_reelle, ''))),
            'intervention', p_intervention);
  end if;
  return v_cr;
exception when unique_violation then
  raise exception 'Le compte rendu de cette intervention a déjà été déposé';
end;
$function$
$definition_anterieure$);

-- ART-21 (3/3)
select pg_temp.restaurer_fonction('public.deposer_facture_artisan(uuid,text,bigint,text,text,text,bigint,text)',
  $marque$Audit du 13/10 (ART-21)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.deposer_facture_artisan(p_intervention uuid, p_numero text, p_montant_ttc_cents bigint, p_justification text, p_storage_path text, p_mime text, p_taille bigint, p_empreinte text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v record; v_plafond bigint; v_doc uuid; v_facture uuid; v_numero_incident text;
  v_ecart boolean; v_justif text;
begin
  select i.* into v from public.incident_interventions i
  where i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;

  -- « Aucune facture sans intervention terminée + photo » (module 9).
  if v.statut <> 'terminee' then
    raise exception 'La facture se dépose une fois l''intervention terminée (état : %)', v.statut;
  end if;
  if not exists (select 1 from public.intervention_comptes_rendus cr
                 where cr.intervention_id = p_intervention) then
    raise exception 'Déposez d''abord le compte rendu : il conditionne la facturation';
  end if;
  if not exists (select 1 from public.intervention_photos ip
                 where ip.intervention_id = p_intervention and ip.moment = 'apres') then
    raise exception 'Ajoutez la photo du travail réalisé : sans elle, pas de facture (RM-7.5.2)';
  end if;
  if exists (select 1 from public.intervention_factures f where f.intervention_id = p_intervention) then
    raise exception 'La facture de cette intervention a déjà été déposée';
  end if;

  if length(btrim(coalesce(p_numero, ''))) not between 1 and 60 then
    raise exception 'Indiquez le numéro de votre facture';
  end if;
  if coalesce(p_montant_ttc_cents, 0) <= 0 or p_montant_ttc_cents > 100000000000 then
    raise exception 'Indiquez le montant TTC de la facture';
  end if;

  v_plafond := public.plafond_intervention(p_intervention);
  v_ecart := v_plafond is not null and p_montant_ttc_cents <> v_plafond;
  v_justif := nullif(btrim(coalesce(p_justification, '')), '');
  -- L'écart ne bloque pas ; il se JUSTIFIE (l'agent tranche).
  if v_ecart and v_justif is null then
    raise exception 'Le montant diffère du devis retenu : expliquez l''écart, l''agence le tranchera';
  end if;
  if length(coalesce(v_justif, '')) > 4000 then
    raise exception 'L''explication de l''écart est trop longue (4 000 caractères au plus)';
  end if;

  if p_storage_path is null
     or p_storage_path not like v.organization_id::text || '/factures-artisan/' || p_intervention::text || '/%' then
    raise exception 'Joignez votre facture (PDF ou photo)';
  end if;

  select numero into v_numero_incident from public.incidents where id = v.incident_id;
  begin
    insert into public.documents
      (organization_id, type, titre, storage_path, mime_type, taille_octets,
       empreinte, deposited_by)
    values (v.organization_id, 'facture_artisan',
            'Facture ' || btrim(p_numero) || ' — incident ' || v_numero_incident,
            p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()))
    returning id into v_doc;
  exception when unique_violation then
    raise exception 'Ce fichier a déjà été déposé';
  end;
  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, v.organization_id, 'organisation', v.organization_id),
         (v_doc, v.organization_id, 'incident', v.incident_id);

  insert into public.intervention_factures
    (organization_id, intervention_id, artisan_id, numero, montant_ttc_cents,
     montant_reference_cents, ecart_justification, document_id, deposee_par)
  values (v.organization_id, p_intervention, v.artisan_id, btrim(p_numero),
          p_montant_ttc_cents, v_plafond, v_justif, v_doc, (select auth.uid()))
  returning id into v_facture;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'facture_deposee', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'facture_id', v_facture,
                             'numero', btrim(p_numero),
                             'montant_ttc_cents', p_montant_ttc_cents,
                             'montant_reference_cents', v_plafond));

  insert into public.alerts (organization_id, type, criticite, titre, details,
                             origine_type, origine_id)
  values (v.organization_id, 'facture_artisan_a_valider',
          case when v_ecart then 'critique' else 'normale' end::public.alerte_criticite,
          case when v_ecart
               then 'Facture à valider, écart avec le devis — ' || v_numero_incident
               else 'Facture à valider — ' || v_numero_incident end,
          jsonb_build_object('incident_id', v.incident_id,
                             'lot_id', (select i2.lot_id from public.incidents i2
                                        where i2.id = v.incident_id),
                             'intervention_id', p_intervention,
                             'document_id', v_doc,
                             'facture_id', v_facture,
                             'montant_ttc_cents', p_montant_ttc_cents,
                             'montant_reference_cents', v_plafond,
                             'libelle', case when v_ecart
                               then 'Écart avec le devis retenu, justifié par l''artisan : ' || v_justif
                               else 'Montant conforme au devis retenu' end),
          'intervention', p_intervention);
  return v_facture;
end;
$function$
$definition_anterieure$);

-- La règle de la marge n'a plus d'appelant : on la retire, SANS cascade, sauf si une fonction y fait encore appel
-- (réécrite depuis par une autre migration) — dans ce cas elle est conservée, avec un avertissement.
do $retour_arriere$
begin
  if exists (select 1 from pg_proc p
              where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname <> 'ecart_rendez_vous'
                and pg_get_functiondef(p.oid) like '%ecart\_rendez\_vous%') then
    raise warning 'public.ecart_rendez_vous conservée : une fonction y fait encore appel';
  else
    drop function if exists public.ecart_rendez_vous(timestamptz);
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014301000';
  end if;
end $retour_arriere$;

commit;
