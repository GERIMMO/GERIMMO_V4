-- Cohérence structurelle entre l'état du LOT et son BAIL — audit du 2026-09-10.
--
-- LA RÈGLE (« le bail fait foi, le lot suit ») :
--   · un bail vivant « actif »   → le lot est « loué » ;
--   · un bail vivant « préavis » → le lot est « en préavis » ;
--   · aucun bail vivant          → le lot n'est ni « loué » ni « en préavis »
--     (il est brouillon, disponible ou archivé, au choix de l'agence).
-- Un lot ne porte qu'un seul bail vivant à la fois (index partiel
-- `baux_un_seul_vivant_par_lot`), donc l'état attendu est toujours unique.
--
-- POURQUOI. La chaîne critique « bail signé → lot loué » (RM-1.7.1 à RM-1.7.3,
-- wiki [[Machines à états et événements]] et [[Bail]]) et la décision du
-- 2026-08-03 « l'état du lot adossé au bail » (migration
-- 20260803_etat_lot_adosse_au_bail.sql) posaient la règle, mais rien ne la
-- garantissait dans le sens de la sortie : la machine à états du lot
-- (module 0, tranchée le 2026-07-25 : brouillon → disponible → loué ⇄ préavis
-- → archivé) autorisait « préavis → disponible » sans regarder le bail. Le
-- bouton « Le locataire est parti » remettait donc le lot sur le marché alors
-- que son bail courait encore jusqu'au terme du préavis : le parc annonçait
-- vacant un logement occupé, et le lot pouvait même être archivé sous un bail
-- vivant. Constaté sur données réelles (un lot « disponible » avec un bail en
-- préavis jusqu'au 01/11).
--
-- Le départ du locataire ne se décrète pas depuis le lot : il se constate sur
-- le bail — congé enregistré (`enregistrer_conge`), puis clôture
-- (`terminer_bail`), qui exige l'état des lieux de sortie signé (RM-3.11.2) et
-- repose le lot en « disponible » lui-même.
--
-- CE QUE POSE CETTE MIGRATION.
--   1. le rattrapage des lignes déjà incohérentes (avant toute contrainte) ;
--   2. le refus immédiat, dans `verifier_transition_lot`, de toute transition
--      du lot qui contredirait son bail — avec le message qui dit quoi faire ;
--   3. un déclencheur de contrainte différé (`...coherence_lot_bail`) sur
--      `lots` ET sur `baux` : quel que soit le chemin d'écriture (RPC, écriture
--      directe autorisée par les policies `lots_update` / `baux_update`, ordre
--      des mises à jour dans la transaction), aucune transaction ne peut être
--      validée en laissant un lot en désaccord avec son bail. C'est la
--      transaction qui porte la cohérence, comme pour les effets immédiats
--      d'une transition (RM-A5.3). Quand un bail change de lot, les DEUX lots
--      sont vérifiés — celui qu'il rejoint et celui qu'il quitte : autrement
--      `update baux set lot_id = …` suffisait à laisser derrière lui un lot
--      « loué » sans aucun bail.
-- Le déclencheur est différé (`initially deferred`) parce que les fonctions
-- existantes écrivent le bail PUIS le lot (activer_bail, enregistrer_conge,
-- annuler_conge, devalider_bail, terminer_bail) : il n'a donc pas à arbitrer
-- l'ordre, seulement le résultat.

-- ---------------------------------------------------------------------------
-- 1. Rattrapage des lignes existantes — AVANT de poser la contrainte.
-- ---------------------------------------------------------------------------
-- Le rattrapage traverse des transitions que la machine à états interdit
-- (« disponible → préavis » n'existe pas : un lot vacant n'a pas de préavis) :
-- on suspend le déclencheur de transitions le temps de remettre la vérité du
-- bail dans le lot, jamais l'inverse.
--
-- À exécuter AVANT cette migration pour garder la trace nominative des lignes
-- corrigées (la migration, elle, n'en donne que le compte) :
--
--   select o.name as agence, bi.nom as bien, l.id as lot_id, l.nom as lot,
--          l.etat as etat_lot, b.id as bail_id,
--          coalesce(b.etat::text, 'aucun bail vivant') as etat_bail, b.date_fin,
--          (case b.etat when 'actif' then 'loue' when 'preavis' then 'preavis'
--                       else 'disponible ou brouillon' end) as etat_attendu
--     from public.lots l
--     join public.organizations o on o.id = l.organization_id
--     join public.biens bi on bi.id = l.bien_id
--     left join public.baux b on b.lot_id = l.id and b.etat in ('actif','preavis')
--    where (b.id is not null
--           and l.etat is distinct from
--               (case b.etat when 'actif' then 'loue' else 'preavis' end)::public.lot_etat)
--       or (b.id is null and l.etat in ('loue','preavis'))
--    order by o.name, bi.nom, l.nom;
-- Sur une base où cette migration aurait déjà tourné, on retire d'abord les
-- déclencheurs de contrainte : le rattrapage poserait sinon des événements
-- différés en attente, et Postgres refuse de réactiver `lots_transitions` tant
-- qu'il en reste. Ils sont reposés en fin de fichier.
drop trigger if exists lots_coherence_bail on public.lots;
drop trigger if exists baux_coherence_lot on public.baux;

alter table public.lots disable trigger lots_transitions;

do $$
declare
  v_vers_bail integer;
  v_vers_libre integer;
begin
  -- a) un bail vivant : le lot prend l'état du bail (loué / préavis).
  with vivants as (
    select b.lot_id,
           (case b.etat when 'actif' then 'loue' else 'preavis' end)::public.lot_etat as attendu
    from public.baux b
    where b.etat in ('actif', 'preavis')
  )
  update public.lots l
     set etat = v.attendu, updated_at = now()
    from vivants v
   where v.lot_id = l.id
     and l.etat is distinct from v.attendu;
  get diagnostics v_vers_bail = row_count;

  -- b) aucun bail vivant : un lot ne reste ni « loué » ni « en préavis ». Il
  --    redevient « disponible » s'il est louable en l'état, sinon « brouillon »
  --    — on ne remet pas sur le marché un lot dont la détention ou les
  --    diagnostics bloquent la mise en location (RM-0.5.4, RM-0.7.3).
  update public.lots l
     set etat = (case
                   when coalesce(array_length(public.lot_blocages_location(l.id), 1), 0) = 0
                     then 'disponible' else 'brouillon'
                 end)::public.lot_etat,
         updated_at = now()
   where l.etat in ('loue', 'preavis')
     and not exists (select 1 from public.baux b
                      where b.lot_id = l.id and b.etat in ('actif', 'preavis'));
  get diagnostics v_vers_libre = row_count;

  raise notice 'Cohérence lot/bail — rattrapage : % lot(s) réalignés sur leur bail vivant, % lot(s) libérés faute de bail vivant.',
    v_vers_bail, v_vers_libre;
end $$;

alter table public.lots enable trigger lots_transitions;

-- ---------------------------------------------------------------------------
-- 2. Refus immédiat, au moment du geste, avec le mode d'emploi dans le message.
-- ---------------------------------------------------------------------------
-- Repris à l'identique de la version en vigueur (verrouillage des surfaces,
-- matrice des transitions, blocages de mise en location, réactivation réservée
-- à l'admin) ; seul le bloc « le lot suit le bail » change : il ne vérifie plus
-- seulement l'entrée en « loué » / « préavis », il vérifie TOUT état d'arrivée.
create or replace function public.verifier_transition_lot()
returns trigger language plpgsql set search_path to '' as $function$
declare
  v_blocages text[];
  v_bail record;
  v_attendu public.lot_etat;
begin
  if old.etat in ('loue', 'preavis') then
    if new.surface_m2 is distinct from old.surface_m2
       or new.pieces is distinct from old.pieces
       or new.surface_carrez is distinct from old.surface_carrez then
      raise exception 'Lot loué : surface et pièces sont verrouillées (avenant au bail requis)';
    end if;
  end if;

  if new.etat = old.etat then return new; end if;

  if not (
    (old.etat = 'brouillon'  and new.etat in ('disponible', 'archive'))
    or (old.etat = 'disponible' and new.etat in ('brouillon', 'loue', 'archive'))
    or (old.etat = 'loue'       and new.etat in ('preavis', 'disponible'))
    or (old.etat = 'preavis'    and new.etat in ('loue', 'disponible'))
    or (old.etat = 'archive'    and new.etat = 'brouillon')
  ) then
    raise exception 'Transition interdite : % → %', old.etat, new.etat;
  end if;

  if new.etat = 'disponible' and old.etat = 'brouillon' then
    v_blocages := public.lot_blocages_location(new.id);
    if array_length(v_blocages, 1) is not null then
      raise exception 'Passage en disponible impossible : %',
        array_to_string(v_blocages, ' · ');
    end if;
  end if;

  -- Le lot suit le bail : l'état d'arrivée doit être celui que le bail vivant
  -- commande. Un seul bail vivant par lot (baux_un_seul_vivant_par_lot).
  select b.etat, b.date_fin into v_bail
    from public.baux b
   where b.lot_id = new.id and b.etat in ('actif', 'preavis')
   limit 1;
  v_attendu := (case v_bail.etat when 'actif' then 'loue'
                                 when 'preavis' then 'preavis' end)::public.lot_etat;

  if v_attendu = 'loue' and new.etat <> 'loue' then
    raise exception 'Ce lot porte un bail en cours : il reste loué. Le départ se constate sur le bail — enregistrez le congé, puis clôturez le bail une fois l''état des lieux de sortie signé ; le lot redeviendra disponible tout seul';
  elsif v_attendu = 'preavis' and new.etat <> 'preavis' then
    raise exception 'Le bail de ce lot court encore (préavis %) : le lot ne se libère pas à la main. Clôturez le bail une fois l''état des lieux de sortie signé (RM-3.11.2) — le lot repassera en disponible tout seul',
      coalesce('jusqu''au ' || to_char(v_bail.date_fin, 'DD/MM/YYYY'), 'en cours');
  elsif v_attendu is null and new.etat = 'loue' then
    raise exception 'Ce lot n''a pas de bail : créez le bail et activez-le, le lot passera en loué tout seul';
  elsif v_attendu is null and new.etat = 'preavis' then
    raise exception 'Aucun congé enregistré sur ce bail : enregistrez le congé, le lot passera en préavis tout seul';
  end if;

  if old.etat = 'archive' and new.etat = 'brouillon' then
    if not (
      new.organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','proprietaire_direct']::public.membership_role[]))
      or public.is_super_admin()
    ) then
      raise exception 'Réactivation réservée à l''admin de l''agence';
    end if;
  end if;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. La garantie structurelle : aucune transaction ne se valide incohérente.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER : le contrôle doit voir le bail même quand la policy de
-- lecture du demandeur ne le lui montre pas — sinon il suffirait de ne pas
-- voir le bail pour être autorisé à contredire la règle.
create or replace function public.verifier_coherence_lot_bail()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare
  v_lots uuid[];
  v_lot uuid;
  v_lot_etat public.lot_etat;
  v_lot_nom text;
  v_bail record;
  v_attendu public.lot_etat;
begin
  if tg_table_name = 'lots' then
    if tg_op = 'UPDATE' and new.etat is not distinct from old.etat then
      return null;   -- rien de l'état n'a bougé : rien à revérifier
    end if;
    v_lots := array[new.id];
  elsif tg_op = 'DELETE' then
    v_lots := array[old.lot_id];
  elsif tg_op = 'UPDATE' then
    if new.etat is not distinct from old.etat
       and new.lot_id is not distinct from old.lot_id then
      return null;
    end if;
    -- Un bail rattaché à un AUTRE lot laisse deux lots à vérifier : celui
    -- qu'il rejoint et celui qu'il quitte — ce dernier n'a plus de bail
    -- vivant et ne peut donc rester « loué » ou « en préavis ». Sans cela,
    -- `update baux set lot_id = …` (permis par la policy `baux_update`, qui
    -- ne contrôle que l'organisation) abandonnait derrière lui un lot
    -- éternellement loué sans locataire.
    v_lots := array[new.lot_id];
    if new.lot_id is distinct from old.lot_id then
      v_lots := v_lots || old.lot_id;
    end if;
  else
    v_lots := array[new.lot_id];
  end if;

  foreach v_lot in array v_lots loop
    select l.etat, l.nom into v_lot_etat, v_lot_nom
      from public.lots l where l.id = v_lot;
    if v_lot_etat is null then continue; end if;   -- lot disparu : rien à tenir

    select b.etat, b.date_fin into v_bail
      from public.baux b
     where b.lot_id = v_lot and b.etat in ('actif', 'preavis')
     limit 1;
    v_attendu := (case v_bail.etat when 'actif' then 'loue'
                                   when 'preavis' then 'preavis' end)::public.lot_etat;

    if v_attendu is not null and v_lot_etat is distinct from v_attendu then
      raise exception 'Le lot « % » porte un bail % (%) : son état doit être « % », pas « % » — le lot suit le bail (activation, congé, clôture), il ne se pilote pas à la main',
        v_lot_nom, v_bail.etat,
        coalesce('échéance ' || to_char(v_bail.date_fin, 'DD/MM/YYYY'), 'sans terme enregistré'),
        v_attendu, v_lot_etat;
    end if;

    if v_attendu is null and v_lot_etat in ('loue', 'preavis') then
      raise exception 'Le lot « % » est « % » alors qu''aucun bail ne vit dessus : sans bail, un lot n''est ni loué ni en préavis',
        v_lot_nom, v_lot_etat;
    end if;
  end loop;

  return null;
end;
$function$;

revoke execute on function public.verifier_coherence_lot_bail() from public, anon, authenticated;

drop trigger if exists lots_coherence_bail on public.lots;
create constraint trigger lots_coherence_bail
  after insert or update on public.lots
  deferrable initially deferred
  for each row execute function public.verifier_coherence_lot_bail();

drop trigger if exists baux_coherence_lot on public.baux;
create constraint trigger baux_coherence_lot
  after insert or update or delete on public.baux
  deferrable initially deferred
  for each row execute function public.verifier_coherence_lot_bail();
