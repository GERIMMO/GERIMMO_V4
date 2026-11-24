-- RETOUR ARRIÈRE de 20261124170000_revision_loyer_troisieme_reprise_d2.sql (décisions du dirigeant du 24/11/2026, lot D2,
-- troisième reprise).
--
-- Rend à `reviser_loyer(uuid,numeric,text,date)` sa définition d'avant (mêmes trois endroits, relus dans la définition EN
-- VIGUEUR et attendus une seule fois chacun). Aucune autre fonction n'est touchée.
-- Une base déjà revenue, ou qui n'a jamais reçu la troisième reprise, est laissée telle quelle (rejouable) ; une fonction
-- qui ne porte qu'une partie de la troisième reprise (réécrite depuis) arrête le script sans rien modifier. Un seul bloc :
-- atomique.
--
-- RÉINTRODUIT l'état d'avant : pour un bail dont l'indice est de l'année civile d'avant son début (bail du 01/01/2024,
-- indice T3 2023), l'indice de la révision suivante est de nouveau accepté (706,10 € ou 723,53 € au lieu de 717,27 € dans
-- l'exemple de la migration) ; un indice plus ancien que celui de l'échéance est accepté ; l'indice précédent est
-- redemandé pour un bail repris dont l'indice est à jour.
-- AUCUNE DONNÉE N'EST MODIFIÉE NI SUPPRIMÉE : ni révision, ni appel de loyer, ni avenant, ni bail ; rien n'est recalculé.
-- À jouer AVANT le retour de 20261124150000 (qui attend ses propres lignes intactes : joué en premier, il s'arrête sans
-- rien modifier). Indépendant du retour du code : le code de la troisième reprise fonctionne avec la base d'avant (il
-- propose seulement l'indice de l'échéance là où la base en accepterait encore d'autres).
do $retour$
declare
  c_signature constant text := 'public.reviser_loyer(uuid,numeric,text,date)';
  -- Les trois endroits : [texte d'avant, texte de la troisième reprise]. Mêmes textes que la migration.
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
  v_apres integer := 0;
  paire text[];
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % est absente de cette base ; rien n''est modifié.', c_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  -- Combien des trois textes de la troisième reprise se lisent (une fois chacun) dans la définition en vigueur.
  foreach paire slice 1 in array c_endroits loop
    if (length(v_def) - length(replace(v_def, paire[2], ''))) / length(paire[2]) = 1 then
      v_apres := v_apres + 1;
    end if;
  end loop;
  if v_apres = 3 then
    -- Dans l'ordre inverse de la migration : la condition, la règle B, puis la variable.
    v_def := replace(v_def, c_endroits[3][2], c_endroits[3][1]);
    v_def := replace(v_def, c_endroits[2][2], c_endroits[2][1]);
    v_def := replace(v_def, c_endroits[1][2], c_endroits[1][1]);
    execute v_def;
    raise notice '% : définition d''avant rétablie', c_signature;
  elsif v_apres = 0 then
    -- Déjà revenue, ou base qui n'a jamais reçu la troisième reprise : aucun de ses textes ne s'y lit.
    raise notice '% : aucun texte de la troisième reprise, rien à faire', c_signature;
  else
    raise exception 'Retour arrière : % ne porte qu''une partie de la troisième reprise (% endroit(s) sur 3) : définition réécrite depuis, rien n''est modifié.',
      c_signature, v_apres;
  end if;

  delete from supabase_migrations.schema_migrations where version = '20261124170000';
end $retour$;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
