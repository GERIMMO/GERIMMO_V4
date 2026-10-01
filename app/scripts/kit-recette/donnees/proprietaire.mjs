// Kit 03 — Propriétaire bailleur. Personnage : Julien MOREL (Orsay), deux
// biens, un locataire (Thomas Girard, joué par le testeur « Locataire du
// propriétaire »), l'artisan Karim Haddad (testeur « Artisan »).
//
// Les règles citées sont celles de l'application au 01/10/2026 : essai de
// 2 mois (offre de lancement jusqu'au 31/12/2026), formules Solo / Bailleur /
// Investisseur / Patrimoine, parrainage « un mois offert au parrain ».
import { EUR, calculerAmortissement, iban, siret, siretEspace } from "../commun.mjs";

export const DATE_KIT = "01/10/2026";

export const persona = {
  civilite: "M.",
  prenom: "Julien",
  nom: "Morel",
  naissance: "03/09/1977",
  lieuNaissance: "Lyon (69)",
  adresse: "18 rue de l'Ébauche",
  cp: "91400",
  ville: "Orsay",
  tel: "06 39 98 64 40",
  espace: "Parc de Julien Morel",
  qualite: "Personne physique",
  signature: "J. Morel",
};
export const ibanPersona = iban("00018", "00006440018");

export const cabinet = {
  initiales: "EG",
  nom: "Expertises du Gabarit",
  adresse: "12 cours des Étalons, 91400 Orsay",
  siret: siretEspace(siret("00008611", "0001")),
  operateur: "Rachid Lemoine",
  certification: "CERT-RCT-2026-1127",
};

export const syndic = { nom: "Syndic Fictif de l'Essonne", adresse: "11 cours des Copropriétés, 91300 Massy", siret: siretEspace(siret("00008813", "0001")) };

export const bien1 = {
  reference: "Appartement du Prototype",
  type: "Appartement",
  annee: 1931,
  adresse: "12 rue du Prototype",
  cp: "91400",
  ville: "Orsay",
  copro: true,
  zoneTendue: true,
  partiesCommunes: "Hall, escalier, local vélos",
  tic: "Fibre optique",
  surface: 38.9,
  pieces: 2,
  lot: "D2",
  etage: "2",
  idFiscal: "9999920710002",
  chauffage: "Individuel — chaudière gaz",
  eauChaude: "Individuelle — chaudière gaz",
  locauxPrivatifs: "Cave n° 4",
  autresParties: "Néant",
  dpe: "E",
  designation: "Appartement du Prototype — T2, 2ᵉ étage sans ascenseur",
};
export const bien2 = {
  reference: "Studio du Gabarit",
  type: "Appartement",
  annee: 2011,
  adresse: "3 impasse du Gabarit",
  cp: "91290",
  ville: "Arpajon",
  copro: true,
  zoneTendue: false,
  partiesCommunes: "Hall, parking extérieur, local poubelles",
  tic: "Fibre optique et antenne TNT collective",
  surface: 19.6,
  pieces: 1,
  lot: "S1",
  etage: "RDC",
  idFiscal: "9999921200001",
  chauffage: "Individuel — électricité",
  eauChaude: "Individuelle — ballon électrique",
  locauxPrivatifs: "Place de parking n° 3",
  autresParties: "Néant",
  dpe: "B",
  designation: "Studio du Gabarit — studio, rez-de-chaussée",
};

// Dates des diagnostics (réalisé → expire ; vide = illimité).
export const diags = {
  bien1: {
    erp: ["18/09/2026", "18/03/2027"],
    amiantePC: ["20/11/2018", ""],
    dpe: ["12/02/2025", "11/02/2035"],
    elec: ["14/09/2026", "13/09/2032"],
    gaz: ["14/09/2026", "13/09/2032"],
    crep: ["12/02/2025", ""],
    amiante: ["12/02/2025", ""],
  },
  bien2: { erp: ["19/09/2026", "19/03/2027"], dpe: ["05/05/2024", "04/05/2034"], elec: ["19/09/2026", "18/09/2032"] },
};

export const locataire = {
  civilite: "M.",
  prenom: "Thomas",
  nom: "Girard",
  naissance: "25/08/1998",
  lieuNaissance: "Lille (59)",
  adresse: "12 rue des Ébauches",
  cp: "59000",
  ville: "Lille",
  tel: "06 39 98 60 31",
  emploi: "Technicien de maintenance",
  contrat: "CDI depuis le 02/03/2022",
  matricule: "RCT-9825",
  tauxPas: 0.038,
};
export const employeurLocataire = {
  initiales: "AN",
  nom: "Atelier Fictif du Nord",
  forme: "SAS",
  adresse: "45 rue des Gabarits, 59000 Lille",
  siret: siretEspace(siret("00005732", "0001")),
  naf: "33.12Z — Réparation de machines et équipements mécaniques",
  convention: "Convention collective de la métallurgie",
};
export const brutLocataire = 2480;

export const artisan = { nom: "Haddad Plomberie Chauffage", siret: "00007314800017", tel: "06 39 98 73 14", zone: "91400", personne: "Karim Haddad" };

export const bail = {
  type: "Nu",
  entree: "21/09/2026",
  echeance: 1,
  loyer: 680,
  charges: 70,
  depot: 680,
  irl: "T2",
  irlValeur: "146,00",
  lieu: "Virement sur le compte de Julien Morel",
  dernierLoyer: 660,
  dernierVersement: "31/08/2026",
  derniereRevision: "01/03/2026",
};
export const terme = bail.loyer + bail.charges; // 750
export const prorataSeptembre = Math.round((terme * 10) / 30); // du 21 au 30 : 10 jours sur 30
export const paiementPartiel = 400;
export const solde = terme - paiementPartiel;

export const edl = {
  presents: "Julien Morel (bailleur) ; Thomas Girard (locataire)",
  pieces: [
    ["Entrée", "Bon", "Porte palière et interphone révisés"],
    ["Séjour", "Bon", "Parquet ciré ; élément « prises » : Usagé — un cache de prise fêlé"],
    ["Cuisine", "Usagé", "Plan de travail rayé ; plaques gaz et hotte fonctionnelles"],
    ["Chambre", "Bon", "Radiateur à eau chaude avec tête thermostatique ; fenêtre double vitrage"],
    ["Salle de bain", "Bon", "Chaudière murale entretenue en avril 2026 ; joints refaits en septembre"],
  ],
  compteurs: [
    ["Gaz", "RCT-GZ-0412", "5 206 m³"],
    ["Électricité", "0999 6120 0412", "14 877 kWh (base)"],
    ["Eau froide", "RCT-0412", "198,440 m³"],
  ],
  cles: "2 clés de la porte palière, 1 clé de boîte aux lettres, 1 bip du portail.",
};

export const chiffres = {
  devisArtisan: 205.59,
  devisArtisanHT: 186.9,
  factureArtisan: "F2026-0143",
  taxeFonciere: 1286,
  teom: 192,
  pno: 131,
  travaux: 385,
  pret: { capital: 132000, taux: 0.0245, dureeAns: 20, debut: 26, assurance: 145 },
  appelSyndic: [
    { libelle: "Charges générales (entretien, ménage, escalier)", recuperable: true, montant: 54.2 },
    { libelle: "Eau froide collective", recuperable: true, montant: 44.3 },
    { libelle: "Assurance de l'immeuble", recuperable: false, montant: 24.6 },
    { libelle: "Honoraires du syndic", recuperable: false, montant: 28.9 },
    { libelle: "Fonds de travaux (loi ALUR)", recuperable: false, montant: 12.8 },
  ],
};
export const interetsPret = calculerAmortissement(chiffres.pret).interets;
export const appelTotal = chiffres.appelSyndic.reduce((s, p) => s + p.montant, 0);
export const appelRecup = chiffres.appelSyndic.filter((p) => p.recuperable).reduce((s, p) => s + p.montant, 0);

const F = {
  signature: "01-mon-identite/signature-julien-morel.png",
  rib: "01-mon-identite/RIB-julien-morel.pdf",
  d1: "02-appartement-du-prototype-diagnostics",
  d2: "03-studio-du-gabarit-diagnostics",
  dossier: "04-dossier-thomas-girard",
  bailSigne: "05-bail-signe/bail-signe-thomas-girard.pdf",
  vitre: "06-incidents/incident-vitre-felee.jpg",
  livre: "07-livre-recettes-depenses",
};
export const FICHIERS = F;

// ── La fiche de tests ───────────────────────────────────────────────────────
export const phases = [
  {
    titre: "J1 · Inscription et installation",
    tests: [
      {
        id: "PRO-01",
        titre: "S'inscrire en ligne et confirmer son adresse",
        duree: "10 min",
        etapes: [
          "[www.gerimmo.app/connexion] -> « Propriétaire bailleur ? Ouvrir mon espace » (ou directement [www.gerimmo.app/inscription]).",
          `{Prénom} [${persona.prenom}] ; {Nom} [${persona.nom.toUpperCase()}] ; {Adresse postale} [${persona.adresse}] ; {Code postal} [${persona.cp}] ; {Ville} [${persona.ville}] ; {Téléphone} [${persona.tel}] ; {Vous louez en tant que} [${persona.qualite}] ; {Adresse e-mail} : la vôtre ; {Code de parrainage} : laissez vide (un code n'allonge pas l'essai : il offre un mois au parrain quand vous payez votre première facture).`,
          "{Mot de passe} de 8 caractères seulement -> <<Ouvrir mon espace>> : refus attendu. Puis deux mots de passe différents : refus attendu.",
          "Mot de passe correct (12 caractères ou plus), confirmé ; cochez les CGU -> <<Ouvrir mon espace>>.",
          "Avant de confirmer, essayez de vous connecter : refus attendu. Puis ouvrez le courriel « Confirmez votre adresse — Gerimmo » -> <<Confirmer mon adresse>> dans le courriel, puis le bouton <<Confirmer mon adresse>> de la page qui s'ouvre (le lien ne sert qu'une fois).",
        ],
        resultat: `Messages « Le mot de passe doit compter au moins 12 caractères. », « Les deux saisies ne correspondent pas. », puis « Vérifiez votre boîte mail… ». Connexion avant confirmation : « Votre adresse e-mail n'est pas encore confirmée… ». Après confirmation : votre espace « ${persona.espace} » s'ouvre.`,
      },
      {
        id: "PRO-02",
        titre: "Découvrir son espace",
        duree: "5 min",
        appareil: "les_deux",
        etapes: [
          `Tableau de bord : « Bonjour ${persona.prenom} », bloc « Mettre votre premier lot en location ».`,
          "Barre latérale : « Essai gratuit — N jours restants » (environ 60 : l'offre de lancement donne 2 mois, comptés en mois calendaires).",
          "Ouvrez chaque entrée : Mes lots, Locataires & garants, Loyers & charges, Livre recettes-dépenses, Incidents, Alertes, Agenda, Statistiques, Messages, et sous « Plus » : Mon profil, Fiscalité, Documents, Carnet d'artisans, Abonnement, Aide.",
        ],
        resultat: "Aucune page d'erreur ; chaque écran vide explique quoi faire. Pas de mandat ni d'honoraires : c'est l'espace d'un propriétaire. L'essai affiché fait bien 2 mois, pas 14 jours.",
      },
      {
        id: "PRO-03",
        titre: "Compléter son profil (condition pour créer un bien)",
        duree: "8 min",
        fichiers: [F.signature],
        etapes: [
          "Mes lots -> <<Ajouter un bien>> : si le profil est incomplet, l'encadré « Complétez d'abord votre profil » apparaît -> <<Compléter mon profil>>.",
          `Mon profil : {Nom de votre espace} [${persona.espace}] ; {Adresse} [${persona.adresse}] ; [${persona.cp}] [${persona.ville}] ; {Téléphone} [${persona.tel}] ; {Email de contact} : votre adresse ; {SIRET} vide ; {IBAN} [${ibanPersona.affiche}] (fictif).`,
          "Cochez les trois envois automatiques (avis d'échéance, quittances, relances) ; relances à [1] et [2] jours -> <<Enregistrer>>.",
          `Carte « Signature préenregistrée » : @@${F.signature.split("/")[1]}@@ -> <<Enregistrer>>.`,
        ],
        resultat: "Profil enregistré ; « Ajouter un bien » s'ouvre désormais sur le formulaire. Pas de rubrique de marque (logo) pour un propriétaire : c'est normal.",
      },
    ],
  },
  {
    titre: "J1 · Mes biens",
    tests: [
      {
        id: "PRO-04",
        titre: "Créer l'Appartement du Prototype",
        duree: "10 min",
        etapes: [
          `Mes lots -> <<Ajouter un bien>> : {Référence interne} [${bien1.reference}] ; {Type} [${bien1.type}] ; {Adresse} [${bien1.adresse}] (adresse fictive : ignorez les suggestions) ; [${bien1.cp}] [${bien1.ville}] ; {Année de construction} [${bien1.annee}] ; cochez **En copropriété** et **En zone tendue** ; {Parties communes} [${bien1.partiesCommunes}] ; {TIC} [${bien1.tic}] ; {Surface (m²)} [${bien1.surface}] ; {Nombre de pièces} [${bien1.pieces}] -> <<Créer le bien et son lot unique>>.`,
          `Sur la fiche du lot -> <<Modifier le lot>> : {Nom du lot} [${bien1.lot}] ; {Étage} [${bien1.etage}] ; {Identifiant fiscal du logement} [${bien1.idFiscal}] ; {Chauffage} [${bien1.chauffage}] ; {Eau chaude} [${bien1.eauChaude}] ; {Locaux privatifs} [${bien1.locauxPrivatifs}] ; {Autres parties du logement} [${bien1.autresParties}] -> <<Enregistrer>>.`,
          "« Pièces (état des lieux) » -> <<Proposer les pièces de ce logement>> : vérifiez Entrée, Séjour, Cuisine, Chambre, Salle de bain.",
        ],
        resultat: "Le lot est créé et vous êtes déjà propriétaire à 100 % (détention posée d'office sur votre fiche). Il reste « En préparation » tant que les diagnostics manquent.",
      },
      {
        id: "PRO-05",
        titre: `Déposer les diagnostics et mettre ${bien1.lot} en location`,
        duree: "15 min",
        donnees: "Dates : « Mon personnage » § 5 (aussi écrites sur chaque PDF).",
        fichiers: [`${F.d1}/ (7 fichiers)`],
        etapes: [
          `Fiche du lot -> « Diagnostics du lot » : [DPE] classe [${bien1.dpe}] ([${diags.bien1.dpe[0]}] -> [${diags.bien1.dpe[1]}]) ; [Électricité] et [Gaz] ([${diags.bien1.elec[0]}] -> [${diags.bien1.elec[1]}]) ; [Plomb (CREP)] ([${diags.bien1.crep[0]}], échéance vide) ; [Amiante (privatif)] ([${diags.bien1.amiante[0]}], échéance vide). Diagnostiqueur : [${cabinet.nom}].`,
          `« Diagnostics du bien » : [ERP — état des risques] ([${diags.bien1.erp[0]}] -> [${diags.bien1.erp[1]}]) ; [Amiante (parties communes)] ([${diags.bien1.amiantePC[0]}], échéance vide).`,
          "Carte du haut -> <<Mettre en location>>.",
        ],
        info: "Si un dépôt échoue avec un message général, ne réessayez pas le même fichier : prenez la copie de secours (dossier @@secours/@@) et signalez-le.",
        resultat: `Gerimmo attend bien le plomb (construction avant 1949) et l'amiante (avant 1997). « Lot passé en « Disponible ». »`,
      },
      {
        id: "PRO-06",
        titre: "Créer le Studio du Gabarit (deuxième bien)",
        duree: "10 min",
        fichiers: [`${F.d2}/ (3 fichiers)`],
        etapes: [
          `<<Ajouter un bien>> : [${bien2.reference}] ; [${bien2.type}] ; [${bien2.adresse}] ; [${bien2.cp}] [${bien2.ville}] ; [${bien2.annee}] ; **En copropriété** cochée, **En zone tendue** non ; [${bien2.partiesCommunes}] ; [${bien2.tic}] ; [${bien2.surface}] m² ; [${bien2.pieces}] pièce -> créer.`,
          `Lot : nom [${bien2.lot}], étage [${bien2.etage}], identifiant [${bien2.idFiscal}], chauffage [${bien2.chauffage}], eau chaude [${bien2.eauChaude}], locaux privatifs [${bien2.locauxPrivatifs}], autres parties [${bien2.autresParties}].`,
          `Diagnostics : DPE classe [${bien2.dpe}] ([${diags.bien2.dpe[0]}] -> [${diags.bien2.dpe[1]}]), électricité ([${diags.bien2.elec[0]}] -> [${diags.bien2.elec[1]}]), ERP ([${diags.bien2.erp[0]}] -> [${diags.bien2.erp[1]}]). Puis <<Mettre en location>>.`,
        ],
        resultat: "Deux biens dans « Mes lots », tous deux « Disponible ». Ni plomb ni amiante demandés (construction de 2011).",
      },
    ],
  },
  {
    titre: "J1 · Abonnement",
    tests: [
      {
        id: "PRO-07",
        titre: "Souscrire l'abonnement",
        duree: "10 min",
        badges: ["paiement"],
        etapes: [
          "Plus -> Abonnement : « Biens en gestion : 2 ». La formule proposée est [Bailleur — jusqu'à 3 biens] à **9,99 € TTC par mois** (Solo ne couvre qu'un bien : vérifiez qu'elle n'est pas proposée pour 2 biens).",
          "Périodicité [Mensuel, sans engagement] (regardez aussi « Annuel — deux mois offerts » : 99,90 € par an, sans le choisir) -> <<Continuer vers le paiement sécurisé>> -> page de paiement Stripe : revenez d'abord en arrière sans payer.",
          "Recommencez et payez avec votre carte (adresse de facturation demandée, validation 3D Secure possible).",
        ],
        alerte: "Paiement réel : ne le faites qu'après accord du coordinateur sur la prise en charge.",
        resultat: "Sans payer : « Paiement interrompu : rien n'a été prélevé, et rien n'a changé… ». Après paiement : « Merci, votre paiement est enregistré… », statut « Abonnement actif », et la mention que la carte ne sera débitée qu'à la fin de l'essai (date affichée, environ deux mois après votre inscription), pour 9,99 €.",
      },
      {
        id: "PRO-08",
        titre: "Gérer son abonnement dans le portail Stripe",
        duree: "3 min",
        badges: ["paiement"],
        etapes: ["Abonnement -> <<Gérer mon abonnement>> : regardez carte, factures, adresse. Ne résiliez pas maintenant. Revenez dans Gerimmo."],
        resultat: "Le portail Stripe s'ouvre et ramène à Gerimmo. Une erreur à l'ouverture est à signaler en [BLOQUANT].",
      },
    ],
  },
  {
    titre: "J2 · Mise en location",
    tests: [
      {
        id: "PRO-09",
        titre: "Créer la fiche de Thomas et déposer son dossier",
        duree: "12 min",
        fichiers: [`${F.dossier}/ (5 fichiers)`],
        etapes: [
          `Locataires & garants -> <<+ Créer une fiche>> -> [Locataire] : [${locataire.nom.toUpperCase()}] [${locataire.prenom}] ; {Adresse email} : l'adresse réelle du testeur « Locataire du propriétaire » (demandez-la au coordinateur) ; [${locataire.tel}] ; né le [${locataire.naissance}] à [Lille] ; [${locataire.adresse}], [${locataire.cp}] [${locataire.ville}] -> <<Créer la fiche>>.`,
          "« Pièces justificatives » : [Pièce d'identité] @@piece-identite-thomas-girard.pdf@@ ; [Justificatif] : les 3 bulletins et @@attestation-employeur-thomas-girard.pdf@@ (un dépôt par fichier, avec un titre parlant).",
        ],
        resultat: "Fiche de Thomas avec 5 pièces.",
      },
      {
        id: "PRO-10",
        titre: "Inviter Thomas et lui réclamer trois pièces",
        duree: "5 min",
        etapes: [
          "Prévenez le testeur : son lien d'accès ouvre une page avec le bouton <<Choisir mon mot de passe>>, valable une durée limitée. Fiche de Thomas -> « Accès locataire » -> <<Inviter comme locataire>>.",
          "Une fois son compte actif (LOP-01) : « Pièces réclamées » -> [Justificatif de domicile], [Avis d'imposition], puis [RIB] -> <<Demander>> à chaque fois.",
        ],
        resultat: "« Invitation envoyée à … » puis « Compte locataire actif » ; Thomas reçoit trois courriels « Pièce demandée : … ». Ses dépôts (LOP-04) rejoignent son dossier.",
      },
      {
        id: "PRO-11",
        titre: "Créer le bail de Thomas, le faire signer, le déposer signé",
        duree: "25 min",
        fichiers: [F.bailSigne],
        etapes: [
          `Fiche du lot ${bien1.lot} -> « Baux & état des lieux » : [${bail.type}] ; locataire [${locataire.prenom} ${locataire.nom.toUpperCase()}] ; {Date d'entrée} [${bail.entree}] (entrée en cours de mois, exprès) ; {Jour d'échéance} [${bail.echeance}] ; [${bail.loyer}] € hors charges ; [${bail.charges}] € de charges en [Provision] ; dépôt [${bail.depot}] ; IRL [${bail.irl}], révision cochée -> <<Créer le bail>>.`,
          `« Compléments du contrat » : [Librement fixé] ; [À échoir (d'avance)] ; lieu [${bail.lieu}] ; IRL de référence [${bail.irlValeur}] (valeur de test) ; dernier loyer du précédent locataire [${bail.dernierLoyer}], dernier versement [${bail.dernierVersement}], dernière révision [${bail.derniereRevision}] (si proposés) -> <<Enregistrer les compléments>>. Puis <<Générer le bail (PDF)>> et la notice.`,
          "Documents -> le PDF du bail -> <<Envoyer pour signature>> (Thomas). Attendez son retour (LOP-05).",
          "Fiche du bail -> « Bail signé » -> @@bail-signe-thomas-girard.pdf@@ -> <<Déposer le bail signé>> -> <<Envoyer au locataire>>.",
        ],
        resultat: "Bail actif, lot « Loué », Thomas reçoit « Votre bail signé est disponible ». Préavis d'un mois affiché (zone tendue).",
      },
      {
        id: "PRO-12",
        titre: "État des lieux d'entrée et dépôt de garantie",
        duree: "20 min",
        appareil: "les_deux",
        donnees: "« Mon personnage » § 7 (état des pièces, compteurs, clés).",
        etapes: [
          "« États des lieux » -> « Nouvel état des lieux » [Entrée] -> <<Préparer cet état des lieux>> -> <<Ouvrir la grille>>.",
          `Mentions : [${edl.presents}] ; détecteur [Présent], [Fonctionne (testé)] ; assurance fournie [Oui] ; observations [Néant] -> <<Enregistrer les mentions>>.`,
          `Grille : pièce par pièce d'après « Mon personnage » (la cuisine en [Usagé] avec son commentaire) ; compteurs gaz [${edl.compteurs[0][1]}] [${edl.compteurs[0][2].split(" ")[0]} ${edl.compteurs[0][2].split(" ")[1]}], électricité [${edl.compteurs[1][1]}] [${edl.compteurs[1][2].split(" (")[0]}], eau [${edl.compteurs[2][1]}] [${edl.compteurs[2][2]}] ; clés 2 + 1 + 1 bip -> <<Enregistrer et signer>> -> <<Générer le PDF>>.`,
          `« Dépôt de garantie » -> <<Enregistrer un encaissement>> [${bail.depot}], date du jour, [Virement] -> <<Encaisser>>.`,
        ],
        resultat: `État des lieux « Signé — figé » avec son PDF ; dépôt de ${EUR(bail.depot)} enregistré avec son reçu.`,
      },
      {
        id: "PRO-13",
        titre: "Enregistrer l'artisan dans votre carnet",
        duree: "5 min",
        badges: ["attente"],
        prerequis: "L'artisan est inscrit et validé (ART-04).",
        etapes: [
          `Plus -> Carnet d'artisans -> « Enregistrer un artisan » : [${artisan.nom}] ; SIRET [${artisan.siret}] ; mobile [${artisan.tel}] ; courriel vide ; métiers [Plomberie] et [Chauffage] ; zone [${artisan.zone}] -> <<Enregistrer l'artisan>>.`,
        ],
        resultat: "« Artisan enregistré… sa fiche vous a été rattachée plutôt que dupliquée. » Il apparaît validé par Gerimmo.",
      },
    ],
  },
  {
    titre: "J3 · Loyers",
    tests: [
      {
        id: "PRO-14",
        titre: "Générer l'échéancier : un premier mois au prorata",
        duree: "5 min",
        etapes: [
          "Fiche du bail -> « Loyers & paiements » -> <<Générer l'échéancier>>.",
          "Ouvrez <<Prorata (PDF)>> de septembre et <<Avis d'échéance (PDF)>> d'octobre.",
          "Loyers & charges : tuiles « Demandé ce mois », « Encaissé », « Reste dû ».",
        ],
        resultat: `Septembre est appelé au prorata (du 21 au 30 : 10 jours sur 30, soit ${EUR(prorataSeptembre)} sur ${EUR(terme)}), octobre pour ${EUR(terme)}. Le décompte de prorata explique le calcul. Si les envois automatiques sont cochés, Thomas reçoit l'avis le lendemain matin, puis une relance tant que rien n'est encaissé.`,
      },
      {
        id: "PRO-15",
        titre: "Encaisser septembre, puis un paiement partiel, puis le solde",
        duree: "12 min",
        badges: ["attente"],
        prerequis: "De préférence le lendemain de PRO-14, après les courriels du matin (Thomas vous dit ce qu'il a reçu).",
        etapes: [
          "Loyers & charges : sur la ligne de Thomas, le bouton « Encaisser … » signale « (septembre d'abord) ». Ne cliquez pas : faites les trois paiements depuis la fiche du bail, pour contrôler les montants.",
          `Fiche du bail -> « Loyers & paiements » -> <<Saisir un encaissement>> : le montant exact du prorata de septembre ([${prorataSeptembre}] €), date du jour, [Virement] -> <<Encaisser>> -> septembre « Payé ».`,
          `<<Saisir un encaissement>> : [${paiementPartiel}] € -> <<Encaisser>> -> octobre devient « Partiel » avec un « Reçu partiel ».`,
          `<<Saisir un encaissement>> : [${solde}] € -> <<Encaisser>> -> octobre « Payé ».`,
          "Envoyez ce qui n'est pas encore parti (<<Envoyer le reçu>>, <<Envoyer la quittance>>, ou l'envoi groupé de « Loyers & charges »).",
        ],
        resultat: `Quittance de septembre ; reçu de paiement d'octobre (${EUR(paiementPartiel)}) ; puis quittance d'octobre au solde. Thomas reçoit « Reçu de paiement — octobre 2026 » puis « Quittance de loyer — octobre 2026 ». Le compte rendu d'encaissement dit « imputés du terme le plus ancien au plus récent ».`,
      },
    ],
  },
  {
    titre: "J3–J5 · Incidents",
    tests: [
      {
        id: "PRO-16",
        titre: "Qualifier le radiateur en panne et consulter l'artisan",
        duree: "12 min",
        badges: ["attente"],
        prerequis: "Thomas a signalé son radiateur (LOP-09).",
        etapes: [
          "Incidents -> l'incident -> « Qualification — qui paie » : [Charge propriétaire] ; [Tête thermostatique défectueuse par usure : charge du bailleur] -> <<Qualifier l'incident>>.",
          "« Confier à un artisan » : {Métier} [Chauffage] ; {Nature des travaux} [Remplacement d'équipement] (décennale exigée) ; validité [30] ; « J'assume un devis unique » -> <<Ouvrir la mise en concurrence>> -> Haddad -> <<Demander un devis>>.",
          `Au devis reçu (ART-11 : ${EUR(chiffres.devisArtisan)} TTC) -> <<Retenir ce devis>>.`,
        ],
        resultat: `L'artisan est proposé (décennale valide, zone ${artisan.zone}, carnet). Le devis se lit ligne par ligne ; la mission est confiée.`,
      },
      {
        id: "PRO-17",
        titre: "Trancher une « autre cause » signalée par l'artisan, puis clôturer",
        duree: "10 min",
        badges: ["attente"],
        prerequis: "L'artisan a fait l'intervention et signalé un problème imprévu (ART-13).",
        etapes: [
          "Carte « L'artisan signale une autre cause — à trancher avant facturation » -> {Qui prend en charge, après diagnostic} [Charge propriétaire] ; {Justification} [Robinet de radiateur grippé, usure normale] -> <<Réviser l'imputation>>.",
          "Si le montant change, décidez : <<Accepter l'avenant>> (ou refuser et garder le montant autorisé).",
          `« Noter ${artisan.nom} » (5 / 5 / 4) -> <<Noter l'artisan>> ; « Clôture » : [Résolu], [Tête thermostatique remplacée, circuit purgé] -> <<Clôturer l'incident>>.`,
        ],
        resultat: "La révision d'imputation est tracée avant facturation ; l'artisan peut ensuite déposer sa facture ; l'incident est « Clos ».",
      },
      {
        id: "PRO-18",
        titre: "Déclarer vous-même un incident, imputé au locataire",
        duree: "8 min",
        fichiers: [F.vitre],
        etapes: [
          `Incidents -> <<Ouvrir un incident>> (…/incidents/nouveau) : lot [${bien1.lot}] ; [Menuiserie — vitre brisée] ; pièce [Chambre] ; urgence [Normal] ; description [Vitre intérieure de la fenêtre de la chambre fêlée en étoile, sans courant d'air] ; photo @@incident-vitre-felee.jpg@@ -> <<Déclarer l'incident>>.`,
          "Qualifiez : [Dégradation fautive — charge locataire], [Vitre fêlée par un choc depuis l'intérieur].",
          "Attendez la contestation de Thomas (LOP-14), répondez-lui, puis clôturez : [Classé sans suite], [Le locataire fait remplacer la vitre par son assureur].",
        ],
        resultat: "L'incident est visible par Thomas avec l'imputation ; sa contestation vous parvient ; la clôture « Classé sans suite » est tracée.",
      },
    ],
  },
  {
    titre: "J5–J7 · Gestion courante",
    tests: [
      {
        id: "PRO-19",
        titre: "Tenir le livre recettes-dépenses",
        duree: "15 min",
        fichiers: [`${F.livre}/ (5 justificatifs)`],
        etapes: [
          "Livre recettes-dépenses : repérez les loyers encaissés, inscrits seuls.",
          `« Saisir une écriture » : [Dépense] · [Taxe foncière] · [${chiffres.taxeFonciere}] · date pièce [15/09/2026] · lot [${bien1.lot}] · [Taxe foncière 2026 (dont TEOM ${chiffres.teom} €)] -> <<Ajouter l'écriture>>.`,
          `Puis : [Assurance] [${chiffres.pno}] ([03/01/2026], [Assurance PNO 2026]) ; [Travaux] [${chiffres.travaux}] ([24/09/2026], [Joints de salle de bain et mitigeur avant location]) ; [Travaux] [${chiffres.devisArtisan.toFixed(2).replace(".", ",")}] (date de la facture de l'artisan, [Facture ${chiffres.factureArtisan} Haddad — radiateur]).`,
          `Les intérêts d'emprunt ([${EUR(interetsPret)}]) : s'il existe une catégorie adaptée, saisissez-les ; sinon, notez où Gerimmo vous propose de les indiquer (voir PRO-21).`,
          "Plus -> Documents -> <<+ Déposer un document>> : rangez les 5 justificatifs (type [Justificatif] ou [Autre]).",
        ],
        resultat: "Chaque écriture s'ajoute au bon lot ; les justificatifs sont rangés. Signalez toute catégorie qui manque pour un propriétaire.",
      },
      {
        id: "PRO-20",
        titre: "Charges de copropriété et clôture de septembre",
        duree: "10 min",
        fichiers: [`${F.livre}/appel-de-fonds-syndic-T4-2026-prototype.pdf`],
        etapes: [
          `Fiche du lot ${bien1.lot} -> « Charges de copropriété » -> « Saisir un appel de charges » : exercice [2026], reçu le date du jour, total [${appelTotal.toFixed(2).replace(".", ",")}] (récupérable [${appelRecup.toFixed(2).replace(".", ",")}], non récupérable [${(appelTotal - appelRecup).toFixed(2).replace(".", ",")}]), appel @@appel-de-fonds-syndic-T4-2026-prototype.pdf@@ -> <<Créer l'appel>>.`,
          "Livre recettes-dépenses -> « Clôturer un mois » : [septembre 2026] -> <<Clôturer le mois>> (irréversible).",
          "Essayez ensuite une écriture imputée en septembre : refus attendu.",
        ],
        resultat: "L'appel est ventilé ; « Mois clôturé. » ; une écriture de septembre est refusée (« Mois clôturé : imputez au mois ouvert ou passez une contre-écriture »).",
      },
      {
        id: "PRO-21",
        titre: "Préparer sa déclaration : le récapitulatif fiscal",
        duree: "10 min",
        etapes: [
          "Plus -> Fiscalité -> « Récapitulatif fiscal » -> {Année du récapitulatif} [2026].",
          "Comparez aux écritures : loyers (lignes 211/212), taxe foncière, assurance, travaux, intérêts d'emprunt « à compléter ».",
          "Exportez le livre (« Journal » -> <<Exporter 2026>>).",
        ],
        resultat: "Les montants correspondent à vos écritures ; les rubriques sont compréhensibles pour un particulier. Signalez un montant faux ou mal rangé (la TEOM, récupérable sur le locataire, en est un bon test).",
      },
      {
        id: "PRO-22",
        titre: "Messages, assurance du locataire, alertes",
        duree: "8 min",
        appareil: "les_deux",
        badges: ["attente"],
        prerequis: "Thomas a déposé son assurance (LOP-03) et vous a écrit (LOP-13).",
        etapes: [
          "Fiche de Thomas -> « Pièces justificatives » -> attestation « À vérifier » -> <<Valider>>.",
          "Messages -> la conversation -> fiche de Thomas -> <<Répondre>>.",
          "Alertes et Agenda : ouvrez chaque alerte et vérifiez qu'elle mène au bon geste.",
        ],
        resultat: "Assurance « Validée » ; Thomas reçoit votre réponse par courriel ; les alertes se referment une fois le geste fait.",
      },
      {
        id: "PRO-23",
        titre: "Documents : refuser un doublon",
        duree: "3 min",
        etapes: ["Documents -> <<+ Déposer un document>> : redéposez @@avis-taxe-fonciere-2026-prototype.pdf@@ déjà rangé en PRO-19."],
        resultat: "Refus : « Un fichier au contenu strictement identique existe déjà… ».",
      },
      {
        id: "PRO-24",
        titre: "Parrainage, aide et règles",
        duree: "5 min",
        appareil: "les_deux",
        etapes: [
          "Mon profil -> carte « Parrainage » : {Votre code} et {Lien à partager} (copiez le lien). Lisez la règle affichée : un mois offert **au parrain** à la première facture payée du filleul ; rien pour le filleul.",
          "Plus -> Aide (questions fréquentes) et Les règles à connaître : lisez deux ou trois réponses.",
        ],
        resultat: "Le lien de parrainage mène à l'inscription avec le code prérempli. La FAQ répond clairement et dit la même chose que l'application sur l'essai (2 mois) et le parrainage (signalez toute contradiction).",
      },
    ],
  },
  {
    titre: "Fin de recette",
    tests: [
      {
        id: "PRO-25",
        titre: "Résilier l'abonnement (sur consigne)",
        duree: "5 min",
        badges: ["paiement", "facultatif", "attente"],
        prerequis: "Uniquement quand le coordinateur le demande.",
        etapes: ["Abonnement -> <<Gérer mon abonnement>> -> résiliez dans le portail Stripe -> revenez dans Gerimmo."],
        resultat: "Bandeau « Votre abonnement prend fin le … ». À cette date, le compte passe en lecture seule (vos données restent consultables et exportables).",
      },
      {
        id: "PRO-26",
        titre: "Sécurité du compte et déconnexion",
        duree: "5 min",
        appareil: "les_deux",
        etapes: [
          "Menu du compte -> Sécurité du compte : changez le mot de passe ; facultatif : activez puis retirez la double authentification.",
          "Aide et retours -> [Proposer une idée] : ce qui vous manquerait pour gérer seul vos biens.",
          "<<Se déconnecter>>.",
        ],
        resultat: "« Mot de passe modifié… » ; idée enregistrée ; déconnexion effective.",
      },
    ],
  },
];

// ── « Mon personnage » ──────────────────────────────────────────────────────
const vide = "vide (illimité)";
export function sectionsPersonnage(fichiers) {
  return [
    {
      titre: "1. Qui êtes-vous",
      tableau: {
        colonnes: ["Champ", "Valeur à saisir"],
        lignes: [
          ["Civilité", persona.civilite],
          ["Prénom", persona.prenom],
          ["Nom", persona.nom.toUpperCase()],
          ["Date de naissance", persona.naissance],
          ["Commune de naissance", persona.lieuNaissance],
          ["Adresse", `${persona.adresse}, ${persona.cp} ${persona.ville}`],
          ["Téléphone (fictif)", persona.tel],
          ["Vous louez en tant que", persona.qualite],
        ],
      },
    },
    {
      titre: "2. Vos accès et votre abonnement",
      puces: [
        "Vous créez votre compte vous-même sur **www.gerimmo.app/inscription**, avec votre vraie adresse e-mail, puis vous la confirmez (courriel « Confirmez votre adresse — Gerimmo », qui ouvre une page avec un bouton à cliquer ; le lien ne sert qu'une fois). Pas de code de parrainage.",
        "**Essai de 2 mois** (offre de lancement, pour toute inscription jusqu'au 31/12/2026). Aucun bien n'est offert : avec deux biens, la formule est **Bailleur** (jusqu'à 3 biens), **9,99 € TTC par mois** — paiement réel par carte, débité à la fin de l'essai. Accord du coordinateur avant de payer.",
        "**Parrainage** : votre code (Mon profil) offre un mois à son utilisateur ? Non — c'est **vous, le parrain**, qui gagnez un mois quand un filleul paie sa première facture. Le filleul n'a pas d'avantage.",
      ],
    },
    {
      titre: "3. Votre profil (« Mon profil »)",
      tableau: {
        colonnes: ["Champ", "Valeur à saisir"],
        lignes: [
          ["Nom de votre espace", persona.espace],
          ["Adresse · code postal · ville", `${persona.adresse} · ${persona.cp} · ${persona.ville}`],
          ["Téléphone", persona.tel],
          ["Email de contact", "votre adresse"],
          ["SIRET", "vide (facultatif pour un particulier)"],
          ["IBAN", `${ibanPersona.affiche} (fictif)`],
          ["Relances automatiques", "première à 1 jour, seconde à 2 jours"],
          ["Signature", fichiers.signature],
        ],
      },
    },
    {
      titre: "4. Vos deux biens",
      tableau: {
        colonnes: ["", bien1.reference, bien2.reference],
        lignes: [
          ["Référence interne", bien1.reference, bien2.reference],
          ["Type · année", `${bien1.type} · ${bien1.annee}`, `${bien2.type} · ${bien2.annee}`],
          ["Adresse", `${bien1.adresse}, ${bien1.cp} ${bien1.ville}`, `${bien2.adresse}, ${bien2.cp} ${bien2.ville}`],
          ["En copropriété · zone tendue", "oui · oui", "oui · non"],
          ["Parties communes", bien1.partiesCommunes, bien2.partiesCommunes],
          ["TIC", bien1.tic, bien2.tic],
          ["Nom du lot · étage", `${bien1.lot} · ${bien1.etage}`, `${bien2.lot} · ${bien2.etage}`],
          ["Identifiant fiscal", bien1.idFiscal, bien2.idFiscal],
          ["Surface · pièces", `${String(bien1.surface).replace(".", ",")} m² · ${bien1.pieces}`, `${String(bien2.surface).replace(".", ",")} m² · ${bien2.pieces}`],
          ["Chauffage · eau chaude", `${bien1.chauffage} · ${bien1.eauChaude}`, `${bien2.chauffage} · ${bien2.eauChaude}`],
          ["Locaux privatifs · autres parties", `${bien1.locauxPrivatifs} · ${bien1.autresParties}`, `${bien2.locauxPrivatifs} · ${bien2.autresParties}`],
          ["Classe DPE", bien1.dpe, bien2.dpe],
        ],
      },
    },
    {
      titre: "5. Les diagnostics",
      intro: `Diagnostiqueur : ${cabinet.nom}.`,
      tableau: {
        colonnes: ["Où", "Diagnostic", "Réalisé le", "Expire le"],
        lignes: [
          ["Immeuble du Prototype", "ERP — état des risques", ...diags.bien1.erp],
          ["Immeuble du Prototype", "Amiante (parties communes)", diags.bien1.amiantePC[0], vide],
          [`Lot ${bien1.lot}`, "DPE", ...diags.bien1.dpe],
          [`Lot ${bien1.lot}`, "Électricité", ...diags.bien1.elec],
          [`Lot ${bien1.lot}`, "Gaz", ...diags.bien1.gaz],
          [`Lot ${bien1.lot}`, "Plomb (CREP)", diags.bien1.crep[0], vide],
          [`Lot ${bien1.lot}`, "Amiante (privatif)", diags.bien1.amiante[0], vide],
          ["Immeuble du Gabarit", "ERP — état des risques", ...diags.bien2.erp],
          [`Lot ${bien2.lot}`, "DPE", ...diags.bien2.dpe],
          [`Lot ${bien2.lot}`, "Électricité", ...diags.bien2.elec],
        ],
      },
    },
    {
      titre: "6. Votre locataire et son bail",
      intro: `**${locataire.prenom} ${locataire.nom.toUpperCase()}** — né le ${locataire.naissance} à ${locataire.lieuNaissance} ; ${locataire.adresse}, ${locataire.cp} ${locataire.ville} ; ${locataire.tel} ; e-mail : l'adresse réelle du testeur « Locataire du propriétaire » (tableau du coordinateur). Il est ${locataire.emploi.toLowerCase()} chez ${employeurLocataire.nom} (${locataire.contrat}).`,
      tableau: {
        colonnes: [`Bail de Thomas (lot ${bien1.lot})`, "Valeur"],
        lignes: [
          ["Type · date d'entrée · échéance", `${bail.type} · ${bail.entree} (entrée en cours de mois : premier mois au prorata) · le 1ᵉʳ`],
          ["Loyer · charges", `${EUR(bail.loyer)} · ${EUR(bail.charges)} (provision)`],
          ["Dépôt de garantie", EUR(bail.depot)],
          ["IRL · révision annuelle · valeur de référence", `${bail.irl} · oui · ${bail.irlValeur} (valeur de test)`],
          ["Fixation · paiement · lieu", `Librement fixé · À échoir · ${bail.lieu}`],
          ["Dernier loyer du précédent locataire", `${EUR(bail.dernierLoyer)} (dernier versement le ${bail.dernierVersement}, dernière révision le ${bail.derniereRevision})`],
          ["Pièces que vous déposez", "pièce d'identité, 3 bulletins de salaire, attestation d'employeur"],
          ["Pièces que vous lui réclamez", "justificatif de domicile, avis d'imposition, RIB"],
        ],
      },
    },
    {
      titre: `7. L'état des lieux d'entrée (lot ${bien1.lot})`,
      intro: `Présents « ${edl.presents} » · détecteur présent, fonctionne · assurance fournie : oui · observations : Néant.`,
      tableau: { colonnes: ["Pièce", "État", "Commentaire"], lignes: edl.pieces },
      apres: `États proposés par Gerimmo : Neuf, Bon, Usagé, Mauvais, Absent. Utilisez « Toute la section : Bon », puis ajustez. Compteurs : ${edl.compteurs.map((c) => `${c[0]} ${c[1]} — ${c[2]}`).join(" ; ")}. Clés remises : ${edl.cles}`,
    },
    {
      titre: "8. Les chiffres de la recette",
      tableau: {
        colonnes: ["Quoi", "Montant"],
        lignes: [
          ["Septembre (du 21 au 30)", `${EUR(prorataSeptembre)} (10 jours sur 30 de ${EUR(terme)}) — lisez le montant exact sur l'échéancier`],
          ["Octobre", `${EUR(terme)} : un premier paiement de ${EUR(paiementPartiel)}, puis ${EUR(solde)}`],
          ["Abonnement", "formule Bailleur, 9,99 € TTC par mois (99,90 € en annuel), après 2 mois d'essai"],
          ["Devis et facture de l'artisan (radiateur)", `${EUR(chiffres.devisArtisan)} TTC (${EUR(chiffres.devisArtisanHT)} HT)`],
          ["Taxe foncière 2026", `${EUR(chiffres.taxeFonciere)} dont TEOM ${EUR(chiffres.teom)} (récupérable)`],
          ["Assurance propriétaire non occupant", EUR(chiffres.pno)],
          ["Travaux salle de bain (septembre)", EUR(chiffres.travaux)],
          ["Intérêts d'emprunt 2026", `${EUR(interetsPret)} (assurance emprunteur ${EUR(chiffres.pret.assurance)})`],
          [`Appel du syndic T4 2026 (lot ${bien1.lot})`, `${EUR(appelTotal)} dont ${EUR(appelRecup)} récupérables`],
        ],
      },
    },
    {
      titre: "9. Les personnages que vous croiserez",
      tableau: {
        colonnes: ["Personnage", "Rôle", "Joué par"],
        lignes: [
          [`${locataire.prenom} ${locataire.nom}`, `votre locataire (T2 ${bien1.lot})`, "le testeur « Locataire du propriétaire »"],
          [artisan.personne, "l'artisan qui répare le radiateur", "le testeur « Artisan »"],
          ["Tahir", "supervision Gerimmo", "le coordinateur"],
        ],
      },
    },
    {
      titre: "10. Vos fichiers",
      tableau: { colonnes: ["Fichier (dans documents/)", "Usage"], lignes: fichiers.liste },
    },
  ];
}

export const guide = {
  date: DATE_KIT,
  roles: [
    { icone: "🏢", titre: "L'agence immobilière", texte: "Nadia Bensaïd, gérante d'Horizon Gestion (Évry-Courcouronnes). Elle gère les lots de Bernard Fontaine (propriétaire « mandant », sans compte) et loue un appartement à Camille." },
    { icone: "🔑", titre: "Le locataire de l'agence", texte: "Camille Roussel. Elle entre dans son appartement, retrouve son bail et ses quittances, signale une fuite sous l'évier." },
    { icone: "🏠", titre: "Le propriétaire bailleur", texte: `${persona.prenom} ${persona.nom} gère seul ses deux biens (${bien1.ville} et ${bien2.ville}), sans agence. Il loue son T2 à Thomas et paie son abonnement pour de vrai.` },
    { icone: "🔑", titre: "Le locataire du propriétaire", texte: `Thomas Girard. Il entre dans le T2 de ${persona.prenom}, reçoit ses quittances, signale un radiateur en panne.` },
    { icone: "🔧", titre: "L'artisan", texte: "Karim Haddad, plombier-chauffagiste. Il s'inscrit, est validé par Gerimmo, puis répare la fuite (pour l'agence) et le radiateur (pour Julien)." },
    { icone: "🛡", titre: "Le coordinateur", texte: "Tahir, côté supervision de Gerimmo : il ouvre l'agence, valide l'artisan, lit et répond à vos signalements. C'est lui qu'on prévient en cas de blocage." },
  ],
  calendrier: [
    ["J0", "Coordinateur : vérifie la plateforme, ouvre l'agence, envoie les dossiers."],
    ["J1", "Chacun s'installe, en parallèle. Agence : compte, profil, résidence, lots, diagnostics, mandat. Propriétaire : inscription, profil, deux biens, diagnostics, abonnement (paiement réel). Artisan : inscription et attestations — puis le coordinateur le valide. Locataires : rien encore."],
    ["J2", "Mise en location. L'agence invite Camille, le propriétaire invite Thomas ; baux, bail signé, état des lieux d'entrée, dépôt de garantie. Les locataires ouvrent leur espace, déposent leurs pièces et leur assurance. L'agence et le propriétaire ajoutent l'artisan à leur réseau."],
    ["J3", "Loyers. Terme d'octobre appelé, paiements saisis, quittances et reçus envoyés ; les locataires les retrouvent dans leur espace."],
    ["J3–J5", "Incidents. Camille signale une fuite, Thomas un radiateur froid ; qualification, devis de l'artisan, choix du créneau par le locataire, intervention, compte rendu, facture, clôture, évaluations."],
    ["J5–J7", "Gestion courante et fin. Messages, documents, charges, comptabilité et clôture du mois, récapitulatif fiscal ; pour l'agence, rapport de gestion, imports, congé de Camille et état des lieux de sortie."],
  ],
  paiements: [
    "**Propriétaire bailleur** : une formule selon le nombre de biens, TTC — Solo (1 bien) 5,99 €, Bailleur (jusqu'à 3 biens) 9,99 €, Investisseur (jusqu'à 10) 19,99 €, Patrimoine (jusqu'à 20) 29,99 € par mois ; l'annuel vaut dix mois. Aucun bien n'est offert. Avec deux biens : **9,99 € par mois**.",
    "**Agence** : 39 € HT par mois jusqu'à 10 lots sous mandat actif (TVA non applicable, art. 293 B du CGI : 39 € tout compris), puis 2 € HT par lot du 11ᵉ au 50ᵉ — seulement si le coordinateur a ouvert l'agence en période d'essai.",
    "**Locataires et artisan** : ne paient jamais rien dans Gerimmo.",
    "**Parrainage** : le parrain reçoit un mois offert quand son filleul paie sa première facture ; le filleul n'a pas d'avantage.",
  ],
};

export const remontee = {
  date: DATE_KIT,
  espaceExemple: persona.espace,
  modele: `Test : PRO-04 (fiche Propriétaire bailleur)
Étapes :
1. Menu Mes lots, bouton « Ajouter un bien »
2. Champs remplis avec « Mon personnage » (${bien1.reference})
3. Clic sur « Créer le bien et son lot unique »
Constaté : rien ne se passe, aucun message ; le bien n'apparaît pas dans Mes lots.
Appareil : iPhone 13, Safari (ou : PC Windows, Chrome)
Heure : 14 h 32
Réf. d'erreur affichée : aucune`,
  exempleUtile: {
    titre: "[GÊNANT] LOP-08 — La quittance d'octobre n'apparaît pas dans « Mes paiements »",
    corps: `Test LOP-08. Mon propriétaire a saisi mon paiement de ${EUR(terme)} hier à 18 h (il me l'a confirmé). Ce matin, Mes paiements affiche toujours le loyer à régler et aucune quittance. Téléphone Android, Chrome, 9 h 10. Pas de réf. d'erreur.`,
    attendu: "la quittance d'octobre est téléchargeable, et un e-mail l'annonce.",
  },
};
