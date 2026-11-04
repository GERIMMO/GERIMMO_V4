drop function if exists public.contexte_echange_intervention(uuid);
drop function if exists public.fermer_echange_intervention(uuid,boolean);
drop function if exists public.envoyer_message_intervention(uuid,text,uuid);
drop table if exists public.intervention_messages;
drop table if exists public.intervention_echanges_etat;
drop function if exists public.role_echange_intervention(uuid);
