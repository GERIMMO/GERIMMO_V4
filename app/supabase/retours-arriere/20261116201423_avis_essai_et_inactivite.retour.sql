-- RETOUR ARRIÈRE de 20261116201423. Sur un schéma antérieur, aucune action.
do $retour$
begin
  if to_regprocedure('public.finaliser_avant_avis_echeances(text)') is not null
     or exists (select from supabase_migrations.schema_migrations where version='20261116201423') then
    raise exception 'Retour refusé. Conserver les preuves de livraison et les obligations de préavis et corriger en avant.';
  end if;
end $retour$;
