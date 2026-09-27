"""Fiche de tests — Locataire de l'agence (Camille Roussel, lot A12, Massy).

Espace locataire : app/locataire/[orgId]/… (menu : components/nav-locataire.tsx).
Les chemins de fichiers partent du dossier « documents/ » du dossier locataire.
"""

PREFIXE = "LOA"
TITRE = "Locataire de l'agence"
SOUS_TITRE = "Camille Roussel, locataire du T2 A12 géré par Horizon Gestion"

TESTS = [
    {
        "id": "LOA-01", "phase": "J2 · Arrivée", "titre": "Recevoir l'invitation et créer son mot de passe",
        "duree": "5 min", "appareil": "téléphone",
        "attendre": "L'agence vous invite (AGC-16) ; elle vous prévient juste avant.",
        "etapes": [
            "Ouvrez le courriel **« Votre accès Gerimmo »** (vérifiez les indésirables) → ⟦b|Choisir mon mot de passe⟧ **dans l'heure**.",
            "Choisissez un mot de passe de 12 caractères ou plus (⟦c|Nouveau mot de passe⟧, ⟦c|Confirmation⟧) → ⟦b|Changer le mot de passe⟧.",
            "Connectez-vous sur www.gerimmo.app/connexion.",
        ],
        "attendu": "Vous arrivez dans votre espace : « Bonjour Camille ». Au téléphone, la barre du bas propose Accueil, Documents, Paiements, Demandes et Menu.",
        "attention": "Lien expiré (plus d'une heure) ? Page de connexion → « Mot de passe oublié ? » avec votre adresse : un nouveau lien arrive.",
    },
    {
        "id": "LOA-02", "phase": "J2 · Arrivée", "titre": "Découvrir son espace avant le bail",
        "duree": "8 min", "appareil": "les deux",
        "etapes": [
            "⟦m|Accueil⟧ : lisez « Ce qui vous attend » (l'assurance manquante doit y figurer).",
            "⟦m|Mon logement⟧ : avant la signature, « Aucun bail actif — votre logement apparaîtra ici dès la signature ».",
            "Ouvrez chaque entrée du menu : ⟦m|Mes documents⟧, ⟦m|Mes paiements⟧, ⟦m|Mes demandes⟧, ⟦m|Mon gestionnaire⟧, ⟦m|Les règles à connaître⟧, ⟦m|Questions fréquentes⟧.",
            "Regardez l'en-tête : le logo et les couleurs d'Horizon Gestion (si l'agence les a déposés en AGC-03).",
        ],
        "attendu": "Aucune page d'erreur ; des messages clairs quand il n'y a encore rien. L'espace est aux couleurs de l'agence.",
    },
    {
        "id": "LOA-03", "phase": "J2 · Arrivée", "titre": "Déposer son attestation d'assurance habitation",
        "duree": "5 min", "appareil": "téléphone",
        "fichiers": ["attestation-assurance-habitation-camille-roussel.pdf"],
        "etapes": [
            "⟦m|Mes documents⟧ → carte « Votre assurance habitation » → « Déposer mon attestation ».",
            "⟦c|Fichier⟧ ⟦f|attestation-assurance-habitation-camille-roussel.pdf⟧ ; ⟦c|Date d'expiration⟧ ⟦v|01/09/2026⟧ (exprès, déjà passée) → ⟦b|Déposer⟧ → refus attendu.",
            "Corrigez ⟦c|Date d'expiration⟧ ⟦v|30/09/2027⟧ ; ⟦c|Assureur⟧ ⟦v|Mutuelle Fictive de l'Essonne — contrat MFE-MRH-2026-51207⟧ → ⟦b|Déposer⟧.",
        ],
        "attendu": "La date passée est refusée (« Cette attestation est déjà expirée — déposez l'attestation en cours de validité. »). Ensuite : « En cours de vérification », puis « Validée » quand l'agence l'aura validée (AGC-34).",
    },
    {
        "id": "LOA-04", "phase": "J2 · Arrivée", "titre": "Déposer les pièces que l'agence vous réclame",
        "duree": "5 min", "appareil": "téléphone",
        "attendre": "L'agence vous réclame votre avis d'imposition et votre RIB (AGC-17).",
        "fichiers": ["pieces-reclamees/avis-impot-2026-camille-roussel.pdf", "pieces-reclamees/RIB-camille-roussel.pdf"],
        "etapes": [
            "Courriels « Pièce demandée : … » → ⟦m|Mes documents⟧ → carte « Des pièces vous sont demandées ».",
            "Avis d'imposition → ⟦f|avis-impot-2026-camille-roussel.pdf⟧ → ⟦b|Déposer⟧ ; RIB → ⟦f|RIB-camille-roussel.pdf⟧ → ⟦b|Déposer⟧.",
        ],
        "attendu": "Chaque demande disparaît une fois la pièce déposée ; l'agence est prévenue. Aucun message d'erreur.",
    },
    {
        "id": "LOA-05", "phase": "J2 · Arrivée", "titre": "Signer le bail (circuit manuel)",
        "duree": "8 min", "appareil": "les deux",
        "attendre": "L'agence vous envoie le bail à signer (AGC-19).",
        "fichiers": ["document-a-renvoyer-signe/exemplaire-signe-par-camille-roussel.pdf"],
        "etapes": [
            "Courriel « Document à signer : … » → ⟦m|Mes documents⟧ → « Documents à signer » → ⟦b|Télécharger⟧ : relisez le bail (votre nom, l'adresse, 890 € + 90 € de provision, dépôt 890 €, entrée le 01/10/2026).",
            "⟦b|Déposer le signé⟧ avec **le fichier que vous venez de télécharger** → refus attendu (identique au document reçu).",
            "⟦b|Déposer le signé⟧ avec ⟦f|exemplaire-signe-par-camille-roussel.pdf⟧ (votre exemplaire « signé »).",
        ],
        "attendu": "Le fichier non signé est refusé (« Ce fichier est identique au document reçu : signez-le d'abord… »). L'exemplaire signé est accepté : « ✓ … signé et déposé — votre gestionnaire est notifié ».",
    },
    {
        "id": "LOA-06", "phase": "J2 · Arrivée", "titre": "Retrouver son bail signé et son état des lieux d'entrée",
        "duree": "5 min", "appareil": "les deux",
        "attendre": "L'agence a activé le bail (AGC-20) et signé l'état des lieux d'entrée (AGC-21).",
        "etapes": [
            "Courriel « Votre bail signé est disponible ».",
            "⟦m|Mon logement⟧ : loyer, dépôt, préavis ; ⟦b|Consulter mon bail signé⟧.",
            "« Mes états des lieux » : ouvrez l'état des lieux d'entrée et comparez avec « Mon personnage » (eau 482,315 m³, électricité 12 587 kWh, 3 clés + badge + boîte aux lettres + cave).",
        ],
        "attendu": "Le bail signé s'ouvre ; le préavis affiché est d'un mois (zone tendue). L'état des lieux reprend les bons relevés et le bon nombre de clés.",
    },
    {
        "id": "LOA-07", "phase": "J3 · Loyers", "titre": "Avis d'échéance et relance de loyer",
        "duree": "5 min", "appareil": "téléphone",
        "attendre": "L'agence a appelé le terme d'octobre (AGC-24) ; ces courriels partent le matin (vers 9 h 30 et 9 h 45).",
        "etapes": [
            "Vérifiez vos courriels : « Avis d'échéance — octobre 2026 », puis, tant que l'agence n'a pas saisi le paiement, « Loyer d'octobre — un règlement semble en attente ».",
            "⟦m|Mes paiements⟧ : « Loyer restant à régler », l'IBAN de l'agence (bouton ⟦b|Copier⟧), « Vos charges », « Relances reçues ».",
        ],
        "attendu": "Montant de 980 € (890 + 90), relance visible dans « Relances reçues ». **Ne faites aucun virement** : l'IBAN est fictif, l'agence saisit le paiement pour vous.",
    },
    {
        "id": "LOA-08", "phase": "J3 · Loyers", "titre": "Recevoir et vérifier sa quittance",
        "duree": "8 min", "appareil": "les deux",
        "attendre": "L'agence a encaissé votre loyer (AGC-26).",
        "etapes": [
            "Courriel « Quittance de loyer — octobre 2026 » → « Consulter / imprimer le document » (connexion demandée).",
            "Vérifiez : loyer 890 € et charges 90 € séparés, période du 1ᵉʳ au 31 octobre, nom du bailleur (Bernard Fontaine) et de l'agence, signature.",
            "⟦m|Mes paiements⟧ → « Historique des loyers » : la quittance y est ; « Attestation de bon paiement » → ⟦b|Imprimer ou enregistrer⟧.",
        ],
        "attendu": "La quittance est complète et conforme ; l'attestation de bon paiement se génère (elle serait indisponible avec un mois impayé).",
    },
    {
        "id": "LOA-09", "phase": "J3 · Loyers", "titre": "Suivre son dépôt de garantie",
        "duree": "2 min", "appareil": "téléphone",
        "attendre": "L'agence a encaissé le dépôt (AGC-22).",
        "etapes": ["⟦m|Mes paiements⟧ → « Votre dépôt de garantie »."],
        "attendu": "890 €, avec sa date d'encaissement.",
    },
    {
        "id": "LOA-10", "phase": "J3–J5 · Incident", "titre": "Signaler la fuite sous l'évier, depuis le téléphone",
        "duree": "5 min", "appareil": "téléphone",
        "fichiers": ["photos-incident/incident-fuite-evier.jpg (à copier d'abord sur le téléphone)"],
        "etapes": [
            "⟦m|Mes demandes⟧ → ⟦b|Signaler un problème →⟧.",
            "⟦c|Photos (jusqu'à 5)⟧ (premier champ) : ⟦f|incident-fuite-evier.jpg⟧.",
            "⟦c|De quoi s'agit-il ?⟧ ⟦v|Plomberie — joint, siphon, robinetterie⟧ ; ⟦c|Dans quelle pièce ?⟧ ⟦v|Cuisine⟧ ; ⟦c|Décrivez en quelques mots⟧ ⟦v|Fuite sous l'évier, ça goutte en continu, j'ai mis un seau⟧ ; ⟦c|Depuis quand ?⟧ ⟦v|Depuis hier soir⟧ ; ⟦c|Est-ce urgent ?⟧ ⟦v|Oui, dégât en cours ou logement inutilisable⟧ → ⟦b|Envoyer le signalement⟧.",
        ],
        "attendu": "Le signalement est enregistré en trois écrans au plus ; son statut s'affiche dans « Mes demandes » et sur l'accueil. L'agence reçoit un courriel « URGENT ».",
    },
    {
        "id": "LOA-11", "phase": "J3–J5 · Incident", "titre": "Voir qui paie la réparation",
        "duree": "2 min", "appareil": "téléphone",
        "attendre": "L'agence qualifie l'incident (AGC-28).",
        "etapes": ["⟦m|Mes demandes⟧ → l'incident : lisez la qualification et sa justification."],
        "attendu": "« Charge propriétaire » avec la justification de l'agence (vétusté du siphon). Aucun courriel n'est envoyé pour cette étape : c'est normal.",
    },
    {
        "id": "LOA-12", "phase": "J3–J5 · Incident", "titre": "Choisir le créneau de l'intervention",
        "duree": "3 min", "appareil": "téléphone",
        "attendre": "L'artisan propose trois créneaux (ART-07).",
        "etapes": [
            "Courriel « Choisissez le créneau de votre intervention » → ⟦m|Mes demandes⟧ → « Choisissez votre rendez-vous ».",
            "Choisissez un créneau → ⟦b|Confirmer ce rendez-vous⟧.",
        ],
        "attendu": "Courriel « Rendez-vous fixé — … » ; la veille, « Rappel — intervention demain, … » (vers 8 h).",
    },
    {
        "id": "LOA-13", "phase": "J3–J5 · Incident", "titre": "Donner son avis sur l'intervention",
        "duree": "2 min", "appareil": "téléphone",
        "attendre": "L'artisan a terminé (ART-09) et l'agence a clôturé (AGC-31).",
        "etapes": ["⟦m|Mes demandes⟧ → « Votre avis sur l'intervention » : ⟦v|5⟧ étoiles, ⟦v|Rapide et soigneux⟧ → ⟦b|Envoyer mon avis⟧."],
        "attendu": "Avis enregistré. Vous ne jugez pas le prix (vous ne l'avez pas payé).",
    },
    {
        "id": "LOA-14", "phase": "J3–J5 · Incident", "titre": "Signaler un volet bloqué et contester qui paie",
        "duree": "8 min", "appareil": "téléphone", "optionnel": True,
        "fichiers": ["photos-incident/incident-volet-bloque.jpg"],
        "etapes": [
            "⟦b|Signaler un problème →⟧ : photo ⟦f|incident-volet-bloque.jpg⟧ ; ⟦v|Autre problème⟧ ; ⟦v|Séjour⟧ ; ⟦v|Volet roulant bloqué à mi-hauteur, les lames sont sorties du rail⟧ ; urgent : ⟦v|Non⟧ → ⟦b|Envoyer le signalement⟧.",
            "Quand l'agence l'impute « Charge locataire » (AGC-33) : ⟦b|Contester qui paie⟧ → ⟦c|Motif de votre contestation⟧ ⟦v|Le volet s'est bloqué tout seul, sans choc : c'est de l'usure⟧ → ⟦b|Envoyer⟧.",
        ],
        "attendu": "La contestation est enregistrée et visible par l'agence ; sa décision vous est ensuite affichée.",
    },
    {
        "id": "LOA-15", "phase": "J5–J7 · Au quotidien", "titre": "Écrire à son gestionnaire",
        "duree": "3 min", "appareil": "les deux",
        "etapes": [
            "⟦m|Mon gestionnaire⟧ → « Écrire à Horizon Gestion » → ⟦c|Votre message⟧ ⟦v|Bonjour, quand a lieu la régularisation des charges ?⟧ → ⟦b|Envoyer le message⟧.",
            "Attendez la réponse (AGC-35) : courriel « Horizon Gestion vous a répondu » → « Lire la réponse ».",
        ],
        "attendu": "Le fil de discussion garde la question et la réponse.",
    },
    {
        "id": "LOA-16", "phase": "J5–J7 · Au quotidien", "titre": "Sécurité du compte et données personnelles",
        "duree": "5 min", "appareil": "les deux",
        "etapes": [
            "Menu → ⟦m|Sécurité du compte⟧ : changez votre mot de passe (actuel, nouveau, confirmation) → ⟦b|Changer le mot de passe⟧.",
            "Constatez que l'adresse de connexion ne se change pas ici (message explicatif).",
            "Menu → ⟦m|Mes données personnelles⟧ : lisez ce qui est proposé.",
        ],
        "attendu": "« Mot de passe modifié… » ; les explications sont compréhensibles. Dites-nous si quelque chose vous manque (export de vos données, par exemple).",
    },
    {
        "id": "LOA-17", "phase": "J5–J7 · Au quotidien", "titre": "Règles et questions fréquentes",
        "duree": "5 min", "appareil": "téléphone",
        "etapes": ["⟦m|Les règles à connaître⟧ et ⟦m|Questions fréquentes⟧ : lisez deux ou trois fiches (assurance, préavis, dépôt)."],
        "attendu": "Les textes sont clairs et justes pour un locataire ; signalez toute phrase obscure ou fausse (« Proposer une idée » ou « Demander une explication »).",
    },
    {
        "id": "LOA-18", "phase": "Dernier jour · Départ", "titre": "Annoncer son départ",
        "duree": "3 min", "appareil": "téléphone",
        "attendre": "Le coordinateur donne le top de fin.",
        "etapes": [
            "⟦m|Mon logement⟧ → « Vous quittez le logement ? » → ⟦b|Annoncer mon départ⟧.",
            "⟦c|Un mot pour votre gestionnaire⟧ ⟦v|Je quitte le logement pour une mutation, ma lettre recommandée est partie ce jour⟧ → ⟦b|Prévenir mon gestionnaire⟧.",
        ],
        "attendu": "Gerimmo confirme et rappelle que cette annonce ne remplace pas la lettre recommandée. L'agence voit l'annonce sur votre bail.",
    },
    {
        "id": "LOA-19", "phase": "Dernier jour · Départ", "titre": "Recevoir le décompte de restitution du dépôt",
        "duree": "5 min", "appareil": "les deux",
        "attendre": "L'agence a fait l'état des lieux de sortie et finalisé le décompte (AGC-48, AGC-49).",
        "etapes": [
            "« Mes états des lieux » : ouvrez l'état des lieux de sortie.",
            "⟦m|Mes paiements⟧ → « Votre dépôt de garantie » : lisez le décompte (retenue, coût, âge, décote) et ouvrez le justificatif.",
            "Après la clôture du bail : reconnectez-vous et vérifiez que vous accédez toujours à vos quittances et documents.",
        ],
        "attendu": "Chaque retenue est détaillée et justifiée ; le montant rendu = 890 € − retenues. Vos quittances restent consultables après la fin du bail.",
    },
    {
        "id": "LOA-20", "phase": "Dernier jour · Départ", "titre": "Signaler ce qui vous a gêné",
        "duree": "5 min", "appareil": "les deux",
        "etapes": [
            "Menu → ⟦m|Aide et retours⟧ → ⟦v|Proposer une idée⟧ : ce qui vous a le plus manqué comme locataire.",
            "⟦m|Aide et retours⟧ → ⟦m|Mes demandes⟧ : relisez les réponses de la supervision à vos signalements.",
            "Menu → ⟦b|Se déconnecter⟧.",
        ],
        "attendu": "Votre idée est enregistrée (elle sera visible des membres de l'espace de l'agence) ; vos échanges gardent toutes les réponses.",
    },
]
