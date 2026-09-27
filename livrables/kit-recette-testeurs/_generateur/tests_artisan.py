"""Fiche de tests — Artisan (Karim Haddad, Haddad Plomberie Chauffage).

Espace artisan : app/artisan/… (menu : components/nav-artisan.tsx). Les chemins
de fichiers partent du dossier « documents/ » du dossier artisan.
"""

import univers as U

AR = U.ARTISAN_ENTREPRISE

PREFIXE = "ART"
TITRE = "Artisan"
SOUS_TITRE = "Karim Haddad, plombier-chauffagiste (Haddad Plomberie Chauffage)"

TESTS = [
    {
        "id": "ART-01", "phase": "J1 · Inscription", "titre": "Créer son compte artisan",
        "duree": "5 min", "appareil": "les deux",
        "etapes": [
            "www.gerimmo.app/connexion → « Artisan ? Inscrire mon entreprise » (…/artisan/inscription).",
            "« 1. Votre compte » : ⟦c|Adresse e-mail⟧ (la vôtre), ⟦c|Mot de passe⟧ et ⟦c|Confirmer le mot de passe⟧ (12 caractères ou plus), CGU cochées → ⟦b|Créer mon compte⟧.",
            "Courriel **« Confirmez votre adresse — Gerimmo »** → ⟦b|Confirmer mon adresse⟧ (1 heure).",
        ],
        "attendu": "Retour sur …/artisan/inscription, à l'étape « Inscrire mon entreprise ».",
    },
    {
        "id": "ART-02", "phase": "J1 · Inscription", "titre": "Inscrire son entreprise",
        "duree": "5 min", "appareil": "les deux",
        "etapes": [
            "⟦c|SIRET⟧ ⟦v|0000731480001⟧ (13 chiffres, exprès) → le formulaire doit refuser.",
            f"⟦c|Nom de votre entreprise⟧ ⟦v|{AR['raison_sociale']}⟧ ; ⟦c|SIRET⟧ ⟦v|{AR['siret']}⟧ ; ⟦c|Mobile⟧ ⟦v|{AR['telephone']}⟧ ; ⟦c|Adresse e-mail⟧ : **la vôtre** (sans elle, aucune notification ne vous parvient) ; ⟦c|Vos métiers⟧ ⟦v|Plomberie⟧ et ⟦v|Chauffage⟧ ; ⟦c|Votre zone d'intervention⟧ ⟦v|{', '.join(AR['zone'])}⟧ → ⟦b|Inscrire mon entreprise⟧.",
        ],
        "attendu": "« Votre entreprise est inscrite. Déposez maintenant votre décennale et votre RC pro… » ; bandeau permanent « Inscription en cours de validation par Gerimmo… ».",
        "attention": f"Si Gerimmo répond que ce SIRET est déjà inscrit, prenez le SIRET de secours ⟦v|{AR['siret_secours']}⟧ et prévenez le coordinateur (les agences devront utiliser celui-là).",
    },
    {
        "id": "ART-03", "phase": "J1 · Inscription", "titre": "Déposer ses quatre attestations",
        "duree": "10 min", "appareil": "les deux",
        "fichiers": ["01-attestations/ (décennale, RC pro, URSSAF, Kbis)"],
        "etapes": [
            "⟦m|Mon entreprise⟧ → « Mes attestations » → « Déposer une attestation ».",
            "⟦c|Quelle attestation⟧ ⟦v|Assurance décennale⟧ ; ⟦c|Émise le⟧ ⟦v|05/01/2026⟧ ; ⟦c|Valable jusqu'au⟧ ⟦v|31/12/2026⟧ ; ⟦c|L'attestation⟧ ⟦f|attestation-decennale-2026.pdf⟧ → ⟦b|Déposer l'attestation⟧.",
            "⟦v|Responsabilité civile professionnelle⟧ : mêmes dates, ⟦f|attestation-rc-pro-2026.pdf⟧.",
            "⟦v|Attestation de vigilance URSSAF⟧ : ⟦v|15/09/2026⟧ → ⟦v|15/03/2027⟧, ⟦f|attestation-vigilance-urssaf.pdf⟧.",
            "⟦v|Extrait Kbis⟧ : ⟦v|10/09/2026⟧ → ⟦v|10/12/2026⟧, ⟦f|extrait-kbis.pdf⟧.",
            "Prévenez le coordinateur : il doit valider votre inscription.",
        ],
        "attendu": "Les quatre attestations apparaissent avec leur échéance ; la liste « Encore attendues » se vide.",
    },
    {
        "id": "ART-04", "phase": "J1 · Inscription", "titre": "Constater la validation par Gerimmo",
        "duree": "2 min", "appareil": "les deux",
        "attendre": "Le coordinateur vérifie votre SIRET et valide votre inscription (aucun courriel ne vous prévient).",
        "etapes": ["⟦m|Mon entreprise⟧ → « Ma fiche » : statut et « Vérification du SIRET »."],
        "attendu": "« Inscription validée », SIRET vérifié, le bandeau « en cours de validation » a disparu. (Qu'aucun courriel ne l'annonce est un point à signaler si cela vous gêne.)",
    },
    {
        "id": "ART-05", "phase": "J1 · Inscription", "titre": "Métiers, zone et visibilité",
        "duree": "3 min", "appareil": "les deux",
        "etapes": [
            "⟦m|Mon entreprise⟧ → « Mes métiers et ma zone » : vérifiez, sans rien changer → ⟦b|Enregistrer⟧.",
            "« Qui peut me solliciter » : ⟦b|Rendre mon profil public⟧, puis lisez l'explication (privé par défaut : seules les agences qui vous ont ajouté peuvent vous solliciter).",
        ],
        "attendu": "Les réglages sont enregistrés et expliqués clairement.",
    },
    {
        "id": "ART-06", "phase": "J3–J5 · Mission pour l'agence", "titre": "Chiffrer la demande de devis de l'agence",
        "duree": "10 min", "appareil": "les deux",
        "attendre": "L'agence vous demande un devis pour la fuite de Camille (AGC-29).",
        "etapes": [
            "Courriel « Nouvelle demande de devis — Horizon Gestion — Plomberie — Massy » → menu ⟦m|Devis⟧ → « À chiffrer » → la demande.",
            "⟦c|Votre diagnostic⟧ ⟦v|Siphon PVC fissuré et joint usé : remplacement du siphon et des joints⟧.",
            "Lignes (⟦b|Ajouter une prestation ou fourniture⟧) : ⟦v|Déplacement et diagnostic⟧ 1 × 45,00 ; ⟦v|Siphon PVC et joints (fourniture)⟧ 1 × 38,50 ; ⟦v|Main-d'œuvre⟧ 1,5 × 52,00 — TVA ⟦v|10 %⟧ sur chaque ligne.",
            "⟦c|Délai avant intervention⟧ ⟦v|Sous 48 heures⟧ ; ⟦c|Durée estimée⟧ ⟦v|1 h 30⟧ ; ⟦c|Contraintes et accès⟧ ⟦v|Vider le meuble sous l'évier avant mon passage⟧ ; ⟦c|Valable jusqu'au⟧ : laissez la date proposée → ⟦b|Envoyer mon devis⟧.",
        ],
        "attendu": "Total 161,50 € HT, 16,15 € de TVA, **177,65 € TTC** ; le devis passe dans « Devis envoyés » et n'est plus modifiable. L'agence reçoit « Devis reçu — … ».",
    },
    {
        "id": "ART-07", "phase": "J3–J5 · Mission pour l'agence", "titre": "Accepter la mission et proposer trois créneaux",
        "duree": "5 min", "appareil": "téléphone",
        "attendre": "L'agence retient votre devis (AGC-29).",
        "etapes": [
            "Courriel « Mission confiée — … » → la mission → ⟦b|Accepter la mission⟧.",
            "⟦b|Proposer des créneaux⟧ : essayez d'abord avec deux créneaux seulement → refus attendu (trois au minimum).",
            "Trois créneaux dans les 2 à 4 jours, par exemple 9 h – 11 h (⟦c|Jour⟧, ⟦c|De⟧, ⟦c|À⟧, ⟦b|Ajouter un créneau⟧) → ⟦b|Envoyer les créneaux⟧.",
        ],
        "attendu": "Mission « Acceptée » ; Camille reçoit « Choisissez le créneau de votre intervention ».",
    },
    {
        "id": "ART-08", "phase": "J3–J5 · Mission pour l'agence", "titre": "Rendez-vous confirmé, agenda et rappel",
        "duree": "3 min", "appareil": "téléphone",
        "attendre": "Camille confirme un créneau (LOA-12).",
        "etapes": [
            "Courriel « Rendez-vous confirmé par le locataire — … ».",
            "Menu ⟦m|Agenda⟧ : le rendez-vous est dans « Les 7 prochains jours », avec le nom et le logo d'Horizon Gestion.",
            "La veille : courriel « Rappel — intervention demain, … » (vers 8 h).",
        ],
        "attendu": "Le rendez-vous est au bon jour et à la bonne heure, sur la fiche et dans l'agenda.",
    },
    {
        "id": "ART-09", "phase": "J3–J5 · Mission pour l'agence", "titre": "Intervenir et faire le compte rendu",
        "duree": "8 min", "appareil": "téléphone",
        "fichiers": ["03-photos-chantier/intervention-avant-siphon.jpg", "03-photos-chantier/intervention-apres-siphon.jpg"],
        "etapes": [
            "Le jour du rendez-vous : la mission → ⟦b|Je démarre l'intervention⟧.",
            "Compte rendu, « Étape 1 sur 2 » : essayez de continuer sans photo → impossible.",
            "« Photographier le travail terminé » : **au téléphone, l'appareil photo s'ouvre directement** → photographiez n'importe quel objet (jamais un visage ni un document). **Sur ordinateur**, choisissez ⟦f|intervention-apres-siphon.jpg⟧. Facultatif : « Photo avant » ⟦f|intervention-avant-siphon.jpg⟧.",
            "« Étape 2 sur 2 » : ⟦c|Ce que vous avez fait⟧ ⟦v|Remplacement du siphon et des joints, test d'étanchéité concluant⟧ ; ⟦c|Montant final TTC⟧ ⟦v|177,65⟧ ; ⟦c|Avez-vous trouvé autre chose que prévu ?⟧ ⟦v|Non⟧ → ⟦b|Terminer l'intervention⟧.",
        ],
        "attendu": "Sans photo « après », impossible de terminer. Ensuite : mission « Terminée », l'agence voit le compte rendu et la photo.",
    },
    {
        "id": "ART-10", "phase": "J3–J5 · Mission pour l'agence", "titre": "Déposer sa facture",
        "duree": "5 min", "appareil": "les deux",
        "fichiers": ["04-factures/facture-F2026-0142-fuite-evier-lot-A12.pdf"],
        "etapes": [
            "La mission → « Déposer ma facture » : ⟦c|Numéro de la facture⟧ ⟦v|F2026-0142⟧ ; ⟦c|Montant TTC (€)⟧ : tapez ⟦v|190⟧ → le champ « Pourquoi le montant diffère-t-il du devis ? » apparaît et devient obligatoire.",
            "Remettez ⟦v|177,65⟧ ; ⟦c|Votre facture⟧ ⟦f|facture-F2026-0142-fuite-evier-lot-A12.pdf⟧ → ⟦b|Déposer ma facture⟧.",
            "⟦m|Mon entreprise⟧ → « Ma facturation ».",
        ],
        "attendu": "Facture déposée (statut « Facture déposée ») ; une seule facture par intervention. Le paiement se fait hors de Gerimmo.",
    },
    {
        "id": "ART-11", "phase": "J3–J5 · Mission pour la propriétaire", "titre": "Chiffrer le radiateur, accepter, proposer des créneaux",
        "duree": "12 min", "appareil": "les deux",
        "attendre": "Sophie Lemaire vous demande un devis (PRO-16).",
        "etapes": [
            "⟦m|Devis⟧ → la demande (Chauffage, Corbeil-Essonnes) : diagnostic ⟦v|Tête thermostatique cassée, circuit à purger⟧ ; lignes ⟦v|Déplacement et diagnostic⟧ 1 × 45,00 ; ⟦v|Tête thermostatique (fourniture)⟧ 1 × 29,90 ; ⟦v|Purge et remise en service du circuit⟧ 1 × 60,00 ; ⟦v|Main-d'œuvre⟧ 1 × 52,00 ; TVA ⟦v|10 %⟧ ; délai ⟦v|Sous 3 jours⟧ ; durée ⟦v|1 heure⟧ → ⟦b|Envoyer mon devis⟧.",
            "Quand Sophie le retient : ⟦b|Accepter la mission⟧ → ⟦b|Proposer des créneaux⟧ (trois) → ⟦b|Envoyer les créneaux⟧.",
        ],
        "attendu": "Devis de **205,59 € TTC** (186,90 € HT). Mission acceptée ; Thomas reçoit vos créneaux.",
    },
    {
        "id": "ART-12", "phase": "J3–J5 · Mission pour la propriétaire", "titre": "Retenir une date proposée par le locataire",
        "duree": "3 min", "appareil": "téléphone",
        "attendre": "Thomas refuse vos créneaux et propose les siens (LOP-10).",
        "etapes": [
            "Courriel « Le locataire propose d'autres créneaux — … » → la mission.",
            "Choisissez une de ses dates → ⟦b|Je retiens cette date⟧.",
        ],
        "attendu": "« Rendez-vous fixé — … » pour vous et pour Thomas ; l'agenda le montre avec le nom de Sophie Lemaire.",
    },
    {
        "id": "ART-13", "phase": "J3–J5 · Mission pour la propriétaire", "titre": "Signaler une cause imprévue, terminer et facturer",
        "duree": "10 min", "appareil": "les deux",
        "fichiers": ["03-photos-chantier/intervention-apres-radiateur.jpg", "04-factures/facture-F2026-0143-radiateur-banc-d-essai.pdf"],
        "etapes": [
            "⟦b|Je démarre l'intervention⟧ → photo « après » (appareil photo au téléphone, ou ⟦f|intervention-apres-radiateur.jpg⟧ sur ordinateur).",
            "Bilan : ⟦v|Tête thermostatique remplacée, circuit purgé⟧ ; montant ⟦v|205,59⟧ ; « Avez-vous trouvé autre chose que prévu ? » ⟦v|Oui⟧ → ⟦c|Ce que vous avez constaté⟧ ⟦v|Robinet de radiateur grippé, usure normale⟧ ; ⟦c|Selon vous, qui devrait payer ?⟧ ⟦v|le propriétaire⟧ (ou « Je ne me prononce pas ») → ⟦b|Terminer l'intervention⟧.",
            "Quand Sophie a tranché (PRO-17) : « Déposer ma facture » → ⟦v|F2026-0143⟧, ⟦v|205,59⟧, ⟦f|facture-F2026-0143-radiateur-banc-d-essai.pdf⟧ → ⟦b|Déposer ma facture⟧.",
        ],
        "attendu": "Votre constat arrive chez Sophie comme « autre cause — à trancher avant facturation » ; une fois tranchée, la facture se dépose.",
    },
    {
        "id": "ART-14", "phase": "J5–J7 · Au quotidien", "titre": "Aujourd'hui, agenda et facturation, toutes clientèles confondues",
        "duree": "5 min", "appareil": "téléphone",
        "etapes": [
            "⟦m|Aujourd'hui⟧ : sections « Vos attestations », « Missions à accepter », « Rendez-vous à fixer », « Devis à chiffrer », « Prochaines interventions ».",
            "⟦m|Agenda⟧ : « Les 7 prochains jours », « Sans rendez-vous », « Journées passées » : vos deux missions, chacune au nom de son client.",
            "« Ma facturation » : deux factures déposées.",
        ],
        "attendu": "Tout est rangé par client, lisible au téléphone (gros boutons, contraste suffisant en extérieur).",
    },
    {
        "id": "ART-15", "phase": "J5–J7 · Au quotidien", "titre": "Consulter sa note, puis la contester",
        "duree": "8 min", "appareil": "les deux",
        "attendre": "L'agence et la propriétaire vous ont noté (AGC-31, PRO-17).",
        "etapes": [
            "⟦m|Mon entreprise⟧ → « Ma note » : lisez les indicateurs (délai d'acceptation, délai d'intervention, taux de refus, attestations expirées).",
            "« Contester votre note est un droit » → formulaire « Contester mon évaluation » (dans « Aide et retours ») : ⟦c|Titre⟧ ⟦v|[DÉTAIL] ART-15 — Contestation de test⟧ ; ⟦c|Quels faits souhaitez-vous faire réexaminer ?⟧ ⟦v|Test de la contestation : délai compté alors que le locataire a déplacé le rendez-vous⟧ → ⟦b|Envoyer ma demande⟧.",
        ],
        "attendu": "Avant trois évaluations, la note porte la mention « nouveau ». La contestation n'est visible que de la supervision Gerimmo, jamais des agences.",
    },
    {
        "id": "ART-16", "phase": "J5–J7 · Au quotidien", "titre": "Règles, aide en cas de panne, sécurité",
        "duree": "5 min", "appareil": "les deux",
        "etapes": [
            "« Les règles à connaître » et « Aide en cas de panne » (…/artisan/panne) : lisez.",
            "« Sécurité du compte » : changez le mot de passe.",
            "Bouton rond « Aide et retours » (en bas à droite) → ⟦v|Proposer une idée⟧ : ce qui vous ferait gagner du temps sur le chantier. Puis « Se déconnecter ».",
        ],
        "attendu": "Pages claires ; mot de passe changé ; idée enregistrée.",
    },
]
