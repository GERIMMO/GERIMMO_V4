-- D16 (fiche ART-15), décision du dirigeant du 14/10/2026, option A : la photo jointe par le locataire est visible de l'artisan dès la
-- demande de devis, en lecture seule.
--
-- Constat (audit du 13/10) : la demande de devis dit « Photo jointe » mais l'artisan n'en voit aucune ; ni `mes_sollicitations` ni
-- `mon_agenda_artisan` ne rendent de pièce, et la photo est un `documents` de l'organisation que la politique de stockage
-- `ged_select_artisan` ne lui ouvre pas. Il chiffrait à l'aveugle.
--
-- Principe : la POLITIQUE DE STOCKAGE NE CHANGE PAS. Le portail artisan ne lit aucune table (aucune politique RLS ne nomme le rôle
-- `artisan`) : tout passe par des fonctions qui déduisent l'identité de `auth.uid()`. Deux fonctions s'ajoutent :
--   · `mes_photos_incident_artisan(sollicitation | intervention)` — la LISTE des photos que l'artisan a le droit de voir (identifiant,
--     type, rang). Ni chemin, ni nom de fichier, ni auteur. Lecture seule.
--   · `lire_photo_incident_artisan(document, sollicitation | intervention)` — revérifie le droit, ÉCRIT la trace d'accès
--     (`acces_pieces_log`, comme pour toute pièce de la GED : sans trace, pas d'accès) et rend le chemin de stockage. Le serveur
--     de l'application en tire une URL signée de 60 secondes (service_role, côté serveur seulement) : le fichier n'est ni lisible
--     ni écrasable autrement.
--
-- Qui voit quoi (le droit est celui de la demande ou de la mission, jamais un identifiant passé au hasard) :
--   · l'artisan destinataire d'une sollicitation `envoyee`, `devis_depose` ou `retenue`, ou d'une mission `proposee`, `acceptee`,
--     `planifiee` ou `en_cours`, tant que l'incident n'est pas clos ; ni les autres artisans, ni une demande déclinée, expirée,
--     annulée ou non retenue, ni une mission terminée ;
--   · seulement les photos de type `photo_incident` liées à cet incident, non purgées, DÉPOSÉES PAR LE DÉCLARANT (le locataire) :
--     les photos d'un constat de l'agence ne sont pas visées par cette décision.
--
-- Retour arrière : app/supabase/retours-arriere/20261014233000_photos_demande_devis_artisan.retour.sql (retire les deux fonctions ;
-- les lignes déjà écrites au journal d'accès restent). Rejouable : create or replace.

-- ── 1. La liste des photos visibles ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.mes_photos_incident_artisan(p_sollicitation uuid default null, p_intervention uuid default null)
returns table (document_id uuid, mime_type text, rang integer)
language sql stable security definer set search_path = '' as $$
  with moi as (select public.mon_artisan_id() as id),
  vise as (
    select s.incident_id, s.organization_id
      from public.incident_sollicitations s, moi
     where p_sollicitation is not null and moi.id is not null
       and s.id = p_sollicitation and s.artisan_id = moi.id
       and s.statut in ('envoyee', 'devis_depose', 'retenue')
    union
    select iv.incident_id, iv.organization_id
      from public.incident_interventions iv, moi
     where p_intervention is not null and moi.id is not null
       and iv.id = p_intervention and iv.artisan_id = moi.id
       and iv.statut in ('proposee', 'acceptee', 'planifiee', 'en_cours')
  )
  select d.id, d.mime_type, (row_number() over (order by d.created_at, d.id))::integer
    from vise v
    join public.incidents inc on inc.id = v.incident_id and inc.organization_id = v.organization_id and inc.etat <> 'clos'
    join public.persons declarant on declarant.id = inc.declarant_person_id and declarant.account_id is not null
    join public.document_liens dl on dl.entite = 'incident' and dl.entite_id = v.incident_id and dl.organization_id = v.organization_id
    join public.documents d on d.id = dl.document_id and d.organization_id = v.organization_id
     and d.type = 'photo_incident' and d.purged_at is null and d.storage_path is not null
     and d.deposited_by = declarant.account_id
   order by 3;
$$;
revoke all on function public.mes_photos_incident_artisan(uuid, uuid) from public, anon;
grant execute on function public.mes_photos_incident_artisan(uuid, uuid) to authenticated;

-- ── 2. La lecture d'une photo : droit revérifié, accès tracé, chemin rendu au serveur ───────────────────────────────────
create or replace function public.lire_photo_incident_artisan(p_document uuid, p_sollicitation uuid default null, p_intervention uuid default null)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_chemin text; v_org uuid;
begin
  if (select auth.uid()) is null or public.mon_artisan_id() is null then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if (p_sollicitation is null) = (p_intervention is null) then
    raise exception 'Indiquez la demande de devis ou la mission' using errcode = '22023';
  end if;
  if not exists (select 1 from public.mes_photos_incident_artisan(p_sollicitation, p_intervention) m where m.document_id = p_document) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select d.storage_path, d.organization_id into v_chemin, v_org from public.documents d where d.id = p_document;
  if v_chemin is null then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  -- Trace obligatoire avant tout accès (RM-0b.7.5) : si elle ne s'écrit pas, la fonction échoue et aucun chemin n'est rendu.
  insert into public.acces_pieces_log (organization_id, account_id, document_id, action)
  values (v_org, (select auth.uid()), p_document, 'consultation');
  return v_chemin;
end;
$$;
revoke all on function public.lire_photo_incident_artisan(uuid, uuid, uuid) from public, anon;
grant execute on function public.lire_photo_incident_artisan(uuid, uuid, uuid) to authenticated;

-- Convention de toute migration qui touche une fonction : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
