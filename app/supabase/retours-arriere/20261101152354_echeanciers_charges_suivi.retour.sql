-- Les décomptes et confirmations sont des traces financières : aucun effacement automatique.
do $$ begin raise exception 'Retour conservatoire : conserver les échéanciers et désactiver les nouvelles entrées dans l’interface. Une migration corrective est requise ; aucune réception ne doit être supprimée.'; end $$;
