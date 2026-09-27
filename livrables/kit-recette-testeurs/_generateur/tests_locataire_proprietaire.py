"""Fiche de tests — Locataire du propriétaire (Thomas Girard, T2 B3, Corbeil-Essonnes).

Même espace locataire que chez une agence, mais le gestionnaire est une
propriétaire en direct. Les chemins de fichiers partent du dossier
« documents/ » du dossier locataire.
"""

PREFIXE = "LOP"
TITRE = "Locataire du propriétaire"
SOUS_TITRE = "Thomas Girard, locataire du T2 de Sophie Lemaire (sans agence)"

TESTS = [
    {
        "id": "LOP-01", "phase": "J2 · Arrivée", "titre": "Recevoir l'invitation et créer son mot de passe",
        "duree": "5 min", "appareil": "téléphone",
        "attendre": "La propriétaire vous invite (PRO-10) ; elle vous prévient juste avant.",
        "etapes": [
            "Courriel **« Votre accès Gerimmo »** → ⟦b|Choisir mon mot de passe⟧ **dans l'heure** → mot de passe de 12 caractères ou plus → ⟦b|Changer le mot de passe⟧.",
            "Connectez-vous sur www.gerimmo.app/connexion.",
        ],
        "attendu": "« Bonjour Thomas » ; barre du bas Accueil, Documents, Paiements, Demandes, Menu.",
        "attention": "Plus d'une heure ? « Mot de passe oublié ? » sur la page de connexion.",
    },
    {
        "id": "LOP-02", "phase": "J2 · Arrivée", "titre": "Découvrir son espace",
        "duree": "5 min", "appareil": "les deux",
        "etapes": [
            "⟦m|Accueil⟧ (« Ce qui vous attend »), ⟦m|Mon logement⟧, ⟦m|Mes documents⟧, ⟦m|Mes paiements⟧, ⟦m|Mes demandes⟧, ⟦m|Mon gestionnaire⟧, ⟦m|Les règles à connaître⟧, ⟦m|Questions fréquentes⟧.",
            "⟦m|Mon gestionnaire⟧ : c'est Sophie Lemaire (une particulière), pas une agence.",
        ],
        "attendu": "Aucune page d'erreur ; les textes conviennent à un bailleur particulier (pas de mention d'agence qui n'existe pas). Signalez toute formulation qui supposerait une agence.",
    },
    {
        "id": "LOP-03", "phase": "J2 · Arrivée", "titre": "Déposer son attestation d'assurance",
        "duree": "4 min", "appareil": "téléphone",
        "fichiers": ["attestation-assurance-habitation-thomas-girard.pdf"],
        "etapes": [
            "⟦m|Mes documents⟧ → « Votre assurance habitation » → ⟦c|Fichier⟧ ⟦f|attestation-assurance-habitation-thomas-girard.pdf⟧ ; ⟦c|Date d'expiration⟧ ⟦v|30/09/2027⟧ ; ⟦c|Assureur⟧ ⟦v|Mutuelle Fictive de l'Essonne — contrat MFE-MRH-2026-60311⟧ → ⟦b|Déposer⟧.",
        ],
        "attendu": "« En cours de vérification », puis « Validée » quand la propriétaire l'aura validée (PRO-22).",
    },
    {
        "id": "LOP-04", "phase": "J2 · Arrivée", "titre": "Déposer les trois pièces réclamées",
        "duree": "5 min", "appareil": "téléphone",
        "attendre": "La propriétaire vous les réclame (PRO-10).",
        "fichiers": ["pieces-reclamees/ (justificatif de domicile, avis d'impôt, RIB)"],
        "etapes": ["⟦m|Mes documents⟧ → « Des pièces vous sont demandées » → pour chaque ligne, le fichier correspondant → ⟦b|Déposer⟧."],
        "attendu": "Les trois demandes se referment une à une ; la propriétaire est prévenue.",
    },
    {
        "id": "LOP-05", "phase": "J2 · Arrivée", "titre": "Signer le bail (circuit manuel)",
        "duree": "8 min", "appareil": "les deux",
        "attendre": "La propriétaire vous envoie le bail à signer (PRO-11).",
        "fichiers": ["document-a-renvoyer-signe/exemplaire-signe-par-thomas-girard.pdf"],
        "etapes": [
            "Courriel « Document à signer : … » → ⟦m|Mes documents⟧ → « Documents à signer » → ⟦b|Télécharger⟧ : relisez (entrée le 16/09/2026, 720 € + 60 €, dépôt 720 €).",
            "⟦b|Déposer le signé⟧ avec ⟦f|exemplaire-signe-par-thomas-girard.pdf⟧.",
        ],
        "attendu": "« ✓ … signé et déposé — votre gestionnaire est notifié ».",
    },
    {
        "id": "LOP-06", "phase": "J2 · Arrivée", "titre": "Retrouver bail signé, état des lieux et dépôt",
        "duree": "5 min", "appareil": "les deux",
        "attendre": "La propriétaire a activé le bail et fait l'état des lieux (PRO-11, PRO-12).",
        "etapes": [
            "Courriel « Votre bail signé est disponible » → ⟦m|Mon logement⟧ → ⟦b|Consulter mon bail signé⟧.",
            "« Mes états des lieux » : relevés gaz 8 412, électricité 20 115, eau 311,020 ; 2 clés + boîte aux lettres + bip.",
            "⟦m|Mes paiements⟧ → « Votre dépôt de garantie » : 720 €.",
        ],
        "attendu": "Tout concorde avec « Mon personnage ».",
    },
    {
        "id": "LOP-07", "phase": "J3 · Loyers", "titre": "Échéancier, avis, relance",
        "duree": "5 min", "appareil": "téléphone",
        "attendre": "La propriétaire a généré l'échéancier (PRO-14).",
        "etapes": [
            "Courriels du matin : avis d'échéance, puis relance(s) tant que rien n'est encaissé.",
            "⟦m|Mes paiements⟧ : septembre au prorata (environ 390 €), octobre 780 € ; « Relances reçues » ; IBAN de Sophie (fictif : **aucun virement**).",
            "« Attestation de bon paiement » : essayez-la **avant** vos paiements.",
        ],
        "attendu": "Montants justes. Tant qu'un mois échu est impayé, l'attestation de bon paiement est indisponible (message clair).",
    },
    {
        "id": "LOP-08", "phase": "J3 · Loyers", "titre": "Reçu partiel, puis quittances",
        "duree": "8 min", "appareil": "les deux",
        "attendre": "La propriétaire saisit vos paiements (PRO-15).",
        "etapes": [
            "Courriels : quittance de septembre, « Reçu de paiement — octobre 2026 » (400 €), puis « Quittance de loyer — octobre 2026 ».",
            "Ouvrez le reçu puis la quittance : loyer et charges séparés, période, identité de la bailleuse, montant réglé.",
            "« Attestation de bon paiement » → ⟦b|Imprimer ou enregistrer⟧.",
        ],
        "attendu": "Le reçu partiel ne vaut pas quittance et le dit ; la quittance d'octobre remplace le reçu au solde. L'attestation est maintenant disponible.",
    },
    {
        "id": "LOP-09", "phase": "J3–J5 · Incidents", "titre": "Signaler le radiateur en panne, depuis le téléphone",
        "duree": "5 min", "appareil": "téléphone",
        "fichiers": ["photos-incident/incident-radiateur-froid.jpg (à copier d'abord sur le téléphone)"],
        "etapes": [
            "⟦m|Mes demandes⟧ → ⟦b|Signaler un problème →⟧ : photo ⟦f|incident-radiateur-froid.jpg⟧ ; ⟦c|De quoi s'agit-il ?⟧ ⟦v|Chauffage — radiateur ou eau chaude en panne⟧ ; ⟦v|Chambre⟧ ; ⟦v|Le radiateur de la chambre reste froid, la tête thermostatique est cassée⟧ ; ⟦v|Depuis trois jours⟧ ; urgent : ⟦v|Non, cela peut attendre quelques jours⟧ → ⟦b|Envoyer le signalement⟧.",
        ],
        "attendu": "Signalement enregistré ; son statut s'affiche dans « Mes demandes » et sur l'accueil.",
    },
    {
        "id": "LOP-10", "phase": "J3–J5 · Incidents", "titre": "Proposer vos propres disponibilités à l'artisan",
        "duree": "5 min", "appareil": "téléphone",
        "attendre": "L'artisan propose trois créneaux (ART-11).",
        "etapes": [
            "Courriel « Choisissez le créneau de votre intervention » → ⟦m|Mes demandes⟧.",
            "**Ne choisissez pas** ses créneaux : ⟦b|Aucun ne me convient — proposer mes disponibilités⟧ → 3 × ⟦c|Date⟧ + ⟦c|Moment⟧ (⟦v|Matin (8 h – 12 h)⟧ ou ⟦v|Après-midi (14 h – 18 h)⟧), dans les 2 à 5 jours → ⟦b|Envoyer mes disponibilités⟧.",
            "Attendez que l'artisan retienne une de vos dates.",
        ],
        "attendu": "Vos dates partent à l'artisan (« Le locataire propose d'autres créneaux ») ; quand il en retient une : « Rendez-vous fixé — … », puis le rappel la veille.",
    },
    {
        "id": "LOP-11", "phase": "J3–J5 · Incidents", "titre": "Suivre l'intervention et donner son avis",
        "duree": "3 min", "appareil": "téléphone",
        "attendre": "L'artisan a terminé et la propriétaire a clôturé (ART-13, PRO-17).",
        "etapes": [
            "⟦m|Mes demandes⟧ : suivez le statut jusqu'à « Clos ».",
            "« Votre avis sur l'intervention » : ⟦v|4⟧ étoiles, ⟦v|Ponctuel, travail propre⟧ → ⟦b|Envoyer mon avis⟧.",
        ],
        "attendu": "Avis enregistré.",
    },
    {
        "id": "LOP-12", "phase": "J3–J5 · Incidents", "titre": "Le problème persiste : rouvrir un incident",
        "duree": "3 min", "appareil": "téléphone", "optionnel": True,
        "etapes": ["Sur l'incident clos du radiateur : ⟦b|Le problème persiste⟧ → motif ⟦v|Le radiateur chauffe à peine⟧ → ⟦b|Rouvrir⟧. Prévenez Sophie."],
        "attendu": "L'incident repasse ouvert côté propriétaire, avec votre motif. (Sophie pourra le reclôturer.)",
    },
    {
        "id": "LOP-13", "phase": "J5–J7 · Au quotidien", "titre": "Écrire à sa propriétaire",
        "duree": "3 min", "appareil": "les deux",
        "etapes": [
            "⟦m|Mon gestionnaire⟧ → « Écrire à … » → ⟦v|Bonjour, puis-je installer une étagère murale dans le séjour ?⟧ → ⟦b|Envoyer le message⟧.",
            "Attendez la réponse (PRO-22) : courriel « … vous a répondu ».",
        ],
        "attendu": "La réponse s'affiche dans le fil.",
    },
    {
        "id": "LOP-14", "phase": "J5–J7 · Au quotidien", "titre": "Contester qui paie (prise arrachée)",
        "duree": "3 min", "appareil": "téléphone",
        "attendre": "La propriétaire a déclaré la prise arrachée et vous l'a imputée (PRO-18).",
        "etapes": ["⟦m|Mes demandes⟧ → l'incident « Prise / interrupteur » → ⟦b|Contester qui paie⟧ → ⟦v|La prise était déjà descellée à mon arrivée⟧ → ⟦b|Envoyer⟧."],
        "attendu": "La contestation est enregistrée et visible par la propriétaire.",
    },
    {
        "id": "LOP-15", "phase": "J5–J7 · Au quotidien", "titre": "Sécurité du compte et données personnelles",
        "duree": "5 min", "appareil": "les deux",
        "etapes": [
            "⟦m|Sécurité du compte⟧ : changez le mot de passe.",
            "⟦m|Mes données personnelles⟧ : lisez ce qui est proposé.",
            "⟦m|Aide et retours⟧ → ⟦v|Proposer une idée⟧ : ce qui vous manque comme locataire d'un particulier. Puis ⟦b|Se déconnecter⟧.",
        ],
        "attendu": "« Mot de passe modifié… » ; idée enregistrée ; déconnexion effective.",
    },
]
