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
export function objectifEditorial(titre: string) {
  return ANGLES.lancement.find(angle => angle.titre === titre)?.objectif ?? "notoriete";
}
