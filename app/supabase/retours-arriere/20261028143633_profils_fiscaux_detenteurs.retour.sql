-- Conserver les profils et l'historique. Le retour désactive seulement la nouvelle écriture.
revoke execute on function public.enregistrer_profil_fiscal_detenteur(uuid,integer,text,text,text,text) from authenticated;
