-- Métiers et zone d'un artisan : jamais modifiables par un propriétaire direct (relecture du 15/10/2026 du lot
-- « invitation-artisan », constat bloquant).
--
-- Constat : `artisan_definir_metiers_zones` (20260911180000) autorise tout membre actif `admin_agence`, `agent` ou
-- `proprietaire_direct` d'une organisation qui a l'artisan dans son carnet (`artisan_agences`). Jusqu'ici, aucun
-- propriétaire direct n'avait d'artisan dans son carnet (l'ajout par SIRET est réservé aux agences) : la mention
-- `proprietaire_direct` était sans effet. L'invitation d'un artisan (20261014840000) l'ouvre : une fois l'invitation
-- acceptée, le propriétaire pouvait réécrire la zone et les métiers de l'artisan — un profil GLOBAL (RM-A1.8), commun à
-- toutes les organisations et au réseau — et, en ajoutant le code postal de son bien, le solliciter hors de sa zone,
-- commune fermée comprise. La règle du carnet (« la zone de l'artisan couvre le code postal du bien ») ne tenait plus.
--
-- Correctif : la fonction n'admet plus le rôle `proprietaire_direct`. Restent autorisés, comme avant : l'artisan
-- lui-même (son espace), la supervision, et les agences (admin_agence, agent) pour un artisan de leur carnet — la fiche
-- de l'agence le dit déjà (« ce profil est public : métiers et zone appartiennent à l'artisan »). Rien d'autre ne change
-- (corps, droits). Aucune ligne n'est touchée.
--
-- Modèle de rejeu à marques (20261013120000) : la définition en vigueur est RELUE (pg_get_functiondef), l'ancre est
-- remplacée, la marque du correctif est posée dans le corps. Rejouée, la migration trouve sa marque et ne fait rien ;
-- si l'ancre manque ou se répète, elle s'arrête (dans la transaction de `migrations.yml`, rien ne subsiste).
-- Retour arrière : app/supabase/retours-arriere/20261014841000_metiers_zones_sans_proprietaire.retour.sql.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

do $correctif$
declare
  v_def text;
  c_ancre constant text := $ancre$and m.role in ('admin_agence','agent','proprietaire_direct'))$ancre$;
  c_nouveau constant text := $nouveau$and m.role in ('admin_agence','agent')) -- Relecture du 15/10 (invitation d'artisan) : jamais un propriétaire direct, voir 20261014841000.$nouveau$;
begin
  select pg_get_functiondef('public.artisan_definir_metiers_zones(uuid,public.artisan_metier[],text[])'::regprocedure) into v_def;
  if position($marque$Relecture du 15/10 (invitation d'artisan)$marque$ in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, c_ancre, ''))) <> length(c_ancre) then
    raise exception 'Correctif 20261014841000 : définition inattendue de artisan_definir_metiers_zones (ancre absente ou répétée)';
  end if;
  execute replace(v_def, c_ancre, c_nouveau);
end $correctif$;

-- Droits explicites, identiques à ceux en vigueur : les clients connectés (l'artisan, l'agence), jamais `anon` ni PUBLIC.
revoke all on function public.artisan_definir_metiers_zones(uuid, public.artisan_metier[], text[]) from public, anon;
grant execute on function public.artisan_definir_metiers_zones(uuid, public.artisan_metier[], text[]) to authenticated;

select public.fermer_fonctions_a_anon();
