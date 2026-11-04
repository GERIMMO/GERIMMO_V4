-- Rétablir le code précédent. Refus atomique si la discussion contient un historique.
do $retour_atomique$ begin
 if to_regclass('public.intervention_messages') is not null then
  lock table public.intervention_messages in access exclusive mode;
  if exists(select 1 from public.intervention_messages) then raise exception 'Retour refusé : conserver les messages des interventions.'; end if;
 end if;
 if to_regclass('public.intervention_echanges_etat') is not null then
  lock table public.intervention_echanges_etat in access exclusive mode;
  if exists(select 1 from public.intervention_echanges_etat) then raise exception 'Retour refusé : conserver les clôtures des discussions.'; end if;
 end if;
drop function if exists public.contexte_echange_intervention(uuid);
drop function if exists public.fermer_echange_intervention(uuid,boolean);
drop function if exists public.envoyer_message_intervention(uuid,text,uuid);
drop table if exists public.intervention_messages;
drop table if exists public.intervention_echanges_etat;
drop function if exists public.role_echange_intervention(uuid);
delete from supabase_migrations.schema_migrations where version='20261101190943';
end $retour_atomique$;
