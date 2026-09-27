# Protection des pièces déposées — état au 27 septembre 2026

## État réel

Les formulaires contrôlent la taille, le contenu annoncé par le fichier (PDF/JPEG/PNG), la présence de la fin d'un PDF et les doublons selon le parcours. Les espaces de documents restent privés et leurs droits sont contrôlés. **Ces vérifications ne sont pas une analyse antivirus. Aucun antivirus n'est actuellement connecté.**

La console Scaleway demande une nouvelle connexion. Il n'y a donc ni service antivirus déployé, ni coût d'hébergement accepté à ce stade. Ne pas afficher « fichier sans virus » ni une pastille verte sur la seule vérification du format.

## Mise en place prévue

1. Un service ClamAV dédié, hébergé dans l'espace Gerimmo en France, analyse les octets. Les documents ne doivent pas être envoyés à un service public de partage d'échantillons.
2. La connexion passe par HTTPS et une authentification serveur. Le port ClamAV brut ne doit jamais être exposé sur Internet. Ne conserver ni les contenus ni les noms des pièces dans les journaux.
3. Refuser le dépôt ou conserver la pièce en quarantaine si le moteur est indisponible, si ses signatures sont anciennes, si la limite d'analyse est atteinte, ou si le document chiffré ne peut pas être analysé. Un délai dépassé ne vaut jamais un résultat sain.
4. Couvrir tous les dépôts : GED, remplacement de document, assurance locataire, pièce demandée, signature manuscrite, retour signé, artisan et photo d'incident.
5. Protéger aussi les accès directs au stockage : une vérification dans les formulaires seuls serait contournable. Les nouveaux objets doivent rester illisibles tant qu'une analyse serveur de ces octets n'a pas été enregistrée. Les objets doivent rester immuables après analyse ; le remplacement crée un nouvel objet à analyser.
6. Prévoir la reprise des anciennes pièces, l'affichage « analyse en cours / accepté / refusé », les délais, le nettoyage des fichiers refusés et une alerte de supervision compréhensible.
7. Tester un fichier sain, l'échantillon inoffensif de test EICAR, un fichier chiffré, une panne, un délai dépassé, des signatures obsolètes, un contournement direct du stockage et les droits des différents profils.

L'hébergement et son coût doivent être présentés avant souscription. Le branchement et les règles de quarantaine devront être testés ensemble avant activation ; la préparation de ce document ne vaut pas livraison de l'antivirus.

## Références techniques officielles

- [ClamAV — analyse et limites](https://docs.clamav.net/manual/Usage/Scanning.html)
- [Scaleway — tarifs des machines](https://www.scaleway.com/en/pricing/virtual-instances/)
- [Scaleway — conteneurs sans serveur](https://www.scaleway.com/en/pricing/serverless/)
