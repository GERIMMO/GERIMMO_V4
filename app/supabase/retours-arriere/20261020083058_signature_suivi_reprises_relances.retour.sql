-- Remettre le code précédent ; conserver les dates et traces contre tout double rappel.
do $retour_atomique$
declare d text; ancien constant text := $a$array['etat','signataires','external_request_id','external_document_id','document_signe','erreur','updated_at','verrou_jeton','verrou_jusqua']$a$;
 nouveau constant text := $b$array['etat','signataires','external_request_id','external_document_id','document_signe','erreur','updated_at','verrou_jeton','verrou_jusqua','envoye_le']$b$;
begin
 select pg_get_functiondef('public.refuser_ecriture_si_fermee()'::regprocedure) into d;
 if (length(d)-length(replace(d,nouveau,'')))=2*length(nouveau) and strpos(d,ancien)=0 then
  execute replace(d,nouveau,ancien);
 elsif (length(d)-length(replace(d,ancien,'')))<>2*length(ancien) or strpos(d,nouveau)>0 then
  raise exception 'Garde signature : listes de retour inattendues';
 end if;
 execute $retour$
 set local lock_timeout='10s';
 drop function if exists public.reserver_relance_signature(uuid,integer,uuid);
 drop function if exists public.alerter_suivi_signature(uuid,text);
 drop function if exists public.circuits_signature_a_suivre(text,text);
 drop function if exists public.rapprocher_brouillon_signature(uuid,uuid,text,text,text[]);
 drop index if exists public.signature_circuits_envoyes;
 revoke all on public.signature_suivi_actions from public,anon,authenticated,service_role;
 delete from supabase_migrations.schema_migrations where version='20261020083058';
 $retour$;
end $retour_atomique$;
