// LES GARDE-FOUS DE LA RECETTE DE PRODUCTION : où elle a le droit d'aller,
// avec quels comptes, et ce qu'elle n'a jamais le droit de faire.
//
// Ce fichier ne dépend de rien (ni Playwright, ni le banc) : la configuration
// l'importe pour refuser une cible avant même de lancer un navigateur.

/**
 * Les seules cibles admises : le site de production, ou un poste local (le
 * banc, pour valider la recette elle-même). Une préproduction, une URL de
 * déploiement Vercel, un autre domaine : refusés — la recette crée des
 * données, elle ne doit les créer que là où `purger.sql` sait les retrouver.
 */
export function verifierCible(brute: string | undefined): string {
  if (!brute || !brute.trim()) {
    throw new Error("RECETTE_URL est obligatoire (https://www.gerimmo.app, ou http://localhost:3000 pour le banc).");
  }
  let url: URL;
  try {
    url = new URL(brute.trim());
  } catch {
    throw new Error(`RECETTE_URL illisible : ${brute}`);
  }
  const production = url.protocol === "https:" && url.hostname === "www.gerimmo.app" && url.port === "";
  const locale = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  const sansChemin = (url.pathname === "/" || url.pathname === "") && !url.search && !url.hash && !url.username;
  if (!(production || locale) || !sansChemin) {
    throw new Error(
      `RECETTE_URL refusée (${brute}) : seules https://www.gerimmo.app, http://localhost[:port] et http://127.0.0.1[:port] sont admises.`,
    );
  }
  return url.origin;
}

/** Libellés de boutons sur lesquels la recette ne clique JAMAIS. */
export const LIBELLES_INTERDITS =
  /payer|s[’']abonner|supprimer|archiver|retirer|envoyer pour signature/i;

/** Seul domaine d'adresse e-mail que la recette peut saisir. */
export function verifierEmail(valeur: string): string {
  const v = valeur.trim().toLowerCase();
  if (!/^[^@\s]+@resend\.dev$/.test(v)) {
    throw new Error(`Adresse refusée par la recette (hors du domaine resend.dev) : ${valeur}`);
  }
  return v;
}

function variable(nom: string): string {
  const v = process.env[nom]?.trim();
  if (!v) throw new Error(`Variable d'environnement manquante : ${nom}`);
  return v;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(nom: string): string {
  const v = variable(nom);
  if (!UUID.test(v)) throw new Error(`${nom} doit être un UUID : ${v}`);
  return v.toLowerCase();
}

export type Persona = "admin" | "proprietaire" | "locataire";

export type Comptes = {
  motDePasse: string;
  emails: Record<Persona, string>;
  orgAgence: string;
  orgProprietaire: string;
  suffixe: string;
};

/** Lus à la demande (pas au chargement) : les pages publiques s'en passent. */
export function lireComptes(): Comptes {
  const suffixe = variable("RECETTE_SUFFIXE");
  if (!/^[a-z0-9][a-z0-9-]{5,39}$/.test(suffixe)) {
    throw new Error(`RECETTE_SUFFIXE refusé (${suffixe}) : minuscules, chiffres, tirets, 6 à 40 caractères.`);
  }
  return {
    motDePasse: variable("RECETTE_MOT_DE_PASSE"),
    emails: {
      admin: verifierEmail(variable("RECETTE_EMAIL_ADMIN")),
      proprietaire: verifierEmail(variable("RECETTE_EMAIL_PROPRIETAIRE")),
      locataire: verifierEmail(variable("RECETTE_EMAIL_LOCATAIRE")),
    },
    orgAgence: uuid("RECETTE_ORG_AGENCE"),
    orgProprietaire: uuid("RECETTE_ORG_PROPRIETAIRE"),
    suffixe,
  };
}
