-- Audit final avant publication (28/10/2026) — import du parc contrôlé comme il est inséré ; trimestre IRL daté.
--
-- BAIL-05. La passe de contrôle de `importer_parc` ne vérifiait que la FORME (champs obligatoires, types, dates,
-- quote-part) et annonçait « prêtes » des lignes que l'insertion refusait ensuite : dépôt de garantie au-dessus du
-- plafond (déclencheur plafond_depot_garantie), loyer négatif (baux_loyer_hc_check), jour d'échéance 31
-- (baux_jour_echeance_check), surface nulle (lots_surface_m2_check). Le gérant importait « 3 lignes » et en voyait
-- deux tomber avec un motif technique, ou un motif faux (« -700.00 € »). La passe de contrôle rejoue désormais les
-- mêmes règles que l'insertion, rend TOUS les motifs d'une ligne et écrit les montants en français ; le message du
-- déclencheur du plafond fait de même (« soit 700,00 € », « bail meublé »). `importer_parc` est reprise de sa dernière
-- définition (20260911280000_import_du_parc) ; `controler_plafond_depot_garantie` de la sienne
-- (20260927101000_plafond_depot_a_la_fixation) : seuls les contrôles ajoutés et le format du message changent.
--
-- BAIL-02. `baux.irl_trimestre` (texte libre) recevait « T1 »…« T4 » sans année : le contrat et l'acte de
-- cautionnement imprimaient « Trimestre de référence : T3 », mention incomplète dans un acte. L'application écrit
-- désormais « T3 2026 » (la forme que lisent déjà `trimestre_irl_numero` / `trimestre_irl_annee` et qu'écrit la
-- révision annuelle). REPRISE DE DONNÉES, SIGNALÉE ET LIMITÉE AUX BROUILLONS : un bail signé (actif, préavis,
-- terminé) garde sa valeur — l'année de son indice est un fait de son contrat que la base ne peut pas deviner, et
-- `reviser_loyer` en déduit l'année de la première révision. Un brouillon dont le contrat est parti en signature
-- (circuit prêt, en préparation, en cours, à vérifier ou signé) la garde aussi : son contrat est recalculé et comparé
-- à l'empreinte du circuit. Pour les autres brouillons, l'année est celle du dernier trimestre de ce numéro déjà
-- PUBLIÉ à la date de conclusion prévue, à défaut à la date d'entrée (T1 publié mi-avril, T2 mi-juillet, T3
-- mi-octobre, T4 mi-janvier suivant). Sans aucune de ces dates, la valeur reste « Tn » : l'écran la présente
-- « année à préciser » et l'étape Loyer exige de la compléter. Aucune autre colonne n'est touchée.
--
-- Rejouable : create or replace, signatures inchangées ; la reprise ne cible que les valeurs sans année.
-- Retour arrière : supabase/retours-arriere/20261028100300_import_controle_complet_et_trimestre_irl_annee.retour.sql

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Montant écrit en français dans les messages de la base (« 1 400,50 € »)
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.montant_en_euros(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p is null then null else
    case when round(p, 2) < 0 then '-' else '' end
    || reverse(regexp_replace(reverse(trunc(abs(round(p, 2)))::bigint::text), '(\d{3})(?=\d)', '\1 ', 'g'))
    || ',' || lpad(round((abs(round(p, 2)) - trunc(abs(round(p, 2)))) * 100)::integer::text, 2, '0')
    || ' €'
  end;
$$;
comment on function public.montant_en_euros(numeric) is
  'Montant en euros écrit à la française pour les messages de la base : « 1 400,50 € » (espace fine insécable).';

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Plafond du dépôt : même règle, message en français
-- ═════════════════════════════════════════════════════════════════════════
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
    raise exception 'Dépôt de garantie trop élevé : maximum % mois de loyer hors charges (soit %) pour un bail %',
      v_mois, public.montant_en_euros(v_plafond),
      case new.type::text when 'meuble' then 'meublé' when 'colocation' then 'de colocation' else new.type::text end;
  end if;
  return new;
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Import du parc : la passe de contrôle rejoue les règles de l'insertion
-- ═════════════════════════════════════════════════════════════════════════
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
  -- Contrôles de la table (audit final, BAIL-05) : tous les motifs d'une ligne, pas seulement le premier.
  v_motifs text[];
  v_surface numeric; v_pieces integer;
  v_loyer numeric; v_charges numeric; v_depot numeric; v_mois integer;
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
    v_bien := null; v_lot := null; v_bail := null; v_erreur := null; v_motifs := array[]::text[];
    v_surface := null; v_pieces := null; v_loyer := null; v_charges := null; v_depot := null; v_jour := null;
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

    -- ── Les règles de la table, rejouées AVANT d'écrire (BAIL-05) : ce que le
    --    contrôle annonce « prêt » passe à l'import, et chaque motif est dit.
    if v_erreur is null then
      begin
        v_surface := nullif(btrim(coalesce(l->>'surface', '')), '')::numeric;
        if v_surface is not null and v_surface <= 0 then
          v_motifs := array_append(v_motifs, 'La surface doit être supérieure à zéro');
        end if;
      exception when others then
        v_motifs := array_append(v_motifs, format('Surface illisible : « %s »', l->>'surface'));
      end;
      begin
        v_pieces := nullif(btrim(coalesce(l->>'pieces', '')), '')::integer;
        if v_pieces is not null and v_pieces <= 0 then
          v_motifs := array_append(v_motifs, 'Le nombre de pièces doit être au moins 1');
        end if;
      exception when others then
        v_motifs := array_append(v_motifs, format('Nombre de pièces illisible : « %s » (entier attendu)', l->>'pieces'));
      end;
      begin
        perform nullif(btrim(coalesce(l->>'annee', '')), '')::integer;
      exception when others then
        v_motifs := array_append(v_motifs, format('Année de construction illisible : « %s »', l->>'annee'));
      end;
      begin
        perform nullif(btrim(coalesce(l->>'copropriete', '')), '')::boolean;
      exception when others then
        v_motifs := array_append(v_motifs, format('Copropriété illisible : « %s » (oui/non attendu)', l->>'copropriete'));
      end;
      if nullif(btrim(coalesce(l->>'locataire_nom', '')), '') is not null then
        begin
          v_loyer := nullif(btrim(coalesce(l->>'loyer_hc', '')), '')::numeric;
          if v_loyer < 0 then v_motifs := array_append(v_motifs, 'Le loyer hors charges ne peut pas être négatif'); end if;
        exception when others then
          v_motifs := array_append(v_motifs, format('Loyer hors charges illisible : « %s »', l->>'loyer_hc'));
        end;
        begin
          v_charges := nullif(btrim(coalesce(l->>'charges', '')), '')::numeric;
          if v_charges < 0 then v_motifs := array_append(v_motifs, 'Les charges ne peuvent pas être négatives'); end if;
        exception when others then
          v_motifs := array_append(v_motifs, format('Charges illisibles : « %s »', l->>'charges'));
        end;
        begin
          v_depot := nullif(btrim(coalesce(l->>'depot_garantie', '')), '')::numeric;
          if v_depot < 0 then v_motifs := array_append(v_motifs, 'Le dépôt de garantie ne peut pas être négatif'); end if;
        exception when others then
          v_motifs := array_append(v_motifs, format('Dépôt de garantie illisible : « %s »', l->>'depot_garantie'));
        end;
        begin
          v_jour := coalesce(nullif(btrim(coalesce(l->>'jour_echeance', '')), '')::smallint, 1);
          if v_jour < 1 or v_jour > 28 then
            v_motifs := array_append(v_motifs, 'Le jour d’échéance doit être compris entre 1 et 28');
          end if;
        exception when others then
          v_motifs := array_append(v_motifs, format('Jour d’échéance illisible : « %s »', l->>'jour_echeance'));
        end;
        -- Le lot n'existe pas encore : l'import ne crée que des baux nus, un mois de loyer hors charges.
        if v_loyer >= 0 and v_depot >= 0 then
          v_mois := public.plafond_depot_mois('nu', null);
          if v_depot > v_mois * v_loyer then
            v_motifs := array_append(v_motifs, format('Dépôt de garantie trop élevé : maximum %s mois de loyer hors charges (soit %s) pour un bail nu',
                                           v_mois, public.montant_en_euros(v_mois * v_loyer)));
          end if;
        end if;
      end if;
      if cardinality(v_motifs) > 0 then
        v_erreur := array_to_string(v_motifs, ' · ');
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
          v_surface, v_pieces)
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
          insert into public.baux (organization_id, lot_id, locataire_principal, etat,
            date_debut, loyer_hc, charges, depot_garantie, jour_echeance)
          values (p_org, v_lot, v_loc, 'brouillon', v_debut, v_loyer, v_charges, v_depot, v_jour)
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
  'Reprise d''un parc existant, une ligne par lot. Les baux arrivent en BROUILLON : activer passe par controler_mise_en_location, qu''un import ne doit pas contourner. La passe de contrôle rejoue les règles de la table (montants, jour d''échéance, plafond du dépôt, surface).';
revoke execute on function public.importer_parc(uuid, jsonb, boolean) from public, anon;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Trimestre IRL de référence daté (BAIL-02) — reprise signalée, brouillons seulement
-- ═════════════════════════════════════════════════════════════════════════
update public.baux b
   set irl_trimestre = b.irl_trimestre || ' ' || (
         select max(a)::text
           from generate_series(extract(year from coalesce(b.date_conclusion_prevue, b.date_debut))::integer - 2,
                                extract(year from coalesce(b.date_conclusion_prevue, b.date_debut))::integer) a
          -- date de publication approchée de l'indice « Tn a » : mi-avril, mi-juillet, mi-octobre, mi-janvier suivant
          where case substr(b.irl_trimestre, 2, 1)
                  when '4' then make_date(a + 1, 1, 15)
                  else make_date(a, substr(b.irl_trimestre, 2, 1)::integer * 3 + 1, 15)
                end <= coalesce(b.date_conclusion_prevue, b.date_debut))
 where b.irl_trimestre ~ '^T[1-4]$'
   and b.etat = 'brouillon'
   and coalesce(b.date_conclusion_prevue, b.date_debut) is not null
   and not exists (select 1 from public.bail_signature_circuits c
                    where c.bail_id = b.id and c.modele = 'bail'
                      and c.etat in ('pret', 'preparation', 'en_cours', 'a_verifier', 'termine'));

comment on column public.baux.irl_trimestre is
  'Trimestre de l''indice IRL de référence du bail, avec son année : « T3 2026 » (lu par trimestre_irl_numero / trimestre_irl_annee).';

select public.fermer_fonctions_a_anon();
