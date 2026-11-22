-- RETOUR ARRIÈRE de 20261122090000 (décisions 2B et 3A du 22/11/2026 : DPE classé G en alerte et plus d'alerte d'état
-- des lieux d'entrée pour un bail repris en cours).
--
-- Rend à `activer_bail` sa forme d'avant (remplacement exact inverse) et à `bail_blocages_mise_en_location` son corps
-- de 20261120190000 (le DPE classé G bloque de nouveau un bail déjà en cours).
--
-- CE QUE CE RETOUR NE DÉFAIT PAS. Les baux activés entre-temps restent actifs, y compris ceux dont le logement est
-- classé G ; les alertes d'état des lieux non posées ne sont pas créées après coup. Aucune donnée n'est modifiée.
--
-- ORDRE. À jouer AVANT le retour de 20261120190000, qui retire `bail_blocages_mise_en_location` : si elle n'existe
-- plus, ce retour ne la recrée pas. Indépendant du retour de 20261120200000 (`activer_bail` n'appelle aucune de ses
-- fonctions).
--
-- LE CODE. lib/actions-attendues.ts lit `baux.loyers_suivis_depuis` pour ne plus réclamer l'état des lieux d'entrée
-- d'un bail repris : remettre le code d'avant dans la foulée, sinon l'écran et les alertes ne diraient plus la même
-- chose pour les baux activés ensuite.
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
  -- 1. activer_bail : l'alerte « État des lieux d'entrée » se pose de nouveau pour tout bail activé sans état des lieux signé.
  v_def := pg_get_functiondef('public.activer_bail(uuid)'::regprocedure);
  v_apres := $sql$
  -- Décision 3A du 22/11/2026 : un bail repris en cours (mois d'entrée antérieur au mois de son activation, jour de
  -- Paris) ne reçoit pas l'alerte « État des lieux d'entrée » : l'entrée a eu lieu avant Gerimmo.
  if date_trunc('month', v.date_debut::timestamp) >= date_trunc('month', public.aujourdhui_paris()::timestamp)
     and not exists (
    select 1 from public.etats_des_lieux e
    where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe'
  ) then
$sql$;
  v_avant := $sql$
  if not exists (
    select 1 from public.etats_des_lieux e
    where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe'
  ) then
$sql$;
  n_apres := (length(v_def) - length(replace(v_def, v_apres, ''))) / length(v_apres);
  n_avant := (length(v_def) - length(replace(v_def, v_avant, ''))) / length(v_avant);
  if n_apres = 1 and n_avant = 0 then
    execute replace(v_def, v_apres, v_avant);
  elsif not (n_apres = 0 and n_avant = 1) then
    raise exception 'Retour refusé : activer_bail a une forme inattendue (% ancienne(s), % nouvelle(s)).', n_avant, n_apres;
  end if;

  -- 2. bail_blocages_mise_en_location : le corps de 20261120190000, seulement si la fonction existe encore.
  if to_regprocedure('public.bail_blocages_mise_en_location(uuid)') is not null then
    execute $corps$
create or replace function public.bail_blocages_mise_en_location(p_bail uuid)
returns text[]
language plpgsql
stable
set search_path = ''
as $f$
declare
  v_lot uuid;
  v_debut date;
  v_blocages text[];
begin
  select b.lot_id, b.date_debut into v_lot, v_debut from public.baux b where b.id = p_bail;
  if not found then return array['Bail introuvable']; end if;

  v_blocages := public.lot_blocages_location(v_lot);
  if public.bail_deja_en_cours(v_debut) then
    v_blocages := array(
      select t.blocage
        from unnest(v_blocages) with ordinality as t(blocage, rang)
       where t.blocage not like 'DPE absent ou expiré%'
         and t.blocage not like 'ERP absent ou expiré%'
         and t.blocage <> 'Un diagnostic déposé est expiré'
       order by t.rang);
  end if;
  return v_blocages;
end;
$f$
$corps$;
    comment on function public.bail_blocages_mise_en_location(uuid) is
      'Décision B du 20/11/2026 : les blocages de mise en location qui valent pour ce bail. Bail déjà en cours (date d''entrée passée) : ceux de lot_blocages_location, moins les diagnostics absents ou expirés, qui deviennent des actions à mener. Sinon : tous.';
  end if;

  delete from supabase_migrations.schema_migrations where version = '20261122090000';
end $retour$;
notify pgrst, 'reload schema';
