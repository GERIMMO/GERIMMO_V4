# D. Plan d'amélioration (15 chantiers au plus)

Version **dca39641**. Les 41 recommandations de `recommandations.md` sont regroupées en **12 chantiers**, dans
l'ordre où je les ferais.

Pour chaque chantier :
- **Nature** dit ce qu'il faut toucher : texte, mise en page, ou réorganisation d'écran. Aucun ne demande de refaire
  l'identité visuelle.
- **Effet attendu** est ce que l'utilisateur doit pouvoir faire ensuite, sans aide. C'est le test de recette proposé.

| # | Chantier | Recommandations | Écrans | Nature | Effet attendu | Priorité |
|---|---|---|---|---|---|---|
| 1 | **Un accueil propriétaire qui dit quoi faire** : bloc « À faire maintenant » (3 tâches nommées), un seul compteur, parcours « première location » masqué dès qu'un bail est actif, fenêtre d'alertes supprimée ; compte neuf réduit à « Ajoutez votre premier bien ». | 1, 2, 15 | P07, P15, P38, P44 | Réorganisation d'écran | En 10 secondes, un propriétaire nomme sa prochaine action et le logement concerné. | P1 |
| 2 | **Retirer le bandeau « suspendus »** des pages ; une information unique, masquable, sur l'accueil. | 3 | Toutes les pages propriétaire | Texte | Aucun nouveau client ne lit « suspendus » au premier écran. | P1 |
| 3 | **Une inscription en trois champs** (e-mail, nom, statut) ; le reste demandé au premier document ; parrainage replié ; accroche en trois bénéfices. | 4 | E02 | Réorganisation d'écran | Inscription en moins d'une minute au téléphone. | P1 |
| 4 | **Finances sans comptabilité** : une page, trois onglets (Loyers · Dépenses · Bilan de l'année), filtres immédiats, « Ajouter une dépense » simple ; Livre, écritures, clôture et reprise sous « Pour mon comptable » ; état vide en compte neuf. | 5, 16, 17 | P11, P12, P33, P41, P42, P46, P47, P59–P61 | Réorganisation d'écran et texte | Un particulier répond à « Combien m'a rapporté ce logement cette année ? » sans rencontrer un mot de comptable. | P1 |
| 5 | **L'incident en « ce qu'il vous reste à faire »** : action attendue en tête, reste en onglets, créneaux résumés ; liste ouverte sur un filtre non vide. | 6 | P13, P30, P55 | Réorganisation d'écran | Le propriétaire règle la facture et note l'artisan sans faire défiler. | P1 |
| 6 | **Le locataire voit son bailleur et ses documents** : « Ma propriétaire — Élise Morel » (ou la SCI) à la place de « Mon gestionnaire — Parc de … » ; « Mes documents » ouvert sur les documents ; état « bail pas encore activé » en tête ; contact humain avant l'assistant ; bloc d'urgence en un bouton. | 7, 8, 20, 21, 22 | L03, L04, L06, L14, L16, L19 (+ urgence sur 6 écrans) | Texte et mise en page | Un locataire trouve sa quittance et écrit à son propriétaire en deux gestes. | P1 |
| 7 | **L'artisan sait ce qu'on lui doit** : « On vous doit … » en tête de la facturation, une ligne par facture, registre en onglet ; « Factures » dans la barre du bas. | 9, 23 | A01, A07, A26 | Réorganisation d'écran | L'artisan dit en 10 secondes combien il attend et de qui. | P1 |
| 8 | **Une console de dirigeant** : page « Aujourd'hui » (4 à 6 chiffres à décision, puis « À traiter ») ; Santé en phrases ; menu en cinq groupes ; automatismes en une ligne chacun ; technique replié. | 10, 11, 27, 28 | S01, S03, S18, S23, S30, menu | Nouvel écran et réorganisation | Le dirigeant sait en une page si quelque chose demande une décision aujourd'hui. | P1 |
| 9 | **Des fiches courtes** : fiche logement en onglets ; bail aplati ; documents aux titres humains. | 12, 13, 18 | P20, P26, P28 | Mise en page et texte | Une fiche tient en deux écrans de téléphone. | P2 |
| 10 | **Des gestes artisan plus courts** : chantier externe à l'étape suivante ; total du devis visible sans TVA ; créneaux en demi-journées. | 24, 25, 26 | A05, A11, A18 | Réorganisation d'écran | Proposer trois créneaux en trois touches ; un devis ne montre jamais 0,00 € quand une ligne est remplie. | P2 |
| 11 | **Des liens et des invitations qui ne laissent personne bloqué** : liens faux ou expirés avec une action ; connexion directe après le mot de passe ; nom de l'invitant ; abonnement sans faux récapitulatif ; année fiscale claire. | 14, 19, 32, 33 | E07, E08, E09, L00, P01, P04 | Texte | Aucun écran sans issue. | P2 |
| 12 | **Finition commune aux quatre espaces** : pages de compte et règles dans le gabarit, un seul composant de volet, titres et références humains, pluriels, règle de couleurs, panneaux vides à 1440, navigation tablette unique, lisibilité des pages console (S01, S11, S19, S20, S26, S29). | 29–31, 34–41 | Transverse | Texte et mise en page | Aucune page ne « sort » de l'application ; même geste, même apparence partout. | P2 / P3 |

## Ordre proposé

1. **Avant d'ouvrir l'acquisition** : chantiers 1 à 7. Ils touchent les clients payants et leurs locataires ou
   artisans, au premier contact.
2. **Juste après** : le chantier 8 (console), puis les chantiers 9 à 11.
3. **En continu** : le chantier 12, écran par écran, à chaque passage dans le code.

Pour vérifier chaque chantier, il suffit de refaire le test des 10 secondes sur les écrans concernés, au téléphone,
avec une personne qui ne connaît pas Gerimmo.
