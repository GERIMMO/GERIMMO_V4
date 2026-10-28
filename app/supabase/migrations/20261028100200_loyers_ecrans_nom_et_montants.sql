-- Audit final du 27/10 (chantier « loyers — écrans et textes », LOY-10 et LOY-11) : le nom du locataire et les montants des
-- alertes s'écrivent comme partout ailleurs dans l'application.
--
-- LOY-10. `rappels_loyers_proprietaire` (20261026090335) rendait « Prénom Nom » (concat_ws(' ', p.prenom, p.nom)) : la carte
-- « Avez-vous reçu vos loyers ? » et « À faire » affichaient « Paul Durand » quand le quittancement, la fiche du bail et les
-- alertes écrivent « Durand Paul » (quittancement_mois, nomComplet de roles-personnes.ts). La fonction est reprise à l'identique
-- de sa dernière définition, seul l'ordre des deux colonnes change : nom, puis prénom.
--
-- LOY-11. `suivre_impayes_bail` (dernière définition : 20261027100000) écrivait le montant du titre avec
-- to_char(v_du, 'FM999999990.00') : « 1400,00 € dus » à côté de « 1 400,00 € » partout à l'écran. Une fonction `montant_fr`
-- formate désormais un montant à la française, indépendamment de lc_numeric (to_char avec G et D suivrait la locale de la
-- session) : groupes de trois chiffres séparés par une espace fine insécable (U+202F), virgule décimale, deux décimales,
-- espace insécable (U+00A0) avant le symbole — exactement ce que rend eur() dans l'application. `suivre_impayes_bail` est
-- reprise à l'identique de 20261027100000, seul le formatage du montant change ; elle garde une seule occurrence de
-- `public.aujourdhui_paris()` (le retour de 20261014501000 en compte une).
--
-- Aucune donnée existante n'est réécrite : les titres des alertes déjà ouvertes se mettent au nouveau format au prochain
-- encaissement de leur bail ou au passage de nuit (suivre_impayes_bail met le titre à jour quand il diffère).
-- Rejouable : create or replace, signatures inchangées.
-- Retour arrière : supabase/retours-arriere/20261028100200_loyers_ecrans_nom_et_montants.retour.sql

-- Un montant à la française : « 1 400,00 € », « 256,66 € », « 1 234 567,89 € », « -1 400,50 € » pour un négatif.
create or replace function public.montant_fr(p_montant numeric)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(split_part(to_char(p_montant, 'FM999999999999999990.00'), '.', 1), '(\d)(?=(\d{3})+$)', E'\\1\u202f', 'g')
         || ',' || split_part(to_char(p_montant, 'FM999999999999999990.00'), '.', 2) || E'\u00a0€';
$$;
comment on function public.montant_fr(numeric) is
  'Un montant écrit comme à l''écran : groupes de milliers par une espace fine insécable, virgule, deux décimales, espace insécable avant €. Indépendant de lc_numeric.';
revoke execute on function public.montant_fr(numeric) from public, anon;
grant execute on function public.montant_fr(numeric) to authenticated;

create or replace function public.rappels_loyers_proprietaire(p_org uuid)
returns table(appel_id uuid,bail_id uuid,lot_nom text,locataire text,periode date,date_echeance date,
  montant_du numeric,montant_couvert numeric,non_recu_signale_le timestamptz)
language sql stable security invoker set search_path='' as $$
  select e.appel_id,b.id,l.nom,
    nullif(concat_ws(' ',p.nom,p.prenom),''),e.periode,e.date_echeance,e.montant_du,e.montant_couvert,s.signale_le
  from public.baux b
  join public.organizations o on o.id=b.organization_id and o.type='proprietaire_direct'
  join public.lots l on l.id=b.lot_id and l.organization_id=p_org
  left join public.persons p on p.id=b.locataire_principal and p.organization_id=p_org
  cross join lateral public.etat_loyers_bail(b.id) e
  left join public.receptions_loyers_signalees s on s.appel_id=e.appel_id and s.organization_id=p_org
  where b.organization_id=p_org and b.etat in ('actif','preavis','termine')
    and p_org in (select public.org_ids_avec_roles(array['proprietaire_direct']::public.membership_role[]))
    and e.montant_couvert<e.montant_du
  order by e.date_echeance,e.periode,e.appel_id;
$$;
revoke all on function public.rappels_loyers_proprietaire(uuid) from public,anon;
grant execute on function public.rappels_loyers_proprietaire(uuid) to authenticated;

create or replace function public.suivre_impayes_bail(p_bail uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_termes int;
  v_du numeric;
  v_depuis date;
  v_qui text;
  v_titre text;
  v_details jsonb;
  v_posee integer;
begin
  select b.id, b.organization_id, b.locataire_principal, l.nom as lot_nom
    into v
  from public.baux b
  left join public.lots l on l.id = b.lot_id
  where b.id = p_bail;
  if v.id is null then return 0; end if;

  -- Ce qui reste dû sur les termes DÉJÀ ÉCHUS. L'imputation étant du plus
  -- ancien au plus récent (RM-3.3.2), ce sont les premiers de la liste.
  select count(*) filter (where e.montant_du > e.montant_couvert),
         coalesce(sum(e.montant_du - e.montant_couvert) filter (where e.montant_du > e.montant_couvert), 0),
         min(e.date_echeance) filter (where e.montant_du > e.montant_couvert)
    into v_termes, v_du, v_depuis
  from public.etat_loyers_bail_brut(p_bail) e
  where e.date_echeance < public.aujourdhui_paris();

  if v_termes = 0 or v_du <= 0 then
    -- Soldé : l'alerte se ferme d'elle-même, avec son motif, et reste à
    -- l'historique (mécanique du 29/08 sur l'origine des alertes). Comme
    -- fermer_alertes_origine, mais sans auteur même sous la session du compte
    -- qui a encaissé : « Fermée automatiquement », et seule une fermeture sans
    -- auteur se rouvre (audit du 27/10, LAT-01).
    update public.alerts
       set statut = 'fermee', closed_at = now(), closed_by = null, closed_action = 'Impayé soldé'
     where organization_id = v.organization_id and statut = 'ouverte'
       and origine_type = 'bail' and origine_id = p_bail and type = 'loyer_impaye';
    return 0;
  end if;

  -- La dette revient (règlement annulé, nouveau terme impayé) : l'alerte fermée
  -- d'elle-même n'a jamais été traitée, elle se rouvre (audit du 27/10, LAT-01).
  -- Une fermeture à la main porte son auteur : elle reste fermée, quel que soit son texte.
  update public.alerts a
     set statut = 'ouverte', closed_at = null, closed_by = null, closed_action = null
   where a.id = (select x.id from public.alerts x
                  where x.organization_id = v.organization_id and x.type = 'loyer_impaye'
                    and x.origine_type = 'bail' and x.origine_id = p_bail
                  order by x.created_at desc, x.id desc limit 1)
     and a.statut = 'fermee' and a.closed_action = 'Impayé soldé' and a.closed_by is null
     and not exists (select 1 from public.alerts o
                      where o.organization_id = v.organization_id and o.type = 'loyer_impaye'
                        and o.origine_type = 'bail' and o.origine_id = p_bail and o.statut = 'ouverte');

  select p.nom || coalesce(' ' || p.prenom, '') into v_qui
  from public.persons p where p.id = v.locataire_principal;

  v_titre := format('Loyer impayé — %s%s : %s dus depuis le %s',
           coalesce(v_qui, 'locataire'),
           coalesce(' (' || v.lot_nom || ')', ''),
           public.montant_fr(v_du),
           to_char(v_depuis, 'DD/MM/YYYY'));
  v_details := jsonb_build_object('bail_id', p_bail, 'montant_du', v_du, 'termes', v_termes,
                       'depuis', v_depuis);
  v_posee := public.poser_alerte_seuil(
    v.organization_id, 'loyer_impaye', 'bail_id', p_bail, v_termes::text,
    case when v_termes >= 2 then 'critique'::public.alerte_criticite
         else 'normale'::public.alerte_criticite end,
    v_titre, v_details, v_depuis);
  -- poser_alerte_seuil ne touche une alerte ouverte que si son seuil ou sa criticité change : le montant et la date
  -- suivent ici le dernier encaissement (règlement partiel au même nombre de termes, alerte rouverte).
  update public.alerts a
     set titre = v_titre, echeance = v_depuis, details = a.details || v_details
   where a.organization_id = v.organization_id and a.type = 'loyer_impaye' and a.statut = 'ouverte'
     and a.origine_type = 'bail' and a.origine_id = p_bail
     and (a.titre is distinct from v_titre or a.echeance is distinct from v_depuis);
  return v_posee;
end;
$$;
comment on function public.suivre_impayes_bail(uuid) is
  'Pose, met à jour, ferme ou rouvre l''alerte d''impayé d''un bail. Appelée par la tâche de nuit et après chaque encaissement. Constate, ne relance pas. Montant du titre au format français (montant_fr).';
revoke execute on function public.suivre_impayes_bail(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
