# Devis assistés Gerimmo

Le parcours artisan sépare quatre gestes : proposition, conditions, validation et envoi. L'artisan garde la maîtrise de ses prix. La proposition est enregistrée une seule fois par demande ; le bouton Enregistrer le brouillon conserve ses corrections. Les changements d'étape ne démontent aucun champ.

## Prix et IA

Le serveur appelle l'API Responses via `OPENAI_API_KEY` (ou l'alias existant `OPEN_AI_KEY`). `OPENAI_DEVIS_MODEL` permet de choisir le modèle ; sinon le modèle de la plateforme est repris. Les sorties sont structurées. L'IA reçoit seulement la catégorie, une liste de termes techniques extraits et le catalogue ; ni description brute, ni identité, adresse ou coordonnées des habitants ne sont envoyées.

L'IA propose diagnostic, prestations et quantités à confirmer. Les montants proviennent uniquement des références du catalogue, jamais d'un prix inventé par le modèle. Le taux de TVA est choisi par l'artisan. Les prestations sans référence sont à chiffrer. Une indisponibilité de l'IA est signalée et laisse une proposition de catalogue utilisable.

Le catalogue initial contient quatre références de marché françaises en HT : main-d'œuvre plomberie, dépannage électrique en heures ouvrées, application et fourniture de peinture. Sources et date de consultation sont accessibles dans le formulaire et dans `src/lib/references-prix-travaux.ts`. Le centre d'une fourchette n'est pas présenté comme une moyenne statistique nationale ni comme un tarif réglementaire. Les autres prestations peuvent être proposées par l'IA mais restent à chiffrer tant qu'aucune référence fiable n'est ajoutée.

Les moyennes Gerimmo remplacent les repères de marché lorsqu'au moins dix interventions comparables réalisées par trois artisans sont disponibles sur les vingt-quatre derniers mois. Même code de prestation/unité et catégorie d'incident ; travaux terminés, facture validée et montant égal au devis, sans avenant. Une moyenne par chantier évite de surpondérer plusieurs lignes identiques. Seuls les nouveaux devis portant ces codes alimentent les statistiques ; aucune ancienne prestation libre n'est classée arbitrairement. Les agrégats ne divulguent aucune identité ni donnée client.

## Validation, PDF et envoi

La validation recalcule tous les montants et exige une relecture explicite. Elle fige raison sociale, SIRET, coordonnées, adresse, mentions et logo PNG/JPEG de l'entreprise. Le document conserve sa référence et ses octets après modification de la fiche entreprise. Une révision empêche l'écrasement entre deux fenêtres.

Le PDF validé avant envoi est dans le compartiment privé `devis-preparations`, sans policy de lecture directe pour les comptes clients. Sa lecture passe par la route authentifiée qui vérifie la demande adressée à l'artisan. Le serveur vérifie l'empreinte avant lecture/envoi. À l'envoi explicite, les mêmes octets sont classés dans la GED existante, liés au devis et à l'incident, accessibles au demandeur et à l'artisan selon les droits existants.

L'e-mail utilise le prestataire existant et contient le PDF. Il est adressé au créateur de la sollicitation s'il reste membre actif habilité de l'organisation. Pour les anciennes sollicitations sans auteur, le contact de l'organisation reste le repli. Le navigateur ne peut pas définir l'adresse. Une clé d'idempotence protège l'envoi ; son résultat est conservé. Un échec d'e-mail laisse le devis archivé et affiche un bouton de relance.

## Mise en service

Appliquer `20261012090000_devis_assiste_artisan.sql` avant de déployer l'application. Elle crée les préparations, l'identité documentaire, le compartiment privé et les fonctions d'agrégation/envoi. Le service serveur existant est nécessaire ; il n'est jamais exposé au navigateur. Renseigner l'adresse entreprise et, si souhaité, son logo dans Ma fiche entreprise.

Dans l'aperçu local du 12 octobre, la connexion OpenAI n'est pas configurée : le catalogue de références est donc utilisé. Les tests IA et e-mail sont simulés ; aucun e-mail réel n'a été émis. Le rendu PDF est testé avec le moteur Chromium réel, avec logo et sur trois pages, et le parcours a été parcouru dans le navigateur local. Cette fonctionnalité n'a pas été publiée.
