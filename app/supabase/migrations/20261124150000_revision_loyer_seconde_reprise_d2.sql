-- Décisions du dirigeant du 24/11/2026, lot D2 (SECONDE reprise après relecture) : révision annuelle du loyer.
--
-- LA RÈGLE, EN TROIS PHRASES :
--
--  1. Une révision se calcule sur UN an, avec deux indices vraisemblables : l'indice nouveau, dont l'année ne dépasse pas
--     celle de la date de révision, et l'indice de référence, qui est celui de la révision de l'année de bail précédente
--     (celui du bail, la première année) ; quand cette révision n'existe pas, ou que l'année lue de la référence est plus
--     ancienne de plus d'un an, l'indice du même trimestre de l'année précédente doit être saisi et c'est lui qui sert.
--  2. Un terme porte le loyer et les charges qui valaient pour lui, quel que soit le jour où il est appelé : le montant
--     « nouveau » du dernier changement du bail dont l'effet est au plus tard ce terme (une révision par son premier terme,
--     un avenant appliqué par sa date d'effet) ; à défaut, le montant « ancien » du premier changement postérieur.
--  3. Tant que le premier terme révisé n'est pas commencé, le loyer affiché est l'« ancien loyer » de la plus ancienne
--     révision en attente, et le loyer du bail s'annonce à compter de ce premier terme, sauf si le bail finit avant lui
--     (cette phrase est tenue par l'application ; la base rend les révisions du locataire dans cet ordre).
--
-- CE QUE CELA CORRIGE (constats du relecteur sur la migration 20261124130000, chiffres de ses preuves) :
--
--  - Constat 1. L'année non faite n'était reconnue qu'à l'année LUE dans le libellé du trimestre de référence. Un bail du
--    15/10/2023 dont le trimestre est écrit « T2 », « 2e trimestre », « T2 23 » ou n'est pas renseigné passait encore de
--    700 à 742 € en 2025 (deux années d'un coup). Elle se reconnaît désormais à l'ANNÉE DE BAIL : à partir de la deuxième
--    année de bail, s'il n'existe aucune révision pour l'année de bail précédente, l'indice de l'année précédente est exigé.
--  - Constat 2. Aucun contrôle sur la valeur des indices : « NaN » enregistrait un loyer « NaN », l'infini un loyer de 0 €,
--    un indice précédent de 1 un loyer de 74 200 €. Les deux indices doivent donner un rapport compris entre 0,8 et 1,25.
--    C'EST UN GARDE-FOU DE SAISIE, PAS UNE RÈGLE DE DROIT : la plage est volontairement large, elle n'arrête que les fautes
--    de frappe et les valeurs qui ne sont pas des nombres.
--  - Constats 3 et 4. Terme appelé en retard quand un avenant est en jeu : janvier appelé 700 € au lieu de 714 € (avenant
--    enregistré avant une révision, appliqué après) ; février appelé 700 € + 90 € de charges au lieu de 700 € + 50 € (loyer
--    d'avant l'avenant, mais charges d'après). La phrase 2 remplace les cas particuliers du déclencheur.
--  - Constat 5. Deux révisions en attente le même mois : la fonction de lecture du locataire les rend dans un ordre fixe
--    (premier terme, puis date d'enregistrement).
--  - Constat 7. La révision d'une année encore dans son délai s'enregistrait avec l'indice de l'année suivante (bail du
--    15/10/2023 : le 01/09/2025, l'indice T2 2025 était accepté pour la révision du 15/10/2024). Refus clair.
--
-- CE QUI NE CHANGE PAS. Une révision par an, sans avenant : mêmes révisions et mêmes appels de loyer, au centime (vérifié
-- sur des baux tirés au hasard, avec et sans cette migration). Le délai d'un an, le premier terme révisé, le contrôle de
-- l'appelant (`org_ids_avec_roles`), SECURITY DEFINER, le chemin de recherche vide, les droits (rien n'est ouvert aux
-- visiteurs). AUCUNE LIGNE EXISTANTE N'EST MODIFIÉE : ni révision, ni appel de loyer, ni avenant, ni bail.
--
-- COMMENT. `reviser_loyer(uuid,numeric,text,date)` est relue dans sa définition EN VIGUEUR (pg_get_functiondef) et
-- modifiée à quatre endroits, chacun attendu une seule fois ; une définition déjà modifiée est laissée telle quelle
-- (rejeu sans effet) ; toute autre forme arrête la migration sans rien modifier. Deux de ces endroits sont des lignes
-- posées par la migration 20261124130000 (la condition de l'année non faite et son message).
-- À SAVOIR : de ce fait, REJOUER 20261124130000 après celle-ci s'arrête sur son propre contrôle (« définition
-- inattendue »), sans rien modifier ; pour la rejouer, jouer d'abord le retour de celle-ci. Rejouer 20261124100000 ou
-- 20261124130000 remettrait aussi leur version de la fonction du déclencheur : rejouer alors celle-ci en dernier.
-- Retour arrière : supabase/retours-arriere/20261124150000_revision_loyer_seconde_reprise_d2.retour.sql
-- (à jouer AVANT celui de 20261124130000, qui attend ses propres lignes intactes).

do $seconde_reprise_d2$
declare
  c_signature constant text := 'public.reviser_loyer(uuid,numeric,text,date)';
  -- Les quatre endroits : [texte en vigueur, texte de cette seconde reprise].
  c_endroits constant text[][] := array[
    -- 1. Constat 7 : l'indice de la révision suivante est refusé. Posé juste avant la lecture de l'année de la référence.
    [E'  v_annee_ref := coalesce(public.trimestre_irl_annee(v_derniere.irl_trimestre),\n',
     $bloc$  -- Seconde reprise du lot D2 (24/11/2026) : l'année de l'indice nouveau ne peut pas dépasser l'année de la date de
  -- révision à laquelle la demande est rattachée. Un indice d'une année plus récente est celui de la révision suivante.
  if v_annee > extract(year from v_echeance)::integer then
    raise exception 'Indice du % refusé : cet indice est celui de la révision suivante. La révision demandée est celle du % : l''année de son indice ne peut pas dépasser %',
      v_trimestre, to_char(v_echeance, 'DD/MM/YYYY'), extract(year from v_echeance)::integer;
  end if;
  v_annee_ref := coalesce(public.trimestre_irl_annee(v_derniere.irl_trimestre),
$bloc$],
    -- 2. Constat 1 : l'année non faite se reconnaît à l'année de bail (ligne posée par 20261124130000).
    [E'  if v_annee_ref is not null and v_annee > v_annee_ref + 1 then\n',
     $bloc$  -- Seconde reprise du lot D2 : l'année non faite se reconnaît d'abord à l'ANNÉE DE BAIL (aucune révision pour l'année
  -- de bail précédente), et plus seulement à l'année lue dans le libellé du trimestre, qui peut manquer (« T2 », vide).
  if (v_n >= 2 and not exists (select 1 from public.revisions_loyer r
                                where r.bail_id = p_bail and public.annee_de_bail(v.date_debut, r.date_effet) = v_n - 1))
     or (v_annee_ref is not null and v_annee > v_annee_ref + 1) then
$bloc$],
    -- 3. Le message de ce refus ne cite plus l'année lue de la référence, qui peut manquer, et n'affirme plus qu'une
    --    révision « n'a pas été faite » : la base sait seulement qu'aucune n'est enregistrée (bail repris en cours, par
    --    exemple). Message posé par 20261124130000.
    [$bloc$      raise exception 'Indice du T% % obligatoire : l''indice de référence de ce bail est celui de %, la révision d''une année au moins n''a pas été faite. Elle n''est pas rattrapée : le loyer se révise sur un an, avec l''indice du même trimestre de l''année précédente (T% %). Saisissez cet indice',
        v_trim, v_annee - 1, v_annee_ref, v_trim, v_annee - 1;
$bloc$,
     $bloc$      raise exception 'Indice du T% % obligatoire : aucune révision n''est enregistrée pour l''année de bail précédente, ou l''indice de référence de ce bail est plus ancien. Une révision qui n''a pas été faite n''est pas rattrapée : le loyer se révise sur un an, avec l''indice du même trimestre de l''année précédente (T% %). Saisissez cet indice',
        v_trim, v_annee - 1, v_trim, v_annee - 1;
$bloc$],
    -- 4. Constat 2 : les deux indices doivent être des nombres vraisemblables. Posé juste avant le calcul.
    [E'  v_nouveau := round(v.loyer_hc * p_irl_nouveau / v_reference, 2);\n',
     $bloc$  -- Seconde reprise du lot D2 : GARDE-FOU DE SAISIE, pas une règle de droit. Le rapport entre l'indice nouveau et
  -- l'indice de référence doit être compris entre 0,8 et 1,25 (plage volontairement large). Ce seul contrôle écarte aussi
  -- ce qui n'est pas un nombre utilisable : « NaN », l'infini, zéro et les valeurs négatives ne donnent jamais un
  -- rapport dans cette plage.
  if not coalesce(p_irl_nouveau / nullif(v_reference, 0) between 0.8 and 1.25, false) then
    raise exception 'Révision refusée : vérifiez les indices saisis. L''indice nouveau (%) et l''indice de référence (%) doivent être deux nombres positifs proches l''un de l''autre',
      p_irl_nouveau, v_reference;
  end if;
  v_nouveau := round(v.loyer_hc * p_irl_nouveau / v_reference, 2);
$bloc$]
  ];
  v_oid regprocedure := to_regprocedure(c_signature);
  v_def text;
  v_avant integer := 0;
  v_apres integer := 0;
  paire text[];
begin
  if v_oid is null then
    raise exception 'Révision du loyer (seconde reprise) : la fonction % est absente de cette base ; rien n''est modifié.', c_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  -- Chaque endroit doit se lire une seule fois, sous sa forme d'avant ou sous celle de cette seconde reprise.
  foreach paire slice 1 in array c_endroits loop
    if (length(v_def) - length(replace(v_def, paire[2], ''))) / length(paire[2]) = 1 then
      v_apres := v_apres + 1;
    elsif (length(v_def) - length(replace(v_def, paire[1], ''))) / length(paire[1]) = 1 then
      v_avant := v_avant + 1;
    end if;
  end loop;
  if v_apres = 4 then
    raise notice 'Révision du loyer (seconde reprise) : % porte déjà la seconde reprise, rien à faire.', c_signature;
  elsif v_avant = 4 then
    foreach paire slice 1 in array c_endroits loop
      v_def := replace(v_def, paire[1], paire[2]);
    end loop;
    execute v_def;
  else
    raise exception 'Révision du loyer (seconde reprise) : % ne porte ni la définition attendue ni celle de cette seconde reprise (% endroit(s) d''avant, % de la seconde reprise, sur 4) : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.',
      c_signature, v_avant, v_apres;
  end if;
end $seconde_reprise_d2$;

-- PHRASE 2. Un terme appelé APRÈS un changement du bail qui ne le concerne pas encore (rattrapage d'un mois manquant,
-- appels générés en retard) porte le loyer et les charges qui valaient pour lui. Le générateur lit le bail, déjà changé :
-- ce déclencheur remet les montants du terme, au prorata des jours dus comme le générateur (montants_appel_loyer).
--
-- Les changements du bail, rangés par date d'effet :
--   - une révision, par son premier terme révisé : ancien loyer → nouveau loyer (elle ne change pas les charges) ;
--   - un avenant appliqué, par sa date d'effet : ancien loyer → nouveau loyer, anciennes charges → nouvelles charges.
-- Le loyer du terme est le « nouveau » du dernier changement dont l'effet est au plus tard ce terme ; à défaut, l'« ancien »
-- du premier changement postérieur. Même règle pour les charges, avec les seuls avenants.
-- Le « nouveau » passe en premier parce que l'« ancien » d'un avenant est lu le jour où il est ENREGISTRÉ : si une
-- révision passe entre ce jour et sa date d'effet, cet « ancien » n'est plus le loyer d'avant l'avenant.
--
-- Sans changement postérieur au terme, le déclencheur ne touche à rien : le bail porte déjà les bons montants. C'est le
-- cas de tous les appels du cycle mensuel normal.
-- Révisions d'avant le 24/11/2026 (premier terme vide) : comme avant, elles ne font jamais revenir un terme en arrière.
-- Elles comptent seulement comme un changement passé, à leur date d'effet, pour que la suite des loyers reste complète.
-- Même date d'effet : la révision est toujours enregistrée avant que l'avenant s'applique (un avenant s'applique à l'appel
-- de son premier terme, et une révision ne prend jamais pour premier terme un terme déjà appelé) ; l'avenant passe donc
-- après elle. Deux révisions de même premier terme : dans l'ordre de leur date d'effet, unique par bail.
-- Remplace la version de la migration 20261124130000.
create or replace function public.appliquer_revision_a_l_appel()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fonction$
declare
  v_loyer numeric;
  v_charges numeric;
  m record;
begin
  with changements as (
    select coalesce(rv.premier_terme, rv.date_effet) as effet, 0 as rang, rv.date_effet as ordre,
           rv.premier_terme is not null as fait_revenir,
           rv.ancien_loyer as ancien_loyer, rv.nouveau_loyer as nouveau_loyer,
           null::numeric as anciennes_charges, null::numeric as nouvelles_charges
      from public.revisions_loyer rv
     where rv.bail_id = new.bail_id
    union all
    select av.date_effet, 1, av.date_effet, true,
           av.ancien_loyer_hc, av.nouveau_loyer_hc, av.anciennes_charges, av.nouvelles_charges
      from public.avenants_bail av
     where av.bail_id = new.bail_id and av.annule_le is null and av.applique_le is not null
  ),
  avant as (select * from changements c where c.effet <= new.periode),
  apres as (select * from changements c where c.effet > new.periode and c.fait_revenir)
  select
    case when exists (select 1 from apres) then coalesce(
      (select a.nouveau_loyer from avant a order by a.effet desc, a.rang desc, a.ordre desc limit 1),
      (select p.ancien_loyer from apres p order by p.effet, p.rang, p.ordre limit 1)) end,
    case when exists (select 1 from apres p where p.nouvelles_charges is not null) then coalesce(
      (select a.nouvelles_charges from avant a where a.nouvelles_charges is not null order by a.effet desc limit 1),
      (select p.anciennes_charges from apres p where p.nouvelles_charges is not null order by p.effet limit 1)) end
    into v_loyer, v_charges;
  if v_loyer is null and v_charges is null then return new; end if;

  select * into m from public.montants_appel_loyer(new.bail_id, new.periode, coalesce(v_loyer, 0), coalesce(v_charges, 0));
  if v_loyer is not null then
    new.loyer_hc := m.loyer_hc;
    new.base_loyer_hc := v_loyer;
  end if;
  if v_charges is not null then
    new.charges := m.charges;
    new.base_charges := v_charges;
  end if;
  new.montant_du := new.loyer_hc + new.charges;
  return new;
end;
$fonction$;

revoke all on function public.appliquer_revision_a_l_appel() from public, anon, authenticated, service_role;

-- PHRASE 3 (constat 5). Les révisions du bail du locataire connecté sont rendues dans un ordre fixe : premier terme, puis
-- date d'enregistrement, puis date d'effet (unique par bail). L'application prend la première en attente : son « ancien
-- loyer » est le loyer du terme en cours. Mêmes colonnes, même contrôle de l'appelant (`mon_bail_locataire`), mêmes droits
-- que la version de la migration 20261124130000 : seul l'ordre est complété.
create or replace function public.revisions_de_mon_loyer_locataire(p_org uuid)
returns table(bail_id uuid, ancien_loyer numeric, nouveau_loyer numeric, premier_terme date)
language sql
stable
security definer
set search_path to ''
as $fonction$
  select rv.bail_id, rv.ancien_loyer, rv.nouveau_loyer, rv.premier_terme
    from public.revisions_loyer rv
   where rv.organization_id = p_org
     and rv.premier_terme is not null
     and rv.bail_id in (select mb.bail_id from public.mon_bail_locataire(p_org) mb)
   order by rv.premier_terme, rv.created_at, rv.date_effet;
$fonction$;

revoke all on function public.revisions_de_mon_loyer_locataire(uuid) from public, anon;
grant execute on function public.revisions_de_mon_loyer_locataire(uuid) to authenticated, service_role;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
