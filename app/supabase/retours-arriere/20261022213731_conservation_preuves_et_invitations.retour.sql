-- Retour fonctionnel sans perte : suspend les nouveaux nettoyages, conserve
-- les règles et la protection des preuves (ne pas réintroduire la purge à 24 mois).
-- Les modifications de durée restent disponibles pour une reprise contrôlée.
begin;
update public.retention_rules set actif=false where data_type in
 ('contact:attente','contact:attente_agences','invitation:locataire','invitation:artisan');
revoke execute on function public.simuler_conservation_contacts() from authenticated;
delete from supabase_migrations.schema_migrations where version='20261022213731';
commit;
