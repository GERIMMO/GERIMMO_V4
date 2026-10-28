-- Retour arrière de 20261028100300_import_controle_complet_et_trimestre_irl_annee.sql — audit final (BAIL-02, BAIL-05).
-- Rend à public.importer_parc sa définition de 20260911280000_import_du_parc (contrôle de forme seul) et à
-- public.controler_plafond_depot_garantie celle de 20260927101000_plafond_depot_a_la_fixation (montant brut « 700.00 € »),
-- puis supprime public.montant_en_euros. Remettre le code précédent n'est pas nécessaire : signatures inchangées.
-- DONNÉES CONSERVÉES : les trimestres IRL datés (« T3 2026 ») restent tels quels — la colonne est un texte libre que
-- l'ancienne version lit et imprime sans erreur ; son menu déroulant ne les propose simplement pas. Rien n'est réécrit.
begin;
set local lock_timeout = '10s';

create or replace function public.controler_plafond_depot_garantie()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare v_mois integer; v_plafond numeric;
begin
  if new.loyer_hc is null or new.depot_garantie is null then return new; end if;
  -- Audit 27/09 : sur un bail engagé, seul un changement du dépôt, du type ou
  -- du logement rouvre le contrôle — pas l'évolution du loyer (révision IRL,
  -- avenant à la baisse). RM-2.1.5 : le dépôt n'est jamais révisé.
  if tg_op = 'UPDATE'
     and old.etat is distinct from 'brouillon'::public.bail_etat
     and new.depot_garantie is not distinct from old.depot_garantie
     and new.type is not distinct from old.type
     and new.lot_id is not distinct from old.lot_id then
    return new;
  end if;
  v_mois := public.plafond_depot_mois(new.type::text, new.lot_id);
  v_plafond := v_mois * new.loyer_hc;
  if new.depot_garantie > v_plafond then
    raise exception 'Dépôt de garantie trop élevé : maximum % mois de loyer hors charges (soit % €) pour un bail %',
      v_mois, v_plafond, new.type;
  end if;
  return new;
end;
$function$;

create or replace function public.importer_parc(
  p_org uuid,
  p_lignes jsonb,
  p_controle_seulement boolean default true
)
returns table (
  ligne integer,
  statut text,          -- 'ok' | 'erreur'
  message text,
  bien_id uuid,
  lot_id uuid,
  bail_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l jsonb;
  i integer := 0;
  v_bien uuid; v_lot uuid; v_bail uuid;
  v_prop uuid; v_loc uuid;
  v_nom_bien text; v_nom_lot text; v_type text;
  v_quote numeric; v_debut date; v_jour smallint;
  v_erreur text;
  v_texte text;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Réservé au responsable de l''organisation : un import engage tout le parc';
  end if;
  if jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'Le fichier n''a pas pu être lu comme une liste de lignes';
  end if;

  for l in select jsonb_array_elements(p_lignes) loop
    i := i + 1;
    v_bien := null; v_lot := null; v_bail := null; v_erreur := null;
    v_nom_bien := nullif(btrim(coalesce(l->>'bien', '')), '');
    v_nom_lot := nullif(btrim(coalesce(l->>'lot', '')), '');
    v_type := lower(btrim(coalesce(l->>'type', 'appartement')));

    -- ── Contrôle de forme, commun aux deux passes ──────────────────────────
    if v_nom_bien is null then
      v_erreur := 'Le nom du bien est obligatoire';
    elsif v_nom_lot is null then
      v_erreur := 'Le nom du lot est obligatoire';
    elsif nullif(btrim(coalesce(l->>'adresse', '')), '') is null then
      v_erreur := 'L''adresse est obligatoire';
    elsif nullif(btrim(coalesce(l->>'code_postal', '')), '') is null
       or btrim(l->>'code_postal') !~ '^[0-9]{5}$' then
      v_erreur := 'Code postal attendu sur cinq chiffres';
    elsif nullif(btrim(coalesce(l->>'ville', '')), '') is null then
      v_erreur := 'La ville est obligatoire';
    elsif not exists (select 1 from unnest(enum_range(null::public.bien_type)) t
                      where t::text = v_type) then
      v_erreur := format('Type de bien inconnu : « %s » (attendus : %s)',
                         l->>'type',
                         (select string_agg(t::text, ', ') from unnest(enum_range(null::public.bien_type)) t));
    elsif nullif(btrim(coalesce(l->>'proprietaire_nom', '')), '') is null then
      v_erreur := 'Le nom du propriétaire est obligatoire — sans détention, le lot ne se loue pas';
    end if;

    -- Quote-part : absente vaut 100 (un seul propriétaire, le cas courant).
    if v_erreur is null then
      begin
        v_quote := coalesce(nullif(btrim(coalesce(l->>'quote_part', '')), '')::numeric, 100);
        if v_quote <= 0 or v_quote > 100 then
          v_erreur := format('Quote-part hors bornes : %s (attendu entre 0 et 100)', v_quote);
        end if;
      exception when others then
        v_erreur := format('Quote-part illisible : « %s »', l->>'quote_part');
      end;
    end if;

    -- Le bloc « bail » n'est rempli que si un locataire est nommé.
    if v_erreur is null and nullif(btrim(coalesce(l->>'locataire_nom', '')), '') is not null then
      begin
        v_debut := nullif(btrim(coalesce(l->>'date_debut', '')), '')::date;
      exception when others then
        v_erreur := format('Date d''entrée illisible : « %s » (attendu AAAA-MM-JJ)', l->>'date_debut');
      end;
      if v_erreur is null and v_debut is null then
        v_erreur := 'Un locataire est nommé mais la date d''entrée manque';
      end if;
      if v_erreur is null
         and nullif(btrim(coalesce(l->>'loyer_hc', '')), '') is null then
        v_erreur := 'Un locataire est nommé mais le loyer hors charges manque';
      end if;
    end if;

    if v_erreur is not null then
      ligne := i; statut := 'erreur'; message := v_erreur;
      bien_id := null; lot_id := null; bail_id := null;
      return next;
      continue;
    end if;

    if p_controle_seulement then
      ligne := i; statut := 'ok';
      message := format('%s · %s%s', v_nom_bien, v_nom_lot,
        case when nullif(btrim(coalesce(l->>'locataire_nom','')),'') is not null
             then ' · bail en brouillon' else '' end);
      bien_id := null; lot_id := null; bail_id := null;
      return next;
      continue;
    end if;

    -- ── Écriture : chaque ligne dans son bloc, une chute n'emporte pas les
    --    autres et son motif est rendu tel que la base l'a dit.
    begin
      select b.id into v_bien from public.biens b
      where b.organization_id = p_org and lower(btrim(b.nom)) = lower(v_nom_bien)
      limit 1;
      if v_bien is null then
        insert into public.biens (organization_id, nom, type, address_line1,
          address_line2, postal_code, city, annee_construction, copropriete)
        values (p_org, v_nom_bien, v_type::public.bien_type,
          btrim(l->>'adresse'), nullif(btrim(coalesce(l->>'adresse2','')),''),
          btrim(l->>'code_postal'), btrim(l->>'ville'),
          nullif(btrim(coalesce(l->>'annee','')),'')::integer,
          coalesce(nullif(btrim(coalesce(l->>'copropriete','')),'')::boolean, false))
        returning id into v_bien;
      end if;

      -- Un même nom de lot dans un même bien n'est pas recréé : on réimporte
      -- un fichier corrigé sans fabriquer de doublons.
      select lo.id into v_lot from public.lots lo
      where lo.bien_id = v_bien and lower(btrim(lo.nom)) = lower(v_nom_lot)
      limit 1;
      if v_lot is null then
        insert into public.lots (bien_id, organization_id, nom, etage, surface_m2, pieces)
        values (v_bien, p_org, v_nom_lot,
          nullif(btrim(coalesce(l->>'etage','')),''),
          nullif(btrim(coalesce(l->>'surface','')),'')::numeric,
          nullif(btrim(coalesce(l->>'pieces','')),'')::integer)
        returning id into v_lot;
      end if;

      -- Propriétaire : retrouvé par son adresse quand elle est donnée, sinon
      -- par nom + prénom. Deux lignes du même propriétaire ne font qu'une
      -- fiche — c'est ce qui rend son relevé de gestion juste.
      v_prop := public.import_personne(p_org, l->>'proprietaire_nom',
                                       l->>'proprietaire_prenom', l->>'proprietaire_email');
      if not exists (select 1 from public.detentions d
                     where d.lot_id = v_lot and d.person_id = v_prop and d.date_fin is null) then
        insert into public.detentions (lot_id, organization_id, person_id, quote_part)
        values (v_lot, p_org, v_prop, v_quote);
      end if;

      if nullif(btrim(coalesce(l->>'locataire_nom','')),'') is not null then
        v_loc := public.import_personne(p_org, l->>'locataire_nom',
                                        l->>'locataire_prenom', l->>'locataire_email');
        select b.id into v_bail from public.baux b
        where b.organization_id = p_org and b.lot_id = v_lot
          and b.locataire_principal = v_loc and b.etat = 'brouillon'
        limit 1;
        if v_bail is null then
          v_jour := coalesce(nullif(btrim(coalesce(l->>'jour_echeance','')),'')::smallint, 1);
          insert into public.baux (organization_id, lot_id, locataire_principal, etat,
            date_debut, loyer_hc, charges, depot_garantie, jour_echeance)
          values (p_org, v_lot, v_loc, 'brouillon', v_debut,
            nullif(btrim(coalesce(l->>'loyer_hc','')),'')::numeric,
            nullif(btrim(coalesce(l->>'charges','')),'')::numeric,
            nullif(btrim(coalesce(l->>'depot_garantie','')),'')::numeric,
            v_jour)
          returning id into v_bail;
        end if;
      end if;

      ligne := i; statut := 'ok';
      message := format('%s · %s%s', v_nom_bien, v_nom_lot,
        case when v_bail is not null then ' · bail en brouillon' else '' end);
      bien_id := v_bien; lot_id := v_lot; bail_id := v_bail;
      return next;
    exception when others then
      get stacked diagnostics v_texte = message_text;
      ligne := i; statut := 'erreur'; message := v_texte;
      bien_id := null; lot_id := null; bail_id := null;
      return next;
    end;
  end loop;
end;
$$;
comment on function public.importer_parc(uuid, jsonb, boolean) is
  'Reprise d''un parc existant, une ligne par lot. Les baux arrivent en BROUILLON : activer passe par controler_mise_en_location, qu''un import ne doit pas contourner.';
revoke execute on function public.importer_parc(uuid, jsonb, boolean) from public, anon;

drop function if exists public.montant_en_euros(numeric);

comment on column public.baux.irl_trimestre is null;

select public.fermer_fonctions_a_anon();
delete from supabase_migrations.schema_migrations where version = '20261028100300';
commit;
