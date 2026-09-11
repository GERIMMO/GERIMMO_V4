-- Module 19 — RM-19.2.2 : « la photo est le premier champ, avant la
-- description ; deux photos et la pièce suffisent, aucune description
-- obligatoire ».
--
-- L'écran locataire promet cette règle depuis la recette du 24/08 (« facultatif
-- si vous joignez une photo ») mais la base la refusait encore : colonne NOT
-- NULL, contrainte de non-vacuité, et garde explicite dans incident_creer. Le
-- locataire qui photographie sur le vif — le geste que le module 19 veut rendre
-- possible — essuyait donc un refus après avoir tout saisi. C'est la base qu'on
-- aligne sur la règle, pas l'écran sur la base.
--
-- Portée : la seule déclaration du locataire (canal « espace_locataire »).
-- L'agence retranscrit un appel téléphonique : il n'y a aucune photo à faire
-- parler à la place des mots, et rien dans le module 19 ne la dispense de
-- décrire. Son formulaire continue d'exiger la description, la base aussi.

-- La description devient facultative en base ; renseignée, elle reste non vide
-- (une chaîne d'espaces n'a jamais été une description).
alter table public.incidents alter column description drop not null;
alter table public.incidents drop constraint incidents_description_non_vide;
alter table public.incidents add constraint incidents_description_non_vide
  check (description is null or length(trim(description)) > 0);

-- incident_creer : la garde sur la description devient propre au canal
-- « agence ». La déclaration du locataire sans description enregistre NULL —
-- jamais une chaîne vide : « aucune description » se lit de la même façon
-- partout (fil d'activité, dossier d'incident) sans convention implicite.
create or replace function public.incident_creer(
  p_org uuid, p_lot uuid, p_bail uuid, p_declarant uuid,
  p_canal public.incident_canal, p_categorie text, p_description text,
  p_piece text, p_anciennete text, p_urgence public.incident_urgence,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident uuid;
  v_numero text;
  v_doublon boolean;
  v_description text;
begin
  if length(trim(coalesce(p_categorie, ''))) = 0 then
    raise exception 'Choisissez la catégorie du problème';
  end if;
  v_description := nullif(trim(coalesce(p_description, '')), '');
  if v_description is null and p_canal <> 'espace_locataire' then
    raise exception 'Décrivez le problème en une phrase au moins';
  end if;

  v_doublon := exists (
    select 1 from public.incidents i
    where i.organization_id = p_org and i.lot_id = p_lot
      and i.categorie = p_categorie and i.etat <> 'clos'
  );

  v_numero := public.incident_prochain_numero(p_org);
  insert into public.incidents
    (organization_id, numero, lot_id, bail_id, declarant_person_id, canal,
     categorie, piece, description, anciennete, urgence, created_by)
  values
    (p_org, v_numero, p_lot, p_bail, p_declarant, p_canal,
     trim(p_categorie), nullif(trim(coalesce(p_piece, '')), ''),
     v_description, nullif(trim(coalesce(p_anciennete, '')), ''),
     p_urgence, p_created_by)
  returning id into v_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v_incident, 'declaration', p_created_by,
          jsonb_build_object('canal', p_canal, 'urgence', p_urgence, 'doublon_possible', v_doublon));

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'incident_a_qualifier',
          (case when p_urgence = 'urgente' then 'critique' else 'normale' end)::public.alerte_criticite,
          case when p_urgence = 'urgente'
               then 'Incident urgent à qualifier — ' || v_numero
               else 'Incident à qualifier — ' || v_numero end,
          jsonb_build_object('incident_id', v_incident, 'lot_id', p_lot,
                             'libelle', case when v_doublon
                               then 'Doublon possible : un incident du même type est déjà ouvert sur ce lot'
                               end));
  return v_incident;
end;
$$;
