-- RETOUR ARRIÈRE de 20261120190000 (décision B du 20/11/2026 : un bail déjà en cours s'active par son contrat signé).
--
-- Rend à `controler_mise_en_location`, `verifier_transition_lot` et `parcours_demarrage` leur forme d'avant
-- (remplacements exacts inverses), puis retire `bail_blocages_mise_en_location` et `bail_deja_en_cours`.
--
-- CE QUE CE RETOUR NE DÉFAIT PAS. Les baux activés entre-temps restent actifs et leurs logements « loués » : aucune
-- donnée n'est modifiée. Seuls les PROCHAINS dépôts retrouvent l'exigence de mise en location et de diagnostics.
--
-- LE CODE. app/actions/baux.ts lit `bail_blocages_mise_en_location` et se replie sur `lot_blocages_location` si elle
-- manque : ce retour peut se jouer avant ou après la remise du code d'avant. La fiche du bail, elle, continuerait
-- d'ouvrir le dépôt d'un bail déjà en cours dont le logement est en préparation, et la base le refuserait : remettre le
-- code d'avant dans la foulée.
--
-- Atomique et rejouable : une définition déjà rétablie est laissée ; une forme inattendue arrête tout sans rien changer.
do $retour$
declare
  v_def text;
  v_avant text;
  v_apres text;
  n_avant integer;
  n_apres integer;
begin
  -- 1. controler_mise_en_location : les deux remplacements, dans l'ordre inverse.
  v_def := pg_get_functiondef('public.controler_mise_en_location(uuid)'::regprocedure);

  v_apres := $sql$  -- Pour un bail déjà en cours, les diagnostics absents ou expirés ne bloquent pas : ils deviennent des actions à mener.
  v_blocages := public.bail_blocages_mise_en_location(p_bail);
$sql$;
  v_avant := $sql$  v_blocages := public.lot_blocages_location(v.lot_id);
$sql$;
  n_apres := (length(v_def) - length(replace(v_def, v_apres, ''))) / length(v_apres);
  n_avant := (length(v_def) - length(replace(v_def, v_avant, ''))) / length(v_avant);
  if n_apres = 1 and n_avant = 0 then
    v_def := replace(v_def, v_apres, v_avant);
  elsif not (n_apres = 0 and n_avant = 1) then
    raise exception 'Retour refusé : controler_mise_en_location a une forme inattendue (blocages : % ancienne(s), % nouvelle(s)).', n_avant, n_apres;
  end if;

  v_apres := $sql$  -- Décision B du 20/11/2026 : un bail DÉJÀ EN COURS (date d'entrée passée) s'active par son contrat signé, même si
  -- le logement n'a jamais été « mis en location » — il reste alors « brouillon » et passe directement à « loué ».
  if v_lot.etat <> 'disponible' and not (v.chambre_id is not null and v_lot.etat in ('loue','preavis'))
     and not (v_lot.etat = 'brouillon' and public.bail_deja_en_cours(v.date_debut)) then
$sql$;
  v_avant := $sql$  if v_lot.etat <> 'disponible' and not (v.chambre_id is not null and v_lot.etat in ('loue','preavis')) then
$sql$;
  n_apres := (length(v_def) - length(replace(v_def, v_apres, ''))) / length(v_apres);
  n_avant := (length(v_def) - length(replace(v_def, v_avant, ''))) / length(v_avant);
  if n_apres = 1 and n_avant = 0 then
    v_def := replace(v_def, v_apres, v_avant);
  elsif not (n_apres = 0 and n_avant = 1) then
    raise exception 'Retour refusé : controler_mise_en_location a une forme inattendue (état du lot : % ancienne(s), % nouvelle(s)).', n_avant, n_apres;
  end if;
  execute v_def;

  -- 2. verifier_transition_lot : « brouillon → loué » redevient interdit.
  v_def := pg_get_functiondef('public.verifier_transition_lot()'::regprocedure);
  v_apres := $sql$    -- Décision B du 20/11/2026 : « brouillon → loué », pour le logement d'un bail déjà en cours activé par son contrat
    -- signé. Plus bas, « loué » reste refusé tant qu'aucun bail actif ne vit sur le lot.
    (old.etat = 'brouillon'  and new.etat in ('disponible', 'loue', 'archive'))
$sql$;
  v_avant := $sql$    (old.etat = 'brouillon'  and new.etat in ('disponible', 'archive'))
$sql$;
  n_apres := (length(v_def) - length(replace(v_def, v_apres, ''))) / length(v_apres);
  n_avant := (length(v_def) - length(replace(v_def, v_avant, ''))) / length(v_avant);
  if n_apres = 1 and n_avant = 0 then
    execute replace(v_def, v_apres, v_avant);
  elsif not (n_apres = 0 and n_avant = 1) then
    raise exception 'Retour refusé : verifier_transition_lot a une forme inattendue (% ancienne(s), % nouvelle(s)).', n_avant, n_apres;
  end if;

  -- 3. parcours_demarrage : le logement d'un bail en cours redevient une étape « à faire » tant qu'un blocage subsiste.
  v_def := pg_get_functiondef('public.parcours_demarrage(uuid)'::regprocedure);
  v_apres := $sql$  select 'lot_pret', v_lot_pret is not null or v_bail > 0,
         case when v_lot_pret is not null then 'Au moins un lot peut être mis en location.'
              when v_bail > 0 then 'Votre logement est loué. Les diagnostics qui manquent restent signalés dans vos actions à mener.'
$sql$;
  v_avant := $sql$  select 'lot_pret', v_lot_pret is not null,
         case when v_lot_pret is not null then 'Au moins un lot peut être mis en location.'
$sql$;
  n_apres := (length(v_def) - length(replace(v_def, v_apres, ''))) / length(v_apres);
  n_avant := (length(v_def) - length(replace(v_def, v_avant, ''))) / length(v_avant);
  if n_apres = 1 and n_avant = 0 then
    execute replace(v_def, v_apres, v_avant);
  elsif not (n_apres = 0 and n_avant = 1) then
    raise exception 'Retour refusé : parcours_demarrage a une forme inattendue (% ancienne(s), % nouvelle(s)).', n_avant, n_apres;
  end if;

  -- 4. Les deux fonctions de la décision, une fois que plus rien ne les lit.
  drop function if exists public.bail_blocages_mise_en_location(uuid);
  drop function if exists public.bail_deja_en_cours(date);

  delete from supabase_migrations.schema_migrations where version = '20261120190000';
end $retour$;
notify pgrst, 'reload schema';
