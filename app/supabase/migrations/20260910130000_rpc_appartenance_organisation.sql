-- Audit du 2026-09-10 — P0 : fuite inter-agences par etat_loyers_bail.
--
-- Rejeu de la faille (base locale, transaction annulée) : un compte
-- authentifié SANS AUCUNE adhésion, appelant etat_loyers_bail avec l'UUID
-- d'un bail d'une autre organisation, obtient tout son échéancier —
-- périodes, montants appelés, montants couverts, statuts d'impayé.
--
-- Cause : la fonction est SECURITY DEFINER (elle contourne donc le RLS) et
-- sa seule garde était `not bail_hors_portefeuille(...)`. Or cette famille
-- de gardes ne répond qu'à UNE question : « cet agent restreint a-t-il ce
-- lot dans son portefeuille ? ». Pour quiconque n'est pas agent restreint —
-- y compris un parfait étranger à l'organisation — elle répond « non, rien
-- ne s'oppose », ce qui valait ici autorisation.
--
-- Ces gardes restent inchangées : elles servent aussi 30 politiques RLS
-- RESTRICTIVE que traversent les locataires, et les durcir les bloquerait.
-- La correction ajoute le contrôle qui manquait LÀ où il manquait : dans
-- les RPC SECURITY DEFINER qui n'en avaient aucun. Les autres RPC gardées
-- (quittancement_mois, totaux_ecritures, messages_personne, quittance_detail)
-- ont été vérifiées : elles portent déjà leur contrôle d'appartenance.

-- 1 ─ etat_loyers_bail : gérant de l'organisation DU BAIL, puis portefeuille
create or replace function public.etat_loyers_bail(p_bail uuid)
returns table (
  appel_id uuid, periode date, date_echeance date, montant_du numeric,
  cumul_du numeric, montant_couvert numeric, statut text
)
language sql stable security definer set search_path = ''
as $$
  select e.* from public.etat_loyers_bail_brut(p_bail) e
  where exists (
    select 1 from public.baux b
    where b.id = p_bail
      -- Appartenance : la question que la garde de portefeuille ne pose pas
      and b.organization_id in (select public.org_ids_avec_roles(
            array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
      -- Portefeuille : et, pour un agent restreint, ses mandats seulement
      and not public.bail_hors_portefeuille(b.organization_id, b.id)
  );
$$;
revoke execute on function public.etat_loyers_bail(uuid) from public, anon;

-- 2 ─ Deux agrégats de charges exposés sans contrôle : même correction.
--     (Seule regulariser_charges les appelle côté serveur ; elle porte son
--     propre contrôle d'accès, la garde ajoutée ici ne la gêne pas.)
create or replace function public.charges_recuperables_exercice(p_lot uuid, p_exercice integer)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(p.montant), 0)
  from public.appel_charges_postes p
  join public.appels_charges a on a.id = p.appel_id
  join public.lots l on l.id = a.lot_id
  where a.lot_id = p_lot and a.exercice = p_exercice
    and a.statut in ('ventile', 'fige') and p.nature = 'recuperable'
    and l.organization_id in (select public.org_ids_avec_roles(
          array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
$$;
revoke execute on function public.charges_recuperables_exercice(uuid, integer) from public, anon;

create or replace function public.provisions_charges_annee(p_bail uuid, p_annee integer)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(a.charges), 0)
  from public.appels_loyer a
  join public.baux b on b.id = a.bail_id
  where a.bail_id = p_bail
    and extract(year from a.periode) = p_annee
    and b.organization_id in (select public.org_ids_avec_roles(
          array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
$$;
revoke execute on function public.provisions_charges_annee(uuid, integer) from public, anon;
