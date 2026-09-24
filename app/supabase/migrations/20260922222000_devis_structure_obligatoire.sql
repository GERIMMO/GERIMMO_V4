-- Le portail utilise le devis détaillé depuis la livraison précédente.
-- L’ancien calcul interne reste utilisable par le wrapper, jamais directement par un compte connecté.
revoke execute on function public.deposer_devis(uuid,bigint,text,date,text,text,bigint,text) from authenticated;
