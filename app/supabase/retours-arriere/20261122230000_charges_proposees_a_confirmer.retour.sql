-- RETOUR ARRIÈRE de 20261122230000_charges_proposees_a_confirmer.sql (audit palier 1, P0-03 : une nature « récupérable »
-- proposée par la machine doit être confirmée avant la validation d'un appel de charges).
--
-- Rend à `valider_ventilation` son corps d'avant, celui de la migration 20260801_s8 : seuls les postes « à qualifier »
-- et un total inexact bloquent la validation. Aucune donnée n'est modifiée.
--
-- ATTENTION : après ce retour, un poste « récupérable » par proposition, jamais confirmé, passe de nouveau la validation
-- et entre dans la régularisation des charges du locataire. À ne jouer que pour revenir à une version antérieure de
-- l'application. Atomique et rejouable.
do $retour$
begin
  execute $ancienne$
create or replace function public.valider_ventilation(p_appel uuid)
returns void language plpgsql security definer set search_path = '' as $f$
declare v record; v_somme numeric; v_aqualifier integer;
begin
  select * into v from public.appels_charges where id = p_appel;
  if v.id is null then raise exception 'Appel introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'fige' then raise exception 'Appel figé : plus de ventilation possible'; end if;
  select coalesce(sum(montant), 0), count(*) filter (where nature = 'a_qualifier')
    into v_somme, v_aqualifier
    from public.appel_charges_postes where appel_id = p_appel;
  if v_aqualifier > 0 then
    raise exception '% poste(s) restent à qualifier — ventilation bloquée (RM-0c.3.3)', v_aqualifier;
  end if;
  if round(v_somme, 2) <> round(v.total, 2) then
    raise exception 'Total des postes (% €) différent du total de l''appel (% €) — bloquant (RM-0c.2.2)',
      round(v_somme, 2), round(v.total, 2);
  end if;
  update public.appels_charges set statut = 'ventile' where id = p_appel;
end $f$;
$ancienne$;
  revoke execute on function public.valider_ventilation(uuid) from public, anon;
  delete from supabase_migrations.schema_migrations where version = '20261122230000';
end $retour$;
notify pgrst, 'reload schema';
