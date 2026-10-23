-- Retour de 20261023162446_souscription_unique_et_trace_hausse.sql (défauts A01 et A02, audit du 23/10/2026).
-- Revenir D'ABORD au code précédent : le code de cette livraison appelle les quatre fonctions retirées ici ; sans elles,
-- il refuse d'ouvrir une page de paiement (« réservation indisponible ») au lieu d'en ouvrir deux.
-- Instruction atomique : participe à une transaction externe sans la valider.
-- Conserve la table public.intentions_souscription et son historique (aucune donnée bancaire ni personnelle), et les
-- lignes d'audit abonnement_hausse_non_appliquee déjà écrites : aucune donnée effacée sans décision. La réapplication
-- de la migration les retrouve telles quelles.
do $retour_atomique$
declare
  d text;
  ancien text := $a$'automation_events', 'orchestration_cases', 'orchestration_history',
                           -- A01 (23/10/2026) : la réservation de la page de paiement d'un compte gelé.
                           'intentions_souscription'];$a$;
  nouveau text := $n$'automation_events', 'orchestration_cases', 'orchestration_history'];$n$;
begin
  perform set_config('lock_timeout', '10s', true);
  drop function if exists public.intention_souscription_reserver(uuid, text, integer, integer);
  drop function if exists public.intention_souscription_poser(uuid, uuid, text, text);
  drop function if exists public.intention_souscription_terminer(uuid, uuid, text);
  drop function if exists public.abonnement_hausse_tracer(uuid, text, jsonb);
  -- La liste « jamais gardées » de poser_gardes_abonnement() reprend sa forme d'avant (compte exact, sinon arrêt).
  select pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure) into d;
  if strpos(d, $q$'intentions_souscription'$q$) > 0 then
    if (length(d) - length(replace(d, ancien, ''))) / length(ancien) <> 1 then
      raise exception 'poser_gardes_abonnement : forme A01 inattendue, rien n''est modifié';
    end if;
    execute replace(d, ancien, nouveau);
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261023162446';
  end if;
end;
$retour_atomique$;
