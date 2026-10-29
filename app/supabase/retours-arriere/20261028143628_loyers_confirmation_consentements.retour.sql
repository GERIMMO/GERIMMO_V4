-- Les consentements et leur journal sont conservés en retour arrière.
do $$ declare definition text; begin
 select pg_get_functiondef('public.quittances_a_envoyer(integer)'::regprocedure) into definition;
 definition:=replace(definition,'and o.quittances_envoi_auto and public.quittance_envoi_autorise(q.organization_id,q.bail_id)','and o.quittances_envoi_auto');execute definition;
 select pg_get_functiondef('public.relances_loyer_dues(integer)'::regprocedure) into definition;
 definition:=replace(definition,'where not n.relance_du_jour and public.confirmation_relance_proprietaire(n.bail_id,case when not n.a_relance_1 then ''relance_1'' else ''relance_2'' end,n.date_echeance)','where not n.relance_du_jour');execute definition;
end $$;
notify pgrst,'reload schema';
drop trigger if exists reception_montant_confirme on public.receptions_loyers_signalees;
-- Montant et accord conservés pour investigation ; leur présence ne modifie pas les anciens parcours.
