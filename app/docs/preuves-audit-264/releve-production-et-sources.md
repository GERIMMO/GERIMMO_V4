# Sources réglementaires consultées (27/10/2026)
- DPE, durée de validité : décret n° 2020-1610 du 17 décembre 2020, art. 1 (art. D.134-4-2 CCH) — 10 ans ; réalisés du 01/01/2013 au 31/12/2017 : valides jusqu'au 31/12/2022 ; du 01/01/2018 au 30/06/2021 : jusqu'au 31/12/2024. https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000042695192 ; confirmé par le ministère : https://www.ecologie.gouv.fr/politiques-publiques/diagnostic-performance-energetique-dpe
  (Légifrance et service-public injoignables directement depuis le banc : texte relu via le moteur de recherche, extraits cités.)

# Relevé de production en lecture seule (27/10/2026, ~10 h 40 UTC, projet rddlxunppddzpsaatdaz)
- Migrations #264 (20261026*) : les 5 appliquées. Tables nouvelles vides : receptions_loyers_signalees 0, qualifications_diagnostics_lot 0, pieces_attendues_bail 0, commandes_encaissement_reste 0.
- Données : 7 comptes, 4 organisations, 2 lots, 2 baux (0 actif/préavis, 2 brouillons), 0 appel de loyer, 0 encaissement, 0 relance, 1 incident, 7 documents, 2 diagnostics actifs, 0 personne morale, 2 détentions.
- Exposition aux défauts : DPE transitoires affichés valides 0 ; alertes loyer_impaye ouvertes 0 ; incidents sur lot à plusieurs baux vivants 0.
- Fonctions : 12/13 fonctions clés identiques au dépôt (md5 du corps) ; lot_blocages_location diffère par la mise en forme seulement (commentaire « Loi Climat », déclarations sur plusieurs lignes), logique identique.
- Advisors Supabase (sécurité) : aucune alerte propre aux objets de #264 ; declarer_reception_loyer listée parmi les 382 fonctions SECURITY DEFINER exécutables par authenticated (contrôle d'appartenance interne : conforme au modèle du dépôt) ; fermetures_comptes_nuit (procédure, 24/10) sans search_path fixe : antérieur à #264, à noter.
- Aucune erreur d'exécution Vercel sur 3 jours ; production = 555c5282.

# Batterie « integ1 » (branche après fusion de bail, depot_documents, transversal ; tête 385ea301)
- lint 0 ; typecheck 0 ; build OK ; e2e 240 réussis, 1 instable (alias-espace:114, réussi au 2e essai), 1 ignoré, 0 échec ; vitest 11 565 réussis, 1 échec (fichier-signe-navigateur, banc Chromium, identique à la référence), 17 ignorés.
