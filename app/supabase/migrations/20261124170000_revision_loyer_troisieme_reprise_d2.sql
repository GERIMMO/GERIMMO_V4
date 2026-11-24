-- Décisions du dirigeant du 24/11/2026, lot D2 (TROISIÈME reprise après relecture) : révision annuelle du loyer.
--
-- LA RÈGLE COMPLÈTE, telle que la base l'applique une fois cette migration jouée.
--
-- Vocabulaire. L'« échéance » est la date de révision : une date anniversaire du début du bail. La n-ième échéance tombe
-- n années après le début du bail (un bail du 29 février a son échéance le 28 les années ordinaires). L'« indice du
-- bail » est le trimestre et la valeur écrits sur le bail (`baux.irl_trimestre`, `baux.irl_valeur`).
--
-- A. À QUELLE ÉCHÉANCE LA DEMANDE EST RATTACHÉE (inchangé). À la dernière échéance atteinte à la date de la demande. La
--    révision de cette échéance s'enregistre de l'échéance jusqu'à la veille de la suivante ; passé ce jour, elle est
--    refusée, même avec une demande datée d'avant. Une seule révision par échéance.
--
-- B. QUEL INDICE EST ATTENDU POUR QUELLE ÉCHÉANCE. Toujours celui du même trimestre que l'indice du bail. Pour l'année :
--    B1. LE BAIL PORTE SON INDICE D'ORIGINE. La base le reconnaît à trois signes : le trimestre et l'année de l'indice
--        du bail se lisent (« T3 2023 ») ; ce trimestre était terminé au début du bail ; son année est celle du début du
--        bail ou l'année d'avant. Alors l'indice de la n-ième échéance est celui du même trimestre, n années après celui
--        du bail. EXACTEMENT celui-là : un indice plus récent (celui de la révision suivante) et un indice plus ancien
--        sont refusés, que la demande soit faite à l'heure, en retard ou le dernier jour du délai.
--        Exemples : bail du 01/01/2024, indice du bail T3 2023 → échéance du 01/01/2025 : T3 2024 ; du 01/01/2026 :
--        T3 2025. Bail du 15/10/2023, T2 2023 → échéance du 15/10/2024 : T2 2024. Bail du 01/03/2024, T4 2023 →
--        échéance du 01/03/2025 : T4 2024.
--    B2. SINON (le libellé ne dit pas l'année : « T3 », vide ; ou l'indice du bail n'est pas celui d'origine : bail repris
--        en cours dont l'indice a été mis à jour après des révisions faites ailleurs). La base ne peut pas compter les
--        années depuis l'indice du bail. Elle accepte les deux derniers indices de ce trimestre connus à la date de
--        l'échéance (les mêmes que B1 admet : année du début du bail ou année d'avant) et refuse les autres :
--        - un indice dont le trimestre n'était pas terminé à la date de l'échéance : il ne pouvait pas être publié,
--          c'est celui d'une révision suivante. C'EST UN REPÈRE DE CALENDRIER, PAS UNE RÈGLE DE DROIT : T1 de l'année A,
--          pas avant le 1er avril A ; T2, le 1er juillet A ; T3, le 1er octobre A ; T4, le 1er janvier A+1 ;
--        - un indice plus ancien que ces deux-là. C'EST UN GARDE-FOU DE SAISIE, PAS UNE RÈGLE DE DROIT.
--        Exemple : bail du 01/01/2024, libellé « T3 » → échéance du 01/01/2025 : T3 2024 ou T3 2023 acceptés, T3 2025
--        (pas terminé au 01/01/2025) et T3 2022 refusés.
--        Comme avant, un indice qui n'est pas postérieur à l'indice de référence est refusé quand l'année de celui-ci se lit.
--
-- C. QUEL INDICE SERT DE RÉFÉRENCE (le diviseur). Le calcul porte toujours sur UN an :
--    nouveau loyer = loyer du bail × indice de l'échéance / indice du même trimestre de l'année précédente, arrondi au centime.
--    C1. Première échéance : l'indice du bail.
--    C2. Une révision est enregistrée dans Gerimmo pour l'échéance précédente : l'indice de cette révision.
--    C3. Aucune révision n'est enregistrée dans Gerimmo et l'année de l'indice du bail est celle de l'indice demandé moins
--        un (bail repris en cours, révisé ailleurs l'an dernier, indice du bail à jour) : l'indice du bail, SANS ressaisie.
--    C4. Dans tous les autres cas (aucune révision enregistrée pour l'échéance précédente, ou indice de référence plus
--        ancien de plus d'un an) : L'INDICE PRÉCÉDENT EST DEMANDÉ — celui du même trimestre de l'année précédente,
--        cinquième paramètre de `reviser_loyer` — et c'est lui qui sert. Sans lui : refus, rien n'est écrit. Une révision
--        qui n'a pas été faite n'est donc jamais rattrapée.
--    Garde-fou de saisie (pas une règle de droit, inchangé) : le rapport des deux indices doit être entre 0,8 et 1,25.
--
-- D. QUEL LOYER PORTE QUEL TERME (inchangé). Les termes sont des mois civils. Le loyer révisé s'applique à partir du
--    « premier terme révisé » : le premier mois qui commence après la date de la demande, après le jour de
--    l'enregistrement, et après le dernier terme déjà appelé. Un terme porte le loyer et les charges qui valaient pour
--    lui, quel que soit le jour où il est appelé : le montant « nouveau » du dernier changement du bail dont l'effet est
--    au plus tard ce terme (une révision par son premier terme révisé, un avenant appliqué par sa date d'effet) ; à
--    défaut, le montant « ancien » du premier changement postérieur.
--
-- CE QUE CELA CORRIGE (constats du relecteur sur la migration 20261124150000, chiffres de ses preuves) :
--
--  1. La borne posée par 20261124150000 (« l'année de l'indice ne dépasse pas celle de la date de révision ») laissait
--     passer l'indice de la révision SUIVANTE pour les baux dont l'indice est de l'année civile d'avant le début du bail.
--     Bail du 01/01/2024, indice du bail T3 2023 = 141,03, loyer 700 € ; demande tardive du 28/10/2025 pour l'échéance du
--     01/01/2025 : l'indice T3 2025 (145,77) était accepté avec l'indice précédent 144,51 → 706,10 € ; et, libellé « T3 »
--     sans année, à quatre paramètres → 723,53 € (deux années d'un coup). Le loyer juste est 700 × 144,51 / 141,03 =
--     717,27 €. La règle B remplace cette borne : T3 2025 est refusé, T3 2024 donne 717,27 €.
--  2. Il n'y avait pas de borne basse (T2 2024 accepté pour l'échéance de 2025, T2 2019 accepté) : l'égalité de B1 la
--     pose, et le garde-fou de B2 pour les baux dont l'année de l'indice ne se lit pas.
--  3. Bail repris en cours, révisé ailleurs l'an dernier, indice du bail à jour : l'indice précédent était redemandé
--     alors qu'il est déjà sur le bail. Règle C3.
--
-- CE QUI NE CHANGE PAS. Une révision par an, faite avec l'indice de son échéance : mêmes révisions et mêmes appels de
-- loyer, au centime (vérifié sur des baux tirés, avec et sans cette migration). Le délai d'un an, le premier terme révisé,
-- le déclencheur des appels, la lecture du locataire, la seconde signature à cinq paramètres, le contrôle de l'appelant
-- (`org_ids_avec_roles`), SECURITY DEFINER, le chemin de recherche vide, les droits (rien n'est ouvert aux visiteurs).
-- AUCUNE LIGNE EXISTANTE N'EST MODIFIÉE : ni révision, ni appel de loyer, ni avenant, ni bail. Aucune table, aucune
-- colonne, aucune fonction n'est créée ni supprimée.
--
-- COMMENT. `reviser_loyer(uuid,numeric,text,date)` est relue dans sa définition EN VIGUEUR (pg_get_functiondef) et
-- modifiée à trois endroits, chacun attendu une seule fois ; une définition déjà modifiée est laissée telle quelle
-- (rejeu sans effet) ; toute autre forme arrête la migration sans rien modifier. Deux de ces endroits sont des lignes
-- posées par la migration 20261124150000 (sa borne sur l'année de l'indice, et sa condition de l'indice précédent).
-- À SAVOIR : de ce fait, REJOUER 20261124150000 après celle-ci s'arrête sur son propre contrôle (« définition
-- inattendue »), sans rien modifier ; pour la rejouer, jouer d'abord le retour de celle-ci.
-- Retour arrière : supabase/retours-arriere/20261124170000_revision_loyer_troisieme_reprise_d2.retour.sql
-- (à jouer AVANT celui de 20261124150000, qui attend ses propres lignes intactes).

do $troisieme_reprise_d2$
declare
  c_signature constant text := 'public.reviser_loyer(uuid,numeric,text,date)';
  -- Les trois endroits : [texte en vigueur, texte de cette troisième reprise].
  c_endroits constant text[][] := array[
    -- 1. Une variable : l'année lue dans l'indice du bail.
    [E'  v_annee_ref integer;\n',
     E'  v_annee_ref integer;\n  v_annee_bail integer;\n'],
    -- 2. Règle B : l'indice attendu pour l'échéance. Remplace la borne posée par 20261124150000.
    [$bloc$  -- Seconde reprise du lot D2 (24/11/2026) : l'année de l'indice nouveau ne peut pas dépasser l'année de la date de
  -- révision à laquelle la demande est rattachée. Un indice d'une année plus récente est celui de la révision suivante.
  if v_annee > extract(year from v_echeance)::integer then
    raise exception 'Indice du % refusé : cet indice est celui de la révision suivante. La révision demandée est celle du % : l''année de son indice ne peut pas dépasser %',
      v_trimestre, to_char(v_echeance, 'DD/MM/YYYY'), extract(year from v_echeance)::integer;
  end if;
$bloc$,
     $bloc$  -- Troisième reprise du lot D2 (24/11/2026), règle B : quel indice est attendu pour quelle échéance.
  -- B1. Le bail porte son indice d'origine : son trimestre était terminé au début du bail, et son année est celle du
  -- début du bail ou l'année d'avant. L'indice de la n-ième échéance est celui du même trimestre, n années après celui
  -- du bail : exactement celui-là, ni l'indice de la révision suivante, ni un indice plus ancien.
  v_annee_bail := public.trimestre_irl_annee(v.irl_trimestre);
  if v_annee_bail >= extract(year from v.date_debut)::integer - 1
     and (make_date(v_annee_bail, 1, 1) + make_interval(months => 3 * public.trimestre_irl_numero(v.irl_trimestre)))::date <= v.date_debut then
    if v_annee <> v_annee_bail + v_n then
      raise exception 'Indice du % refusé : la révision demandée est celle du %, et son indice est celui du T% % (le trimestre de l''indice du bail, une année de plus par année de bail écoulée)',
        v_trimestre, to_char(v_echeance, 'DD/MM/YYYY'), v_trim, v_annee_bail + v_n;
    end if;
  -- B2. Sinon (année illisible, ou indice du bail mis à jour après des révisions faites ailleurs) : la base ne peut pas
  -- compter les années. Elle refuse un indice dont le trimestre n'était pas terminé à la date de l'échéance. REPÈRE DE
  -- CALENDRIER, pas une règle de droit : T1 de l'année A, pas avant le 1er avril A ; T2, le 1er juillet A ; T3, le
  -- 1er octobre A ; T4, le 1er janvier A+1.
  elsif (make_date(v_annee, 1, 1) + make_interval(months => 3 * v_trim))::date > v_echeance then
    raise exception 'Indice du % refusé : ce trimestre n''était pas terminé à la date de révision demandée (%), son indice ne pouvait pas encore être publié. C''est l''indice d''une révision suivante',
      v_trimestre, to_char(v_echeance, 'DD/MM/YYYY');
  -- Et elle refuse un indice trop ancien : il reste les deux derniers indices de ce trimestre connus à l'échéance, les
  -- mêmes que B1 admet (année du début du bail ou année d'avant). GARDE-FOU DE SAISIE, pas une règle de droit.
  elsif (make_date(v_annee + 2, 1, 1) + make_interval(months => 3 * v_trim))::date <= v_echeance then
    raise exception 'Indice du % refusé : cet indice est trop ancien pour la révision du %. Vérifiez l''année de l''indice',
      v_trimestre, to_char(v_echeance, 'DD/MM/YYYY');
  end if;
$bloc$],
    -- 3. Règle C3 : bail repris, révisé ailleurs l'an dernier, indice du bail à jour. Condition posée par 20261124150000.
    [$bloc$  if (v_n >= 2 and not exists (select 1 from public.revisions_loyer r
                                where r.bail_id = p_bail and public.annee_de_bail(v.date_debut, r.date_effet) = v_n - 1))
     or (v_annee_ref is not null and v_annee > v_annee_ref + 1) then
$bloc$,
     $bloc$  -- Troisième reprise du lot D2, règle C3 : quand aucune révision n'est enregistrée dans Gerimmo et que l'année de
  -- l'indice du bail est celle de l'indice demandé moins un (bail repris en cours, révisé ailleurs l'an dernier), l'indice
  -- du bail est déjà celui de l'année précédente : il sert de référence, sans ressaisie.
  if (v_n >= 2 and not exists (select 1 from public.revisions_loyer r
                                where r.bail_id = p_bail and public.annee_de_bail(v.date_debut, r.date_effet) = v_n - 1)
      and not (v_derniere.date_effet is null and v_annee_ref is not distinct from v_annee - 1))
     or (v_annee_ref is not null and v_annee > v_annee_ref + 1) then
$bloc$]
  ];
  v_oid regprocedure := to_regprocedure(c_signature);
  v_def text;
  v_avant integer := 0;
  v_apres integer := 0;
  paire text[];
begin
  if v_oid is null then
    raise exception 'Révision du loyer (troisième reprise) : la fonction % est absente de cette base ; rien n''est modifié.', c_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  -- Chaque endroit doit se lire une seule fois, sous sa forme d'avant ou sous celle de cette troisième reprise.
  foreach paire slice 1 in array c_endroits loop
    if (length(v_def) - length(replace(v_def, paire[2], ''))) / length(paire[2]) = 1 then
      v_apres := v_apres + 1;
    elsif (length(v_def) - length(replace(v_def, paire[1], ''))) / length(paire[1]) = 1 then
      v_avant := v_avant + 1;
    end if;
  end loop;
  if v_apres = 3 then
    raise notice 'Révision du loyer (troisième reprise) : % porte déjà la troisième reprise, rien à faire.', c_signature;
  elsif v_avant = 3 then
    foreach paire slice 1 in array c_endroits loop
      v_def := replace(v_def, paire[1], paire[2]);
    end loop;
    execute v_def;
  else
    raise exception 'Révision du loyer (troisième reprise) : % ne porte ni la définition attendue ni celle de cette troisième reprise (% endroit(s) d''avant, % de la troisième reprise, sur 3) : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.',
      c_signature, v_avant, v_apres;
  end if;
end $troisieme_reprise_d2$;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
