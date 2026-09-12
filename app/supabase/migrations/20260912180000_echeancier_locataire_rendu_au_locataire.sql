-- L'échéancier du locataire lui revient.
--
-- LE DÉFAUT, CONSTATÉ AU NAVIGATEUR LE 12/09. La page « Mes paiements » d'un
-- locataire qui doit 400 € affichait : « Tous vos loyers sont à jour — rien à
-- régler pour l'instant. » Au même moment, l'agence voyait l'impayé, et la
-- relance partait. Le produit disait donc deux choses opposées sur la même
-- dette, et c'est au débiteur qu'il mentait.
--
-- LA CAUSE. `mon_echeancier_locataire` porte DÉJÀ tout son contrôle d'accès :
-- adhésion « locataire » de l'organisation, et être locataire principal ou
-- colocataire DE CE BAIL. Elle chaînait ensuite `etat_loyers_bail`, à qui la
-- migration du 10/09 (20260910130000, étanchéité des RPC) a ajouté — à juste
-- titre pour ses autres appelants — l'exigence d'être GÉRANT de l'organisation
-- du bail. Un locataire ne l'est jamais. La jointure latérale ne rendait donc
-- aucune ligne, pour tout le monde, depuis deux jours.
--
-- Aucun test ne l'a vu : l'échéancier du locataire n'en avait pas, et « zéro
-- terme » ressemble trait pour trait à « aucun loyer appelé ».
--
-- LA CORRECTION. On appelle `etat_loyers_bail_brut`, le CALCUL, et non
-- `etat_loyers_bail`, le calcul PLUS une garde de gérant. Ce n'est pas
-- contourner un contrôle : c'est ne pas en empiler un second, écrit pour un
-- autre appelant, par-dessus celui que cette fonction tient déjà — et que les
-- quatre conditions du `where` ci-dessous énoncent en toutes lettres.
create or replace function public.mon_echeancier_locataire(p_org uuid)
returns table (
  periode date, montant_du numeric, montant_couvert numeric,
  statut text, quittance_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.periode, e.montant_du, e.montant_couvert, e.statut,
    (select q.id from public.quittances q where q.appel_id = e.appel_id) as quittance_id
  from public.baux b
  cross join lateral public.etat_loyers_bail_brut(b.id) e
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis', 'termine')
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by e.periode;
$$;
comment on function public.mon_echeancier_locataire(uuid) is
  'L''échéancier du locataire appelant. Porte son propre contrôle d''accès (adhésion locataire + être partie AU BAIL) et appelle donc le calcul brut : `etat_loyers_bail` y ajouterait une garde de GÉRANT, qu''un locataire ne franchit jamais.';
revoke execute on function public.mon_echeancier_locataire(uuid) from public, anon;

select public.fermer_fonctions_a_anon();
