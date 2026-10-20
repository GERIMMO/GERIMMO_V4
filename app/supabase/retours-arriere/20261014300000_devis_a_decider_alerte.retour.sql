-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014300000_devis_a_decider_alerte.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les
-- migrations d'origine SANS cette migration, puis recopiées ici par un générateur — aucune n'est écrite
-- à la main. Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014300000_devis_a_decider_alerte.retour.sql
--
-- RÉINTRODUIT le défaut PRO2-13 : le dépôt d'un devis ne laisse plus d'alerte dans l'application (seul l'e-mail part), et plus rien ne
-- ferme les alertes `devis_a_decider` à la décision.
-- NE DÉFAIT PAS les alertes `devis_a_decider` déjà écrites (public.alerts) : elles restent, ouvertes pour celles qui l'étaient. Aucune donnée
-- n'est modifiée par ce script. Pour les fermer à la main après le retour, voir LISEZ-MOI.md (« Alertes devis_a_decider »).

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

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

-- PRO2-13 (2/2) : le déclencheur d'abord (la fonction ne se retire qu'une fois détaché), puis sa fonction.
drop trigger if exists fermer_alerte_devis_a_decider on public.incident_devis;
drop function if exists public.fermer_alerte_devis_a_decider();

-- PRO2-13 (1/2)
select pg_temp.restaurer_fonction('public.deposer_devis(uuid,bigint,text,date,text,text,bigint,text)',
  $marque$Audit du 13/10 (PRO2-13)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.deposer_devis(p_sollicitation uuid, p_montant_ttc_cents bigint, p_description text, p_valide_jusqu_au date DEFAULT NULL::date, p_storage_path text DEFAULT NULL::text, p_mime text DEFAULT NULL::text, p_taille bigint DEFAULT NULL::bigint, p_empreinte text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; c record; v_devis uuid; v_doc uuid; v_echeance date;
begin
  select s.* into v from public.incident_sollicitations s
  where s.id = p_sollicitation and s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut <> 'envoyee' then
    raise exception 'Cette demande n''attend plus de devis (état : %)', v.statut;
  end if;
  if coalesce(p_montant_ttc_cents, 0) <= 0 then
    raise exception 'Indiquez le montant TTC du devis';
  end if;
  if length(trim(coalesce(p_description, ''))) = 0 then
    raise exception 'Décrivez ce que couvre le devis';
  end if;
  select * into c from public.incident_consultations where id = v.consultation_id;
  v_echeance := coalesce(p_valide_jusqu_au, (current_date + c.validite_jours)::date);
  if v_echeance <= current_date then
    raise exception 'La date de validité du devis doit être à venir';
  end if;

  if p_storage_path is not null then
    if p_storage_path not like v.organization_id::text || '/%' then
      raise exception 'Chemin de stockage invalide';
    end if;
    begin
      insert into public.documents
        (organization_id, type, titre, storage_path, mime_type, taille_octets,
         empreinte, deposited_by)
      values (v.organization_id, 'devis',
              'Devis — incident ' || (select i.numero from public.incidents i where i.id = v.incident_id),
              p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()))
      returning id into v_doc;
    exception when unique_violation then
      raise exception 'Ce fichier a déjà été déposé';
    end;
    insert into public.document_liens (document_id, organization_id, entite, entite_id)
    values (v_doc, v.organization_id, 'organisation', v.organization_id),
           (v_doc, v.organization_id, 'incident', v.incident_id);
  end if;

  insert into public.incident_devis
    (organization_id, sollicitation_id, incident_id, artisan_id,
     montant_ttc_cents, description, valide_jusqu_au, document_id)
  values (v.organization_id, p_sollicitation, v.incident_id, v.artisan_id,
          p_montant_ttc_cents, trim(p_description), v_echeance, v_doc)
  returning id into v_devis;

  update public.incident_sollicitations
  set statut = 'devis_depose', repondue_le = now() where id = p_sollicitation;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'devis', (select auth.uid()),
          jsonb_build_object('devis_id', v_devis, 'artisan_id', v.artisan_id,
                             'montant_ttc_cents', p_montant_ttc_cents,
                             'valide_jusqu_au', v_echeance));
  return v_devis;
exception when unique_violation then
  raise exception 'Un devis a déjà été déposé pour cette demande';
end;
$function$
$definition_anterieure$);

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014300000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
