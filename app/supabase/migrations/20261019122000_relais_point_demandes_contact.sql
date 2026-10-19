-- M16 (audit du 19/10/2026) — les demandes de contact du site vitrine dans l'e-mail de 5 h du relais.
--
-- LE DÉFAUT. Les demandes du formulaire de contact du site (table `demandes_devis`, écrite par l'action serveur après le
-- pot de miel ; « statut traité » = colonne `traitee_le`, posée par `demande_devis_traitee`) n'étaient visibles que dans la
-- console (/admin/devis) et dans le point du matin. L'e-mail de 5 h du relais (D46-B) ne les comptait pas : une demande
-- pouvait attendre des jours sans que le dirigeant en soit averti autrement qu'en ouvrant la console.
--
-- LA DÉCISION (19/10). Un point AU TOTAL dans l'e-mail de 5 h dès qu'il reste au moins une demande non traitée, libellé
-- « Demandes de contact du site vitrine — en attente de réponse : N (dont M depuis plus de 48 h) », aucune donnée
-- personnelle ; pas d'e-mail immédiat (la file `relais_urgences` est celle du mode vacances : clé étrangère vers une
-- alerte interne, nature bornée, plafond de 6 envois par heure partagé — une demande de contact n'y a pas sa place).
--
-- CETTE MIGRATION pose UNE fonction nouvelle, `demandes_contact_en_attente()`, et ne touche à rien d'autre. Surtout pas à
-- `sentinelle_relais()` : son texte en production porte les réécritures par ancres des migrations 20261014812000 et
-- 20261016180000 (relevé par pg_get_functiondef le 19/10, identique au banc local rejoué) ; un `create or replace` depuis
-- un fichier du dépôt effacerait ces correctifs. Le serveur (src/lib/relais-alerte-envoi.ts) appelle la nouvelle fonction
-- à la suite de `urgences_relais_recentes` et compose le point (src/lib/relais-alerte.ts).
--
-- Ce qu'elle rend : deux nombres, `en_attente` (demandes dont `traitee_le` est nul) et `depuis_plus_de_48h` (parmi elles,
-- celles reçues il y a plus de 48 h : une durée depuis l'instant présent, pas un jour de Paris à calculer). Jamais un nom,
-- une adresse, un téléphone ni un message. Le registre du relais (`terminer_alerte_relais`) n'accepte d'ailleurs que des
-- nombres dans ses compteurs.
--
-- Réservée au traitement (service_role), comme les autres lectures du relais ; fermée à public, anon et authenticated.
-- Aucune donnée existante lue ni réécrite par la migration, aucune table, aucune politique, aucune tâche pg_cron.
-- Rejouable : `create or replace`. Retour arrière : app/supabase/retours-arriere/20261019122000_relais_point_demandes_contact.retour.sql.

create or replace function public.demandes_contact_en_attente()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultat jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement';
  end if;
  select jsonb_build_object(
           'en_attente', count(*),
           'depuis_plus_de_48h', count(*) filter (where d.created_at < now() - interval '48 hours'))
    into v_resultat
    from public.demandes_devis d
   where d.traitee_le is null;
  return v_resultat;
end;
$$;
comment on function public.demandes_contact_en_attente() is
  'Les demandes de contact du site vitrine non traitées, pour l''e-mail de 5 h du relais (M16) : deux nombres (en attente, dont reçues il y a plus de 48 h), jamais une donnée de la demande. Traitement seulement.';
revoke all on function public.demandes_contact_en_attente() from public, anon, authenticated;
grant execute on function public.demandes_contact_en_attente() to service_role;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();
