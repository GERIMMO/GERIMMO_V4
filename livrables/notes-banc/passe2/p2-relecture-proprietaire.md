# Passe 2 (89cb87ff) — relecture des écrans du propriétaire

**Verdict : aucun défaut bloquant ni majeur vu dans l'espace du propriétaire.** Les défauts mineurs restent reportés, comme décidé.

## Ce qui a été regardé
- **À 390 px :** les 56 captures de p2-on/390/proprietaire, toutes ouvertes, découpées par tranches de 1000 px.
- **À 1440 px :** 16 captures d'écrans principaux (accueil, parc, fiche du bien et du lot, finances, pointage, livre, fiscal, abonnement, agenda, personnes, documents, profil, déclaration d'incident, ajout d'un bien).
- **Balayage :** 29 écrans, 169 liens internes, 0 lien en défaut, dans les deux modes. Le journal du serveur ne montre aucune erreur.

## IA coupée (p2-off)
- **Seulement 6 captures diffèrent d'un octet, et aucune pour une raison d'IA :**
  - accueil « --ouvert » : les deux logements sont listés dans un autre ordre ;
  - profil « --ouvert » : le code de parrainage n'est pas le même ;
  - « artisans » et « loyers » à 1440 px : 0 pixel de différence (tolérance de 2 %) ;
  - fiches du bien et du lot : identiques une fois les identifiants alignés.
- **L'espace reste entièrement utilisable IA coupée.**
- **Réserve :** le banc n'a pas de clé du fournisseur d'IA (aucune variable de clé dans banc.sh). En p2-on, l'IA vaut donc « non_connectee » (lib/etat-ia.ts) et les écrans montrent déjà l'équivalent manuel. L'état « IA active » n'a été vu sur aucun écran du propriétaire.

## Défauts majeurs de la passe 1
- **Aucun dans cet espace.** L63 compte 52 défauts, tous mineurs, et aucun des 21 majeurs d'ECRANS-defauts.md ne concerne le propriétaire.
- **Mineurs toujours présents (rien à faire avant publication) :**
  - E024/E145 : la page de rétractation parle de remboursement et de résiliation pendant l'essai ;
  - E025/E147 : « 1 locataire avec un accès » sur l'accueil, mais « Locataires 0 » dans Personnes ;
  - E026 : l'aide renvoie à « Mon gestionnaire » ;
  - E027/E146 : le même chiffre est appelé « lots » puis « biens » ;
  - E040/E154 : « votre propriétaire ou gestionnaire reste le responsable de traitement », montré au propriétaire. Dans la passe 2, /compte/donnees ajoute en tête un bloc générique « adressez-vous à son bailleur », que le propriétaire voit aussi (page.tsx:57-60) ;
  - E049/E160 : « Mettre en location » reste proposé sur un lot bloqué (boutons-etat-lot.tsx n'a pas changé).

## Non vérifié à l'écran
- **Fonctions sans capture :** le compte balayé n'a ni bail, ni locataire en bail, ni abonnement. Aucune capture ne montre donc :
  - la case « mariés ou pacsés » et le refus de l'avenant pour un bail d'époux ;
  - le congé et sa date limite ;
  - la relance de loyer à la main ;
  - la case de confirmation d'un exercice ancien (régularisation de charges) ;
  - le dépôt de garantie et son reçu ;
  - l'adresse du nouveau domicile à l'état des lieux de sortie ;
  - la liste des pièces du décret sur la fiche d'une personne ;
  - l'accord d'un abonné aux nouvelles conditions et la variante « vendeur incomplet » ;
  - la date limite de révision affichée dans l'agenda.

  Les parcours e2e correspondants sont verts (bail-epoux-pacses, avenant-bail, textes-t3, prudences-juridiques, agenda-echeances-proprietaire, revision-loyer-rappel, restitution-ecran-honnete, abonnement, envois-automatiques). Le code a été relu par endroits, sans rien trouver de faux : délai du congé (le calcul refait sur 3 cas donne le résultat attendu), messages mariés ou pacsés, avertissement sur un exercice ancien, libellés de l'agenda.
- **Captures à 1440 px :** la plupart s'arrêtent au premier écran (1000 px de haut).
- **Captures « --ouvert » à 1440 px :** la barre latérale et l'en-tête y sont redessinés au milieu de la page. C'est un artefact de capture, qui n'a pas été jugé.
