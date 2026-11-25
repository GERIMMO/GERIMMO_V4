-- RETOUR ARRIÈRE de 20261124100000_revision_loyer_delai_et_premier_terme.sql (décisions du dirigeant du 24/11/2026, lot D2 :
-- délai d'un an pour demander la révision, loyer révisé appliqué au premier terme qui suit la demande).
--
-- Rend à `reviser_loyer` sa définition d'avant (mêmes cinq endroits, relus dans la définition EN VIGUEUR et attendus une
-- seule fois chacun), puis retire le déclencheur `a_revision_du_bail` et sa fonction. Une base déjà revenue est laissée telle
-- quelle (rejouable) ; une fonction réécrite depuis arrête le script sans rien modifier. Un seul bloc : atomique.
--
-- RÉINTRODUIT l'état d'avant : une demande antidatée n'est plus refusée après le délai d'un an, et un terme appelé après
-- l'enregistrement d'une révision porte le loyer révisé pour le mois entier, même si sa période précède la demande.
-- AUCUNE DONNÉE N'EST MODIFIÉE NI SUPPRIMÉE : la colonne `revisions_loyer.premier_terme` et ses valeurs sont gardées (les
-- lettres déjà établies restent exactes ; la colonne n'est simplement plus remplie ni lue par la base). Les appels de loyer
-- déjà émis ne sont pas recalculés. À jouer avec le retour du code (la lettre et l'écran citent le premier terme).
do $retour$
declare
  c_signature constant text := 'public.reviser_loyer(uuid,numeric,text,date)';
  -- Les cinq endroits complétés : [texte en vigueur, texte de ce lot].
  c_variables_avant constant text := E'  v_trimestre text;\nbegin';
  c_variables_apres constant text := E'  v_trimestre text;\n  v_aujourdhui date;\n  v_limite date;\n  v_premier_terme date;\nbegin';
  -- Le jour de Paris est lu une seule fois et gardé : le contrôle du délai le relit sans nouvel appel (les migrations
  -- du lot « jour de Paris » comptent les appels à `public.aujourdhui_paris()` dans cette fonction : il en reste deux).
  c_jour_avant constant text := E'  if p_date_demande > public.aujourdhui_paris() then\n';
  c_jour_apres constant text := E'  v_aujourdhui := public.aujourdhui_paris();\n  if p_date_demande > v_aujourdhui then\n';
  c_effet_avant constant text := E'  v_effet := greatest(v_echeance, p_date_demande);\n';
  c_effet_apres constant text := c_effet_avant || $bloc$
  -- Décision Q23 du 24/11/2026 : la révision d'une année se demande pendant un an à compter de sa date de révision.
  -- Passé ce délai, elle est refusée, même avec une demande datée d'avant.
  v_limite := ((v.date_debut + make_interval(years => v_n + 1))::date - 1);
  if v_aujourdhui > v_limite then
    raise exception 'Révision refusée : la révision prévue le % pouvait être demandée jusqu''au %. Ce délai d''un an est passé : la révision de cette année-là n''est plus possible (selon la fiche officielle Service-Public consultée le 24/11/2026). Pour la révision de l''année en cours, datez la demande d''aujourd''hui',
      to_char(v_echeance, 'DD/MM/YYYY'), to_char(v_limite, 'DD/MM/YYYY');
  end if;

  -- Décision Q43 du 24/11/2026 : le loyer révisé ne s'applique jamais à des jours antérieurs à la demande. Il s'applique
  -- au premier terme (mois civil) qui commence après la date de la demande et qui n'est pas déjà appelé.
  v_premier_terme := (date_trunc('month', p_date_demande) + interval '1 month')::date;
  select greatest(v_premier_terme, (max(a.periode) + interval '1 month')::date) into v_premier_terme
    from public.appels_loyer a where a.bail_id = p_bail;
$bloc$;
  c_colonnes_avant constant text := 'date_echeance, date_demande, irl_trimestre)';
  c_colonnes_apres constant text := 'date_echeance, date_demande, irl_trimestre, premier_terme)';
  c_valeurs_avant constant text := 'v_echeance, p_date_demande, v_trimestre);';
  c_valeurs_apres constant text := 'v_echeance, p_date_demande, v_trimestre, v_premier_terme);';
  v_oid regprocedure := to_regprocedure(c_signature);
  v_def text;
  v_avant integer := 0;
  v_apres integer := 0;
  paire text[];
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue) ; rien n''est modifié.', c_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  foreach paire slice 1 in array array[
    [c_variables_avant, c_variables_apres], [c_jour_avant, c_jour_apres], [c_effet_avant, c_effet_apres],
    [c_colonnes_avant, c_colonnes_apres], [c_valeurs_avant, c_valeurs_apres]]
  loop
    if (length(v_def) - length(replace(v_def, paire[2], ''))) / length(paire[2]) = 1 then
      v_apres := v_apres + 1;
    elsif (length(v_def) - length(replace(v_def, paire[1], ''))) / length(paire[1]) = 1 then
      v_avant := v_avant + 1;
    end if;
  end loop;
  if v_apres = 5 then
    -- L'ordre compte : le bloc ajouté contient lui-même la ligne d'avant.
    v_def := replace(v_def, c_effet_apres, c_effet_avant);
    v_def := replace(v_def, c_variables_apres, c_variables_avant);
    v_def := replace(v_def, c_jour_apres, c_jour_avant);
    v_def := replace(v_def, c_colonnes_apres, c_colonnes_avant);
    v_def := replace(v_def, c_valeurs_apres, c_valeurs_avant);
    execute v_def;
    raise notice '% : définition d''avant rétablie', c_signature;
  elsif v_avant = 5 then
    raise notice '% : déjà revenue à sa définition d''avant, rien à faire', c_signature;
  else
    raise exception 'Retour arrière : % ne porte ni la définition de la migration ni celle d''avant (% endroit(s) de la migration, % d''avant, sur 5) : définition réécrite depuis, rien n''est modifié.',
      c_signature, v_apres, v_avant;
  end if;
  drop trigger if exists a_revision_du_bail on public.appels_loyer;
  drop function if exists public.appliquer_revision_a_l_appel();
  delete from supabase_migrations.schema_migrations where version = '20261124100000';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
