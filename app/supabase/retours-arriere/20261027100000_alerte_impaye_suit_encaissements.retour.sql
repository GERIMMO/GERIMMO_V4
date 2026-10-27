-- Retour de 20261027100000 : l'alerte d'impayé ne suit plus que la tâche de nuit.
-- Retire le déclencheur des encaissements et rend à suivre_impayes_bail sa définition précédente (20260911200000,
-- jour de Paris de 20261014501000 : une seule occurrence de public.aujourdhui_paris()). Aucune alerte n'est modifiée :
-- celles rouvertes ou fermées par le déclencheur gardent leur état, la tâche de nuit reprend la main.
begin;
set local lock_timeout = '10s';
drop trigger if exists encaissement_impaye on public.encaissements;
drop function if exists public.encaissement_actualise_impaye();
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
    -- l'historique (mécanique du 29/08 sur l'origine des alertes).
    perform public.fermer_alertes_origine(
      v.organization_id, 'bail', p_bail, 'Impayé soldé', array['loyer_impaye']);
    return 0;
  end if;

  select p.nom || coalesce(' ' || p.prenom, '') into v_qui
  from public.persons p where p.id = v.locataire_principal;

  return public.poser_alerte_seuil(
    v.organization_id, 'loyer_impaye', 'bail_id', p_bail, v_termes::text,
    case when v_termes >= 2 then 'critique'::public.alerte_criticite
         else 'normale'::public.alerte_criticite end,
    format('Loyer impayé — %s%s : %s dus depuis le %s',
           coalesce(v_qui, 'locataire'),
           coalesce(' (' || v.lot_nom || ')', ''),
           replace(to_char(v_du, 'FM999999990.00'), '.', ',') || ' €',
           to_char(v_depuis, 'DD/MM/YYYY')),
    jsonb_build_object('bail_id', p_bail, 'montant_du', v_du, 'termes', v_termes,
                       'depuis', v_depuis),
    v_depuis);
end;
$$;
comment on function public.suivre_impayes_bail(uuid) is
  'Pose ou ferme l''alerte d''impayé d''un bail. Constate, ne relance pas : le circuit de relance (plancher + délais) est paramétrable par agence, module 18.';
revoke execute on function public.suivre_impayes_bail(uuid) from public, anon, authenticated;
delete from supabase_migrations.schema_migrations where version = '20261027100000';
commit;
