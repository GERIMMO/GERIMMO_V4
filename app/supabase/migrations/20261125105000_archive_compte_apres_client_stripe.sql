-- Textes officiels, lot T4, seconde reprise (24/11/2026), relecture T4R-01 — l'archive d'un compte fermé ne se supprime
-- pas tant que la fiche du client chez le prestataire de paiement n'a pas été supprimée.
--
-- LE DÉFAUT. Depuis 20261125103000, la preuve du contrat (dix ans après la fin du dernier abonnement payé) et la dernière
-- facture (dix ans aussi) arrivent à leur terme le même jour. `purger_archives_comptes` retire alors la facture ET
-- supprime la ligne de l'archive dans le même appel. Or la liste des clients à supprimer chez le prestataire de paiement
-- (`clients_stripe_au_terme`) ne lit que `archives_comptes` : l'archive partie, plus rien ne désigne ce client, et sa
-- fiche — avec ses factures — reste chez le prestataire sans limite. Avant ce lot, quatre ans séparaient les deux
-- échéances (six et dix ans) : la mission de suppression avait le temps de passer.
--
-- LA CORRECTION. Une archive qui porte un client (`stripe_customer_id`) ne se supprime que si ce client figure dans
-- `clients_stripe_supprimes` (trace posée par `client_stripe_supprime`, après la suppression chez le prestataire).
-- Une archive SANS client se supprime comme avant. Le retrait des factures à leur échéance ne change pas : l'archive
-- vidée de ses factures reste, le client est proposé à la suppression, puis l'archive part à la purge suivante.
-- Texte de la fonction : celui de 20261024105901 (le dernier joué dans l'ordre du manifeste), recopié avec ce seul
-- changement, marqué « T4R-01 ». Droits inchangés, aucune règle d'accès modifiée, aucune donnée écrite.
--
-- À SAVOIR : la liste des suppressions à faire (`cibles_conservation_complementaire`, écran de simulation) compte
-- toujours une telle archive parmi les preuves arrivées à leur terme ; la purge, elle, l'attend.
-- Rejouable. Retour arrière : supabase/retours-arriere/20261125105000_archive_compte_apres_client_stripe.retour.sql
-- Rejouer SEULE 20261024140000 ou 20261024105901 remet l'ancien texte ; rejouer ensuite celle-ci.

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
     where a.preuve_conservee_jusqu_au < v_jour and jsonb_array_length(a.factures) = 0
       -- T4R-01 : l'archive est la seule trace qui fait supprimer la fiche du client chez le prestataire de paiement.
       and (a.stripe_customer_id is null
            or exists (select 1 from public.clients_stripe_supprimes s where s.stripe_customer_id = a.stripe_customer_id));
    get diagnostics v_archives = row_count;
  end if;
  return jsonb_build_object('archives_comptes_factures_retirees', v_factures, 'archives_comptes_supprimees', v_archives);
end $$;
revoke all on function public.purger_archives_comptes() from public, anon, authenticated;
grant execute on function public.purger_archives_comptes() to service_role;

select public.fermer_fonctions_a_anon();
