# Passe 2 (89cb87ff) — relecture de la console du super admin, défauts bloquants ou majeurs seulement

Captures regardées (Read sur les .png, découpées en tranches) : 46 à 390 px (toutes les pages fermées de la console, plus les versions « --ouvert » de santé, paramètres, article, fiche compte, territoire, ajout de prospect, veille, conservation, demandes de contact, marketing), 8 écrans principaux à 1440 px (santé, paramètres, article, fiche compte, territoire, veille, conservation, demandes de contact) et 12 comparaisons IA activée / IA coupée. Les 76 + 76 paires ont aussi été comparées au pixel.

## Verdict : aucun défaut bloquant ni majeur dans la console du super admin (vérifié sur capture)

## Défauts majeurs de la passe 1 (L64, L65) : les 8 sont corrigés (vérifié sur capture)
- E069 / E179 (demandes de contact) : le bouton vers /#contact a disparu. Une phrase explique que le formulaire ne s'affiche que hors connexion, en navigation privée (390/admin-devis--ouvert.png, 1440/admin-devis.png).
- E070 / E180 (fiche compte) : la section s'appelle « Actions faites par ce compte » et renvoie à « Contrôler l'accès » pour les gestes subis (390 et 1440/admin-comptes-38e0…--ouvert.png).
- E088 (filtre des prospects à 390) : le champ « Nom, e-mail ou origine » occupe toute la ligne, avec « Étape », « En retard » et « Filtrer » en dessous (390/admin-territoire.png).
- E089 (veille) : la page affiche « La collecte ne peut pas encore être commandée » avec le bouton « Vérifier les connexions » (390 et 1440/admin-veille.png).
- E198 (Facebook) : l'éditeur, l'encart et les réglages marketing disent « La Page Facebook n'est pas encore reliée… n'est pas proposée ». Il n'y a plus de bouton « Publier sur Facebook ». Le refus côté serveur est maintenu (actions/publications.ts:150).
- E199 (Stripe) : la pastille est ambre « Stripe non relié ». Le texte dit « ces compteurs ne viennent d'aucun contrôle » (390 et 1440/admin-sante.png, admin-sante--ouvert.png).

## Points de la consigne (vérifiés)
- Envois automatiques : les cinq envois sont fermés, chacun avec sa case « Je confirme » et le bouton « Ouvrir cet envoi ».
- Identité du vendeur : la case « Type de vendeur » est à choisir et la santé l'affiche « manquant ».
- Ouverture sans médiateur : la case « J'ai lu les deux articles (L. 612-1, L. 616-1) » est requise dans la page et contrôlée par le serveur (actions/reglage-souscription.ts:37, permanent seulement).
- Conditions : l'archivage, le bouton et les versions archivées sont présents.
- Conservation : l'historique indique « 6 ans → 10 ans, ne peut plus être réglée en dessous de 120 mois », avec un plancher `minimum_mois` (conservation/reglages.tsx:21).

## IA coupée (p2-off) : l'écran reste utilisable (vérifié)
Les vraies différences touchent la veille, la création d'article, le marketing, les paramètres, l'atelier de corrections, la santé et le relais. Chaque fois, un message clair remplace la fonction (« L'IA est désactivée dans les paramètres… ») et la saisie manuelle reste possible. Les lignes OpenAI passent en « Désactivé » et la santé compte 18 points au lieu de 19. Les autres écarts sont des heures ou le bouton d'aide flottant.

## Mineurs encore visibles (reportés, non comptés)
E094, E095, E096, E097, E107, E109, E189, E213. S'y ajoutent les compteurs « 12 à compléter » et « 9 à fournir », la barre collante « Enregistrer » sur le titre de l'article à 390, les dates en mm/dd/yyyy (langue du navigateur de test) et la colonne « Artisans » coupée dans la couverture à 390.

## Non vérifié
La référence « loi n° 2026-534 du 25 juin 2026, LPF L. 102 B » n'est pas contrôlée à la source. Les versions « --ouvert » des écrans hors consigne (journaux, sécurité, données, équipes, relais…) n'ont été comparées qu'au pixel avec p2-off. Aucun clic réel n'a été fait (lecture seule).
