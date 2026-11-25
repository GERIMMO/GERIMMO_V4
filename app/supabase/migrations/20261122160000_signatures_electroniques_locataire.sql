-- Audit palier 1, P1-06 — Le locataire voit où en est la signature électronique qui le concerne.
--
-- CE QUI MANQUAIT. Depuis le passage à la signature électronique (Zoho Sign), l'espace du locataire ne disait rien
-- d'une signature en cours : ni qu'un bail, un avenant ou un état des lieux l'attendait, ni qu'il avait bien signé,
-- ni que toutes les signatures étaient réunies. Les circuits ne sont lisibles que par le gestionnaire (RLS).
--
-- CE QUE POSE CETTE MIGRATION. `mes_signatures_electroniques(p_org)` rend au locataire connecté, pour les seuls
-- circuits où IL est signataire (reconnu par sa fiche, `ma_personne_locataire`) :
--   · la nature du document, l'état du circuit, ses dates (envoi, échéance, fin) ;
--   · SON état de signataire, et le nombre de signatures reçues sur le nombre attendu.
-- Rien d'autre : ni le nom, ni l'adresse, ni le téléphone des autres signataires, ni le contenu du document.
-- Sont rendus les circuits réellement partis chez le prestataire (« en_cours ») et ceux achevés depuis moins de
-- trente jours (signés, refusés, expirés). Un circuit encore en préparation chez le gestionnaire, un envoi à
-- vérifier, un essai ou l'acceptation d'un devis d'artisan ne concernent pas cet écran.
--
-- Lecture seule : aucune table, aucun droit d'écriture, aucune politique n'est modifiée.
-- Rejouable. Retour arrière : supabase/retours-arriere/20261122160000_signatures_electroniques_locataire.retour.sql

create or replace function public.mes_signatures_electroniques(p_org uuid)
returns table (
  circuit_id uuid, modele text, etat text,
  envoye_le timestamptz, expire_le timestamptz, acheve_le timestamptz,
  mon_statut text, signatures_recues integer, signatures_attendues integer)
language sql stable security definer set search_path = '' as $$
  with moi as (select public.ma_personne_locataire(p_org) as id)
  select c.id, c.modele, c.etat, c.envoye_le, c.expire_le,
         case when c.etat in ('termine', 'refuse', 'expire') then c.updated_at end,
         s.elt->>'statut',
         (select count(*)::integer from jsonb_array_elements(c.signataires) x(e) where x.e->>'statut' = 'signed'),
         jsonb_array_length(c.signataires)
  from moi
  join public.bail_signature_circuits c on c.organization_id = p_org
  cross join lateral jsonb_array_elements(c.signataires) s(elt)
  where moi.id is not null
    and s.elt->>'personId' = moi.id::text
    and c.essai is not true
    and c.modele <> 'devis_artisan'
    and (c.etat = 'en_cours'
         or (c.etat in ('termine', 'refuse', 'expire') and c.updated_at > now() - interval '30 days'))
  order by coalesce(c.envoye_le, c.created_at) desc, c.id
  limit 20;
$$;
revoke all on function public.mes_signatures_electroniques(uuid) from public, anon;
grant execute on function public.mes_signatures_electroniques(uuid) to authenticated;
comment on function public.mes_signatures_electroniques(uuid) is
  'Pour le locataire connecté : les signatures électroniques où il est signataire (en cours, ou achevées depuis moins de 30 jours), son propre état et le décompte des signatures. Aucune donnée des autres signataires.';

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
