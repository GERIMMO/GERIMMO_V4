-- Une fiche historique peut rester sans identifiant jusqu’à sa saisie.
alter table public.persons add column siren text
  check (siren is null or (siren ~ '^[0-9]{9}$' and qualite is not null and qualite in ('SCI','SCI familiale','Personne morale')));
notify pgrst, 'reload schema';
