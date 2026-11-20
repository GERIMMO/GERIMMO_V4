-- UN BAIL DÉJÀ EN COURS S'ACTIVE PAR SON CONTRAT SIGNÉ (décision B du dirigeant, 20/11/2026).
--
-- LE FREIN CONSTATÉ. Un propriétaire qui arrive avec un locataire déjà en place ne pouvait pas activer son bail :
-- la base exigeait d'abord la « mise en location » du logement, donc un DPE et un état des risques de moins de six
-- mois. En production, les 11 baux saisis par des propriétaires étaient restés en brouillon — locataires renseignés,
-- aucun état des risques, aucun contrat déposé. Or la règle RM-0.8.3, confirmée le 25/07, dit : « bloquer un bail en
-- cours n'aiderait personne » ; elle ne valait jusqu'ici que pour un bail déjà actif dans Gerimmo.
--
-- LA DÉCISION. Pour un bail dont la date d'entrée est PASSÉE, le dépôt du contrat signé suffit à l'activer. Les
-- diagnostics absents ou expirés (DPE, état des risques, autre diagnostic déposé puis expiré) ne bloquent plus ; ils
-- restent signalés dans les « actions à mener » du bail en cours (lib/actions-attendues.ts, déjà en place).
--
-- CE QUI NE CHANGE PAS.
--   · Un bail qui commence aujourd'hui ou plus tard : mise en location et diagnostics exigés, comme avant.
--   · Pour TOUS les baux : contrat signé déposé (PDF), mentions obligatoires, plafond du dépôt de garantie, mandat en
--     cours pour une agence, un seul bail en cours par lot, entrée après la sortie réelle du bail précédent.
--   · Les autres blocages du lot : nom, surface, détention à 100 %, clé de répartition, et le DPE classé G
--     (la décision ne porte que sur les diagnostics MANQUANTS).
--   · `lot_blocages_location` et `activer_bail` : inchangées.
--
-- CINQ GESTES, rejouables :
--   1. `bail_deja_en_cours(date)` : la définition, en un seul endroit (jour de Paris).
--   2. `bail_blocages_mise_en_location(bail)` : les blocages qui valent pour CE bail.
--   3. `controler_mise_en_location` : accepte le lot « brouillon » d'un bail déjà en cours, et lit ces blocages-là.
--   4. `verifier_transition_lot` : « brouillon → loué » devient possible ; « loué » reste refusé sans bail actif.
--   5. `parcours_demarrage` : le logement d'un bail en cours n'est plus une étape « à faire ».
--
-- RETOUR ARRIÈRE : supabase/retours-arriere/20261120190000_bail_deja_en_cours.retour.sql (aucune donnée modifiée).

-- 1. Un bail est « déjà en cours » quand sa date d'entrée est strictement passée, au jour de Paris.
create or replace function public.bail_deja_en_cours(p_date_debut date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_date_debut is not null and p_date_debut < public.aujourdhui_paris()
$$;

comment on function public.bail_deja_en_cours(date) is
  'Décision B du 20/11/2026 : vrai quand la date d''entrée du bail est strictement passée (jour de Paris). Un tel bail s''active par son contrat signé, sans mise en location préalable du lot.';

revoke all on function public.bail_deja_en_cours(date) from public, anon;
grant execute on function public.bail_deja_en_cours(date) to authenticated, service_role;

-- 2. Les blocages de mise en location qui valent pour CE bail. Bail déjà en cours : ceux du lot, moins les diagnostics
--    absents ou expirés. Les trois libellés retirés sont ceux de `lot_blocages_location` ; si l'un d'eux est reformulé
--    un jour, le filtre ne le reconnaît plus et le blocage REVIENT (échec du côté sûr) — et
--    tests/bail-deja-en-cours-base.test.ts le signale.
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
       order by t.rang);
  end if;
  return v_blocages;
end;
$$;

comment on function public.bail_blocages_mise_en_location(uuid) is
  'Décision B du 20/11/2026 : les blocages de mise en location qui valent pour ce bail. Bail déjà en cours (date d''entrée passée) : ceux de lot_blocages_location, moins les diagnostics absents ou expirés, qui deviennent des actions à mener. Sinon : tous.';

revoke all on function public.bail_blocages_mise_en_location(uuid) from public, anon;
grant execute on function public.bail_blocages_mise_en_location(uuid) to authenticated, service_role;

-- 3. `controler_mise_en_location` : la seule porte de l'activation. Correctif par ancres, comme D34 (20261014121000) :
--    la définition en place est relue, modifiée à deux endroits exacts, et refusée si elle n'est pas celle attendue.
do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.controler_mise_en_location(uuid)'::regprocedure) into v_def;
  if position('Décision B du 20/11/2026' in v_def) > 0 then return; end if;

  v_ancre := $ancre$  if v_lot.etat <> 'disponible' and not (v.chambre_id is not null and v_lot.etat in ('loue','preavis')) then
$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif bail déjà en cours : définition inattendue de controler_mise_en_location (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$  -- Décision B du 20/11/2026 : un bail DÉJÀ EN COURS (date d'entrée passée) s'active par son contrat signé, même si
  -- le logement n'a jamais été « mis en location » — il reste alors « brouillon » et passe directement à « loué ».
  if v_lot.etat <> 'disponible' and not (v.chambre_id is not null and v_lot.etat in ('loue','preavis'))
     and not (v_lot.etat = 'brouillon' and public.bail_deja_en_cours(v.date_debut)) then
$nouveau$);

  v_ancre := $ancre$  v_blocages := public.lot_blocages_location(v.lot_id);
$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif bail déjà en cours : définition inattendue de controler_mise_en_location (ancre 2 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$  -- Pour un bail déjà en cours, les diagnostics absents ou expirés ne bloquent pas : ils deviennent des actions à mener.
  v_blocages := public.bail_blocages_mise_en_location(p_bail);
$nouveau$);

  execute v_def;
end $correctif$;

-- Les droits de la fonction sont conservés par le remplacement : rien à reposer.

-- 4. `verifier_transition_lot` : « brouillon → loué ». La garde qui suit dans la même fonction reste entière : un lot
--    ne devient « loué » que si un bail actif vit dessus, et un bail ne devient actif que par
--    `controler_mise_en_location`. Le passage « brouillon → disponible » garde son contrôle complet des blocages.
do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.verifier_transition_lot()'::regprocedure) into v_def;
  if position('Décision B du 20/11/2026' in v_def) > 0 then return; end if;

  v_ancre := $ancre$    (old.etat = 'brouillon'  and new.etat in ('disponible', 'archive'))
$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif bail déjà en cours : définition inattendue de verifier_transition_lot (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$    -- Décision B du 20/11/2026 : « brouillon → loué », pour le logement d'un bail déjà en cours activé par son contrat
    -- signé. Plus bas, « loué » reste refusé tant qu'aucun bail actif ne vit sur le lot.
    (old.etat = 'brouillon'  and new.etat in ('disponible', 'loue', 'archive'))
$nouveau$);

  execute v_def;
end $correctif$;

-- 5. `parcours_demarrage` : « Un lot en état d'être loué » n'est plus à faire quand un bail est en cours. Sans cela,
--    le guide renvoyait vers le DPE et l'état des risques au lieu du premier encaissement — et revenait chez un
--    client installé chaque fois que l'état des risques (six mois) expirait.
do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.parcours_demarrage(uuid)'::regprocedure) into v_def;
  if position('Votre logement est loué.' in v_def) > 0 then return; end if;

  v_ancre := $ancre$  select 'lot_pret', v_lot_pret is not null,
         case when v_lot_pret is not null then 'Au moins un lot peut être mis en location.'
$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif bail déjà en cours : définition inattendue de parcours_demarrage (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$  select 'lot_pret', v_lot_pret is not null or v_bail > 0,
         case when v_lot_pret is not null then 'Au moins un lot peut être mis en location.'
              when v_bail > 0 then 'Votre logement est loué. Les diagnostics qui manquent restent signalés dans vos actions à mener.'
$nouveau$);

  execute v_def;
end $correctif$;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
