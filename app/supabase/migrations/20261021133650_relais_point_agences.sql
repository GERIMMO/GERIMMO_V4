-- Compteur des agences en attente dans le relais quotidien existant.
-- Lecture seule, aucun contact dans le résultat, aucune tâche ni alerte supplémentaire.
-- SECURITY INVOKER : le rôle serveur conserve ses propres droits, sans élévation.
create or replace function public.agences_en_attente_relais()
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement';
  end if;
  return (select jsonb_build_object('en_attente', count(*))
    from public.liste_attente_agences where statut = 'en_attente');
end;
$$;
comment on function public.agences_en_attente_relais() is
  'Nombre d’agences en attente pour le relais quotidien, sans donnée personnelle. Lecture réservée au traitement.';
revoke all on function public.agences_en_attente_relais() from public, anon, authenticated;
grant execute on function public.agences_en_attente_relais() to service_role;
select public.fermer_fonctions_a_anon();
