-- RETOUR ARRIÈRE de 20261122140000_incident_urgence_corrigee.sql (audit palier 1, P1-04).
--
-- Supprime la fonction de correction de l'urgence. Les urgences déjà corrigées restent à leur niveau corrigé, et leur
-- trace reste au fil des dossiers : rien n'est effacé. Pour cette raison, le type d'événement « urgence_corrigee »
-- n'est retiré de la liste fermée QUE si aucun dossier ne le porte ; sinon la liste garde ce type, sans autre effet
-- (aucun code ne peut plus en écrire).
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente. Rejouable.
do $retour$
declare
  v_def text;
  v_nouvelle text;
begin
  drop function if exists public.corriger_urgence_incident(uuid, uuid, public.incident_urgence, text);
  if not exists (select 1 from public.incident_evenements where type = 'urgence_corrigee') then
    select pg_get_constraintdef(c.oid) into v_def
      from pg_constraint c
     where c.conrelid = 'public.incident_evenements'::regclass and c.conname = 'incident_evenements_type_check';
    if v_def is not null and position(', ''urgence_corrigee''::text])))' in v_def) > 0 then
      v_nouvelle := replace(v_def, ', ''urgence_corrigee''::text])))', '])))');
      alter table public.incident_evenements drop constraint incident_evenements_type_check;
      execute 'alter table public.incident_evenements add constraint incident_evenements_type_check ' || v_nouvelle;
    end if;
  end if;
  delete from supabase_migrations.schema_migrations where version = '20261122140000';
end $retour$;
notify pgrst, 'reload schema';
