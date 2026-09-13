-- Le portefeuille ne peut pas être acquis en fabriquant un lien documentaire.
-- Preuves du 13/09 : avec un UUID/chemin connu, l'agent pouvait rattacher la
-- pièce d'un collègue à son lot, fabriquer une seconde fiche du même fichier,
-- ou supprimer tous les liens sans filtre. Les vérifications ont lieu AVANT
-- l'écriture, donc avant que le lien forgé ne rende le document visible.
-- Aucun fichier, lien ou historique existant n'est modifié.

create function public.document_deja_visible_agent(p_org uuid, p_document uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document and d.organization_id = p_org
      and (d.deposited_by = (select auth.uid())
           or public.document_dans_portefeuille(p_org, d.id))
  );
$$;
revoke execute on function public.document_deja_visible_agent(uuid,uuid)
  from public, anon, authenticated;

create function public.garde_document_liens_portefeuille()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb[]; j jsonb; v_org uuid; v_document uuid; v_entite uuid; v_cible_ok boolean;
begin
  if tg_op = 'INSERT' then v_rows := array[to_jsonb(new)];
  elsif tg_op = 'DELETE' then v_rows := array[to_jsonb(old)];
  else v_rows := array[to_jsonb(old),to_jsonb(new)];
  end if;
  foreach j in array v_rows loop
    v_org := (j->>'organization_id')::uuid;
    if not public.est_agent_restreint(v_org) then continue; end if;
    v_document := (j->>'document_id')::uuid;
    v_entite := (j->>'entite_id')::uuid;
    -- L'auteur relit sa nouvelle pièce avant son premier lien. C'est le
    -- parcours GED normal : dépôt, lien organisation, puis contexte éventuel.
    if not public.document_deja_visible_agent(v_org, v_document) then
      raise exception 'Ce document est hors de votre portefeuille' using errcode = '42501';
    end if;
    v_cible_ok := case j->>'entite'
      when 'organisation' then v_entite = v_org
      when 'personne' then not public.person_hors_portefeuille(v_org, v_entite)
      when 'lot' then not public.lot_hors_portefeuille(v_org, v_entite)
      when 'bail' then not public.bail_hors_portefeuille(v_org, v_entite)
      when 'mandat' then not public.mandat_hors_portefeuille(v_org, v_entite)
      when 'incident' then
        not public.incident_hors_portefeuille(v_org, v_entite)
        -- Un artisan également agent doit pouvoir déposer son propre devis
        -- ou sa photo sur une mission hors de son portefeuille de gestion.
        or exists (
          select 1 from public.documents d
          where d.id = v_document and d.deposited_by = (select auth.uid())
            and (
              exists (select 1 from public.incident_sollicitations s
                      where s.organization_id = v_org and s.incident_id = v_entite
                        and s.artisan_id = public.mon_artisan_id())
              or exists (select 1 from public.incident_interventions i
                         where i.organization_id = v_org and i.incident_id = v_entite
                           and i.artisan_id = public.mon_artisan_id())
            )
        )
      else false
    end;
    -- Le versionnage recopie les liens de la pièce précédente. Un partage
    -- transversal déjà autorisé par l'administrateur doit rester identique,
    -- sans permettre l'ajout d'une nouvelle cible hors portefeuille.
    if not coalesce(v_cible_ok, false) and tg_op = 'INSERT' then
      select exists (
        select 1 from public.documents d
        join public.document_liens precedent on precedent.document_id = d.remplace_id
        where d.id = v_document and d.organization_id = v_org
          and precedent.organization_id = v_org
          and precedent.entite::text = j->>'entite' and precedent.entite_id = v_entite
          and public.document_deja_visible_agent(v_org, d.remplace_id)
      ) into v_cible_ok;
    end if;
    if not coalesce(v_cible_ok, false) then
      raise exception 'La cible du document est hors de votre portefeuille' using errcode = '42501';
    end if;
  end loop;
  return coalesce(new,old);
end $$;
revoke execute on function public.garde_document_liens_portefeuille() from public, anon, authenticated;
create trigger document_liens_portefeuille
  before insert or update or delete on public.document_liens
  for each row execute function public.garde_document_liens_portefeuille();

-- Une fiche fabriquée avec un chemin existant ne doit pas ouvrir le fichier
-- d'un collègue via le « exists documents » de la RLS de stockage. On ne pose
-- pas d'unicité globale : une référence déjà lisible peut être réutilisée.
create function public.garde_document_fichier_portefeuille()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_proprietaire text; v_objet_existe boolean; v_deja_lisible boolean;
begin
  if not public.est_agent_restreint(new.organization_id) then return new; end if;
  if new.remplace_id is not null
     and not public.document_deja_visible_agent(new.organization_id, new.remplace_id) then
    raise exception 'Le document à remplacer est hors de votre portefeuille' using errcode = '42501';
  end if;
  if new.storage_path is null then return new; end if;
  if new.storage_path not like new.organization_id::text || '/%' then
    raise exception 'Le fichier doit appartenir à cette agence' using errcode = '42501';
  end if;
  select exists (
    select 1 from public.documents d where d.storage_path = new.storage_path
      and public.document_deja_visible_agent(new.organization_id, d.id)
  ) into v_deja_lisible;
  -- Comme la RLS Storage, une référence visible suffit : une autre fiche du
  -- même fichier peut être privée sans retirer un accès déjà accordé.
  if not v_deja_lisible and exists (
    select 1 from public.documents d where d.storage_path = new.storage_path
  ) then
    raise exception 'Ce fichier est hors de votre portefeuille' using errcode = '42501';
  end if;
  -- Le propriétaire protège aussi l'intervalle entre l'upload et sa fiche.
  -- Supabase utilise owner_id ; owner reste présent dans les versions plus
  -- anciennes et dans le banc local. La lecture JSON couvre les deux formes.
  select coalesce(nullif(to_jsonb(o)->>'owner_id',''), to_jsonb(o)->>'owner')
    into v_proprietaire
  from storage.objects o where o.bucket_id = 'documents' and o.name = new.storage_path;
  v_objet_existe := found;
  if v_objet_existe and not v_deja_lisible
     and v_proprietaire is distinct from (select auth.uid())::text then
    raise exception 'Ce fichier n''a pas été déposé par votre compte' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.garde_document_fichier_portefeuille() from public, anon, authenticated;
create trigger documents_fichier_portefeuille
  before insert on public.documents
  for each row execute function public.garde_document_fichier_portefeuille();

-- Les métadonnées sont déjà immuables pour le client (versionnage par RPC).
-- L'insertion ne doit pas pouvoir être suivie d'un remplacement direct du
-- chemin/auteur qui esquiverait la garde. Refuser une base qui aurait dérivé.
do $$
begin
  if has_table_privilege('authenticated','public.documents','UPDATE,DELETE,TRUNCATE') then
    raise exception 'Les métadonnées documents ne doivent pas être modifiables directement';
  end if;
end $$;
