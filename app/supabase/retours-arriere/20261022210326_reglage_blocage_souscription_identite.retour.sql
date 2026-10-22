-- Revenir d'abord au code précédent, qui ignore cette colonne et exige
-- toujours une identité complète. Retirer ensuite les droits du bouton.
-- La décision et son historique sont conservés, sans effacement de données.
do $retour_atomique$
begin
perform set_config('lock_timeout', '10s', true);
revoke select(blocage_souscription_identite), update(blocage_souscription_identite)
  on public.supervision_identite from authenticated;
delete from supabase_migrations.schema_migrations where version='20261022210326';
end;
$retour_atomique$;
