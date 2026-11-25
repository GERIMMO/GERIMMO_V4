-- Décision du dirigeant du 24/11/2026 (Q46) — la notice d'information déposée par le bailleur.
--
-- CE QUI EXISTAIT. Gerimmo prépare un RÉSUMÉ de la notice d'information (rangé en « courrier »). Le texte officiel
-- n'est pas joint au bail : l'écran demandait au bailleur de le remettre lui-même, à part.
--
-- CE QUE POSE CETTE MIGRATION. Un type de document de plus, `notice_information` : le PDF de la notice officielle que
-- le bailleur dépose lui-même pour un bail (lié au bail par `document_liens`, comme les autres pièces). L'application
-- bloque l'envoi du bail en signature électronique tant qu'il n'est pas déposé, et le joint ensuite comme annexe.
--
-- CE QUI NE CHANGE PAS. Aucune table, aucune fonction, aucune politique, aucun droit. Aucune règle de conservation
-- n'est créée pour ce type : sa durée de conservation reste à décider (un document sans règle n'est pas purgé
-- automatiquement). Gerimmo ne fournit pas le texte de la notice et ne vérifie pas le fichier déposé.
--
-- Rejouable (`if not exists`). Retour arrière : supabase/retours-arriere/20261124180000_notice_information_deposee.retour.sql
-- (PostgreSQL ne sait pas retirer une valeur d'un type énuméré : le retour ne retire que l'inscription de la migration).

alter type public.document_type add value if not exists 'notice_information';
