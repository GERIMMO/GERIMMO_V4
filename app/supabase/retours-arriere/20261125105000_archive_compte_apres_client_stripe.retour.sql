-- RETOUR ARRIÈRE de 20261125105000_archive_compte_apres_client_stripe.sql (textes officiels, lot T4, seconde reprise du
-- 24/11/2026, relecture T4R-01).
--
-- Rend à `purger_archives_comptes` son texte de 20261024105901, recopié tel quel : l'archive d'un compte fermé se
-- supprime de nouveau au terme de sa preuve, que la fiche du client chez le prestataire de paiement ait été supprimée
-- ou non. RÉINTRODUIT le défaut : avec des factures gardées dix ans, l'archive peut partir avant cette suppression, qui
-- n'aurait alors plus jamais lieu. Aucune donnée modifiée ni supprimée par ce retour ; droits inchangés.
-- Indépendant du retour du code. À jouer AVANT le retour de 20261024105901 (qui retire la colonne
-- `archives_comptes.factures_duree_mois`, que cette fonction lit). Rejouable.

create or replace function public.purger_archives_comptes()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_mois_factures integer := public.duree_conservation_active('archive:facture');
  v_factures bigint := 0;
  v_archives bigint := 0;
begin
  if v_mois_factures is not null then
    update public.archives_comptes a
       set factures = coalesce((select jsonb_agg(x.e order by x.rang)
                                  from jsonb_array_elements(a.factures) with ordinality x(e, rang)
                                 where public.echeance_facture_archivee(x.e, a.fin_dernier_abonnement_paye, a.factures_duree_mois) >= v_jour), '[]'::jsonb),
           factures_purgees_le = now()
     where exists (select 1 from jsonb_array_elements(a.factures) e
                    where public.echeance_facture_archivee(e, a.fin_dernier_abonnement_paye, a.factures_duree_mois) < v_jour);
    get diagnostics v_factures = row_count;
  end if;
  if public.duree_conservation_active('archive:preuve_contrat') is not null then
    delete from public.archives_comptes a
     where a.preuve_conservee_jusqu_au < v_jour and jsonb_array_length(a.factures) = 0;
    get diagnostics v_archives = row_count;
  end if;
  return jsonb_build_object('archives_comptes_factures_retirees', v_factures, 'archives_comptes_supprimees', v_archives);
end $$;
revoke all on function public.purger_archives_comptes() from public, anon, authenticated;
grant execute on function public.purger_archives_comptes() to service_role;

select public.fermer_fonctions_a_anon();
