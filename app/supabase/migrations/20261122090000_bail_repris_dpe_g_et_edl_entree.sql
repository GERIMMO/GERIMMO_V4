-- BAIL DÉJÀ EN COURS : LE DPE CLASSÉ G NE BLOQUE PLUS, ET UN BAIL REPRIS NE REÇOIT PLUS L'ALERTE D'ÉTAT DES LIEUX
-- D'ENTRÉE (décisions 2B et 3A du dirigeant, 22/11/2026).
--
-- DÉCISION 2B. Pour un bail dont la date d'entrée est PASSÉE (bail_deja_en_cours, décision B du 20/11), le DPE classé G
-- rejoint les diagnostics qui ne bloquent pas l'activation : il devient une alerte du bail en cours
-- (lib/actions-attendues.ts). Le dirigeant a tranché contre la recommandation de garder le blocage ; aucune source du
-- wiki ne dit ce que la classe G implique pour un bail déjà en cours.
--   · Ce qui ne change pas : un bail qui commence aujourd'hui ou plus tard reste bloqué par un DPE classé G, et un
--     logement classé G ne se « met pas en location » (`lot_blocages_location`, inchangée).
--
-- DÉCISION 3A. À l'activation, un bail REPRIS EN COURS — mois d'entrée antérieur au mois de l'activation, celui dont
-- les loyers ne sont suivis qu'à partir de là (20261120200000) — ne reçoit plus l'alerte « État des lieux d'entrée » :
-- l'entrée a eu lieu avant Gerimmo. L'écran suit la même règle (baux.loyers_suivis_depuis renseignée).
--   · Ce qui ne change pas : un bail activé le mois de son entrée, ou avant, reçoit toujours l'alerte.
--
-- DEUX GESTES, rejouables :
--   1. `bail_blocages_mise_en_location` : même fonction, un libellé de plus retiré pour un bail déjà en cours.
--   2. `activer_bail` : corrigée EN RELISANT sa définition en vigueur (ancre + marque). Sa définition diffère d'une
--      ligne de commentaire entre le dépôt et la production (relevé du 20/11) ; l'ancre ne porte pas sur cette ligne.
--      La condition est écrite sans appeler de fonction de 20261120200000 : les deux retours restent indépendants.
--
-- Aucune donnée n'est modifiée. En production au 22/11 : aucun bail actif, donc aucune alerte à reprendre.
-- RETOUR ARRIÈRE : supabase/retours-arriere/20261122090000_bail_repris_dpe_g_et_edl_entree.retour.sql

-- 1. Les blocages de mise en location qui valent pour CE bail. Bail déjà en cours : ceux du lot, moins les diagnostics
--    absents ou expirés, et désormais moins le DPE classé G. Les quatre libellés retirés sont ceux de
--    `lot_blocages_location` ; si l'un d'eux est reformulé un jour, le filtre ne le reconnaît plus et le blocage REVIENT
--    (échec du côté sûr) — tests/bail-deja-en-cours-base.test.ts le signale.
create or replace function public.bail_blocages_mise_en_location(p_bail uuid)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
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
         -- Décision 2B du 22/11/2026 : le DPE classé G devient une alerte du bail en cours.
         and t.blocage not like 'DPE classe G%'
       order by t.rang);
  end if;
  return v_blocages;
end;
$$;

comment on function public.bail_blocages_mise_en_location(uuid) is
  'Décisions B du 20/11/2026 et 2B du 22/11/2026 : blocages de mise en location qui valent pour ce bail. Bail déjà en cours : ceux du lot, moins les diagnostics absents ou expirés et le DPE classé G, qui restent des actions à mener.';

revoke all on function public.bail_blocages_mise_en_location(uuid) from public, anon;
grant execute on function public.bail_blocages_mise_en_location(uuid) to authenticated, service_role;

-- 2. `activer_bail` : pas d'alerte « État des lieux d'entrée » pour un bail repris en cours.
do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.activer_bail(uuid)'::regprocedure) into v_def;
  if position('Décision 3A du 22/11/2026' in v_def) > 0 then return; end if;

  v_ancre := $ancre$
  if not exists (
    select 1 from public.etats_des_lieux e
    where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe'
  ) then
$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision 3A : définition inattendue de activer_bail (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$
  -- Décision 3A du 22/11/2026 : un bail repris en cours (mois d'entrée antérieur au mois de son activation, jour de
  -- Paris) ne reçoit pas l'alerte « État des lieux d'entrée » : l'entrée a eu lieu avant Gerimmo.
  if date_trunc('month', v.date_debut::timestamp) >= date_trunc('month', public.aujourdhui_paris()::timestamp)
     and not exists (
    select 1 from public.etats_des_lieux e
    where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe'
  ) then
$nouveau$);
  execute v_def;
end $correctif$;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
