-- Audit de la PR #264 (27/10, LAT-01) : l'alerte d'impayé suit les encaissements, sans attendre la nuit.
--
-- Avant : `suivre_impayes_bail` n'était appelée que par la tâche de 5 h 30 UTC. Un loyer soldé depuis le tableau de bord
-- (`declarer_reception_loyer`) ou depuis le bail (`encaisser_reste_atomique`, saisie détaillée) laissait l'alerte
-- « Loyer impayé » ouverte jusqu'au lendemain : l'accueil la présentait comme l'action prioritaire d'un bail à jour.
-- Une alerte fermée d'elle-même (« Impayé soldé ») ne revenait pas non plus quand la dette revenait (règlement annulé,
-- nouveau terme impayé au même nombre de termes) : `poser_alerte_seuil` ne recrée jamais un seuil déjà vu.
--
-- Maintenant :
--  1. un déclencheur AFTER INSERT / UPDATE (bail, montant) / DELETE sur `encaissements` rappelle `suivre_impayes_bail`
--     pour le bail touché : tous les chemins d'écriture sont couverts, aucune lecture ne ferme une alerte. Mêmes baux
--     que la tâche de nuit (actif, préavis, terminé ; organisation dont l'écriture est ouverte), et seulement si le bail
--     a déjà une alerte ouverte ou fermée « Impayé soldé » : la nuit reste seule à poser une alerte nouvelle, un
--     encaissement saisi ou retiré (reprise, nettoyage) n'en crée jamais ;
--  2. `suivre_impayes_bail` rouvre la dernière alerte du bail si elle a été fermée « Impayé soldé » par la base
--     (fermeture automatique, jamais un traitement) et qu'aucune n'est ouverte, puis la met au seuil du jour. Une alerte
--     fermée à la main reste fermée, même avec le texte « Impayé soldé » : la règle de `poser_alerte_seuil` s'applique
--     comme avant. Aucun doublon : on ne rouvre qu'en l'absence d'alerte ouverte, et `poser_alerte_seuil` met à jour
--     l'alerte ouverte au lieu d'en créer une. La fermeture automatique se reconnaît à `closed_by` nul : l'écran
--     (actions/alertes.ts) renseigne toujours le compte, et « Historique des alertes » affiche « Fermée
--     automatiquement » pour un `closed_by` nul. `suivre_impayes_bail` ferme donc son alerte elle-même, `closed_by`
--     nul, même appelée dans la session du propriétaire qui a déclaré la réception (`fermer_alertes_origine` y
--     inscrirait son compte) ;
--  3. le titre (montant, date de départ) et l'échéance de l'alerte ouverte suivent la dette du jour, même quand le
--     nombre de termes ne change pas (règlement partiel, alerte rouverte) : `poser_alerte_seuil`, partagée avec d'autres
--     alertes, n'est pas modifiée.
--
-- `suivre_impayes_bail` repart de sa dernière définition (20260911200000, jour de Paris posé par 20261014501000) : seul
-- le bloc de réouverture est ajouté. Elle garde une seule occurrence de `public.aujourdhui_paris()` (le retour de
-- 20261014501000 en compte une). Aucune donnée existante n'est réécrite par la migration : les alertes déjà ouvertes
-- d'un bail soldé se ferment au prochain encaissement de ce bail ou au passage de nuit, comme avant.
-- Rejouable : create or replace, drop trigger if exists.
-- Retour arrière : supabase/retours-arriere/20261027100000_alerte_impaye_suit_encaissements.retour.sql

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
           replace(to_char(v_du, 'FM999999990.00'), '.', ',') || ' €',
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
  'Pose, met à jour, ferme ou rouvre l''alerte d''impayé d''un bail. Appelée par la tâche de nuit et après chaque encaissement. Constate, ne relance pas.';
revoke execute on function public.suivre_impayes_bail(uuid) from public, anon, authenticated;

-- Le déclencheur : chaque écriture d'encaissement actualise l'alerte de son bail (et de l'ancien bail si une
-- correction l'a déplacé). Les écritures sans effet sur le reste dû (note, mode) ne le réveillent pas.
create or replace function public.encaissement_actualise_impaye()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_bail uuid;
begin
  for v_bail in
    select distinct b.id from public.baux b
     where b.id in (case when tg_op <> 'DELETE' then new.bail_id end,
                    case when tg_op <> 'INSERT' then old.bail_id end)
       and b.etat in ('actif', 'preavis', 'termine')
       and public.org_ecriture_ouverte(b.organization_id)
       -- La tâche de nuit reste seule à poser une alerte nouvelle : on n'actualise que l'alerte du bail encore ouverte,
       -- ou fermée d'elle-même (« Impayé soldé », sans auteur). Une alerte fermée à la main n'est pas reprise.
       and exists (select 1 from public.alerts a
                    where a.id = (select x.id from public.alerts x
                                   where x.organization_id = b.organization_id and x.type = 'loyer_impaye'
                                     and x.origine_type = 'bail' and x.origine_id = b.id
                                   order by (x.statut = 'ouverte') desc, x.created_at desc, x.id desc limit 1)
                      and (a.statut = 'ouverte' or (a.closed_action = 'Impayé soldé' and a.closed_by is null)))
  loop
    perform public.suivre_impayes_bail(v_bail);
  end loop;
  return null; -- AFTER trigger
end;
$$;
revoke execute on function public.encaissement_actualise_impaye() from public, anon, authenticated;

drop trigger if exists encaissement_impaye on public.encaissements;
create trigger encaissement_impaye
  after insert or update of bail_id, montant or delete on public.encaissements
  for each row execute function public.encaissement_actualise_impaye();

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
