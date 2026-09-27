"""Fiche de tests — Agence immobilière (Nadia Bensaïd, Horizon Gestion).

Libellés relevés dans le code au 27/09/2026 (menus : lib/navigation-espace.ts ;
parc, lots, baux, EDL, loyers, incidents, comptabilité : app/agence/[orgId]/…).
Les chemins de fichiers partent du dossier « documents/ » du dossier agence.
"""

import univers as U

A = U.AGENCE
AR = U.ARTISAN_ENTREPRISE

PREFIXE = "AGC"
TITRE = "Agence immobilière"
SOUS_TITRE = "Nadia Bensaïd, gérante d'Horizon Gestion — administratrice d'agence"

TESTS = [
    # ------------------------------------------------------------------ J1
    {
        "id": "AGC-01", "phase": "J1 · Arrivée et installation", "titre": "Recevoir son accès et choisir son mot de passe",
        "duree": "10 min", "appareil": "ordinateur",
        "attendre": "Le coordinateur ouvre l'organisation « Horizon Gestion (recette) » avec votre adresse e-mail (vous recevez alors le courriel).",
        "etapes": [
            "Ouvrez le courriel **« Votre accès Gerimmo »** (regardez aussi dans les indésirables).",
            "Cliquez ⟦b|Choisir mon mot de passe⟧. Le lien vaut **1 heure** et ne sert qu'une fois.",
            "Essayez d'abord le mot de passe ⟦v|password1234⟧ (12 caractères mais présent dans toutes les fuites de données) : Gerimmo doit le refuser.",
            "Saisissez un vrai mot de passe de 12 caractères ou plus dans ⟦c|Nouveau mot de passe⟧ et ⟦c|Confirmation⟧, puis ⟦b|Changer le mot de passe⟧.",
            "Connectez-vous sur **www.gerimmo.app/connexion** avec votre adresse et ce mot de passe.",
        ],
        "attendu": "Vous arrivez sur le ⟦m|Tableau de bord⟧ (« Bonjour … ») avec le bloc « Mettre votre premier lot en location » et ses 6 étapes. Si l'agence est en essai, la barre latérale affiche « Essai gratuit — N jours restants ».",
        "attention": "Lien expiré ? Page de connexion → « Mot de passe oublié ? » → un nouveau lien arrive.",
    },
    {
        "id": "AGC-02", "phase": "J1 · Arrivée et installation", "titre": "Compléter l'identité de l'agence",
        "duree": "10 min", "appareil": "ordinateur",
        "donnees": "« Mon personnage » § 3 (identité de l'agence).",
        "etapes": [
            "Menu du compte (⟦b|Mon compte⟧ en haut à droite) → ⟦m|Profil de l'agence⟧, ou ⟦b|Compléter le profil⟧ depuis le tableau de bord.",
            f"Carte « Identité » : ⟦c|Nom de l'agence⟧ ⟦v|{A['nom']}⟧, ⟦c|Adresse⟧ ⟦v|{A['adresse']}⟧, ⟦c|Code postal⟧ ⟦v|{A['code_postal']}⟧, ⟦c|Ville⟧ ⟦v|{A['ville']}⟧, ⟦c|Téléphone⟧ ⟦v|{A['telephone']}⟧, ⟦c|Email de contact⟧ : votre adresse.",
            f"⟦c|SIRET⟧ ⟦v|{A['siret_lisible']}⟧, ⟦c|Carte professionnelle (n° et CCI)⟧ ⟦v|{A['carte_pro']} — CCI Paris Île-de-France⟧, ⟦c|Garantie financière (organisme, montant)⟧ ⟦v|{A['garantie']}⟧, ⟦c|N° de TVA intracommunautaire⟧ ⟦v|{A['tva']}⟧.",
            f"⟦c|IBAN (modalités de paiement des documents)⟧ ⟦v|{A['iban']['iban_lisible']}⟧ (fictif : c'est ce que vos locataires verront).",
            "Videz exprès le champ ⟦c|Carte professionnelle⟧ et cliquez ⟦b|Enregistrer⟧ : le formulaire doit refuser. Remettez la valeur, puis ⟦b|Enregistrer⟧.",
        ],
        "attendu": "Le profil est enregistré ; l'étape « Votre identité » du tableau de bord passe au vert. Un champ obligatoire vide bloque l'enregistrement avec un message clair.",
    },
    {
        "id": "AGC-03", "phase": "J1 · Arrivée et installation", "titre": "Habiller l'espace à vos couleurs (logo, couleurs)",
        "duree": "5 min", "appareil": "ordinateur",
        "fichiers": ["11-tests-negatifs/logo-trop-lourd.png", "01-identite-de-l-agence/logo-horizon-gestion-600x150.png"],
        "etapes": [
            "⟦m|Profil de l'agence⟧ → sous-section « Votre marque sur Gerimmo ».",
            "⟦c|Votre logo⟧ : choisissez d'abord ⟦f|logo-trop-lourd.png⟧ puis ⟦b|Enregistrer⟧ → Gerimmo doit refuser (« Choisissez un logo de moins de 200 Ko. »).",
            "Recommencez avec ⟦f|logo-horizon-gestion-600x150.png⟧ ; ⟦c|Nom affiché⟧ ⟦v|Horizon Gestion⟧ ; ⟦c|Couleur principale⟧ ⟦v|#1F5FBF⟧ ; ⟦c|Couleur foncée⟧ ⟦v|#0F2352⟧ ; laissez vides ⟦c|Adresse personnalisée⟧ et ⟦c|Adresse d'envoi des emails⟧ → ⟦b|Enregistrer⟧.",
        ],
        "attendu": "L'aperçu « Identité actuellement enregistrée » montre le logo et les couleurs ; l'en-tête de l'espace les reprend. Ils apparaîtront aussi dans l'espace de Camille, sur les documents et dans les courriels aux locataires.",
    },
    {
        "id": "AGC-04", "phase": "J1 · Arrivée et installation", "titre": "Activer les envois automatiques (relances au plus court)",
        "duree": "3 min", "appareil": "ordinateur",
        "etapes": [
            "⟦m|Profil de l'agence⟧ → cochez « Annoncer chaque échéance au locataire par e-mail », « Envoyer automatiquement les quittances et reçus aux locataires » et « Relancer automatiquement les loyers impayés par e-mail ».",
            "⟦c|Première relance, jours après l'échéance⟧ ⟦v|1⟧ ; ⟦c|Seconde relance…⟧ ⟦v|2⟧ (au plus court, pour voir les relances pendant la recette) → ⟦b|Enregistrer⟧.",
        ],
        "attendu": "Les trois cases restent cochées après rechargement de la page. Les envois partent chaque matin (avis vers 9 h 30, quittances vers 9 h, relances vers 9 h 45, heure de Paris).",
    },
    {
        "id": "AGC-05", "phase": "J1 · Arrivée et installation", "titre": "Déposer la signature préenregistrée",
        "duree": "3 min", "appareil": "ordinateur",
        "fichiers": ["01-identite-de-l-agence/signature-nadia-bensaid.png"],
        "etapes": [
            "⟦m|Profil de l'agence⟧ → carte « Signature préenregistrée » → ⟦c|Déposer une signature (PNG/JPEG, 1 Mo max)⟧ : ⟦f|signature-nadia-bensaid.png⟧ → ⟦b|Enregistrer⟧.",
            "Lisez la carte « Parrainage » : notez ⟦c|Votre code⟧ dans votre suivi (il servira peut-être).",
        ],
        "attendu": "L'aperçu de la signature s'affiche. Elle sera apposée sur les quittances, reçus et courriers (vérifié en AGC-27), jamais sur un bail ni un état des lieux.",
    },
    {
        "id": "AGC-06", "phase": "J1 · Le parc", "titre": "Créer la Résidence Les Essais et ses deux lots",
        "duree": "10 min", "appareil": "ordinateur",
        "etapes": [
            "⟦m|Parc de l'agence⟧ → ⟦b|Ajouter un bien⟧.",
            "⟦c|Référence interne⟧ ⟦v|Résidence Les Essais⟧ ; ⟦c|Type⟧ ⟦v|Immeuble⟧ ; ⟦c|Adresse⟧ ⟦v|14 allée des Essais⟧ (adresse fictive : ignorez les suggestions) ; ⟦c|Code postal⟧ ⟦v|91300⟧ ; ⟦c|Ville⟧ ⟦v|Massy⟧ ; ⟦c|Année de construction⟧ ⟦v|1972⟧.",
            "Cochez ⟦c|En copropriété⟧ et ⟦c|En zone tendue⟧. ⟦c|Parties communes⟧ ⟦v|Hall, ascenseur, cave, local vélos, espaces verts⟧ ; ⟦c|Accès internet, téléphone, TV (TIC)⟧ ⟦v|Fibre optique et antenne TNT collective⟧.",
            "« Lots de l'immeuble » : ⟦c|Nom du lot⟧ ⟦v|A12⟧, ⟦c|Surface (m²)⟧ ⟦v|45.6⟧, ⟦c|Pièces⟧ ⟦v|2⟧ ; ⟦b|+ Ajouter un lot⟧ : ⟦v|A05⟧, ⟦v|24.3⟧, ⟦v|1⟧.",
            "⟦b|Créer le bien et ses 2 lots⟧.",
        ],
        "attendu": "Le bien et ses deux lots existent, lots « En préparation ». La fiche du bien signale « Clé de répartition — À valider ».",
    },
    {
        "id": "AGC-07", "phase": "J1 · Le parc", "titre": "Valider la clé de répartition",
        "duree": "3 min", "appareil": "ordinateur",
        "etapes": [
            "Fiche du bien → section « Clé de répartition ».",
            "Gerimmo propose une répartition à la surface (environ 65 % pour A12, 35 % pour A05). Ouvrez ⟦b|Modifier⟧ pour voir les autres modes, puis revenez à la proposition.",
            "⟦b|Valider la clé par surface⟧.",
        ],
        "attendu": "« En vigueur (Surface…, effet au …) », 100 % exactement. Sans clé valide, aucun lot de l'immeuble ne peut passer en disponible.",
    },
    {
        "id": "AGC-08", "phase": "J1 · Le parc", "titre": "Compléter la fiche des deux lots et leurs pièces",
        "duree": "10 min", "appareil": "ordinateur",
        "donnees": "« Mon personnage » § 4 (lots A12 et A05).",
        "etapes": [
            "Fiche du lot A12 → ⟦b|Modifier le lot⟧ : ⟦c|Étage⟧ ⟦v|2⟧ ; ⟦c|Identifiant fiscal du logement⟧ ⟦v|9999913770012⟧ ; ⟦c|Surface (m²)⟧ ⟦v|45.6⟧ ; ⟦c|Pièces⟧ ⟦v|2⟧ ; ⟦c|Chauffage⟧ ⟦v|Individuel — électricité⟧ ; ⟦c|Eau chaude⟧ ⟦v|Individuelle — ballon électrique⟧ ; ⟦c|Locaux privatifs⟧ ⟦v|Cave n° 12⟧ ; ⟦c|Autres parties du logement⟧ ⟦v|Néant⟧ → ⟦b|Enregistrer⟧.",
            "Section « Pièces (état des lieux) » : ⟦b|Proposer les pièces de ce logement⟧, puis vérifiez qu'il y a Entrée, Séjour, Cuisine, Chambre, Salle de bain (ajoutez « WC » par ⟦b|Autre pièce…⟧).",
            "Lot A05 → ⟦b|Modifier le lot⟧ : ⟦c|Étage⟧ ⟦v|RDC⟧ ; identifiant ⟦v|9999913770005⟧ ; ⟦v|24.3⟧ m² ; ⟦v|1⟧ pièce ; chauffage et eau chaude comme A12 ; ⟦c|Locaux privatifs⟧ ⟦v|Néant⟧ ; cochez ⟦c|Meublé⟧ ; ⟦c|Autres parties du logement⟧ ⟦v|Néant⟧ → ⟦b|Enregistrer⟧.",
        ],
        "attendu": "Les deux fiches sont complètes. L'encadré « Ce qui empêche la mise en location » ne cite plus que la détention et les diagnostics.",
    },
    {
        "id": "AGC-09", "phase": "J1 · Le parc", "titre": "Créer le mandant Bernard Fontaine et sa détention",
        "duree": "10 min", "appareil": "ordinateur",
        "fichiers": ["03-mandant-bernard-fontaine/piece-identite-bernard-fontaine.pdf", "03-mandant-bernard-fontaine/RIB-bernard-fontaine.pdf"],
        "etapes": [
            "⟦m|Personnes⟧ → ⟦b|+ Créer une fiche⟧ → rôle ⟦v|Propriétaire mandant⟧.",
            "⟦c|Nom⟧ ⟦v|FONTAINE⟧ ; ⟦c|Prénom⟧ ⟦v|Bernard⟧ ; ⟦c|Adresse email⟧ : **votre adresse avec « +mandant »** (ex. ⟦v|prenom.nom+mandant@gmail.com⟧) ; ⟦c|Téléphone⟧ ⟦v|06 39 98 42 30⟧ ; ⟦c|Date de naissance⟧ ⟦v|03/11/1956⟧ ; ⟦c|Commune de naissance⟧ ⟦v|Orléans⟧ ; ⟦c|Adresse⟧ ⟦v|22 avenue des Maquettes⟧ ; ⟦v|75012⟧ ⟦v|Paris⟧ ; ⟦c|Rattacher à un lot de l'agence⟧ : ⟦v|A12⟧ → ⟦b|Créer la fiche⟧.",
            "Sur sa fiche, carte « Pièces justificatives » : ⟦c|Type de pièce⟧ ⟦v|Pièce d'identité⟧ + ⟦f|piece-identite-bernard-fontaine.pdf⟧ → ⟦b|Déposer⟧ ; puis ⟦v|Justificatif⟧ + ⟦f|RIB-bernard-fontaine.pdf⟧ → ⟦b|Déposer⟧.",
            "Fiche du lot A05 → section « Propriétaires mandants du lot » : ⟦c|Propriétaire⟧ ⟦v|Bernard FONTAINE⟧, ⟦c|Quote-part (%)⟧ ⟦v|100⟧, ⟦c|Début de détention⟧ ⟦v|01/09/2026⟧ → ⟦b|Enregistrer la détention⟧.",
        ],
        "attendu": "« Détention active : 100 % » sur A12 et A05. Sa fiche n'a pas de carte « Accès locataire » : un mandant n'a jamais de compte, c'est voulu.",
    },
    {
        "id": "AGC-10", "phase": "J1 · Le parc", "titre": "Déposer les diagnostics des lots et de l'immeuble",
        "duree": "15 min", "appareil": "ordinateur",
        "donnees": "Dates de réalisation et d'échéance : « Mon personnage » § 5 (elles sont aussi écrites sur chaque PDF).",
        "fichiers": ["02-residence-les-essais-diagnostics/ (DPE, électricité, amiante)"],
        "etapes": [
            "Fiche du lot A12 → « Diagnostics du lot » → ligne DPE → ⟦b|Déposer⟧ : ⟦c|Diagnostiqueur⟧ ⟦v|Diag'Essai Expertises⟧, ⟦c|Classe énergétique (DPE)⟧ ⟦v|D⟧, ⟦c|Réalisé le⟧ ⟦v|18/11/2025⟧, ⟦c|Expire le⟧ ⟦v|17/11/2035⟧, ⟦c|Rapport du diagnostiqueur⟧ ⟦f|DPE-lot-A12.pdf⟧ → ⟦b|Déposer⟧.",
            "Même geste pour ⟦v|Électricité⟧ (⟦v|02/09/2026⟧ → ⟦v|01/09/2032⟧, ⟦f|electricite-lot-A12.pdf⟧) et ⟦v|Amiante (privatif)⟧ (⟦v|12/05/2021⟧, **Expire le vide** = illimité, ⟦f|amiante-privatif-lot-A12.pdf⟧). Pas de gaz dans l'immeuble : laissez la ligne Gaz vide.",
            "Lot A05 : DPE classe ⟦v|E⟧ (mêmes dates que A12, ⟦f|DPE-lot-A05.pdf⟧), électricité et amiante (privatif) avec les fichiers « lot-A05 ».",
            "Fiche du bien → « Diagnostics de l'immeuble » → ⟦v|Amiante (parties communes)⟧ : ⟦v|12/05/2021⟧, échéance vide, ⟦f|amiante-parties-communes-immeuble.pdf⟧. **Ne déposez pas encore l'ERP** (test suivant).",
        ],
        "attendu": "Chaque diagnostic apparaît avec sa date et son échéance ; le DPE montre sa classe. Aucun fichier n'est refusé (tous sont différents).",
        "attention": "Si un dépôt échoue avec un message général, **ne réessayez pas le même fichier** : il est peut-être resté dans les documents et serait refusé comme doublon. Utilisez la copie de secours (dossier ⟦f|secours/⟧) et signalez-le.",
    },
    {
        "id": "AGC-11", "phase": "J1 · Le parc", "titre": "Un ERP périmé bloque la mise en location, un ERP valide la débloque",
        "duree": "10 min", "appareil": "ordinateur",
        "fichiers": ["02-residence-les-essais-diagnostics/test-negatif/ERP-immeuble-PERIME.pdf", "02-residence-les-essais-diagnostics/ERP-immeuble.pdf"],
        "etapes": [
            "Fiche du bien → « Diagnostics de l'immeuble » → ⟦v|ERP — état des risques⟧ → ⟦b|Déposer⟧ : ⟦c|Réalisé le⟧ ⟦v|03/01/2026⟧, ⟦c|Expire le⟧ ⟦v|03/07/2026⟧ (déjà passé), fichier ⟦f|ERP-immeuble-PERIME.pdf⟧.",
            "Fiche du lot A12 → ⟦b|Mettre en location⟧.",
            "Constatez le refus, puis revenez à l'ERP → ⟦b|Remplacer⟧ : ⟦v|15/09/2026⟧ → ⟦v|15/03/2027⟧, ⟦f|ERP-immeuble.pdf⟧.",
            "Fiche du lot A12 → ⟦b|Mettre en location⟧ ; puis faites de même pour A05.",
        ],
        "attendu": "Avec l'ERP périmé : « Passage en disponible impossible : … » citant l'ERP (ou « Un diagnostic déposé est expiré »). Avec l'ERP valide : « Lot passé en « Disponible ». » pour A12 et A05.",
    },
    {
        "id": "AGC-12", "phase": "J1 · Le parc", "titre": "Créer le mandat de gestion et l'activer",
        "duree": "10 min", "appareil": "ordinateur",
        "etapes": [
            "⟦m|Personnes⟧ → fiche de Bernard FONTAINE → carte « Mandats de gestion » → « Nouveau mandat » : ⟦c|Date de rapport (jour du mois)⟧ ⟦v|10⟧, ⟦c|Seuil de délégation (€)⟧ ⟦v|500⟧ → ⟦b|Créer le mandat⟧.",
            "Composez-le : ⟦c|Lot⟧ ⟦v|A12⟧ + ⟦c|Taux %⟧ ⟦v|7⟧ → ⟦b|Ajouter⟧ ; puis ⟦v|A05⟧ + ⟦v|7⟧ → ⟦b|Ajouter⟧.",
            "⟦b|Mandat PDF⟧ : ouvrez le mandat généré et relisez-le (parties, lots, taux).",
            "⟦b|Passer à signer⟧ puis ⟦b|Activer⟧ (il n'y a pas de dépôt de mandat signé : c'est prévu ainsi).",
            "Plus → ⟦m|Mandats & versements⟧ : le mandat y figure. Plus → ⟦m|Abonnement⟧ : regardez « Lots sous mandat actif ».",
        ],
        "attendu": "Mandat « Actif » avec 2 lots à 7 %. « Mandats & versements » le liste ; « Abonnement » compte 2 lots sous mandat actif.",
    },
    {
        "id": "AGC-13", "phase": "J1 · Le parc", "titre": "Payer l'abonnement de l'agence",
        "duree": "10 min", "appareil": "ordinateur", "paiement": True, "optionnel": True,
        "attendre": "Uniquement si le coordinateur vous le demande (agence ouverte en essai).",
        "etapes": [
            f"Plus → ⟦m|Abonnement⟧ : le tarif affiché doit correspondre à 2 lots sous mandat actif ({int(U.TARIFS['agence_forfait_10_lots'])} € par mois jusqu'à 10 lots).",
            "⟦b|S'abonner — … par mois⟧ → page de paiement Stripe : cliquez d'abord la flèche de retour sans payer → Gerimmo doit afficher « Paiement interrompu : rien n'a été prélevé… ».",
            "Recommencez et payez avec votre carte (adresse de facturation demandée).",
            "⟦b|Gérer mon abonnement⟧ : vérifiez la carte et les factures dans le portail Stripe, sans résilier.",
        ],
        "attendu": "Retour « Merci, votre paiement est enregistré… », statut « Abonnement actif ». Pendant l'essai, la page dit que la carte ne sera débitée qu'à la fin de l'essai (date affichée).",
        "attention": "Paiement réel : ne le faites qu'après accord du coordinateur sur la prise en charge.",
    },
    # ------------------------------------------------------------------ J2
    {
        "id": "AGC-14", "phase": "J2 · Mise en location", "titre": "Créer la fiche de Camille et déposer son dossier",
        "duree": "15 min", "appareil": "ordinateur",
        "fichiers": ["04-dossier-camille-roussel/ (6 fichiers)"],
        "etapes": [
            "⟦m|Personnes⟧ → ⟦b|+ Créer une fiche⟧ → rôle ⟦v|Locataire⟧.",
            "⟦c|Nom⟧ ⟦v|ROUSSEL⟧ ; ⟦c|Prénom⟧ ⟦v|Camille⟧ ; ⟦c|Adresse email⟧ : **l'adresse réelle du testeur « Locataire de l'agence »** (demandez-la au coordinateur) ; ⟦c|Téléphone⟧ ⟦v|06 39 98 51 20⟧ ; ⟦c|Date de naissance⟧ ⟦v|12/03/1994⟧ ; ⟦c|Commune de naissance⟧ ⟦v|Nantes⟧ ; ⟦c|Adresse⟧ ⟦v|5 rue des Brouillons⟧, ⟦v|44000⟧ ⟦v|Nantes⟧ → ⟦b|Créer la fiche⟧.",
            "Carte « Pièces justificatives » : ⟦v|Pièce d'identité⟧ → ⟦f|piece-identite-camille-roussel.pdf⟧ ; ⟦v|Justificatif (revenus, domicile…)⟧ → les 3 bulletins de salaire, ⟦f|attestation-employeur-camille-roussel.pdf⟧ et ⟦f|justificatif-domicile-camille-roussel.pdf⟧ (un dépôt par fichier, avec un titre parlant).",
            "Créez une seconde fiche avec la **même adresse e-mail** : Gerimmo doit refuser (« Cette adresse email est déjà portée par une autre fiche de l'agence… »). Abandonnez-la.",
        ],
        "attendu": "La fiche de Camille porte 6 pièces. Le doublon d'adresse est refusé. **Ne déposez pas** son avis d'impôt ni son RIB : Camille les déposera elle-même (AGC-17).",
    },
    {
        "id": "AGC-15", "phase": "J2 · Mise en location", "titre": "Créer la fiche du garant Philippe Roussel",
        "duree": "8 min", "appareil": "ordinateur",
        "fichiers": ["05-garant-philippe-roussel/ (3 fichiers)"],
        "etapes": [
            "⟦b|+ Créer une fiche⟧ → rôle ⟦v|Garant⟧ : ⟦v|ROUSSEL⟧ ⟦v|Philippe⟧ ; ⟦c|Adresse email⟧ : **votre adresse avec « +garant »** ; ⟦v|06 39 98 51 21⟧ ; né le ⟦v|30/09/1961⟧ à ⟦v|Rennes⟧ ; ⟦v|9 rue des Épreuves⟧, ⟦v|35000⟧ ⟦v|Rennes⟧ → ⟦b|Créer la fiche⟧.",
            "Pièces : ⟦v|Pièce d'identité⟧ ⟦f|piece-identite-philippe-roussel.pdf⟧ ; ⟦v|Justificatif⟧ ⟦f|avis-impot-2026-philippe-roussel.pdf⟧ et ⟦f|attestation-pension-philippe-roussel.pdf⟧.",
        ],
        "attendu": "Fiche du garant avec 3 pièces. N'utilisez pas « Inviter comme locataire » sur cette fiche.",
    },
    {
        "id": "AGC-16", "phase": "J2 · Mise en location", "titre": "Inviter Camille dans son espace",
        "duree": "3 min", "appareil": "ordinateur",
        "etapes": [
            "Prévenez d'abord la testeuse : son lien d'accès ne vaudra qu'une heure.",
            "Fiche de Camille → carte « Accès locataire » → ⟦b|Inviter comme locataire⟧.",
            "Après son premier accès (LOA-01), rouvrez la fiche.",
        ],
        "attendu": "« Invitation envoyée à … » ; puis « Compte locataire actif — la personne accède à son espace ». L'étape « Un locataire » du tableau de bord passe au vert.",
    },
    {
        "id": "AGC-17", "phase": "J2 · Mise en location", "titre": "Réclamer à Camille son avis d'imposition et son RIB",
        "duree": "3 min", "appareil": "ordinateur",
        "attendre": "Camille a activé son compte (LOA-01) : la carte « Pièces réclamées » n'apparaît qu'ensuite.",
        "etapes": [
            "Fiche de Camille → carte « Pièces réclamées » → raccourci ⟦b|Avis d'imposition⟧ (ou tapez-le dans ⟦c|Pièce à demander⟧, puis ⟦b|Demander⟧) ; même geste pour ⟦v|RIB⟧.",
            "Après son dépôt (LOA-04), rouvrez la fiche.",
        ],
        "attendu": "Camille reçoit « Pièce demandée : … ». Après son dépôt, les deux pièces rejoignent son dossier et une alerte vous prévient.",
    },
    {
        "id": "AGC-18", "phase": "J2 · Mise en location", "titre": "Créer le bail de Camille et le compléter",
        "duree": "20 min", "appareil": "ordinateur",
        "donnees": "« Mon personnage » § 6 (bail et compléments).",
        "etapes": [
            "Fiche du lot A12 → section « Baux & état des lieux » : ⟦c|Type de bail⟧ ⟦v|Nu⟧ ; ⟦c|Locataire principal⟧ ⟦v|Camille ROUSSEL⟧ ; ⟦c|Date d'entrée⟧ ⟦v|01/10/2026⟧ ; ⟦c|Jour d'échéance⟧ ⟦v|1⟧ ; ⟦c|Loyer hors charges (€)⟧ ⟦v|890⟧ ; ⟦c|Charges (€)⟧ ⟦v|90⟧ ; ⟦c|Mode de charges⟧ ⟦v|Provision⟧ ; ⟦c|Dépôt de garantie (€)⟧ ⟦v|1800⟧ (exprès) ; ⟦c|Trimestre IRL⟧ ⟦v|T2⟧ ; ⟦c|Révision annuelle du loyer (IRL)⟧ cochée → ⟦b|Créer le bail⟧.",
            "Constatez le refus du dépôt (plafond d'un mois de loyer hors charges pour un bail nu), corrigez à ⟦v|890⟧ → ⟦b|Créer le bail⟧.",
            "Fiche du bail → « Compléments du contrat » : ⟦c|Fixation initiale du loyer⟧ ⟦v|Librement fixé⟧ ; ⟦c|Paiement du loyer⟧ ⟦v|À échoir (d'avance)⟧ ; ⟦c|Lieu de paiement⟧ ⟦v|Virement sur le compte de l'agence Horizon Gestion⟧ ; ⟦c|Valeur de l'IRL de référence⟧ ⟦v|146,00⟧ (valeur de test) ; honoraires ⟦c|part du bailleur⟧ ⟦v|400⟧ et ⟦c|part du locataire⟧ ⟦v|400⟧ ; ⟦c|Clauses particulières⟧ vide ; ⟦c|Dernier loyer du précédent locataire⟧ ⟦v|870⟧, ⟦c|Date du dernier versement⟧ ⟦v|31/07/2026⟧, ⟦c|Date de la dernière révision⟧ ⟦v|01/01/2026⟧ (si ces champs sont proposés) → ⟦b|Enregistrer les compléments⟧.",
            "« Garants » → ⟦b|Ajouter le garant⟧ Philippe ROUSSEL ; « Cautionnement » → ⟦v|Caution solidaire⟧ → ⟦b|Générer l'acte⟧.",
            "⟦b|Générer le bail (PDF)⟧, puis « Notice d'information » → ⟦b|Générer la notice (PDF)⟧. Ouvrez les deux PDF et relisez-les.",
        ],
        "attendu": "Bail en brouillon. Le PDF du bail reprend parties, lot, loyer, charges, dépôt, IRL et compléments ; il est rangé dans ⟦m|Documents⟧. Si Gerimmo refuse de générer (« PDF non généré : N informations sont encore obligatoires »), la liste dit quoi compléter : notez-le.",
    },
    {
        "id": "AGC-19", "phase": "J2 · Mise en location", "titre": "Envoyer le bail à signer à Camille (circuit manuel)",
        "duree": "5 min", "appareil": "ordinateur",
        "attendre": "Camille a un compte actif (LOA-01).",
        "etapes": [
            "Plus → ⟦m|Documents⟧ → sélectionnez le PDF du bail → ⟦b|Envoyer pour signature⟧ (⟦c|Signataire⟧ : Camille).",
            "Après le retour de Camille (LOA-05), rouvrez le document.",
        ],
        "attendu": "« Envoyé pour signature — le signataire est prévenu par e-mail… ». Après son retour : « ✓ Signé par Camille ROUSSEL le … » et ⟦b|Ouvrir le signé⟧. Ce retour **n'active pas** le bail : c'est le test suivant.",
    },
    {
        "id": "AGC-20", "phase": "J2 · Mise en location", "titre": "Déposer le bail signé : le bail devient actif",
        "duree": "8 min", "appareil": "ordinateur",
        "fichiers": ["06-bail-signe/bail-signe-lot-A12-camille-roussel.pdf"],
        "etapes": [
            "Téléchargez depuis ⟦m|Documents⟧ le PDF du bail généré par Gerimmo (AGC-18).",
            "Fiche du bail → carte « Bail signé » → ⟦c|Bail signé (PDF uniquement)…⟧ : déposez **ce PDF téléchargé** → ⟦b|Déposer le bail signé⟧ → Gerimmo doit le refuser (fichier déjà présent dans les documents).",
            "Recommencez avec ⟦f|bail-signe-lot-A12-camille-roussel.pdf⟧ → ⟦b|Déposer le bail signé⟧.",
            "Dans la fenêtre du bail signé : ⟦b|Envoyer au locataire⟧.",
        ],
        "attendu": "Le fichier déjà connu est refusé. Avec l'exemplaire signé : « Bail signé déposé — le contrat est actif… L'état des lieux d'entrée reste à signer : une alerte le rappelle. » Le lot A12 passe « Loué » ; Camille reçoit « Votre bail signé est disponible ».",
    },
    {
        "id": "AGC-21", "phase": "J2 · Mise en location", "titre": "Faire l'état des lieux d'entrée (tablette ou téléphone si possible)",
        "duree": "25 min", "appareil": "les deux",
        "donnees": "« Mon personnage » § 7 : état de chaque pièce, relevés des compteurs, clés. Gerimmo ne prend pas de photo à l'état des lieux : tout se saisit dans la grille.",
        "etapes": [
            "Fiche du bail → carte « États des lieux » → « Nouvel état des lieux » ⟦v|Entrée⟧ → ⟦b|Préparer cet état des lieux⟧ → ⟦b|Ouvrir la grille⟧.",
            "« Mentions du document » : ⟦c|Personnes présentes⟧ ⟦v|Nadia Bensaïd (Horizon Gestion, pour le bailleur) ; Camille Roussel (locataire)⟧ ; ⟦c|Détecteur de fumée⟧ ⟦v|Présent⟧ ; ⟦c|État du détecteur⟧ ⟦v|Fonctionne (testé)⟧ ; ⟦c|Attestation d'assurance fournie⟧ ⟦v|Oui⟧ ; ⟦c|Observations des parties⟧ ⟦v|Néant⟧ → ⟦b|Enregistrer les mentions⟧.",
            "« Pièce par pièce » : pour chaque pièce, « Toute la section : » ⟦v|Bon⟧, puis ajustez les éléments cités dans « Mon personnage » (ex. salle de bain : joints ⟦v|Usagé⟧ avec le commentaire). ⟦b|Enregistrer la grille⟧.",
            "Au téléphone, facultatif : passez en mode avion pendant la saisie (« Hors ligne — saisie gardée sur l'appareil »), puis revenez en réseau (« Synchronisé »).",
            "« Compteurs & clés » : eau froide ⟦v|RCT-0482⟧ relevé ⟦v|482,315⟧ ; électricité ⟦v|0999 1234 5678⟧ relevé ⟦v|12587⟧ ; clés : porte palière ⟦v|3⟧, badge ⟦v|1⟧, boîte aux lettres ⟦v|1⟧, cave ⟦v|1⟧ → ⟦b|Enregistrer les relevés⟧.",
            "⟦b|Enregistrer et signer⟧, puis ⟦b|Générer le PDF⟧.",
        ],
        "attendu": "« État des lieux signé — il est figé. » (puce « Signé — figé »). Le PDF reprend mentions, grille, compteurs et clés ; Camille le retrouve dans son espace. Signer sans mentions enregistrées est refusé avec un message clair.",
    },
    {
        "id": "AGC-22", "phase": "J2 · Mise en location", "titre": "Encaisser le dépôt de garantie",
        "duree": "5 min", "appareil": "ordinateur",
        "etapes": [
            "Fiche du bail → carte « Dépôt de garantie » → ⟦b|Enregistrer un encaissement⟧ : ⟦c|Montant (€)⟧ ⟦v|900⟧ (exprès), ⟦c|Date⟧ du jour, ⟦c|Payé par⟧ ⟦v|Virement⟧, ⟦c|Versé par⟧ ⟦v|Le locataire⟧ → ⟦b|Encaisser⟧.",
            "Constatez le refus, puis recommencez avec ⟦v|890⟧. Ouvrez le reçu PDF du dépôt.",
        ],
        "attendu": "900 € est refusé (plafonné au dépôt du bail) ; 890 € est enregistré avec son reçu. Camille voit son dépôt dans « Mes paiements ».",
    },
    {
        "id": "AGC-23", "phase": "J2 · Mise en location", "titre": "Enregistrer l'artisan dans votre carnet",
        "duree": "5 min", "appareil": "ordinateur",
        "attendre": "L'artisan s'est inscrit et le coordinateur l'a validé (ART-01 à ART-04).",
        "etapes": [
            f"Plus → ⟦m|Carnet d'artisans⟧ → « Enregistrer un artisan » : ⟦c|Raison sociale⟧ ⟦v|{AR['raison_sociale']}⟧ ; ⟦c|SIRET⟧ ⟦v|{AR['siret']}⟧ ; ⟦c|Téléphone mobile⟧ ⟦v|{AR['telephone']}⟧ ; ⟦c|Courriel⟧ vide ; ⟦c|Métiers⟧ ⟦v|Plomberie⟧ et ⟦v|Chauffage⟧ ; ⟦c|Zone d'intervention — codes postaux⟧ ⟦v|91300, 91000⟧ → ⟦b|Enregistrer l'artisan⟧.",
            "Ouvrez sa fiche dans le carnet.",
        ],
        "attendu": "« Artisan enregistré. Si ce SIRET existait déjà chez Gerimmo, sa fiche vous a été rattachée plutôt que dupliquée. » La fiche montre un artisan validé par Gerimmo (pas de mention « Gerimmo n'a pas encore validé ce profil »).",
    },
    # ------------------------------------------------------------------ J3 loyers
    {
        "id": "AGC-24", "phase": "J3 · Loyers", "titre": "Appeler le terme d'octobre (avis d'échéance)",
        "duree": "5 min", "appareil": "ordinateur",
        "etapes": [
            "Fiche du bail → « Loyers & paiements ». Si l'échéancier est vide (le bail est devenu actif après le 1ᵉʳ du mois), cliquez ⟦b|Générer l'échéancier⟧.",
            "Ouvrez ⟦b|Avis d'échéance (PDF)⟧ du mois d'octobre.",
            "⟦m|Loyers & charges⟧ : regardez les tuiles « Appelé ce mois », « Encaissé », « Reste dû » et la carte « Quittancement d'octobre ». **N'encaissez pas encore.**",
        ],
        "attendu": "Octobre est appelé pour 980 € (890 + 90), puce « Impayé » ou « À échoir ». L'avis PDF porte votre logo et l'IBAN de l'agence. Si l'annonce automatique est cochée, Camille reçoit « Avis d'échéance — octobre 2026 » le lendemain matin.",
    },
    {
        "id": "AGC-25", "phase": "J3 · Loyers", "titre": "Constater la relance automatique d'un loyer impayé",
        "duree": "5 min", "appareil": "ordinateur",
        "attendre": "Le lendemain matin d'AGC-24 (relance réglée à 1 jour en AGC-04).",
        "etapes": [
            "⟦m|Loyers & charges⟧ → carte « Impayés à relancer » ; fiche du bail → rubrique « Relances ».",
            "Demandez à Camille si elle a reçu « Loyer d'octobre — un règlement semble en attente » (vers 9 h 45).",
            "Facultatif : enregistrez une relance à la main (⟦c|Relance 1⟧, ⟦c|Envoyée le⟧) → ⟦b|Enregistrer la relance⟧.",
        ],
        "attendu": "La relance automatique est tracée sur le bail et Camille l'a reçue. Une mise en demeure n'est jamais envoyée automatiquement.",
    },
    {
        "id": "AGC-26", "phase": "J3 · Loyers", "titre": "Encaisser le loyer d'octobre : la quittance naît",
        "duree": "5 min", "appareil": "ordinateur",
        "etapes": [
            "⟦m|Loyers & charges⟧ → ligne de Camille → ⟦b|Encaisser 980,00 €⟧ (vaut un virement reçu ce jour).",
            "Regardez la ligne : lien « quittance », puis ⟦b|Envoyer N quittances et M reçus⟧ si la quittance n'est pas encore partie (sinon elle part seule le lendemain matin).",
        ],
        "attendu": "Paiement complet → quittance d'octobre émise d'office ; tuiles à jour (Reste dû 0). Camille reçoit « Quittance de loyer — octobre 2026 ». Une ligne « ✉ envoyée » s'affiche après l'envoi.",
    },
    {
        "id": "AGC-27", "phase": "J3 · Loyers", "titre": "Relire la quittance, puis corriger un encaissement",
        "duree": "10 min", "appareil": "ordinateur",
        "etapes": [
            "Fiche du bail → « Loyers & paiements » → ⟦b|Quittance (PDF)⟧ d'octobre : vérifiez loyer (890) et charges (90) séparés, période, identité du bailleur et du mandataire, votre signature et votre logo.",
            "Facultatif, **avant** que Camille ne consulte sa quittance : ⟦b|Retirer l'encaissement⟧ (motif ⟦v|Test de correction⟧) → ⟦b|Confirmer⟧ ; puis ⟦b|Saisir un encaissement⟧ ⟦v|980⟧, date du jour, ⟦v|Virement⟧ → ⟦b|Encaisser⟧.",
        ],
        "attendu": "La quittance est conforme (loyer et charges distincts, signature apposée). Après correction, le mois redevient « Payé » avec une quittance réémise ; le retrait reste tracé.",
    },
    # ------------------------------------------------------------------ J3–J5 incidents
    {
        "id": "AGC-28", "phase": "J3–J5 · Incidents", "titre": "Recevoir et qualifier la fuite signalée par Camille",
        "duree": "10 min", "appareil": "les deux",
        "attendre": "Camille a signalé la fuite, en urgence (LOA-10).",
        "fichiers": ["07-incidents/incident-fuite-evier-detail.jpg"],
        "etapes": [
            "Vérifiez le courriel **« URGENT — … »** reçu à la déclaration.",
            "⟦m|Incidents⟧ → filtre « À traiter » → l'incident → ⟦b|Me l'attribuer⟧.",
            "Carte « Ajouter une photo » → ⟦f|incident-fuite-evier-detail.jpg⟧ → ⟦b|Joindre⟧.",
            "« Qualification — qui paie » : ⟦c|Qui prend en charge⟧ ⟦v|Charge propriétaire⟧ ; ⟦c|Justification⟧ ⟦v|Siphon d'origine fissuré par vétusté (pièce de 1998) : réparation à la charge du bailleur⟧ → ⟦b|Qualifier l'incident⟧.",
        ],
        "attendu": "L'incident montre la photo de Camille et la vôtre ; il passe « qualifié ». Camille voit la qualification dans « Mes demandes » (sans courriel).",
    },
    {
        "id": "AGC-29", "phase": "J3–J5 · Incidents", "titre": "Consulter l'artisan et retenir son devis",
        "duree": "10 min", "appareil": "ordinateur",
        "etapes": [
            "Carte « Confier à un artisan » : ⟦c|Métier recherché⟧ ⟦v|Plomberie⟧ ; ⟦c|Nature des travaux⟧ ⟦v|Entretien courant ou réparation simple — sans décennale⟧ ; ⟦c|Validité demandée aux devis (jours)⟧ ⟦v|30⟧ ; cochez « J'assume un devis unique » → ⟦b|Ouvrir la mise en concurrence⟧.",
            "« Artisans proposables sur le 91300 » : Haddad Plomberie Chauffage → ⟦b|Demander un devis⟧.",
            "Attendez son devis (ART-06) : courriel « Devis reçu — Haddad Plomberie Chauffage — 177,65 € — … ».",
            "⟦b|Voir les quantités, les prix et la TVA⟧, puis ⟦b|Retenir ce devis⟧.",
        ],
        "attendu": "L'artisan apparaît dans la liste (validé, bon métier, bonne zone, dans votre carnet). Le devis de 177,65 € TTC est lisible ligne par ligne. Après « Retenir », la mission est confiée : « Confiée — l'artisan n'a pas encore répondu ».",
    },
    {
        "id": "AGC-30", "phase": "J3–J5 · Incidents", "titre": "Suivre le rendez-vous et l'intervention",
        "duree": "5 min (sur 2 à 3 jours)", "appareil": "les deux",
        "attendre": "L'artisan accepte et propose des créneaux (ART-07), Camille en choisit un (LOA-12), l'artisan intervient (ART-09).",
        "etapes": [
            "Suivez la carte « Intervention — Haddad Plomberie Chauffage » : Acceptée → Planifiée (date du rendez-vous) → En cours → Terminée.",
            "⟦m|Agenda⟧ : le rendez-vous y figure.",
            "Après l'intervention : lisez le compte rendu et la photo « après » ; plus tard, la facture déposée (⟦m|Documents⟧, type « Facture d'artisan »).",
        ],
        "attendu": "Chaque étape s'inscrit dans le fil de l'incident (« Compte rendu de l'artisan », « Facture de l'artisan déposée »). Vous n'avez rien eu à ressaisir.",
    },
    {
        "id": "AGC-31", "phase": "J3–J5 · Incidents", "titre": "Noter l'artisan et clôturer l'incident",
        "duree": "5 min", "appareil": "ordinateur",
        "etapes": [
            "« Noter Haddad Plomberie Chauffage » : ⟦c|Qualité du travail⟧ ⟦v|5⟧, ⟦c|Respect du délai⟧ ⟦v|4⟧, ⟦c|Rapport qualité-prix⟧ ⟦v|4⟧, ⟦c|Commentaire — privé à votre agence⟧ ⟦v|Intervention rapide et propre⟧ → ⟦b|Noter l'artisan⟧.",
            "Carte « Clôture » : ⟦c|Motif⟧ ⟦v|Résolu⟧ ; ⟦c|Ce qui a été fait⟧ ⟦v|Siphon et joints remplacés, fuite stoppée⟧ → ⟦b|Clôturer l'incident⟧.",
        ],
        "attendu": "Incident « Clos ». Camille peut donner son avis (LOA-13). Votre commentaire reste privé à l'agence.",
    },
    {
        "id": "AGC-32", "phase": "J3–J5 · Incidents", "titre": "Déclarer vous-même un incident (humidité) et le transmettre au syndic",
        "duree": "8 min", "appareil": "ordinateur",
        "fichiers": ["07-incidents/incident-moisissure-plafond.jpg"],
        "etapes": [
            "⟦m|Incidents⟧ → ⟦b|Ouvrir un incident⟧ : ⟦c|Lot concerné⟧ ⟦v|A12⟧ ; ⟦c|Catégorie⟧ ⟦v|Humidité — infiltration, tache au plafond⟧ ; ⟦c|Pièce concernée⟧ ⟦v|Salle d'eau⟧ ; ⟦c|Urgence⟧ ⟦v|Normal⟧ ; ⟦c|Description⟧ ⟦v|Tache d'humidité au plafond de la salle d'eau, signalée par la voisine du dessus⟧ ; ⟦c|Depuis quand ?⟧ ⟦v|Une semaine⟧ ; ⟦c|Photos⟧ ⟦f|incident-moisissure-plafond.jpg⟧ → ⟦b|Déclarer l'incident⟧.",
            "Qualifiez : ⟦v|Charge propriétaire⟧, justification ⟦v|Infiltration venant de l'étage supérieur (parties communes)⟧.",
            "Clôturez : ⟦c|Motif⟧ ⟦v|Transmis au syndic (parties communes)⟧, ⟦c|Ce qui a été fait⟧ ⟦v|Signalement transmis au syndic le jour même⟧.",
        ],
        "attendu": "L'incident est créé « À qualifier », puis clos avec le motif « Transmis au syndic ». Les listes et filtres (En cours, Clos, Tous) le rangent correctement.",
    },
    {
        "id": "AGC-33", "phase": "J3–J5 · Incidents", "titre": "Imputer un incident au locataire, et recevoir sa contestation",
        "duree": "8 min", "appareil": "ordinateur", "optionnel": True,
        "attendre": "Camille a signalé le volet roulant bloqué (LOA-14).",
        "etapes": [
            "Qualifiez l'incident « volet » : ⟦v|Charge locataire⟧, justification ⟦v|Manœuvre forcée : réparation locative⟧.",
            "Attendez la contestation de Camille (« Contester qui paie »), lisez son motif.",
            "Répondez-lui (⟦m|Messages⟧ ou fiche) puis décidez : maintenir, ou requalifier en ⟦v|Charge propriétaire⟧ si le motif vous convainc. Clôturez.",
        ],
        "attendu": "La contestation est visible sur l'incident ; la requalification (si vous la faites) est tracée et visible par Camille.",
    },
    # ------------------------------------------------------------------ J5–J7 gestion courante
    {
        "id": "AGC-34", "phase": "J5–J7 · Gestion courante", "titre": "Valider l'assurance de Camille",
        "duree": "3 min", "appareil": "ordinateur",
        "attendre": "Camille a déposé son attestation (LOA-03).",
        "etapes": [
            "⟦m|Alertes⟧ : repérez l'alerte liée à l'assurance.",
            "Fiche de Camille → « Pièces justificatives » → l'attestation « À vérifier » → ouvrez-la → ⟦b|Valider⟧.",
        ],
        "attendu": "L'attestation passe « Validée » (Camille voit « Validée »), l'alerte se referme d'elle-même.",
    },
    {
        "id": "AGC-35", "phase": "J5–J7 · Gestion courante", "titre": "Répondre au message de Camille",
        "duree": "3 min", "appareil": "les deux",
        "attendre": "Camille vous écrit (LOA-15).",
        "etapes": [
            "⟦m|Messages⟧ : repérez la conversation (badge). Ouvrez la fiche de Camille → carte « Messages » → ⟦b|Répondre⟧ ⟦v|Bonjour Camille, la régularisation des charges se fait une fois par an, sur justificatifs.⟧",
        ],
        "attendu": "Le badge disparaît ; Camille reçoit « Horizon Gestion vous a répondu ». Note : vous n'êtes pas prévenu par courriel quand un locataire écrit, seulement par le badge.",
    },
    {
        "id": "AGC-36", "phase": "J5–J7 · Gestion courante", "titre": "Documents : retrouver, déposer, refuser un doublon et un faux fichier",
        "duree": "10 min", "appareil": "ordinateur",
        "fichiers": ["09-fin-de-bail/lettre-conge-camille-roussel.pdf", "02-residence-les-essais-diagnostics/DPE-lot-A12.pdf", "11-tests-negatifs/faux-document.pdf"],
        "etapes": [
            "Plus → ⟦m|Documents⟧ : retrouvez le bail signé, l'état des lieux, la quittance, le mandat, les diagnostics.",
            "⟦b|+ Déposer un document⟧ : ⟦f|DPE-lot-A12.pdf⟧, type ⟦v|Autre⟧ → ⟦b|Déposer⟧ → refus attendu (doublon).",
            "Même geste avec ⟦f|faux-document.pdf⟧ (un texte renommé en .pdf) → refus attendu.",
        ],
        "attendu": "Le doublon est refusé avec « Un fichier au contenu strictement identique existe déjà… sous le nom « … » ». Le faux PDF est refusé (contenu vérifié). Rien n'est rangé en double.",
    },
    {
        "id": "AGC-37", "phase": "J5–J7 · Gestion courante", "titre": "Saisir l'appel de charges du syndic",
        "duree": "8 min", "appareil": "ordinateur",
        "fichiers": ["08-copropriete-et-charges/appel-de-fonds-syndic-T4-2026-lot-A12.pdf"],
        "etapes": [
            "Fiche du lot A12 → « Charges de copropriété » → « Saisir un appel de charges » : ⟦c|Exercice⟧ ⟦v|2026⟧ ; ⟦c|Reçu le⟧ date du jour ; ⟦c|Total de l'appel (€)⟧ ⟦v|290,25⟧ ; postes : ⟦v|Récupérable 186,70⟧ et ⟦v|Non récupérable 103,55⟧ (ou poste par poste, d'après le PDF) ; ⟦c|Appel du syndic à joindre⟧ ⟦f|appel-de-fonds-syndic-T4-2026-lot-A12.pdf⟧ → ⟦b|Créer l'appel⟧.",
        ],
        "attendu": "L'appel est enregistré, ventilé récupérable / non récupérable, avec le justificatif joint.",
    },
    {
        "id": "AGC-38", "phase": "J5–J7 · Gestion courante", "titre": "Régulariser les charges de l'année (exploratoire)",
        "duree": "8 min", "appareil": "ordinateur", "optionnel": True,
        "fichiers": ["08-copropriete-et-charges/decompte-charges-2026-lot-A12.pdf"],
        "etapes": [
            "Fiche du bail → « Loyers & paiements » → « Régularisation annuelle des charges » : ⟦c|Année⟧ ⟦v|2026⟧ ; ⟦c|Charges réelles de l'exercice, logement entier (€)⟧ ⟦v|1000⟧ ; ⟦c|Justificatif⟧ ⟦f|decompte-charges-2026-lot-A12.pdf⟧ → ⟦b|Régulariser⟧.",
        ],
        "attendu": "Gerimmo calcule la part de Camille sur sa seule période d'occupation et la compare aux provisions déjà appelées ; le solde (à payer ou à rendre) doit être compréhensible. Signalez tout calcul qui vous paraît faux, en donnant les chiffres affichés.",
    },
    {
        "id": "AGC-39", "phase": "J5–J7 · Gestion courante", "titre": "Écritures : saisir la facture de l'artisan, exporter",
        "duree": "8 min", "appareil": "ordinateur",
        "etapes": [
            "⟦m|Écritures & rapports⟧ : repérez les écritures inscrites seules à l'encaissement (loyer d'octobre et honoraires au taux du mandat, 7 %).",
            "« Saisir une écriture » : ⟦c|Recette ou dépense⟧ ⟦v|Dépense⟧ ; ⟦c|Catégorie⟧ ⟦v|Travaux⟧ ; ⟦c|Montant (€)⟧ ⟦v|177,65⟧ ; ⟦c|Date pièce⟧ date de la facture ; ⟦c|Date d'imputation⟧ date du jour ; ⟦c|Lot⟧ ⟦v|A12⟧ ; ⟦c|Libellé⟧ ⟦v|Facture F2026-0142 Haddad — remplacement du siphon⟧ → ⟦b|Ajouter l'écriture⟧.",
            "« Journal » → ⟦b|Exporter 2026⟧ : ouvrez le CSV.",
        ],
        "attendu": "Loyer et honoraires sont déjà là sans saisie ; la dépense s'ajoute au lot A12 ; l'export CSV contient toutes les lignes.",
    },
    {
        "id": "AGC-40", "phase": "J5–J7 · Gestion courante", "titre": "Clôturer septembre et envoyer le compte rendu au mandant",
        "duree": "10 min", "appareil": "ordinateur",
        "etapes": [
            "⟦m|Écritures & rapports⟧ → « Clôturer un mois » : ⟦c|Mois⟧ ⟦v|septembre 2026⟧ → ⟦b|Clôturer le mois⟧ (irréversible).",
            "Essayez de saisir une écriture datée (imputation) de septembre : elle doit être refusée.",
            "« Rapports de gestion » → Bernard FONTAINE → ⟦c|Mois du rapport de gestion⟧ ⟦v|septembre 2026⟧ → ⟦b|Générer le rapport⟧ → ⟦b|Préparer le PDF pour relecture⟧ → commentaire ⟦v|Premier compte rendu (recette)⟧ → ⟦b|Valider & envoyer le PDF⟧.",
            "Ouvrez votre boîte : l'adresse « +mandant » a reçu le compte rendu.",
            "Renseignez le versement au mandant (montant ⟦v|0⟧, date du jour) → ⟦b|Versement⟧ ; si Gerimmo exige un montant positif, notez le message et passez.",
        ],
        "attendu": "« Mois clôturé. » ; une écriture de septembre est refusée (« Mois clôturé : imputez au mois ouvert ou passez une contre-écriture »). Le rapport de septembre est à 0 € (le mandat ne court que depuis octobre : c'est normal, on teste le circuit). Courriel « Votre compte rendu de gestion — 2026-09 », expéditeur Horizon Gestion, PDF joint. Statut final « Versé ».",
    },
    {
        "id": "AGC-41", "phase": "J5–J7 · Gestion courante", "titre": "Tour des alertes, de l'agenda et des statistiques",
        "duree": "8 min", "appareil": "les deux",
        "etapes": [
            "⟦m|Alertes⟧ : ouvrez chaque alerte, suivez son lien, vérifiez qu'elle mène au bon écran.",
            "⟦m|Agenda⟧ : rendez-vous d'intervention, échéances (diagnostics, assurance, fin d'essai…).",
            "⟦m|Statistiques⟧ et ⟦m|Tableau de bord⟧ : les chiffres collent-ils à ce que vous avez saisi ?",
            "Plus → ⟦m|Les règles à connaître⟧ : lisez une fiche. Refaites le tour au téléphone (barre du bas : Accueil, Parc, Loyers, Alertes, Menu).",
        ],
        "attendu": "Chaque alerte mène à son geste ; les chiffres sont cohérents ; tout reste lisible au téléphone, sans défilement horizontal.",
    },
    # ------------------------------------------------------------------ facultatif : agent, meublé, imports
    {
        "id": "AGC-42", "phase": "Facultatif · L'agent et son portefeuille", "titre": "Inviter un agent et lui confier le mandat",
        "duree": "15 min", "appareil": "ordinateur", "optionnel": True,
        "etapes": [
            "Plus → ⟦m|Administration⟧ → carte « Équipe & portefeuilles » → ⟦c|Ajouter un agent⟧ : **votre adresse avec « +agent »** → ⟦b|Inviter⟧.",
            "Dans une **fenêtre de navigation privée**, ouvrez le courriel « Votre accès Gerimmo » de l'agent, choisissez son mot de passe, connectez-vous : vous êtes Julien Marchetti.",
            "En agent : le menu montre « Mon portefeuille » ; « Aucun lot ne vous est confié ». L'adresse …/administration doit donner une page introuvable ; « Clôturer un mois » n'est pas proposé.",
            "Revenez en administratrice : fiche de Bernard FONTAINE → mandat → ⟦c|Confié à⟧ : l'agent.",
            "En agent : « Mon portefeuille » montre maintenant A12 et A05, et leurs personnes.",
        ],
        "attendu": "L'agent ne voit que les lots des mandats qui lui sont confiés ; les écrans réservés au responsable lui sont fermés.",
    },
    {
        "id": "AGC-43", "phase": "Facultatif · L'agent et son portefeuille", "titre": "Préparer un bail meublé sur le studio A05 (sans l'activer)",
        "duree": "15 min", "appareil": "ordinateur", "optionnel": True,
        "etapes": [
            "⟦m|Personnes⟧ → fiche locataire ⟦v|PILOTE⟧ ⟦v|Léo⟧, adresse **votre adresse avec « +locataire2 »**, né le ⟦v|05/05/2001⟧ à ⟦v|Amiens⟧, ⟦v|3 rue des Essais⟧ ⟦v|80000⟧ ⟦v|Amiens⟧.",
            "Lot A05 → bail ⟦v|Meublé⟧, entrée le 1ᵉʳ du mois prochain, loyer ⟦v|640⟧, charges ⟦v|55⟧ en ⟦v|Forfait⟧, dépôt ⟦v|1280⟧ (2 mois : accepté en meublé) → ⟦b|Créer le bail⟧.",
            "« Inventaire du mobilier » : ajoutez le lit, les plaques, le réfrigérateur, la table et 2 chaises → ⟦b|Ajouter au mobilier⟧ ; générez le bail meublé (PDF).",
            "Ne déposez aucun bail signé : laissez-le en brouillon.",
        ],
        "attendu": "Le forfait de charges et le dépôt de 2 mois sont acceptés en meublé ; l'inventaire figure dans le PDF du bail meublé.",
    },
    {
        "id": "AGC-44", "phase": "Facultatif · Imports", "titre": "Contrôler un fichier de parc plein d'erreurs",
        "duree": "5 min", "appareil": "ordinateur", "optionnel": True,
        "fichiers": ["10-imports/import-parc-avec-erreurs.csv"],
        "etapes": [
            "⟦m|Parc de l'agence⟧ → « Reprendre le parc » (…/parc/import) → ⟦b|Télécharger le gabarit⟧ (pour voir), puis ⟦c|Votre fichier (CSV)⟧ : ⟦f|import-parc-avec-erreurs.csv⟧ **sans l'ouvrir dans Excel** → ⟦b|Contrôler le fichier⟧.",
            "Lisez le rapport ligne par ligne. **N'importez pas.**",
        ],
        "attendu": "1 ligne « prête » et 4 « à corriger » : « Type de bien inconnu : « studio » … », « Code postal attendu sur cinq chiffres », « Le nom du propriétaire est obligatoire… », « Date d'entrée illisible … (attendu AAAA-MM-JJ) ».",
    },
    {
        "id": "AGC-45", "phase": "Facultatif · Imports", "titre": "Importer un petit parc depuis un tableur",
        "duree": "10 min", "appareil": "ordinateur", "optionnel": True,
        "fichiers": ["10-imports/import-parc-ateliers-du-prototype.csv"],
        "etapes": [
            "« Reprendre le parc » → ⟦f|import-parc-ateliers-du-prototype.csv⟧ → ⟦b|Contrôler le fichier⟧ → 5 lignes « prêtes ».",
            "⟦b|Importer 5 lignes⟧.",
            "Rejouez le même fichier (contrôle puis import) : rien ne doit être dupliqué.",
            "⟦m|Parc de l'agence⟧ : ouvrez « Les Ateliers du Prototype » et « Maison Brouillon ».",
        ],
        "attendu": "2 biens et 4 lots créés « En préparation » ; le lot P03 est détenu à 50/50 par Roger MAQUETTE et Line BRISSAC ; 2 baux en brouillon (P01 et P03). Le second import ne crée aucun doublon.",
    },
    {
        "id": "AGC-46", "phase": "Facultatif · Imports", "titre": "Reprendre une balance comptable d'ouverture (en dernier)",
        "duree": "10 min", "appareil": "ordinateur", "optionnel": True,
        "fichiers": ["10-imports/reprise-comptable-horizon.csv"],
        "etapes": [
            "Prérequis : le bail de Camille est actif. ⟦m|Écritures & rapports⟧ → « Reprendre mes comptes — balance d'ouverture → ».",
            "**Avant tout clic**, saisissez : ⟦c|Date de bascule⟧ date du jour ; ⟦c|Trésorerie reprise (€)⟧ ⟦v|230,00⟧ ; ⟦c|Votre balance (CSV)⟧ ⟦f|reprise-comptable-horizon.csv⟧.",
            "⟦b|Contrôler la balance⟧ : l'écart doit être nul. Puis ⟦b|Basculer 2 lignes⟧ (définitif).",
        ],
        "attendu": "2 lignes rattachées au bail du lot A12 (provisions 180 € et avance de 50 €), écart 0, bascule faite. L'avance apparaît au compte de Camille.",
        "attention": "Les valeurs saisies sont figées au premier contrôle, il n'y a pas de bouton d'abandon et une seule reprise par agence : ne rechargez pas la page entre les deux clics. Si vous êtes bloqué, c'est une trouvaille : signalez-la.",
    },
    # ------------------------------------------------------------------ fin
    {
        "id": "AGC-47", "phase": "Dernier jour · Départ de Camille", "titre": "Enregistrer le congé de Camille",
        "duree": "8 min", "appareil": "ordinateur",
        "attendre": "Le coordinateur donne le top de fin ; Camille a « annoncé son départ » (LOA-18).",
        "fichiers": ["09-fin-de-bail/lettre-conge-camille-roussel.pdf"],
        "etapes": [
            "Fiche du bail : repérez l'encadré signalant que la locataire a annoncé son départ.",
            "⟦m|Documents⟧ → ⟦b|+ Déposer un document⟧ : ⟦f|lettre-conge-camille-roussel.pdf⟧, type ⟦v|Courrier⟧, rattaché à Camille.",
            "Fiche du bail → carte « Congé » : ⟦c|Donné par⟧ ⟦v|Locataire⟧ ; ⟦c|Date de réception du congé⟧ date du jour ; lisez « Préavis appliqué : N mois » → ⟦b|Enregistrer le congé⟧.",
        ],
        "attendu": "Préavis d'un mois (zone tendue), bail « Préavis ». Le courrier est rangé et visible par Camille une fois mis à disposition.",
    },
    {
        "id": "AGC-48", "phase": "Dernier jour · Départ de Camille", "titre": "Faire l'état des lieux de sortie",
        "duree": "15 min", "appareil": "les deux",
        "etapes": [
            "Carte « États des lieux » → « Nouvel état des lieux » ⟦v|Sortie⟧ → ⟦b|Préparer cet état des lieux⟧ → ⟦b|Ouvrir la grille⟧ (reprise de l'entrée).",
            "Mentions : ⟦c|Adresse de restitution du dépôt⟧ ⟦v|12 rue des Nouveaux Départs, 44000 Nantes⟧ ; personnes présentes, détecteur, observations comme à l'entrée.",
            "Séjour → murs : ⟦v|Mauvais⟧ avec ⟦v|3 trous de cheville, rayures, trace au mur⟧ ; le reste ⟦v|Bon⟧. Clés rendues : 3 + 1 + 1 + 1 → ⟦b|Enregistrer les relevés et les clés rendues⟧.",
            "⟦b|Enregistrer et signer⟧ → fenêtre « Signer l'état des lieux de sortie » → ⟦b|Signer⟧ ; ouvrez le « Comparatif entrée / sortie ».",
        ],
        "attendu": "Le comparatif fait ressortir le séjour « Dégradé depuis l'entrée ». L'état des lieux de sortie est signé et figé.",
    },
    {
        "id": "AGC-49", "phase": "Dernier jour · Départ de Camille", "titre": "Restituer le dépôt avec une retenue décotée, puis clôturer le bail",
        "duree": "15 min", "appareil": "ordinateur",
        "fichiers": ["09-fin-de-bail/devis-remise-en-peinture-lot-A12.pdf"],
        "etapes": [
            "Carte « Restitution du dépôt de garantie » : ⟦c|Remise des clés⟧ date du jour ; ne cochez pas « Sortie conforme à l'entrée » → ⟦b|Démarrer la restitution⟧.",
            "« Ajouter une retenue (décote de vétusté) » : ⟦c|Objet de la retenue⟧ ⟦v|Remise en peinture du séjour (trous et rayures)⟧ ; ⟦c|Coût (€)⟧ ⟦v|420⟧ ; ⟦c|Durée de vie (ans)⟧ ⟦v|10⟧ ; ⟦c|Âge (ans)⟧ ⟦v|3⟧ ; justificatif ⟦f|devis-remise-en-peinture-lot-A12.pdf⟧ → ⟦b|Ajouter la retenue⟧.",
            "Relisez le décompte → ⟦b|Finaliser le décompte⟧ → ⟦b|Finaliser⟧ ; ⟦c|Envoyé au locataire le⟧ date du jour → ⟦b|Décompte envoyé⟧.",
            "Carte « Congé en cours » → ⟦b|Clôturer le bail⟧.",
        ],
        "attendu": "La retenue est décotée selon l'âge (bien moins que 420 €) et le montant rendu = 890 € − retenue. Le bail passe « terminé », le lot A12 redevient disponible ; l'espace de Camille reste consultable.",
    },
    {
        "id": "AGC-50", "phase": "Dernier jour · Départ de Camille", "titre": "Sécurité du compte et déconnexion",
        "duree": "5 min", "appareil": "les deux",
        "etapes": [
            "Menu du compte → ⟦m|Sécurité du compte⟧ : changez votre mot de passe (actuel, nouveau, confirmation) → ⟦b|Changer le mot de passe⟧.",
            "Constatez que l'adresse de connexion ne se change pas depuis cet écran (message explicatif).",
            "Facultatif : ⟦b|Activer la double authentification⟧ avec une application d'authentification (Google Authenticator, 1Password…), puis retirez-la.",
            "Menu du compte → ⟦b|Se déconnecter⟧ ; essayez d'ouvrir …/espaces : retour à la connexion.",
        ],
        "attendu": "« Mot de passe modifié. Vos autres appareils connectés ont été déconnectés ; celui-ci reste ouvert. » La déconnexion ferme bien l'accès.",
    },
]
