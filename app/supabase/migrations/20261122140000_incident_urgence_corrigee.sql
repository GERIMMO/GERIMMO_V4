-- LE GESTIONNAIRE CORRIGE L'URGENCE D'UN INCIDENT APRÈS SA DÉCLARATION (audit palier 1 du 22/11/2026, P1-04).
--
-- LE DÉFAUT. L'urgence d'un incident était fixée une fois pour toutes à la déclaration : aucune fonction de la base ne
-- modifiait `incidents.urgence`. Un locataire qui déclarait « urgent » à tort (ou « normal » une fuite active) laissait
-- un dossier mal classé jusqu'à sa clôture : tri, puce « Urgent » et relais d'urgence restaient faux.
--
-- LA RÈGLE. Le gestionnaire du dossier (propriétaire, administrateur ou agent de l'espace, dans son portefeuille)
-- corrige l'urgence tant que l'incident n'est pas clos. Le motif est obligatoire : il reste au fil du dossier, avec
-- l'ancien et le nouveau niveau, sous le nom de son auteur. Aucune notification ne part : l'espace du locataire
-- n'affiche pas l'urgence de ses demandes après la déclaration.
--
-- DEUX GESTES, rejouables :
--   1. un type d'événement de plus, « urgence_corrigee », ajouté à la liste fermée en relisant la contrainte en
--      vigueur (aucun type existant n'est retiré) ;
--   2. `corriger_urgence_incident(p_org, p_incident, p_urgence, p_motif)`.
-- Aucune donnée existante n'est modifiée.
--
-- RETOUR ARRIÈRE : supabase/retours-arriere/20261122140000_incident_urgence_corrigee.retour.sql

-- 1. Le type d'événement.
do $contrainte$
declare
  v_def text;
  v_nouvelle text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.incident_evenements'::regclass and c.conname = 'incident_evenements_type_check';
  if v_def is null then
    raise exception 'P1-04 : contrainte incident_evenements_type_check introuvable';
  end if;
  if position('''urgence_corrigee''' in v_def) = 0 then
    v_nouvelle := regexp_replace(v_def, '\]\)\)\)$', ', ''urgence_corrigee''::text])))');
    if v_nouvelle = v_def or position('''urgence_corrigee''::text])))' in v_nouvelle) = 0 then
      raise exception 'P1-04 : forme inattendue de la contrainte incident_evenements_type_check';
    end if;
    alter table public.incident_evenements drop constraint incident_evenements_type_check;
    execute 'alter table public.incident_evenements add constraint incident_evenements_type_check ' || v_nouvelle;
  end if;
end $contrainte$;

-- 2. Le geste. Mêmes gardes que la qualification : portefeuille de l'agent, rôle gestionnaire de l'espace.
create or replace function public.corriger_urgence_incident(
  p_org uuid, p_incident uuid, p_urgence public.incident_urgence, p_motif text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if public.incident_hors_portefeuille(p_org, p_incident) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.incidents
   where id = p_incident and organization_id = p_org for update;
  if not found then raise exception 'Incident introuvable'; end if;
  if v.etat = 'clos' then
    raise exception 'Cet incident est clos : son urgence ne se corrige plus';
  end if;
  if p_urgence is null then
    raise exception 'Indiquez le niveau d''urgence';
  end if;
  if v.urgence = p_urgence then
    raise exception 'L''urgence de ce dossier est déjà à ce niveau';
  end if;
  if length(btrim(coalesce(p_motif, ''))) not between 5 and 500 then
    raise exception 'Indiquez le motif de la correction, en 5 à 500 caractères : il reste dans l''historique du dossier';
  end if;

  update public.incidents set urgence = p_urgence where id = p_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'urgence_corrigee', (select auth.uid()),
          jsonb_build_object('urgence', p_urgence, 'urgence_precedente', v.urgence, 'motif', btrim(p_motif)));
end;
$$;
comment on function public.corriger_urgence_incident(uuid, uuid, public.incident_urgence, text) is
  'P1-04 (22/11/2026) : le gestionnaire du dossier corrige l''urgence d''un incident non clos ; motif obligatoire, tracé au fil du dossier (événement « urgence_corrigee »).';
revoke all on function public.corriger_urgence_incident(uuid, uuid, public.incident_urgence, text) from public, anon;
grant execute on function public.corriger_urgence_incident(uuid, uuid, public.incident_urgence, text) to authenticated;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
