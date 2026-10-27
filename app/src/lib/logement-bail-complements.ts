import { TYPES_BIEN } from "./parc";

/** Les champs requis par les formulaires existants, sans redemander les valeurs enregistrées. */
type Valeurs = Record<string, unknown>;
const absent = (valeur: unknown) => valeur == null || String(valeur).trim() === "";

export function complementsLogementBail(lot: Valeurs, bien: Valeurs) {
  const logement = ["nom", "identifiant_fiscal", "surface_m2", "pieces", "chauffage", "eau_chaude", "locaux_privatifs", "description"]
    .filter(champ => absent(lot[champ]) || (["surface_m2", "pieces"].includes(champ) && !(Number(lot[champ]) > 0)));
  const batiment = ["nom", "address_line1", "postal_code", "city", "annee_construction", "parties_communes", "acces_tic"]
    .filter(champ => absent(bien[champ]) || (champ === "annee_construction" && (!Number.isInteger(Number(bien[champ])) || Number(bien[champ]) < 1000 || Number(bien[champ]) > 2100)));
  return { logement, batiment };
}

export type InformationLogementBail = {
  champ: string;
  libelle: string;
  valeur: string | null;
  etat: "renseigne" | "manquant" | "a_corriger" | "a_confirmer" | "facultatif";
  large?: boolean;
};

const texte = (valeur: unknown) => absent(valeur) ? null : String(valeur).trim();
const nombre = (valeur: unknown, unite = "") => absent(valeur) ? null
  : `${Number.isFinite(Number(valeur)) ? Number(valeur).toLocaleString("fr-FR") : String(valeur)}${unite}`;
const ouiNon = (valeur: unknown, oui = "Oui", non = "Non") => valeur === true ? oui : valeur === false ? non : null;

/** Lecture exhaustive des données utiles au bail : une absence facultative ne
 * devient pas un manque, et une valeur invalide reste visible pour correction. */
export function informationsLogementBail(lot: Valeurs, bien: Valeurs): { logement: InformationLogementBail[]; batiment: InformationLogementBail[] } {
  const manquants = complementsLogementBail(lot, bien);
  const ligne = (source: "logement" | "batiment", champ: string, libelle: string, valeur: string | null, options: { facultatif?: boolean; confirmer?: boolean; large?: boolean } = {}): InformationLogementBail => ({
    champ, libelle, valeur,
    etat: manquants[source].includes(champ) ? valeur === null ? "manquant" : "a_corriger"
      : valeur !== null ? "renseigne" : options.confirmer ? "a_confirmer" : options.facultatif ? "facultatif" : "manquant",
    ...(options.large ? { large: true } : {}),
  });
  return {
    logement: [
      ligne("logement", "nom", "Nom du lot", texte(lot.nom)),
      ligne("logement", "meuble", "Mobilier", ouiNon(lot.meuble, "Meublé", "Non meublé"), { confirmer: true }),
      ligne("logement", "surface_m2", "Surface habitable", nombre(lot.surface_m2, " m²")),
      ligne("logement", "pieces", "Nombre de pièces", nombre(lot.pieces)),
      ligne("logement", "etage", "Étage", texte(lot.etage), { facultatif: true }),
      ligne("logement", "surface_carrez", "Surface Carrez", nombre(lot.surface_carrez, " m²"), { facultatif: true }),
      ligne("logement", "identifiant_fiscal", "Identifiant fiscal", texte(lot.identifiant_fiscal)),
      ...(bien.copropriete !== false || !absent(lot.tantieme) ? [ligne("logement", "tantieme", "Tantièmes de copropriété", nombre(lot.tantieme), { facultatif: true })] : []),
      ligne("logement", "chauffage", "Chauffage", texte(lot.chauffage)),
      ligne("logement", "eau_chaude", "Eau chaude", texte(lot.eau_chaude)),
      ligne("logement", "locaux_privatifs", "Locaux privatifs", texte(lot.locaux_privatifs), { large: true }),
      ligne("logement", "description", "Autres parties du logement", texte(lot.description), { large: true }),
    ],
    batiment: [
      ligne("batiment", "nom", "Nom du bâtiment", texte(bien.nom)),
      ligne("batiment", "type", "Type de bien", typeof bien.type === "string" ? TYPES_BIEN[bien.type] ?? texte(bien.type) : null),
      ligne("batiment", "address_line1", "Adresse", texte(bien.address_line1), { large: true }),
      ...(absent(bien.address_line2) ? [] : [ligne("batiment", "address_line2", "Complément d’adresse", texte(bien.address_line2), { large: true })]),
      ligne("batiment", "postal_code", "Code postal", texte(bien.postal_code)),
      ligne("batiment", "city", "Ville", texte(bien.city)),
      ligne("batiment", "annee_construction", "Année de construction", texte(bien.annee_construction)),
      ligne("batiment", "copropriete", "Copropriété", ouiNon(bien.copropriete), { confirmer: true }),
      ligne("batiment", "zone_tendue", "Zone tendue", ouiNon(bien.zone_tendue), { confirmer: true }),
      ...(absent(bien.commune_insee) ? [] : [ligne("batiment", "commune_insee", "Code commune (INSEE)", texte(bien.commune_insee))]),
      ligne("batiment", "parties_communes", "Parties communes", texte(bien.parties_communes), { large: true }),
      ligne("batiment", "acces_tic", "Internet, téléphone et TV", texte(bien.acces_tic), { large: true }),
    ],
  };
}
