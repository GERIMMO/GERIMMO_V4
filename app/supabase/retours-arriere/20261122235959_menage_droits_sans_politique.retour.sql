-- RETOUR ARRIÈRE de 20261122235959_menage_droits_sans_politique.sql (audit palier 1, P2-08 : ménage de la base).
--
-- Rend aux comptes connectés (`authenticated`) les droits de table retirés par la migration, sur les 21 tables de sa
-- liste. Ces droits restent sans effet tant qu'aucune politique de cloisonnement n'autorise la commande : le retour ne
-- rouvre donc aucune écriture. Le commentaire de la vue `organisations_portail` est retiré. Aucune donnée n'est touchée.
--
-- Peut être joué avant ou après le retour du code de l'application (aucun écran n'en dépend). Rejouable.
do $retour$
begin
  grant update on table public.annonces to authenticated;
  grant insert, update, delete on table public.appels_loyer to authenticated;
  grant update on table public.bail_personnes to authenticated;
  grant delete on table public.bien_infos_pratiques to authenticated;
  grant insert, update, delete on table public.clotures_comptables to authenticated;
  grant delete on table public.demandes_devis to authenticated;
  grant insert, update on table public.depot_encaissements to authenticated;
  grant update, delete on table public.ecritures to authenticated;
  grant delete on table public.equipements_catalogue to authenticated;
  grant insert, update, delete on table public.intentions_conge to authenticated;
  grant insert, update, delete on table public.intervention_rappels to authenticated;
  grant update on table public.lot_equipements to authenticated;
  grant insert, update, delete on table public.messages to authenticated;
  grant insert, delete on table public.quittances to authenticated;
  grant insert, update, delete on table public.rapports_gestion to authenticated;
  grant insert, update, delete on table public.regularisations_charges to authenticated;
  grant update on table public.relances to authenticated;
  grant insert, update, delete on table public.restitutions to authenticated;
  grant insert, update, delete on table public.retenues to authenticated;
  grant insert, update, delete on table public.revisions_loyer to authenticated;
  grant insert, update, delete on table public.site_pages to authenticated;
  comment on view public.organisations_portail is null;
  delete from supabase_migrations.schema_migrations where version = '20261122235959';
end $retour$;
notify pgrst, 'reload schema';
