-- Les nouvelles tables de gestion doivent suivre le même verrou que le reste
-- du patrimoine, y compris lorsque l’écriture passe par une fonction privilégiée.
-- Les lectures, exports et tâches système conservent leurs exceptions existantes.
select public.poser_gardes_abonnement();
