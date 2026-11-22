-- LE LOCATAIRE DIT SES DISPONIBILITÉS DÈS QU'IL SIGNALE UN INCIDENT (audit palier 1 du 22/11/2026, P2-02).
--
-- L'ÉCART. Le formulaire de signalement ne demandait pas au locataire quand il peut recevoir un artisan : le
-- gestionnaire devait le lui redemander avant de proposer des créneaux, ce qui ajoutait un aller-retour.
--
-- CE QUE FAIT CETTE MIGRATION.
--   · `incidents.disponibilites_locataire` : un texte libre de 300 caractères au plus (« en semaine après 18 h, samedi
--     matin »), et `disponibilites_locataire_le`, l'instant où il a été donné.
--   · `indiquer_mes_disponibilites_incident` : le locataire titulaire du signalement (celui qui l'a déclaré, ou le
--     locataire principal du bail quand le gestionnaire l'a déclaré pour lui) écrit, corrige ou efface ce texte tant que
--     le dossier n'est pas clos. Personne d'autre ne passe par cette fonction.
--
-- CE QUI NE CHANGE PAS : le signalement lui-même (catégorie, description, photos, urgence), les créneaux proposés par
-- l'artisan et acceptés par le locataire, et les droits de lecture — le gestionnaire du dossier lit ces disponibilités
-- comme il lit le reste de l'incident. C'est une indication donnée au gestionnaire : elle ne réserve aucun créneau et
-- n'engage ni le locataire ni l'artisan.
--
-- Retour arrière : supabase/retours-arriere/20261122233000_disponibilites_locataire_incident.retour.sql.

alter table public.incidents
  add column if not exists disponibilites_locataire text,
  add column if not exists disponibilites_locataire_le timestamptz;

do $contrainte$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.incidents'::regclass and conname = 'incidents_disponibilites_locataire_bornees') then
    alter table public.incidents add constraint incidents_disponibilites_locataire_bornees
      check (disponibilites_locataire is null
             or (length(btrim(disponibilites_locataire)) between 1 and 300
                 and disponibilites_locataire_le is not null));
  end if;
end $contrainte$;

comment on column public.incidents.disponibilites_locataire is
  'P2-02 (22/11/2026) : disponibilités indiquées par le locataire pour une intervention (texte libre, 300 caractères au plus). Simple indication pour le gestionnaire.';

create or replace function public.indiquer_mes_disponibilites_incident(p_incident uuid, p_disponibilites text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_texte text := nullif(btrim(coalesce(p_disponibilites, '')), '');
begin
  select i.id, i.organization_id, i.etat, i.declarant_person_id, i.canal, i.bail_id
    into v
    from public.incidents i
   where i.id = p_incident
   for update;
  -- Le même refus pour un dossier absent et pour le dossier d'un autre : rien ne dit qu'il existe.
  if v.id is null
     or not exists (
       select 1 from public.persons p
        where p.id = public.titulaire_incident(v.declarant_person_id, v.canal, v.bail_id)
          and p.organization_id = v.organization_id
          and p.account_id = (select auth.uid()))
     or not exists (
       select 1 from public.memberships m
        where m.account_id = (select auth.uid()) and m.organization_id = v.organization_id
          and m.role = 'locataire' and m.status in ('active', 'inactive')) then
    raise exception 'Signalement introuvable';
  end if;
  if v.etat = 'clos' then
    raise exception 'Ce signalement est clos : vos disponibilités ne peuvent plus être modifiées';
  end if;
  if length(v_texte) > 300 then
    raise exception 'Indiquez vos disponibilités en 300 caractères au plus';
  end if;

  update public.incidents
     set disponibilites_locataire = v_texte,
         disponibilites_locataire_le = case when v_texte is null then null else now() end
   where id = p_incident;
end;
$$;
comment on function public.indiquer_mes_disponibilites_incident(uuid, text) is
  'P2-02 (22/11/2026) : le locataire titulaire d''un signalement non clos indique, corrige ou efface ses disponibilités pour une intervention.';
revoke all on function public.indiquer_mes_disponibilites_incident(uuid, text) from public, anon;
grant execute on function public.indiquer_mes_disponibilites_incident(uuid, text) to authenticated;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
