-- Conserver les déclarations et leur date : retrait de l’interface plutôt qu’effacement.
do $$begin raise exception 'Retour conservateur : rétablir l’interface précédente, conserver les données';end$$;
