-- AUDIT SÉCURITÉ DU 27/09 — MINEUR : SUPPRESSION D'ENCAISSEMENT SANS MOTIF.
--
-- L'écran exige un motif et passe par `supprimer_encaissement(p_motif)` (ou
-- `supprimer_encaissement_depot`), qui le transmet à la contre-écriture. Mais
-- la politique DELETE laissait aussi `DELETE /rest/v1/encaissements` passer
-- en direct : la contre-écriture, créée par un déclencheur definer, échappait
-- à la règle « motif obligatoire » (RM-A6.6) et rien n'allait au journal.
--
-- LA CORRECTION. Un déclencheur BEFORE DELETE sur `encaissements` et
-- `depot_encaissements` :
--  · refuse la suppression faite par un compte connecté sans motif (le motif
--    n'existe que si la suppression passe par les fonctions prévues, qui le
--    posent pour la seule durée du geste) ;
--  · inscrit chaque suppression au journal d'audit, avec le motif.
-- Les suppressions en cascade (un bail supprimé par la supervision) et celles
-- des traitements sans utilisateur ne sont pas visées : elles ne sont pas un
-- geste de correction comptable.
--
-- Idempotent : CREATE OR REPLACE, DROP TRIGGER IF EXISTS.

create or replace function public.suppression_encaissement_exige_motif()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_motif text := public.motif_de_contre_ecriture();
begin
  if v_uid is not null and pg_trigger_depth() = 1 and v_motif is null then
    raise exception 'Motif obligatoire pour supprimer un encaissement' using errcode = '23514';
  end if;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (v_uid, old.organization_id,
          case tg_table_name when 'depot_encaissements' then 'suppression_encaissement_depot'
                             else 'suppression_encaissement' end,
          jsonb_build_object('encaissement_id', old.id, 'bail_id', old.bail_id,
                             'montant', old.montant, 'motif', v_motif));
  return old;
end $$;

revoke execute on function public.suppression_encaissement_exige_motif() from public, anon, authenticated;

drop trigger if exists encaissements_suppression_motif on public.encaissements;
create trigger encaissements_suppression_motif
  before delete on public.encaissements
  for each row execute function public.suppression_encaissement_exige_motif();

drop trigger if exists depot_encaissements_suppression_motif on public.depot_encaissements;
create trigger depot_encaissements_suppression_motif
  before delete on public.depot_encaissements
  for each row execute function public.suppression_encaissement_exige_motif();

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
