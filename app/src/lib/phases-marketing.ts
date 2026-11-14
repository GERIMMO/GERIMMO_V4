export const PHASES = {
  preparation: "Préparation du lancement",
  lancement: "Lancement et premières inscriptions",
  communaute: "Développement de la communauté",
  commercial: "Ouverture commerciale",
  fidelisation: "Fidélisation",
} as const;
export type Phase = keyof typeof PHASES;
export function phaseValide(v: unknown): v is Phase {
  return typeof v === "string" && Object.hasOwn(PHASES, v);
}

type Objectif = "notoriete" | "conversion" | "trafic";
type Angle = { cle: string; titre: string; texte: string; action: string; objectif: Objectif };
const decouvrir: Angle = {
  cle: "decouvrir-gerimmo", titre: "Un seul dossier pour retrouver votre location",
  texte: "Un bail dans un dossier, des quittances dans les e-mails et une fuite signalée par téléphone : retrouver une information prend vite du temps. Dans Gerimmo, ouvrez le logement pour retrouver son bail, ses documents et ses incidents.",
  action: "Découvrez Gerimmo sur www.gerimmo.app.", objectif: "notoriete",
};
const essayer: Angle = {
  cle: "essayer-gerimmo", titre: "Vous suivez encore vos loyers dans un tableur ?",
  texte: "Pour essayer Gerimmo, commencez avec un seul logement. Vous pourrez y rassembler les documents du bail et suivre les loyers attendus et reçus.",
  action: "Consultez les conditions de l’essai gratuit sans carte bancaire sur www.gerimmo.app/inscription.", objectif: "conversion",
};
const configurer: Angle = {
  cle: "premier-logement", titre: "Votre premier logement dans Gerimmo",
  texte: "Dans Biens et locations, ajoutez le bien et son logement. Vérifiez son adresse et son propriétaire avant de commencer le bail. Vous retrouverez ensuite les pièces du dossier depuis cette même fiche.",
  action: "Ouvrez Biens et locations dans votre espace propriétaire.", objectif: "trafic",
};
const ecouter: Angle = {
  cle: "retours-bailleurs", titre: "Quelle étape vous prend le plus de temps dans votre location ?",
  texte: "Retrouver une quittance, vérifier un loyer ou suivre une réparation : les premiers retours des bailleurs nous aident à choisir les parcours à simplifier.",
  action: "Dans Aide et retours, décrivez l’étape que vous aimeriez simplifier.", objectif: "trafic",
};
const incident: Angle = {
  cle: "suivre-reparation", titre: "Où en est la réparation dans votre logement ?",
  texte: "Rassemblez le constat, les photos et les échanges dans la fiche de l’incident. À la prochaine demande du locataire, vous pourrez reprendre le dossier là où vous en étiez.",
  action: "Retrouvez le suivi dans la rubrique Incidents de votre espace.", objectif: "trafic",
};
const ANGLES: Record<Phase, Angle[]> = {
  preparation: [decouvrir, ecouter], lancement: [decouvrir, essayer, configurer, incident, ecouter],
  communaute: [ecouter, incident, configurer], commercial: [essayer, decouvrir, configurer],
  fidelisation: [incident, configurer, ecouter],
};

// Une phase est un choix éditorial. Aucune phase ne promet l’ouverture des ventes.
export function prochainAngle(phase: Phase, titresUtilises: ReadonlySet<string>) {
  return ANGLES[phase].find(angle => !titresUtilises.has(angle.titre));
}
// Des rendez-vous pratiques mensuels après les premiers sujets. Chaque fiche porte
// sur une période effective et une vérification distincte dans un écran existant.
const RENDEZ_VOUS = [
  ["loyers", "Loyers", "ouvrez les loyers attendus pour la période. Comparez-les aux virements reçus avant de confirmer chaque encaissement.", "conversion"],
  ["documents", "Documents du logement", "choisissez un logement et retrouvez son bail et ses diagnostics. Vérifiez si une pièce ajoutée ce mois-ci manque à son dossier.", "trafic"],
  ["incident", "Réparations", "reprenez les incidents encore ouverts. Pour chacun, retrouvez la dernière réponse et identifiez qui doit agir ensuite.", "notoriete"],
  ["depenses", "Dépenses du logement", "reprenez les factures reçues ce mois-ci. Vérifiez le logement concerné et retrouvez le justificatif de chaque dépense.", "trafic"],
  ["quittances", "Quittances", "sélectionnez un loyer réglé pendant la période et retrouvez la quittance correspondante dans le dossier du bail.", "conversion"],
  ["agenda", "Rendez-vous du logement", "ouvrez l’agenda et repérez les interventions prévues. Pour chaque rendez-vous, vérifiez le logement et la personne attendue.", "notoriete"],
  ["compteurs", "Relevés des compteurs", "ouvrez la fiche du logement. Retrouvez le dernier index et sa date avant de saisir un nouveau relevé.", "trafic"],
  ["occupants", "Occupants du logement", "comparez les arrivées et départs du mois avec les dates inscrites dans le bail du logement.", "notoriete"],
  ["charges", "Charges locatives", "reprenez une facture de la période. Avant de partager les montants, vérifiez les dates et la méthode de répartition.", "conversion"],
  ["messages", "Messages des locataires", "relisez les échanges du mois qui attendent une réponse. Retrouvez le logement concerné avant de répondre.", "trafic"],
  ["baux", "Baux du mois", "repérez les locations qui commencent pendant la période et vérifiez les documents associés à leur bail.", "notoriete"],
  ["garants", "Dossiers des garants", "pour les nouveaux baux du mois, vérifiez à quel locataire chaque garant est rattaché.", "conversion"],
] as const;

export function rendezVousEditorial(phase:Phase, jour:string, deja:ReadonlySet<string>, objectif?:Objectif):Angle|undefined {
  const date = new Date(jour+"T12:00:00Z");
  const mois = date.toLocaleDateString("fr-FR",{month:"long",year:"numeric",timeZone:"Europe/Paris"});
  const sujets = [...RENDEZ_VOUS].sort((a,b)=>Number(b[3]===objectif)-Number(a[3]===objectif));
  for(const [cle,nom,consigne,but] of sujets){
    const titre = nom+" : votre point de "+mois;
    if(deja.has(titre)) continue;
    const action = phase === "lancement" ? "Pour faire ce premier point avec votre logement, essayez Gerimmo sans carte bancaire : www.gerimmo.app/inscription." : ANGLES[phase][0].action;
    return {cle:cle+"-"+jour.slice(0,7),titre,texte:"Pour votre suivi de "+mois+", "+consigne,action,objectif:but};
  }
}

export function objectifEditorial(titre: string) {
  return RENDEZ_VOUS.find(s=>titre.startsWith(s[1]+" : votre point de "))?.[3] ?? ANGLES.lancement.find(angle => angle.titre === titre)?.objectif ?? "notoriete";
}
