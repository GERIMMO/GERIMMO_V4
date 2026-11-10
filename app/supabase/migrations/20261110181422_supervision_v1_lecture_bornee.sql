begin;
-- Lecture de supervision par la session authentifiée, jamais par une clé de service dans la page.
-- Aucun droit d'écriture, corps chiffré, destinataire ou jeton n'est exposé.
grant select (id,organization_id,etat,tentatives,updated_at,motif,reprise_autonome,expire_le,finalisation_etat,circuit)
 on public.courriels_durables to authenticated;
create policy supervision_courriels_v1 on public.courriels_durables for select to authenticated
 using (public.is_super_admin() and (select auth.jwt()->>'aal')='aal2');
grant select (id,organization_id,evenement,etat,tentatives,motif,cree_le)
 on public.notification_intentions to authenticated;
create policy supervision_intentions_v1 on public.notification_intentions for select to authenticated
 using (public.is_super_admin() and (select auth.jwt()->>'aal')='aal2');
create policy supervision_factures_v1 on public.factures_automatiques for select to authenticated
 using (public.is_super_admin() and (select auth.jwt()->>'aal')='aal2');
-- Index de relations : évitent les balayages lors des contrôles de clés étrangères.
create index courriels_durables_organisation_idx on public.courriels_durables(organization_id);
create index courriels_evenements_courrier_idx on public.courriels_evenements(courrier_id);
create index factures_auto_evenements_facture_idx on public.factures_automatiques_evenements(facture_id);
create index factures_auto_evenements_organisation_idx on public.factures_automatiques_evenements(organization_id);
create index notification_intentions_courriel_idx on public.notification_intentions(courriel_id);
commit;
