-- Décisions du dirigeant du 24/11/2026, lot D1 (reprise), Q20 — le motif du retrait d'une note n'est lu que par
-- l'AUTEUR de cette note.
--
-- CE QUI EXISTAIT. `artisan_evaluations.retrait_motif` (le motif écrit par la supervision quand elle retire une note
-- après contestation) se lisait, comme toute la table, par les gestionnaires de l'organisation : y compris le motif
-- du retrait de la note donnée par leur LOCATAIRE. Et le locataire, lui, ne lisait pas le motif du retrait de sa
-- propre note.
--
-- CE QUE POSE CETTE MIGRATION (elle RESSERRE la lecture ; aucune règle de lecture n'est élargie, aucune ligne modifiée).
--   1. Les comptes connectés ne lisent plus la colonne `retrait_motif` directement, même par l'API : le droit de
--      lecture de la table est remplacé par un droit sur chacune des autres colonnes. Les deux politiques de la table
--      ne changent pas. (Une colonne ajoutée plus tard à cette table devra recevoir son droit de lecture.)
--   2. `retraits_de_mes_notes(p_org)` : la seule lecture du motif pour un client. Elle rend, pour l'organisation
--      donnée, les notes retirées dont l'appelant est l'AUTEUR, avec leur motif :
--        · note « gerant » : l'appelant est membre actif de l'organisation qui a noté (admin d'agence, agent,
--          propriétaire direct), dans la limite du portefeuille de l'agent — la même limite que la politique de la table ;
--        · note « locataire » : l'appelant est le compte qui a déposé cette note.
--      L'artisan, un autre locataire, une autre organisation : rien. Un visiteur : fonction fermée.
--   3. La supervision ne passe pas par cette fonction (elle exige une adhésion réelle à l'organisation) : elle garde
--      sa lecture tracée, `evaluations_contestation`, inchangée.
--
-- Rejouable. Retour arrière : supabase/retours-arriere/20261124120000_motif_retrait_reserve_a_l_auteur.retour.sql
set local lock_timeout = '10s';

-- ── 1. La colonne du motif n'est plus lisible directement ───────────────────────────────────────────────────────
revoke select on table public.artisan_evaluations from authenticated;
grant select (id, organization_id, intervention_id, artisan_id, source, note_globale, note_qualite, note_delai,
              note_prix, commentaire, evaluateur_account_id, retiree_le, retiree_par, created_at)
  on table public.artisan_evaluations to authenticated;

-- ── 2. La lecture réservée à l'auteur de la note ────────────────────────────────────────────────────────────────
create or replace function public.retraits_de_mes_notes(p_org uuid)
returns table (intervention_id uuid, source public.evaluation_source, note_globale smallint,
               retiree_le timestamptz, retrait_motif text)
language sql stable security definer set search_path = '' as $$
  select e.intervention_id, e.source, e.note_globale, e.retiree_le, e.retrait_motif
  from public.artisan_evaluations e
  where e.organization_id = p_org
    and e.retiree_le is not null
    and (select auth.uid()) is not null
    and (
      -- La note de l'organisation : lue par ses gestionnaires (adhésion réelle, jamais la traversée de la supervision).
      (e.source = 'gerant'
        and exists (select 1 from public.memberships m
                    where m.account_id = (select auth.uid()) and m.organization_id = e.organization_id
                      and m.status = 'active' and m.role in ('admin_agence', 'agent', 'proprietaire_direct'))
        and not public.intervention_hors_portefeuille(e.organization_id, e.intervention_id))
      -- La note du locataire : lue par le compte qui l'a déposée, et par lui seul.
      or (e.source = 'locataire' and e.evaluateur_account_id = (select auth.uid()))
    );
$$;
revoke all on function public.retraits_de_mes_notes(uuid) from public, anon;
grant execute on function public.retraits_de_mes_notes(uuid) to authenticated;
comment on function public.retraits_de_mes_notes(uuid) is
  'Notes retirées dont l''appelant est l''auteur (organisation pour une note « gerant », compte du locataire pour une note « locataire »), avec le motif du retrait. Décision Q20 du 24/11/2026.';

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
