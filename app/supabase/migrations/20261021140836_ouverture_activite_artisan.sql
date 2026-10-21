-- Demande directe du dirigeant le 21 octobre : une base fonctionnelle complète.
-- Ouvre les deux modules métier existants, sans modifier RLS, rôles ou propriété.
-- Les règlements sont des déclarations manuelles avec preuve, pas des paiements bancaires.
do $ouverture$
begin
  if (select count(*) from public.artisan_modules_locaux where code in ('clients','reglements')) <> 2 then
    raise exception 'Modules artisans absents : vérifier le schéma avant ouverture';
  end if;
  update public.artisan_modules_locaux set actif=true where code in ('clients','reglements');
end $ouverture$;
