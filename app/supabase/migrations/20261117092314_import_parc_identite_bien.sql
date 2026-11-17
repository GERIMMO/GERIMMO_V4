-- Identité d'un immeuble dans le tableur : organisation, nom et adresse physique.
-- Aucun bien, lot, contrat ou rattachement antérieur n'est modifié.
create function public.adresse_import_parc(rue text, cp text, ville text, complement text)
returns text[] language sql immutable parallel safe set search_path = ''
as $$
  select array(
    select lower(btrim(regexp_replace(coalesce(champ, ''), '[[:space:]]+', ' ', 'g')))
    from unnest(array[rue, cp, ville, complement]) with ordinality as a(champ, position)
    order by position
  )
$$;
revoke all on function public.adresse_import_parc(text,text,text,text) from public, anon, authenticated, service_role;

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
  v_adresse text[]; v_adresse_affichee text;
  v_candidat record; v_complements_incertain text[];
begin
  if p_org is null or not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Réservé au responsable de l''organisation : un import engage tout le parc';
  end if;
  if jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'Le fichier n''a pas pu être lu comme une liste de lignes';
  end if;

  -- Le même verrou est utilisé par la création manuelle de bien. Il ne concerne
  -- que l'organisation qui confirme l'import ; le contrôle reste en lecture.
  if p_controle_seulement is false then
    perform pg_advisory_xact_lock(hashtext(p_org::text));
  end if;

  -- Une adresse sans complément ne permet pas de choisir entre des bâtiments
  -- homonymes de la même rue. Vérifier le fichier entier avant sa première ligne.
  select array(
    select (array[nom] || adresse[1:3])::text
    from (
      select lower(btrim(x->>'bien')) as nom,
             public.adresse_import_parc(x->>'adresse', x->>'code_postal', x->>'ville', x->>'adresse2') as adresse
      from jsonb_array_elements(p_lignes) as t(x)
    ) as fichier
    group by nom, adresse[1:3]
    having bool_or(adresse[4] = '') and bool_or(adresse[4] <> '')
  ) into v_complements_incertain;

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

    if v_erreur is null then
      v_adresse := public.adresse_import_parc(l->>'adresse', l->>'code_postal', l->>'ville', l->>'adresse2');
      v_adresse_affichee := concat_ws(', ', btrim(l->>'adresse'), nullif(btrim(l->>'adresse2'), ''),
                                      concat_ws(' ', btrim(l->>'code_postal'), btrim(l->>'ville')));
      if (array[lower(v_nom_bien)] || v_adresse[1:3])::text = any(v_complements_incertain) then
        v_erreur := 'Des lignes du fichier désignent des bâtiments homonymes à cette adresse. Précisez le complément sur chaque ligne.';
      end if;
    end if;

    if v_erreur is null then
      -- Réexaminer le rattachement lors de la bascule même après un aperçu vert.
      -- Empêcher une modification de l'adresse choisie pendant notre écriture.
      if p_controle_seulement is false then
        perform 1 from public.biens b where b.organization_id = p_org
          and lower(btrim(b.nom)) = lower(v_nom_bien) order by b.id for share;
      end if;
      for v_candidat in
        select b.id, b.archived_at,
               public.adresse_import_parc(b.address_line1, b.postal_code, b.city, b.address_line2) as adresse
        from public.biens b
        where b.organization_id = p_org and lower(btrim(b.nom)) = lower(v_nom_bien)
      loop
        -- Une différence explicite de rue, code postal ou ville distingue les homonymes.
        if exists (select 1 from generate_series(1, 3) as pos
                   where v_candidat.adresse[pos] <> '' and v_candidat.adresse[pos] <> v_adresse[pos]) then
          continue;
        end if;
        if '' = any(v_candidat.adresse[1:3]) then
          v_erreur := 'L’adresse d’un bien homonyme est incomplète. Complétez sa fiche avant de reprendre cette ligne.';
        elsif v_candidat.adresse[4] <> v_adresse[4] then
          if v_candidat.adresse[4] <> '' and v_adresse[4] <> '' then continue; end if;
          v_erreur := 'Le complément d’adresse ne permet pas de reconnaître le bâtiment. Vérifiez le fichier et la fiche du bien.';
        elsif v_candidat.archived_at is not null then
          v_erreur := 'Un bien archivé correspond à cette adresse. Vérifiez sa fiche avant de reprendre cette ligne.';
        elsif v_bien is not null then
          v_erreur := 'Plusieurs biens ont ce nom et cette adresse. Donnez-leur des noms distincts avant l’import.';
        else
          v_bien := v_candidat.id;
        end if;
        exit when v_erreur is not null;
      end loop;
    end if;

    if v_erreur is not null then
      ligne := i; statut := 'erreur'; message := v_erreur;
      bien_id := null; lot_id := null; bail_id := null;
      return next;
      continue;
    end if;

    if p_controle_seulement is not false then
      ligne := i; statut := 'ok';
      message := format('%s · %s · %s%s', v_nom_bien, v_adresse_affichee, v_nom_lot,
        case when nullif(btrim(coalesce(l->>'locataire_nom','')),'') is not null
             then ' · bail en brouillon' else '' end);
      bien_id := null; lot_id := null; bail_id := null;
      return next;
      continue;
    end if;

    -- ── Écriture : chaque ligne dans son bloc, une chute n'emporte pas les
    --    autres et son motif est rendu tel que la base l'a dit.
    begin
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
      message := format('%s · %s · %s%s', v_nom_bien, v_adresse_affichee, v_nom_lot,
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
