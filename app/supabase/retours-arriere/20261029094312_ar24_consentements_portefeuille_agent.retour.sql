-- Retour conservateur : ne jamais rouvrir les courriers et accords hors
-- portefeuille. Ces politiques et déclencheurs disparaîtront avec les tables
-- lors du retour du module ; aucune donnée ni protection n'est supprimée ici.
select true as protection_portefeuille_conservee;
