"""Fiche de tests — Propriétaire bailleur en gestion directe (Sophie Lemaire).

L'espace propriétaire reprend les écrans de l'agence (/agence/[orgId]) avec
son propre menu (lib/navigation-espace.ts). Les chemins de fichiers partent du
dossier « documents/ » du dossier propriétaire.
"""

import univers as U

AR = U.ARTISAN_ENTREPRISE
T = U.TARIFS
PRIX = str(T["proprietaire_par_bien"]).replace(".", ",")

PREFIXE = "PRO"
TITRE = "Propriétaire bailleur"
SOUS_TITRE = "Sophie Lemaire, propriétaire de deux biens, gère seule sans agence"

TESTS = [
    # ------------------------------------------------------------------ J1
    {
        "id": "PRO-01", "phase": "J1 · Inscription et installation", "titre": "S'inscrire en ligne et confirmer son adresse",
        "duree": "10 min", "appareil": "ordinateur",
        "etapes": [
            "www.gerimmo.app/connexion → « Propriétaire bailleur ? Ouvrir mon espace » (ou directement www.gerimmo.app/inscription).",
            "⟦c|Prénom⟧ ⟦v|Sophie⟧ ; ⟦c|Nom⟧ ⟦v|LEMAIRE⟧ ; ⟦c|Adresse postale⟧ ⟦v|40 boulevard du Test⟧ ; ⟦c|Code postal⟧ ⟦v|91100⟧ ; ⟦c|Ville⟧ ⟦v|Corbeil-Essonnes⟧ ; ⟦c|Téléphone⟧ ⟦v|06 39 98 60 30⟧ ; ⟦c|Vous louez en tant que⟧ ⟦v|Personne physique⟧ ; ⟦c|Adresse e-mail⟧ : la vôtre ; ⟦c|Code de parrainage⟧ : **laissez vide** (sinon l'essai passerait à 30 jours).",
            "Mot de passe de 8 caractères seulement → ⟦b|Ouvrir mon espace⟧ : refus attendu. Puis deux mots de passe différents : refus attendu.",
            "Mot de passe correct (12 caractères ou plus), confirmé ; cochez les CGU → ⟦b|Ouvrir mon espace⟧.",
            "Avant de confirmer, essayez de vous connecter : refus attendu. Puis ouvrez le courriel **« Confirmez votre adresse — Gerimmo »** → ⟦b|Confirmer mon adresse⟧ (lien valable 1 heure).",
        ],
        "attendu": "Messages « Le mot de passe doit compter au moins 12 caractères. », « Les deux saisies ne correspondent pas. », puis « Vérifiez votre boîte mail… ». Connexion avant confirmation : « Votre adresse e-mail n'est pas encore confirmée… ». Après confirmation : votre espace « Parc de Sophie Lemaire » s'ouvre.",
    },
    {
        "id": "PRO-02", "phase": "J1 · Inscription et installation", "titre": "Découvrir son espace",
        "duree": "5 min", "appareil": "les deux",
        "etapes": [
            "⟦m|Tableau de bord⟧ : « Bonjour Sophie », bloc « Mettre votre premier lot en location ».",
            "Barre latérale : « Essai gratuit — 14 jours restants ».",
            "Ouvrez chaque entrée : ⟦m|Mes lots⟧, ⟦m|Locataires & garants⟧, ⟦m|Loyers & charges⟧, ⟦m|Livre recettes-dépenses⟧, ⟦m|Incidents⟧, ⟦m|Alertes⟧, ⟦m|Agenda⟧, ⟦m|Statistiques⟧, ⟦m|Messages⟧, et sous « Plus » : ⟦m|Mon profil⟧, ⟦m|Fiscalité⟧, ⟦m|Documents⟧, ⟦m|Carnet d'artisans⟧, ⟦m|Abonnement⟧, ⟦m|Aide⟧.",
        ],
        "attendu": "Aucune page d'erreur ; chaque écran vide explique quoi faire. Pas de mandat ni d'honoraires : c'est l'espace d'un propriétaire.",
    },
    {
        "id": "PRO-03", "phase": "J1 · Inscription et installation", "titre": "Compléter son profil (condition pour créer un bien)",
        "duree": "8 min", "appareil": "ordinateur",
        "fichiers": ["01-mon-identite/signature-sophie-lemaire.png"],
        "etapes": [
            "⟦m|Mes lots⟧ → ⟦b|Ajouter un bien⟧ : si le profil est incomplet, l'encadré « Complétez d'abord votre profil » apparaît → ⟦b|Compléter mon profil⟧.",
            "⟦m|Mon profil⟧ : ⟦c|Nom de votre espace⟧ ⟦v|Parc de Sophie Lemaire⟧ ; ⟦c|Adresse⟧ ⟦v|40 boulevard du Test⟧ ; ⟦v|91100⟧ ⟦v|Corbeil-Essonnes⟧ ; ⟦c|Téléphone⟧ ⟦v|06 39 98 60 30⟧ ; ⟦c|Email de contact⟧ : votre adresse ; ⟦c|SIRET⟧ vide ; ⟦c|IBAN⟧ ⟦v|FR76 9999 9000 0200 0060 3177 722⟧ (fictif).",
            "Cochez les trois envois automatiques (avis d'échéance, quittances, relances) ; relances à ⟦v|1⟧ et ⟦v|2⟧ jours → ⟦b|Enregistrer⟧.",
            "Carte « Signature préenregistrée » : ⟦f|signature-sophie-lemaire.png⟧ → ⟦b|Enregistrer⟧.",
        ],
        "attendu": "Profil enregistré ; « Ajouter un bien » s'ouvre désormais sur le formulaire. Pas de rubrique de marque (logo) pour un propriétaire : c'est normal.",
    },
    {
        "id": "PRO-04", "phase": "J1 · Mes biens", "titre": "Créer l'appartement du Banc-d'Essai",
        "duree": "10 min", "appareil": "ordinateur",
        "etapes": [
            "⟦m|Mes lots⟧ → ⟦b|Ajouter un bien⟧ : ⟦c|Référence interne⟧ ⟦v|Appartement Banc-d'Essai⟧ ; ⟦c|Type⟧ ⟦v|Appartement⟧ ; ⟦c|Adresse⟧ ⟦v|27 rue du Banc-d'Essai⟧ ; ⟦v|91100⟧ ⟦v|Corbeil-Essonnes⟧ ; ⟦c|Année de construction⟧ ⟦v|1938⟧ ; cochez ⟦c|En copropriété⟧ et ⟦c|En zone tendue⟧ ; ⟦c|Parties communes⟧ ⟦v|Hall, cour intérieure, local poubelles⟧ ; ⟦c|TIC⟧ ⟦v|Fibre optique⟧ ; ⟦c|Surface (m²)⟧ ⟦v|41.8⟧ ; ⟦c|Nombre de pièces⟧ ⟦v|2⟧ → ⟦b|Créer le bien et son lot unique⟧.",
            "Sur la fiche du lot → ⟦b|Modifier le lot⟧ : ⟦c|Nom du lot⟧ ⟦v|B3⟧ ; ⟦c|Étage⟧ ⟦v|3⟧ ; ⟦c|Identifiant fiscal du logement⟧ ⟦v|9999917410003⟧ ; ⟦c|Chauffage⟧ ⟦v|Individuel — chaudière gaz⟧ ; ⟦c|Eau chaude⟧ ⟦v|Individuelle — chaudière gaz⟧ ; ⟦c|Locaux privatifs⟧ ⟦v|Néant⟧ ; ⟦c|Autres parties du logement⟧ ⟦v|Néant⟧ → ⟦b|Enregistrer⟧.",
            "« Pièces (état des lieux) » → ⟦b|Proposer les pièces de ce logement⟧.",
        ],
        "attendu": "Le lot est créé et vous êtes déjà propriétaire à 100 % (détention posée d'office sur votre fiche). Il reste « En préparation » tant que les diagnostics manquent.",
    },
    {
        "id": "PRO-05", "phase": "J1 · Mes biens", "titre": "Déposer les diagnostics et mettre B3 en location",
        "duree": "15 min", "appareil": "ordinateur",
        "donnees": "Dates : « Mon personnage » § 5 (aussi écrites sur chaque PDF).",
        "fichiers": ["02-appartement-banc-d-essai-diagnostics/ (7 fichiers)"],
        "etapes": [
            "Fiche du lot → « Diagnostics du lot » : ⟦v|DPE⟧ classe ⟦v|D⟧ (⟦v|04/03/2025⟧ → ⟦v|03/03/2035⟧) ; ⟦v|Électricité⟧ et ⟦v|Gaz⟧ (⟦v|10/09/2026⟧ → ⟦v|09/09/2032⟧) ; ⟦v|Plomb (CREP)⟧ (⟦v|04/03/2025⟧, échéance vide) ; ⟦v|Amiante (privatif)⟧ (⟦v|04/03/2025⟧, échéance vide). Diagnostiqueur : ⟦v|Diag'Essai Expertises⟧.",
            "« Diagnostics du bien » : ⟦v|ERP — état des risques⟧ (⟦v|16/09/2026⟧ → ⟦v|16/03/2027⟧) ; ⟦v|Amiante (parties communes)⟧ (⟦v|03/02/2020⟧, échéance vide).",
            "Carte du haut → ⟦b|Mettre en location⟧.",
        ],
        "attendu": "Gerimmo attend bien le plomb (construction avant 1949) et l'amiante (avant 1997). « Lot passé en « Disponible ». »",
        "attention": "Si un dépôt échoue avec un message général, ne réessayez pas le même fichier : prenez la copie de secours (dossier ⟦f|secours/⟧) et signalez-le.",
    },
    {
        "id": "PRO-06", "phase": "J1 · Mes biens", "titre": "Créer le Studio Maquette (deuxième bien)",
        "duree": "10 min", "appareil": "ordinateur",
        "fichiers": ["03-studio-maquette-diagnostics/ (3 fichiers)"],
        "etapes": [
            "⟦b|Ajouter un bien⟧ : ⟦v|Studio Maquette⟧ ; ⟦v|Appartement⟧ ; ⟦v|5 impasse de la Maquette⟧ ; ⟦v|91150⟧ ⟦v|Étampes⟧ ; ⟦v|2004⟧ ; ⟦c|En copropriété⟧ cochée, ⟦c|En zone tendue⟧ **non** ; ⟦v|Hall, parking extérieur⟧ ; ⟦v|Fibre optique et antenne TNT collective⟧ ; ⟦v|22.4⟧ m² ; ⟦v|1⟧ pièce → créer.",
            "Lot : nom ⟦v|M1⟧, étage ⟦v|1⟧, identifiant ⟦v|9999922230001⟧, chauffage ⟦v|Individuel — électricité⟧, eau chaude ⟦v|Individuelle — ballon électrique⟧, locaux privatifs ⟦v|Place de parking n° 7⟧, autres parties ⟦v|Néant⟧.",
            "Diagnostics : DPE classe ⟦v|C⟧ (⟦v|21/06/2024⟧ → ⟦v|20/06/2034⟧), électricité (⟦v|17/09/2026⟧ → ⟦v|16/09/2032⟧), ERP (⟦v|17/09/2026⟧ → ⟦v|17/03/2027⟧).",
        ],
        "attendu": "Deux biens dans « Mes lots ». Ni plomb ni amiante demandés (construction de 2004).",
    },
    {
        "id": "PRO-07", "phase": "J1 · Abonnement", "titre": "Souscrire l'abonnement",
        "duree": "10 min", "appareil": "ordinateur", "paiement": True,
        "etapes": [
            f"Plus → ⟦m|Abonnement⟧ : « Total mensuel » **{PRIX} €** (premier bien offert, le second payant).",
            f"⟦b|S'abonner — {PRIX} € par mois⟧ → page de paiement Stripe : revenez d'abord en arrière **sans payer**.",
            "Recommencez et payez avec votre carte (adresse de facturation demandée, validation 3D Secure possible).",
        ],
        "attendu": "Sans payer : « Paiement interrompu : rien n'a été prélevé, et rien n'a changé… ». Après paiement : « Merci, votre paiement est enregistré… », statut « Abonnement actif », et la mention que la carte ne sera débitée qu'à la fin de l'essai (date affichée).",
        "attention": "Paiement réel : ne le faites qu'après accord du coordinateur sur la prise en charge.",
    },
    {
        "id": "PRO-08", "phase": "J1 · Abonnement", "titre": "Gérer son abonnement dans le portail Stripe",
        "duree": "3 min", "appareil": "ordinateur", "paiement": True,
        "etapes": ["⟦m|Abonnement⟧ → ⟦b|Gérer mon abonnement⟧ : regardez carte, factures, adresse. **Ne résiliez pas maintenant.** Revenez dans Gerimmo."],
        "attendu": "Le portail Stripe s'ouvre et ramène à Gerimmo. Une erreur à l'ouverture est à signaler en [BLOQUANT].",
    },
    # ------------------------------------------------------------------ J2
    {
        "id": "PRO-09", "phase": "J2 · Mise en location", "titre": "Créer la fiche de Thomas et déposer son dossier",
        "duree": "12 min", "appareil": "ordinateur",
        "fichiers": ["04-dossier-thomas-girard/ (5 fichiers)"],
        "etapes": [
            "⟦m|Locataires & garants⟧ → ⟦b|+ Créer une fiche⟧ → ⟦v|Locataire⟧ : ⟦v|GIRARD⟧ ⟦v|Thomas⟧ ; ⟦c|Adresse email⟧ : **l'adresse réelle du testeur « Locataire du propriétaire »** (demandez-la au coordinateur) ; ⟦v|06 39 98 60 31⟧ ; né le ⟦v|25/08/1998⟧ à ⟦v|Lille⟧ ; ⟦v|12 rue des Ébauches⟧, ⟦v|59000⟧ ⟦v|Lille⟧ → ⟦b|Créer la fiche⟧.",
            "« Pièces justificatives » : ⟦v|Pièce d'identité⟧ ⟦f|piece-identite-thomas-girard.pdf⟧ ; ⟦v|Justificatif⟧ : les 3 bulletins et ⟦f|attestation-employeur-thomas-girard.pdf⟧.",
        ],
        "attendu": "Fiche de Thomas avec 5 pièces.",
    },
    {
        "id": "PRO-10", "phase": "J2 · Mise en location", "titre": "Inviter Thomas et lui réclamer trois pièces",
        "duree": "5 min", "appareil": "ordinateur",
        "etapes": [
            "Prévenez le testeur (lien valable 1 heure). Fiche de Thomas → « Accès locataire » → ⟦b|Inviter comme locataire⟧.",
            "Une fois son compte actif (LOP-01) : « Pièces réclamées » → ⟦b|Justificatif de domicile⟧, ⟦b|Avis d'imposition⟧, puis ⟦v|RIB⟧ → ⟦b|Demander⟧ à chaque fois.",
        ],
        "attendu": "« Invitation envoyée à … » puis « Compte locataire actif » ; Thomas reçoit trois courriels « Pièce demandée : … ». Ses dépôts (LOP-04) rejoignent son dossier.",
    },
    {
        "id": "PRO-11", "phase": "J2 · Mise en location", "titre": "Créer le bail de Thomas, le faire signer, le déposer signé",
        "duree": "25 min", "appareil": "ordinateur",
        "fichiers": ["05-bail-signe/bail-signe-thomas-girard.pdf"],
        "etapes": [
            "Fiche du lot B3 → « Baux & état des lieux » : ⟦v|Nu⟧ ; locataire ⟦v|Thomas GIRARD⟧ ; ⟦c|Date d'entrée⟧ ⟦v|16/09/2026⟧ (entrée en cours de mois, exprès) ; ⟦c|Jour d'échéance⟧ ⟦v|1⟧ ; ⟦v|720⟧ € hors charges ; ⟦v|60⟧ € de charges en ⟦v|Provision⟧ ; dépôt ⟦v|720⟧ ; IRL ⟦v|T2⟧, révision cochée → ⟦b|Créer le bail⟧.",
            "« Compléments du contrat » : ⟦v|Librement fixé⟧ ; ⟦v|À échoir (d'avance)⟧ ; lieu ⟦v|Virement sur le compte de Sophie Lemaire⟧ ; IRL de référence ⟦v|146,00⟧ (valeur de test) ; dernier loyer du précédent locataire ⟦v|700⟧, dernier versement ⟦v|31/08/2026⟧, dernière révision ⟦v|01/03/2026⟧ (si proposés) → ⟦b|Enregistrer les compléments⟧. Puis ⟦b|Générer le bail (PDF)⟧ et la notice.",
            "⟦m|Documents⟧ → le PDF du bail → ⟦b|Envoyer pour signature⟧ (Thomas). Attendez son retour (LOP-05).",
            "Fiche du bail → « Bail signé » → ⟦f|bail-signe-thomas-girard.pdf⟧ → ⟦b|Déposer le bail signé⟧ → ⟦b|Envoyer au locataire⟧.",
        ],
        "attendu": "Bail actif, lot « Loué », Thomas reçoit « Votre bail signé est disponible ». Préavis d'un mois affiché (zone tendue).",
    },
    {
        "id": "PRO-12", "phase": "J2 · Mise en location", "titre": "État des lieux d'entrée et dépôt de garantie",
        "duree": "20 min", "appareil": "les deux",
        "donnees": "« Mon personnage » § 7 (état des pièces, compteurs, clés).",
        "etapes": [
            "« États des lieux » → « Nouvel état des lieux » ⟦v|Entrée⟧ → ⟦b|Préparer cet état des lieux⟧ → ⟦b|Ouvrir la grille⟧.",
            "Mentions : ⟦v|Sophie Lemaire (bailleuse) ; Thomas Girard (locataire)⟧ ; détecteur ⟦v|Présent⟧, ⟦v|Fonctionne (testé)⟧ ; assurance fournie ⟦v|Oui⟧ ; observations ⟦v|Néant⟧ → ⟦b|Enregistrer les mentions⟧.",
            "Grille : pièce par pièce d'après « Mon personnage » (le séjour en ⟦v|Usagé⟧ avec son commentaire) ; compteurs gaz ⟦v|RCT-GZ-0317⟧ ⟦v|8412⟧, électricité ⟦v|0999 7412 0003⟧ ⟦v|20115⟧, eau ⟦v|RCT-0317⟧ ⟦v|311,020⟧ ; clés 2 + 1 + 1 bip → ⟦b|Enregistrer et signer⟧ → ⟦b|Générer le PDF⟧.",
            "« Dépôt de garantie » → ⟦b|Enregistrer un encaissement⟧ ⟦v|720⟧, date du jour, ⟦v|Virement⟧ → ⟦b|Encaisser⟧.",
        ],
        "attendu": "État des lieux « Signé — figé » avec son PDF ; dépôt de 720 € enregistré avec son reçu.",
    },
    {
        "id": "PRO-13", "phase": "J2 · Mise en location", "titre": "Enregistrer l'artisan dans votre carnet",
        "duree": "5 min", "appareil": "ordinateur",
        "attendre": "L'artisan est inscrit et validé (ART-04).",
        "etapes": [
            f"Plus → ⟦m|Carnet d'artisans⟧ → « Enregistrer un artisan » : ⟦v|{AR['raison_sociale']}⟧ ; SIRET ⟦v|{AR['siret']}⟧ ; mobile ⟦v|{AR['telephone']}⟧ ; courriel vide ; métiers ⟦v|Plomberie⟧ et ⟦v|Chauffage⟧ ; zone ⟦v|91100⟧ → ⟦b|Enregistrer l'artisan⟧.",
        ],
        "attendu": "« Artisan enregistré… sa fiche vous a été rattachée plutôt que dupliquée. » Il apparaît validé par Gerimmo.",
    },
    # ------------------------------------------------------------------ J3 loyers
    {
        "id": "PRO-14", "phase": "J3 · Loyers", "titre": "Générer l'échéancier : un premier mois au prorata",
        "duree": "5 min", "appareil": "ordinateur",
        "etapes": [
            "Fiche du bail → « Loyers & paiements » → ⟦b|Générer l'échéancier⟧.",
            "Ouvrez ⟦b|Prorata (PDF)⟧ de septembre et ⟦b|Avis d'échéance (PDF)⟧ d'octobre.",
            "⟦m|Loyers & charges⟧ : tuiles « Demandé ce mois », « Encaissé », « Reste dû ».",
        ],
        "attendu": "Septembre est appelé au prorata (du 16 au 30 : environ 390 €, soit la moitié de 780 €), octobre pour 780 €. Le décompte de prorata explique le calcul. Si les envois automatiques sont cochés, Thomas reçoit l'avis le lendemain matin, puis une relance tant que rien n'est encaissé.",
    },
    {
        "id": "PRO-15", "phase": "J3 · Loyers", "titre": "Encaisser septembre, puis un paiement partiel, puis le solde",
        "duree": "12 min", "appareil": "ordinateur",
        "attendre": "De préférence le lendemain de PRO-14, après les courriels du matin (Thomas vous dit ce qu'il a reçu).",
        "etapes": [
            "⟦m|Loyers & charges⟧ : sur la ligne de Thomas, le bouton « Encaisser … » signale « (septembre d'abord) ». **Ne cliquez pas** : faites les trois paiements depuis la fiche du bail, pour contrôler les montants.",
            "Fiche du bail → « Loyers & paiements » → ⟦b|Saisir un encaissement⟧ : le montant exact du prorata de septembre (environ ⟦v|390⟧ €), date du jour, ⟦v|Virement⟧ → ⟦b|Encaisser⟧ → septembre « Payé ».",
            "⟦b|Saisir un encaissement⟧ : ⟦v|400⟧ € → ⟦b|Encaisser⟧ → octobre devient « Partiel » avec un « Reçu partiel ».",
            "⟦b|Saisir un encaissement⟧ : ⟦v|380⟧ € → ⟦b|Encaisser⟧ → octobre « Payé ».",
            "Envoyez ce qui n'est pas encore parti (⟦b|Envoyer le reçu⟧, ⟦b|Envoyer la quittance⟧, ou l'envoi groupé de « Loyers & charges »).",
        ],
        "attendu": "Quittance de septembre ; reçu de paiement d'octobre (400 €) ; puis quittance d'octobre au solde. Thomas reçoit « Reçu de paiement — octobre 2026 » puis « Quittance de loyer — octobre 2026 ». Le compte rendu d'encaissement dit « imputés du terme le plus ancien au plus récent ».",
    },
    # ------------------------------------------------------------------ incidents
    {
        "id": "PRO-16", "phase": "J3–J5 · Incidents", "titre": "Qualifier le radiateur en panne et consulter l'artisan",
        "duree": "12 min", "appareil": "ordinateur",
        "attendre": "Thomas a signalé son radiateur (LOP-09).",
        "etapes": [
            "⟦m|Incidents⟧ → l'incident → « Qualification — qui paie » : ⟦v|Charge propriétaire⟧ ; ⟦v|Tête thermostatique défectueuse par usure : charge de la bailleuse⟧ → ⟦b|Qualifier l'incident⟧.",
            "« Confier à un artisan » : ⟦c|Métier⟧ ⟦v|Chauffage⟧ ; ⟦c|Nature des travaux⟧ ⟦v|Remplacement d'équipement⟧ (décennale exigée) ; validité ⟦v|30⟧ ; « J'assume un devis unique » → ⟦b|Ouvrir la mise en concurrence⟧ → Haddad → ⟦b|Demander un devis⟧.",
            "Au devis reçu (ART-11 : 205,59 € TTC) → ⟦b|Retenir ce devis⟧.",
        ],
        "attendu": "L'artisan est proposé (décennale valide, zone 91100, carnet). Le devis se lit ligne par ligne ; la mission est confiée.",
    },
    {
        "id": "PRO-17", "phase": "J3–J5 · Incidents", "titre": "Trancher une « autre cause » signalée par l'artisan, puis clôturer",
        "duree": "10 min", "appareil": "ordinateur",
        "attendre": "L'artisan a fait l'intervention et signalé un problème imprévu (ART-13).",
        "etapes": [
            "Carte « L'artisan signale une autre cause — à trancher avant facturation » → ⟦c|Qui prend en charge, après diagnostic⟧ ⟦v|Charge propriétaire⟧ ; ⟦c|Justification⟧ ⟦v|Robinet de radiateur grippé, usure normale⟧ → ⟦b|Réviser l'imputation⟧.",
            "Si le montant change, décidez : ⟦b|Accepter l'avenant⟧ (ou refuser et garder le montant autorisé).",
            "« Noter Haddad Plomberie Chauffage » (5 / 5 / 4) → ⟦b|Noter l'artisan⟧ ; « Clôture » : ⟦v|Résolu⟧, ⟦v|Tête thermostatique remplacée, circuit purgé⟧ → ⟦b|Clôturer l'incident⟧.",
        ],
        "attendu": "La révision d'imputation est tracée avant facturation ; l'artisan peut ensuite déposer sa facture ; l'incident est « Clos ».",
    },
    {
        "id": "PRO-18", "phase": "J3–J5 · Incidents", "titre": "Déclarer vous-même un incident, imputé au locataire",
        "duree": "8 min", "appareil": "ordinateur",
        "fichiers": ["06-incidents/incident-prise-arrachee.jpg"],
        "etapes": [
            "⟦m|Incidents⟧ → ⟦b|Ouvrir un incident⟧ (…/incidents/nouveau) : lot ⟦v|B3⟧ ; ⟦v|Électricité — interrupteur, prise, ampoule⟧ ; pièce ⟦v|Chambre⟧ ; urgence ⟦v|Urgent — dégât en cours ou logement inutilisable⟧ ; description ⟦v|Prise arrachée dans la chambre, fils apparents⟧ ; photo ⟦f|incident-prise-arrachee.jpg⟧ → ⟦b|Déclarer l'incident⟧.",
            "Qualifiez : ⟦v|Dégradation fautive — charge locataire⟧, ⟦v|Prise arrachée en déplaçant un meuble⟧.",
            "Attendez la contestation de Thomas (LOP-14), répondez-lui, puis clôturez : ⟦v|Classé sans suite⟧, ⟦v|Le locataire fait intervenir son propre électricien⟧.",
        ],
        "attendu": "L'incident est visible par Thomas avec l'imputation ; sa contestation vous parvient ; la clôture « Classé sans suite » est tracée.",
    },
    # ------------------------------------------------------------------ gestion courante
    {
        "id": "PRO-19", "phase": "J5–J7 · Gestion courante", "titre": "Tenir le livre recettes-dépenses",
        "duree": "15 min", "appareil": "ordinateur",
        "fichiers": ["07-livre-recettes-depenses/ (5 justificatifs)"],
        "etapes": [
            "⟦m|Livre recettes-dépenses⟧ : repérez les loyers encaissés, inscrits seuls.",
            "« Saisir une écriture » : ⟦v|Dépense⟧ · ⟦v|Taxe foncière⟧ · ⟦v|1124⟧ · date pièce ⟦v|15/09/2026⟧ · lot ⟦v|B3⟧ · ⟦v|Taxe foncière 2026 (dont TEOM 168 €)⟧ → ⟦b|Ajouter l'écriture⟧.",
            "Puis : ⟦v|Assurance⟧ ⟦v|118⟧ (⟦v|03/01/2026⟧, ⟦v|Assurance PNO 2026⟧) ; ⟦v|Travaux⟧ ⟦v|650⟧ (⟦v|22/09/2026⟧, ⟦v|Peinture de la chambre avant location⟧) ; ⟦v|Travaux⟧ ⟦v|205,59⟧ (date de la facture de l'artisan, ⟦v|Facture F2026-0143 Haddad — radiateur⟧).",
            "Les intérêts d'emprunt (⟦v|2 846,15 €⟧) : s'il existe une catégorie adaptée, saisissez-les ; sinon, notez où Gerimmo vous propose de les indiquer (voir PRO-21).",
            "Plus → ⟦m|Documents⟧ → ⟦b|+ Déposer un document⟧ : rangez les 5 justificatifs (type ⟦v|Justificatif⟧ ou ⟦v|Autre⟧).",
        ],
        "attendu": "Chaque écriture s'ajoute au bon lot ; les justificatifs sont rangés. Signalez toute catégorie qui manque pour un propriétaire.",
    },
    {
        "id": "PRO-20", "phase": "J5–J7 · Gestion courante", "titre": "Charges de copropriété et clôture de septembre",
        "duree": "10 min", "appareil": "ordinateur",
        "fichiers": ["07-livre-recettes-depenses/appel-de-fonds-syndic-T4-2026-banc-d-essai.pdf"],
        "etapes": [
            "Fiche du lot B3 → « Charges de copropriété » → « Saisir un appel de charges » : exercice ⟦v|2026⟧, reçu le date du jour, total ⟦v|182,20⟧ (récupérable ⟦v|109,90⟧, non récupérable ⟦v|72,30⟧), appel ⟦f|appel-de-fonds-syndic-T4-2026-banc-d-essai.pdf⟧ → ⟦b|Créer l'appel⟧.",
            "⟦m|Livre recettes-dépenses⟧ → « Clôturer un mois » : ⟦v|septembre 2026⟧ → ⟦b|Clôturer le mois⟧ (irréversible).",
            "Essayez ensuite une écriture imputée en septembre : refus attendu.",
        ],
        "attendu": "L'appel est ventilé ; « Mois clôturé. » ; une écriture de septembre est refusée (« Mois clôturé : imputez au mois ouvert ou passez une contre-écriture »).",
    },
    {
        "id": "PRO-21", "phase": "J5–J7 · Gestion courante", "titre": "Préparer sa déclaration : le récapitulatif fiscal",
        "duree": "10 min", "appareil": "ordinateur",
        "etapes": [
            "Plus → ⟦m|Fiscalité⟧ → « Récapitulatif fiscal » → ⟦c|Année du récapitulatif⟧ ⟦v|2026⟧.",
            "Comparez aux écritures : loyers (lignes 211/212), taxe foncière, assurance, travaux, intérêts d'emprunt « à compléter ».",
            "Exportez le livre (« Journal » → ⟦b|Exporter 2026⟧).",
        ],
        "attendu": "Les montants correspondent à vos écritures ; les rubriques sont compréhensibles pour un particulier. Signalez un montant faux ou mal rangé (la TEOM, récupérable sur le locataire, en est un bon test).",
    },
    {
        "id": "PRO-22", "phase": "J5–J7 · Gestion courante", "titre": "Messages, assurance du locataire, alertes",
        "duree": "8 min", "appareil": "les deux",
        "attendre": "Thomas a déposé son assurance (LOP-03) et vous a écrit (LOP-13).",
        "etapes": [
            "Fiche de Thomas → « Pièces justificatives » → attestation « À vérifier » → ⟦b|Valider⟧.",
            "⟦m|Messages⟧ → la conversation → fiche de Thomas → ⟦b|Répondre⟧.",
            "⟦m|Alertes⟧ et ⟦m|Agenda⟧ : ouvrez chaque alerte et vérifiez qu'elle mène au bon geste.",
        ],
        "attendu": "Assurance « Validée » ; Thomas reçoit votre réponse par courriel ; les alertes se referment une fois le geste fait.",
    },
    {
        "id": "PRO-23", "phase": "J5–J7 · Gestion courante", "titre": "Documents : refuser un doublon",
        "duree": "3 min", "appareil": "ordinateur",
        "etapes": ["⟦m|Documents⟧ → ⟦b|+ Déposer un document⟧ : redéposez ⟦f|avis-taxe-fonciere-2026-banc-d-essai.pdf⟧ déjà rangé en PRO-19."],
        "attendu": "Refus : « Un fichier au contenu strictement identique existe déjà… ».",
    },
    {
        "id": "PRO-24", "phase": "J5–J7 · Gestion courante", "titre": "Parrainage, aide et règles",
        "duree": "5 min", "appareil": "les deux",
        "etapes": [
            "⟦m|Mon profil⟧ → carte « Parrainage » : ⟦c|Votre code⟧ et ⟦c|Lien à partager⟧ (copiez le lien).",
            "Plus → ⟦m|Aide⟧ (questions fréquentes) et ⟦m|Les règles à connaître⟧ : lisez deux ou trois réponses.",
        ],
        "attendu": "Le lien de parrainage mène à l'inscription avec le code prérempli. La FAQ répond clairement (signalez toute contradiction avec ce que fait l'application).",
    },
    {
        "id": "PRO-25", "phase": "Fin de recette", "titre": "Résilier l'abonnement (sur consigne)",
        "duree": "5 min", "appareil": "ordinateur", "paiement": True, "optionnel": True,
        "attendre": "Uniquement quand le coordinateur le demande.",
        "etapes": [
            "⟦m|Abonnement⟧ → ⟦b|Gérer mon abonnement⟧ → résiliez dans le portail Stripe → revenez dans Gerimmo.",
        ],
        "attendu": "Bandeau « Votre abonnement prend fin le … ». À cette date, le compte repasse en essai ou en lecture seule (vos données restent consultables et exportables).",
    },
    {
        "id": "PRO-26", "phase": "Fin de recette", "titre": "Sécurité du compte et déconnexion",
        "duree": "5 min", "appareil": "les deux",
        "etapes": [
            "Menu du compte → ⟦m|Sécurité du compte⟧ : changez le mot de passe ; facultatif : activez puis retirez la double authentification.",
            "⟦m|Aide et retours⟧ → ⟦v|Proposer une idée⟧ : ce qui vous manquerait pour gérer seule vos biens.",
            "⟦b|Se déconnecter⟧.",
        ],
        "attendu": "« Mot de passe modifié… » ; idée enregistrée ; déconnexion effective.",
    },
]
