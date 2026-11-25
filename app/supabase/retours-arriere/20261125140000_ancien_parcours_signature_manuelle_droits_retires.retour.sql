-- RETOUR ARRIÈRE de 20261125140000_ancien_parcours_signature_manuelle_droits_retires.sql (décisions du 24/11, lot D5,
-- question Q21 : retrait de l'ancien parcours « télécharger, signer, redéposer »).
--
-- Rend au rôle des comptes connectés le droit d'appeler les trois fonctions de l'ancien parcours, tel qu'il était
-- avant la migration (les fonctions gardent leurs propres contrôles : rôle de gestion, portefeuille, fiche du
-- locataire). Aucune donnée n'est touchée, dans un sens comme dans l'autre. Rien n'est ouvert au visiteur.
-- À jouer AVANT de revenir au code précédent si l'on veut retrouver l'annulation et le dépôt d'un document signé ;
-- sans ce retour, l'ancien code affiche seulement un refus sur ces deux gestes. La création d'une demande reste
-- refusée par le déclencheur signature_manuelle_fin_nouveaux_envois (18/10), que ce retour ne touche pas. Rejouable.
do $retour$
begin
  perform set_config('lock_timeout', '10s', true);
  -- Registre des migrations (essai de publication « retours » du 25/11/2026, constat RET-01) : la version est retirée
  -- dans ce bloc unique, qui passe ou s'arrête d'un tenant (un refus ou une erreur plus bas l'y laisse) ; sans quoi le
  -- chantier « Migrations Supabase » refuserait de rejouer la migration (« version déjà enregistrée »).
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261125140000';
  end if;
  grant execute on function public.envoyer_pour_signature(uuid, uuid, uuid) to authenticated;
  grant execute on function public.retourner_document_signe(uuid, uuid, text, text, bigint, text) to authenticated;
  grant execute on function public.annuler_demande_signature(uuid, uuid) to authenticated;
end $retour$;
