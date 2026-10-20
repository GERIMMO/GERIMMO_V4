/**
 * Liste d'attente des agences (20/10/2026), lot SITE : la validation commune du formulaire (src/lib/liste-attente-agences.ts).
 *
 * Ce que le visiteur tape arrive ici avant la base ; les bornes sont celles des contraintes de la table
 * `liste_attente_agences`, et chaque refus est une phrase en français, dans l'ordre des champs du formulaire. Les cas
 * limites viennent du contrat commun des lots : code postal avec espaces, fins de ligne Windows, blanc insécable dans une
 * adresse, message de 1000 caractères admis et de 1001 refusé, tranche inconnue.
 */
import { describe, expect, it } from "vitest";
import {
  BORNES_LISTE_ATTENTE,
  MESSAGE_SUCCES_LISTE_ATTENTE,
  STATUTS_LISTE_ATTENTE,
  TRANCHES_LOTS,
  estTranche,
  libelleTranche,
  validerInscriptionAgence,
} from "../src/lib/liste-attente-agences";

const VALIDE: Record<string, string> = {
  agence: "Agence du Parc",
  contact: "Marie Durand",
  email: "marie@agence-du-parc.test",
  telephone: "01 02 03 04 05",
  code_postal: "75011",
  nb_lots: "50_a_199",
  message: "Nous gérons 120 lots en centre-ville.",
};

/** Un formulaire valide, où `null` retire le champ (comme un champ absent de la page). */
function formulaire(valeurs: Record<string, string | null> = {}): FormData {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries({ ...VALIDE, ...valeurs })) if (valeur !== null) f.set(cle, valeur);
  return f;
}
const erreur = (valeurs: Record<string, string | null>) => {
  const r = validerInscriptionAgence(formulaire(valeurs));
  return "erreur" in r ? r.erreur : null;
};
const valeurs = (v: Record<string, string | null> = {}) => {
  const r = validerInscriptionAgence(formulaire(v));
  if ("erreur" in r) throw new Error(`refus inattendu : ${r.erreur}`);
  return r.valeurs;
};
// Caractères construits par code (jamais d'échappement \u dans ce dépôt) : espace insécable, tabulation, sonnerie.
const car = (code: number) => String.fromCharCode(code);
const INSECABLE = car(0xa0);
const TABULATION = car(9);
const SONNERIE = car(7);

describe("une saisie complète", () => {
  it("est admise, avec ses valeurs normalisées", () => {
    expect(valeurs()).toEqual({
      agence: "Agence du Parc",
      contact: "Marie Durand",
      email: "marie@agence-du-parc.test",
      telephone: "01 02 03 04 05",
      code_postal: "75011",
      nb_lots: "50_a_199",
      message: "Nous gérons 120 lots en centre-ville.",
    });
  });

  it("les blancs autour des champs sont retirés ; téléphone et message vides deviennent null", () => {
    const v = valeurs({ agence: "  Agence du Parc  ", contact: " Marie Durand ", email: " marie@agence-du-parc.test ", telephone: "   ", message: "" });
    expect(v.agence).toBe("Agence du Parc");
    expect(v.contact).toBe("Marie Durand");
    expect(v.email).toBe("marie@agence-du-parc.test");
    expect(v.telephone).toBeNull();
    expect(v.message).toBeNull();
  });

  it("les champs absents du formulaire (téléphone, message) sont admis ; les obligatoires absents sont refusés", () => {
    expect(valeurs({ telephone: null, message: null })).toMatchObject({ telephone: null, message: null });
    expect(erreur({ agence: null })).toBe("Indiquez le nom de votre agence.");
    expect(erreur({ nb_lots: null })).toBe("Indiquez le nombre de lots que vous gérez.");
  });
});

describe("chaque refus, dans l'ordre des champs du formulaire", () => {
  it("1. le nom de l'agence : obligatoire, 120 caractères au plus, sans caractère de contrôle", () => {
    expect(erreur({ agence: "" })).toBe("Indiquez le nom de votre agence.");
    expect(erreur({ agence: "   " })).toBe("Indiquez le nom de votre agence.");
    expect(valeurs({ agence: "A".repeat(120) }).agence).toHaveLength(120);
    expect(erreur({ agence: "A".repeat(121) })).toBe("Le nom de l'agence ne doit pas dépasser 120 caractères.");
    expect(erreur({ agence: `Agence${SONNERIE}du Parc` })).toBe("Le nom de l'agence ne doit pas dépasser 120 caractères.");
  });

  it("2. le nom du contact : obligatoire, 120 caractères au plus, sans caractère de contrôle", () => {
    expect(erreur({ contact: "" })).toBe("Indiquez votre nom.");
    expect(valeurs({ contact: "B".repeat(120) }).contact).toHaveLength(120);
    expect(erreur({ contact: "B".repeat(121) })).toBe("Votre nom ne doit pas dépasser 120 caractères.");
    expect(erreur({ contact: `Marie${TABULATION}Durand` })).toBe("Votre nom ne doit pas dépasser 120 caractères.");
  });

  it("3. l'adresse e-mail : une arobase, un domaine à deux lettres au moins, 254 caractères au plus, aucun blanc", () => {
    const REFUS = "Indiquez une adresse e-mail valide : c'est là que nous vous écrirons.";
    expect(erreur({ email: "" })).toBe(REFUS);
    expect(erreur({ email: "pas-une-adresse" })).toBe(REFUS);
    expect(erreur({ email: "marie@agence" })).toBe(REFUS);
    expect(erreur({ email: "marie@agence.f" })).toBe(REFUS);
    expect(erreur({ email: "marie@@agence.test" })).toBe(REFUS);
    expect(erreur({ email: "marie durand@agence.test" })).toBe(REFUS);
    // L'espace insécable n'est pas un blanc pour \s de la base : il est refusé explicitement, comme en base ; en bout de
    // chaîne, il est simplement retiré avec les autres blancs (trim), comme un espace tapé par mégarde.
    expect(erreur({ email: `marie${INSECABLE}@agence.test` })).toBe(REFUS);
    expect(erreur({ email: `marie@agence${INSECABLE}.test` })).toBe(REFUS);
    expect(valeurs({ email: `marie@agence.test${INSECABLE}` }).email).toBe("marie@agence.test");
    expect(erreur({ email: `${"a".repeat(243)}@agence.test` })).toBe(REFUS); // 255 caractères
    expect(valeurs({ email: `${"a".repeat(242)}@agence.test` }).email).toHaveLength(254);
    // La casse n'est pas un motif de refus : la base compare en minuscules.
    expect(valeurs({ email: "Marie.DURAND@Agence-du-Parc.TEST" }).email).toBe("Marie.DURAND@Agence-du-Parc.TEST");
  });

  it("4. le téléphone : facultatif, 40 caractères au plus, sans caractère de contrôle", () => {
    expect(valeurs({ telephone: "+33 1 02 03 04 05" }).telephone).toBe("+33 1 02 03 04 05");
    expect(valeurs({ telephone: "0".repeat(40) }).telephone).toHaveLength(40);
    expect(erreur({ telephone: "0".repeat(41) })).toBe("Le téléphone ne doit pas dépasser 40 caractères.");
    expect(erreur({ telephone: `01${TABULATION}02` })).toBe("Le téléphone ne doit pas dépasser 40 caractères.");
  });

  it("5. le code postal : cinq chiffres, les espaces retirés (« 75 011 » devient « 75011 »)", () => {
    const REFUS = "Indiquez le code postal de l'agence : cinq chiffres.";
    expect(valeurs({ code_postal: "75 011" }).code_postal).toBe("75011");
    expect(valeurs({ code_postal: " 750 11 " }).code_postal).toBe("75011");
    expect(valeurs({ code_postal: "01000" }).code_postal).toBe("01000");
    expect(erreur({ code_postal: "" })).toBe(REFUS);
    expect(erreur({ code_postal: "7501" })).toBe(REFUS);
    expect(erreur({ code_postal: "750111" })).toBe(REFUS);
    expect(erreur({ code_postal: "7501A" })).toBe(REFUS);
    expect(erreur({ code_postal: "75-011" })).toBe(REFUS);
  });

  it("6. la tranche de lots : l'un des quatre codes, rien d'autre", () => {
    const REFUS = "Indiquez le nombre de lots que vous gérez.";
    for (const t of TRANCHES_LOTS) expect(valeurs({ nb_lots: t.code }).nb_lots).toBe(t.code);
    expect(erreur({ nb_lots: "" })).toBe(REFUS);
    expect(erreur({ nb_lots: "inconnue" })).toBe(REFUS);
    expect(erreur({ nb_lots: "120" })).toBe(REFUS);
    expect(erreur({ nb_lots: "Moins de 50 lots" })).toBe(REFUS); // le libellé n'est pas le code
  });

  it("7. le message : facultatif, 1000 caractères admis, 1001 refusés, sauts de ligne admis et normalisés", () => {
    expect(valeurs({ message: "M".repeat(1000) }).message).toHaveLength(1000);
    expect(erreur({ message: "M".repeat(1001) })).toBe("Votre message ne doit pas dépasser 1000 caractères.");
    // Les fins de ligne Windows comptent pour un caractère après normalisation : 998 lettres + CRLF + 1 lettre = 1000.
    expect(valeurs({ message: `${"M".repeat(998)}\r\nM` }).message).toBe(`${"M".repeat(998)}\nM`);
    expect(valeurs({ message: "Première ligne\r\nSeconde ligne\rTroisième" }).message).toBe("Première ligne\nSeconde ligne\nTroisième");
    // Les autres caractères de contrôle restent refusés, même dans le message (une tabulation en bout de chaîne, elle,
    // part avec les blancs du trim).
    expect(erreur({ message: `Bon${TABULATION}jour` })).toBe("Votre message ne doit pas dépasser 1000 caractères.");
    expect(erreur({ message: `Bon${SONNERIE}jour` })).toBe("Votre message ne doit pas dépasser 1000 caractères.");
    expect(valeurs({ message: `Bonjour${TABULATION}` }).message).toBe("Bonjour");
  });

  it("le PREMIER défaut est signalé, dans l'ordre : agence, contact, e-mail, téléphone, code postal, tranche, message", () => {
    const tout = { agence: "", contact: "", email: "x", telephone: "0".repeat(41), code_postal: "1", nb_lots: "?", message: "M".repeat(1001) };
    expect(erreur(tout)).toBe("Indiquez le nom de votre agence.");
    expect(erreur({ ...tout, agence: "Agence" })).toBe("Indiquez votre nom.");
    expect(erreur({ ...tout, agence: "Agence", contact: "Marie" })).toMatch(/adresse e-mail valide/);
    expect(erreur({ ...tout, agence: "Agence", contact: "Marie", email: VALIDE.email })).toMatch(/téléphone/);
    expect(erreur({ ...tout, agence: "Agence", contact: "Marie", email: VALIDE.email, telephone: "" })).toMatch(/code postal/);
    expect(erreur({ ...tout, agence: "Agence", contact: "Marie", email: VALIDE.email, telephone: "", code_postal: "75011" })).toMatch(/nombre de lots/);
    expect(erreur({ ...tout, agence: "Agence", contact: "Marie", email: VALIDE.email, telephone: "", code_postal: "75011", nb_lots: "moins_de_50" })).toMatch(/message/);
  });
});

describe("les constantes partagées avec la base et la console", () => {
  it("les tranches de lots sont les quatre codes de la contrainte `nb_lots`, chacun avec un libellé", () => {
    expect(TRANCHES_LOTS.map((t) => t.code)).toEqual(["moins_de_50", "50_a_199", "200_a_499", "500_et_plus"]);
    expect(estTranche("500_et_plus")).toBe(true);
    expect(estTranche("1000")).toBe(false);
    expect(libelleTranche("moins_de_50")).toBe("Moins de 50 lots");
    expect(libelleTranche("inconnue")).toBe("—");
    expect(libelleTranche(null)).toBe("—");
  });

  it("les statuts sont ceux de la contrainte `statut`, et les bornes celles des contraintes de longueur", () => {
    expect(Object.keys(STATUTS_LISTE_ATTENTE)).toEqual(["en_attente", "contactee", "convertie", "retiree"]);
    expect(BORNES_LISTE_ATTENTE).toEqual({ email: 254, agence: 120, contact: 120, telephone: 40, message: 1000, source: 80 });
  });

  it("le message de succès ne promet ni prix ni date, et dit qu'aucune autre sollicitation ne suivra", () => {
    expect(MESSAGE_SUCCES_LISTE_ATTENTE).toContain("liste d'attente");
    expect(MESSAGE_SUCCES_LISTE_ATTENTE).toContain("sans autre sollicitation");
    expect(MESSAGE_SUCCES_LISTE_ATTENTE).not.toMatch(/€|\b20[2-9][0-9]\b/);
  });
});
