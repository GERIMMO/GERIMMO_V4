# Passe 2 (89cb87ff) — relecture de l'espace artisan (bloquants et majeurs seulement)

Périmètre : accueil, aide, agenda, missions (fiche, créneaux, compte rendu, bilan, facture), devis (liste, fiche, nouveau), facturation, fiche entreprise, attestations, évaluations, règles, clients externes et export, données personnelles.
Captures ouvertes une à une : 26 à 390 px (les grandes découpées en morceaux lisibles), 15 à 1440 px, plus 1 de la passe 1 pour comparer. Les 9 autres captures « menu ouvert » à 390 px, comparées pixel par pixel à leur capture de base, ne diffèrent que dans la zone visible en haut (voile et tiroir du menu).
Rapports du balayage (p2-on et p2-off, 390 et 1440) : 18 écrans en statut 200 ; aucune erreur de console ou de page, aucune requête en échec, aucun débordement, aucun lien cassé sur les 74 contrôlés.

## Résultat : aucun défaut bloquant ni majeur trouvé
Pour chaque cas ci-dessous, j'ai vérifié s'il s'agissait d'un défaut. Aucun n'est retenu :
- **Photo jointe par le locataire, affichée cassée** sur la fiche de mission (390 et 1440 ; déjà le cas en passe 1). Effet du banc, déduit du code et des journaux mais pas observé en vrai.
  - La politique de sécurité n'autorise que les images en https (next.config.ts:62) ; l'émulateur fournit une adresse signée en http://127.0.0.1:54321.
  - Le balayage filtre volontairement ce refus (zz-phase3-balayage.gabarit.ts:39) ; la route de la photo ne renvoie aucune erreur. En production, le stockage Supabase est en https.
  - **À vérifier en préproduction avec une vraie photo.**
- **/facture et /compte-rendu/bilan ramènent à la fiche de mission.** Attendu, la mission n'est pas démarrée. Le bilan l'explique par un bandeau ; la facture renvoie sans message (mineur).

## Défaut majeur de la passe 1 (L60 n'en contient qu'un : E001)
- **E001 — CORRIGÉ.**
  - Code : l'entrée de menu mène à /assistance par LienAssistance (nav-artisan.tsx:49 et :208) ; /artisan/panne refait la lecture de la fiche et renvoie vers /artisan si rien n'a échoué (panne/page.tsx:28-29).
  - Captures : p2-on/390/artisan/artisan-panne.png affiche « Aujourd'hui » au lieu de « Lecture momentanément impossible » ; idem à 1440. Parcours verts : lot60-espace-artisan.spec.ts:36 et :56.

## IA coupée
- Captures identiques octet pour octet entre IA activée et coupée : les 33 de même nom, et les 24 nommées par mission ou par devis une fois mises en correspondance.
- L'écran reste utilisable IA coupée. Seule fonction IA de l'espace, la proposition de devis part d'une base issue du catalogue, offre « Repartir d'un devis vierge » et affiche un message dans « Origine des prix et points à vérifier ».
- Limite : le banc n'a pas de clé OpenAI, les deux modes affichent « L'analyse IA n'est pas connectée dans cet environnement » (proposition-devis-ia.ts:69). Le message propre à l'IA coupée (:24) n'a été vu sur aucune capture ; interrupteur-ia.spec.ts:141 (vert, IA activée seulement) ne cherche qu'une phrase commune aux deux messages.

## Non vérifié
- Formulaire de facture, dépôt de la photo du travail, bilan rempli : mission du banc non démarrée (couverts par artisan-fin-mission.spec.ts, vert).
- PDF de devis et de facture de l'artisan : aucun dans documents/.
- Contenu du fichier exporté (JSON) : parcours-artisan.spec.ts:92 vert.
- Page /assistance ouverte depuis l'espace artisan : aucune capture ; lot60 :36 et :109 verts.
