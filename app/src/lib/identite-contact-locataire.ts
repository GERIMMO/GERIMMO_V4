import { interlocuteurLocataire, type InterlocuteurLocataire } from "./interlocuteur-locataire";

/** Présentation issue de la lecture déjà autorisée au locataire ; jamais du nom interne du parc. */
export type IdentiteContactLocataire = { nom: string | null; titre: string; agence: boolean };

export function identiteContactLocataire(brut: unknown): IdentiteContactLocataire {
  const inconnu = { nom: null, titre: "Mon bailleur", agence: false };
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return inconnu;
  const d = brut as { type?: string; nom?: unknown; bailleurs?: unknown };
  if (d.type === "proprietaire_direct") {
    const noms = Array.isArray(d.bailleurs) ? d.bailleurs.flatMap(b => {
      if (!b || typeof b !== "object") return [];
      const nom = [b.prenom, b.nom].filter((v): v is string => typeof v === "string" && Boolean(v.trim())).map(v => v.trim()).join(" ");
      return nom ? [nom] : [];
    }) : [];
    return { nom: [...new Set(noms)].join(", ") || null, titre: "Mon bailleur", agence: false };
  }
  if (d.type === "agence") return { nom: typeof d.nom === "string" ? d.nom.trim() || null : null, titre: "Mon gestionnaire", agence: true };
  return inconnu;
}

/**
 * Lot 47 : l'interlocuteur que les écrans du locataire nomment (« votre gestionnaire » en agence, « votre bailleur »
 * ailleurs), tiré de la même identité que le titre « Mon gestionnaire » / « Mon bailleur » : les deux ne se contredisent
 * jamais sur une page.
 */
export function interlocuteurDeLIdentite(identite: Pick<IdentiteContactLocataire, "agence">): InterlocuteurLocataire {
  return interlocuteurLocataire(identite.agence ? "agence" : null);
}
