-- LA DÉCLARATION D'INCIDENT DEPUIS LA FICHE DU BIEN DEMANDE LA CATÉGORIE ET L'URGENCE (audit palier 1 du 22/11/2026,
-- P1-19, seconde moitié : « une seule déclaration d'incident côté gestionnaire »).
--
-- LE DÉFAUT. Le gestionnaire déclare un incident par deux portes : l'écran « Incidents » (catégorie, urgence, pièce,
-- photos) et la fiche du bien (titre, date, note). La seconde écrivait TOUJOURS la catégorie « autre » et l'urgence
-- « normale » : un dégât des eaux déclaré depuis la fiche du bien n'était ni trié en tête, ni signalé « urgent », et le
-- repère « doublon possible » comparait tous ces dossiers entre eux puisqu'ils portaient la même catégorie.
--
-- LA CORRECTION. `declarer_incident_bien_simple` reçoit deux arguments de plus, la catégorie et l'urgence, et les traite
-- comme l'autre porte :
--   · sur un logement, elle passe par `ouvrir_incident_agence` (donc `incident_creer`) avec la catégorie et l'urgence
--     choisies : alerte « critique » pour une urgence, doublon possible signalé sur la vraie catégorie ;
--   · sur tout le bien (parties communes, propriétaire en gestion directe seulement, comme avant), elle écrit l'urgence
--     au dossier, pose l'alerte « critique » pour une urgence et signale un doublon possible : un dossier non clos de
--     la même catégorie sur les parties communes du même bien.
-- La liste des catégories reste tenue par la contrainte `incidents_categorie_connue` : une catégorie inconnue est
-- refusée par la base, rien n'est créé.
--
-- L'ANCIEN CODE CONTINUE DE MARCHER. Les deux arguments ont une valeur par défaut (« autre », « normale ») : l'appel à
-- sept arguments nommés que fait la version précédente de l'application aboutit à la nouvelle fonction et produit
-- exactement ce qu'il produisait. L'ancienne signature est retirée dans la même transaction : deux fonctions du même
-- nom rendraient l'appel à sept arguments ambigu pour l'API.
--
-- Rien d'autre ne change : droits (gestionnaire de l'espace), périmètre de l'agent, bien et logement non archivés,
-- titre de 150 caractères au plus, note de 5 000 au plus, date passée ou du jour (jour de Paris), et la commande qui
-- rend un second envoi du même formulaire sans effet.
--
-- Retour arrière : supabase/retours-arriere/20261122220000_incident_bien_categorie_urgence.retour.sql.

drop function if exists public.declarer_incident_bien_simple(uuid, uuid, uuid, text, date, text, uuid);

create or replace function public.declarer_incident_bien_simple(
  p_org uuid,
  p_bien uuid,
  p_lot uuid,
  p_titre text,
  p_date date,
  p_note text,
  p_commande uuid,
  p_categorie text default 'autre',
  p_urgence public.incident_urgence default 'normale'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_numero text;
  v_categorie text := btrim(coalesce(p_categorie, ''));
  v_urgence public.incident_urgence := coalesce(p_urgence, 'normale');
  v_description text;
  v_doublon boolean;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if not exists (select 1 from public.biens where id = p_bien and organization_id = p_org and archived_at is null) then
    raise exception 'Bien inaccessible';
  end if;
  if p_lot is not null then
    if public.lot_hors_portefeuille(p_org, p_lot)
       or not exists (select 1 from public.lots
                      where id = p_lot and bien_id = p_bien and organization_id = p_org and etat <> 'archive') then
      raise exception 'Logement inaccessible dans ce bien';
    end if;
  elsif not exists (select 1 from public.memberships m
                    where m.organization_id = p_org and m.account_id = auth.uid()
                      and m.role = 'proprietaire_direct' and m.status = 'active') then
    raise exception 'Choisissez le logement concerné';
  end if;
  if p_commande is null or nullif(trim(p_titre), '') is null or length(p_titre) > 150
     or length(coalesce(p_note, '')) > 5000 or p_date is null or p_date > public.aujourdhui_paris() then
    raise exception 'Vérifiez le titre, la date et la note';
  end if;
  if v_categorie = '' then
    raise exception 'Choisissez la catégorie du problème';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_commande::text, 0));
  select id into v_id from public.incidents
   where commande_declaration = p_commande and organization_id = p_org
     and lot_id is not distinct from p_lot and bien_id = p_bien;
  if found then
    return v_id;
  end if;

  v_description := trim(p_titre) || case when nullif(trim(p_note), '') is null then '' else E'\n' || trim(p_note) end;

  if p_lot is not null then
    -- La même porte que l'écran « Incidents » : numéro, alerte selon l'urgence, doublon possible sur la catégorie.
    v_id := public.ouvrir_incident_agence(p_org, p_lot, v_categorie, v_description, null, null, v_urgence, null);
    update public.incidents
       set titre = trim(p_titre), date_signalement = p_date, commande_declaration = p_commande, bien_id = p_bien
     where id = v_id;
  else
    v_doublon := exists (
      select 1 from public.incidents i
       where i.organization_id = p_org and i.bien_id = p_bien and i.lot_id is null
         and i.categorie = v_categorie and i.etat <> 'clos'
    );
    v_numero := public.incident_prochain_numero(p_org);
    insert into public.incidents
      (organization_id, bien_id, numero, canal, categorie, titre, description, date_signalement,
       commande_declaration, urgence, created_by)
    values
      (p_org, p_bien, v_numero, 'agence', v_categorie, trim(p_titre), v_description, p_date,
       p_commande, v_urgence, auth.uid())
    returning id into v_id;
    insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
    values (p_org, v_id, 'declaration', auth.uid(),
            jsonb_build_object('bien_id', p_bien, 'parties_communes', true,
                               'urgence', v_urgence, 'doublon_possible', v_doublon));
    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (p_org, 'incident_a_qualifier',
            (case when v_urgence = 'urgente' then 'critique' else 'normale' end)::public.alerte_criticite,
            (case when v_urgence = 'urgente' then 'Incident urgent du bâtiment — ' else 'Incident du bâtiment — ' end)
              || trim(p_titre),
            jsonb_strip_nulls(jsonb_build_object(
              'incident_id', v_id, 'bien_id', p_bien,
              'libelle', case when v_doublon
                then 'Doublon possible : un incident du même type est déjà ouvert sur les parties communes de ce bien'
                end)));
  end if;
  return v_id;
end;
$$;
comment on function public.declarer_incident_bien_simple(uuid, uuid, uuid, text, date, text, uuid, text, public.incident_urgence) is
  'P1-19 (22/11/2026) : déclaration d''un incident depuis la fiche du bien, avec sa catégorie et son urgence (par défaut « autre » et « normale », ce qu''écrivait la version à sept arguments).';
revoke all on function public.declarer_incident_bien_simple(uuid, uuid, uuid, text, date, text, uuid, text, public.incident_urgence) from public, anon;
grant execute on function public.declarer_incident_bien_simple(uuid, uuid, uuid, text, date, text, uuid, text, public.incident_urgence) to authenticated;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
