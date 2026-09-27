-- AUDIT CONSOLE DU 27/09 — MAJEUR 8 : SUSPENDRE LA VALIDATION D'UN ARTISAN.
--
-- La fiche artisan de la console disait elle-même « la validation ne peut pas
-- être suspendue depuis cet écran » pour un artisan validé sans décennale ni
-- RC pro. La décision « suspension » entre dans l'historique des décisions de
-- la plateforme ; elle est utilisée par 20260927203000 (fichier distinct : une
-- valeur d'énumération ajoutée ne s'utilise qu'après sa validation).
--
-- Idempotent : add value if not exists.
alter type public.artisan_decision_plateforme add value if not exists 'suspension';
