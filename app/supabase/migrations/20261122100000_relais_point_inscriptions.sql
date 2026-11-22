-- LES INSCRIPTIONS DANS L'E-MAIL DE 5 H DU RELAIS (acquisition, 22/11/2026).
--
-- LE BESOIN. Le dirigeant cherche ses premiers clients et ne répond qu'aux appels. Rien ne lui dit qu'un propriétaire
-- vient d'ouvrir un espace : il faut ouvrir la console pour le voir. Le 22/11, il a précisé que les espaces présents
-- jusque-là sont des comptes de test : le premier vrai inscrit doit donc se remarquer le lendemain matin.
--
-- LA RÈGLE. Un point AU TOTAL dans l'e-mail de 5 h dès qu'au moins un espace de propriétaire a été ouvert dans les
-- dernières 24 h, comme pour les agences en attente (20261021133650). Le bloc donne cinq nombres : ouverts en 24 h, sur
-- 7 jours, au total ; et, parmi tous, combien n'ont aucun bien et combien ont un bail en cours. Sans inscription dans
-- les 24 h : aucun point, aucun e-mail de plus (l'e-mail ne part que s'il y a quelque chose à signaler).
--
-- CE QUI EST COMPTÉ. Les organisations de type « proprietaire_direct » non archivées. Une agence n'ouvre pas son espace
-- elle-même : elle passe par la liste d'attente, déjà comptée par `agences_en_attente_relais`. Les demandes de rappel
-- (« Être rappelé ») vivent dans `demandes_devis` : `demandes_contact_en_attente` les compte déjà.
--   · sans bien : aucun bien non archivé dans l'espace ;
--   · bail en cours : au moins un bail « actif » ou « preavis ».
--
-- CETTE MIGRATION pose UNE fonction nouvelle, `inscriptions_relais()`, et ne touche à rien d'autre : aucune table,
-- aucune politique, aucune tâche pg_cron, aucune donnée lue ni réécrite par la migration.
--
-- Ce qu'elle rend : cinq nombres. Jamais un nom, une adresse ni un identifiant. Le registre du relais
-- (`terminer_alerte_relais`) n'accepte d'ailleurs que des nombres dans ses compteurs.
--
-- Réservée au traitement (service_role), comme les autres lectures du relais ; fermée à public, anon et authenticated.
-- SECURITY INVOKER : le rôle serveur lit avec ses propres droits, sans élévation.
-- Rejouable : `create or replace`. Retour arrière : supabase/retours-arriere/20261122100000_relais_point_inscriptions.retour.sql
create or replace function public.inscriptions_relais()
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement';
  end if;
  return (
    select jsonb_build_object(
      'depuis_24h', count(*) filter (where o.created_at >= now() - interval '24 hours'),
      'depuis_7j', count(*) filter (where o.created_at >= now() - interval '7 days'),
      'espaces', count(*),
      'sans_bien', count(*) filter (where not exists (
        select 1 from public.biens b where b.organization_id = o.id and b.archived_at is null)),
      'bail_en_cours', count(*) filter (where exists (
        select 1 from public.baux x
         where x.organization_id = o.id
           and x.etat in ('actif'::public.bail_etat, 'preavis'::public.bail_etat))))
    from public.organizations o
    where o.type = 'proprietaire_direct'::public.organization_type
      and o.status <> 'archivee'::public.organization_status
  );
end;
$$;
comment on function public.inscriptions_relais() is
  'Les espaces de propriétaires pour l''e-mail de 5 h du relais (22/11/2026) : cinq nombres (ouverts en 24 h, sur 7 jours, au total, sans bien, avec un bail en cours), jamais une donnée personnelle. Lecture réservée au traitement.';
revoke all on function public.inscriptions_relais() from public, anon, authenticated;
grant execute on function public.inscriptions_relais() to service_role;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();
-- La fonction est appelée par le serveur à travers l'API : celle-ci doit la connaître avant le passage de 5 h.
notify pgrst, 'reload schema';
