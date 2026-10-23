/**
 * Le premier mot de passe, choisi juste après la confirmation de l'adresse (relevé du 23/10/2026, PRO-4 et PRO-5).
 *
 * PRO-4 — un refus (mot de passe trop court, saisies différentes, refus d'Auth, profil incomplet) vidait le formulaire :
 * les informations corrigées revenaient à leur valeur d'origine et la case des conditions générales se décochait. L'action
 * rend désormais la saisie du profil et de la case (jamais un mot de passe) et nomme le champ fautif ; le formulaire les
 * repose (convention de lib/formulaires.ts) et place l'alerte sous ce champ. Les deux listes déroulantes, que React ne
 * repose pas d'elles-mêmes après une action, sont éprouvées dans un vrai navigateur (premier-mot-de-passe-navigateur.test.ts).
 *
 * PRO-5 — après ce premier choix, la personne était déconnectée et renvoyée vers la connexion (« Mot de passe modifié.
 * Connectez-vous avec votre nouveau mot de passe. ») alors qu'elle venait de prouver son adresse. Elle reste connectée et
 * va vers son espace ou l'étape suivante. La récupération d'un compte existant (mot de passe oublié) garde la déconnexion.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatNouveauMotDePasse } from "../src/app/actions/auth";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  supprimerCookie: vi.fn(),
  etat: {} as Record<string, unknown>,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/lien-mot-de-passe", () => ({ envoyerLienMotDePasse: vi.fn(), inscrireEtEnvoyerConfirmation: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ delete: mocks.supprimerCookie }) }));
vi.mock("next/navigation", () => ({ redirect: (chemin: string) => { throw new Error(`REDIRECT ${chemin}`); } }));
// En rendu serveur, useActionState rend toujours l'état initial : l'état d'après un refus est simulé.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: () => [mocks.etat, () => {}, false] };
});

import { definirNouveauMotDePasse } from "../src/app/actions/auth";
import { FormulaireNouveauMotDePasse } from "../src/app/nouveau-mot-de-passe/formulaire-nouveau-mot-de-passe";
import { ACTIVITY_COOKIE } from "../src/lib/session-policy";

const MOT_DE_PASSE = "recette-premier-choix-1";
const PROFIL_SAISI = {
  espace: "proprietaire_direct",
  prenom: "Camille",
  nom: "Corrigé",
  telephone: "01 00 00 00 00",
  adresse: "3 rue du Test",
  code_postal: "69003",
  ville: "Lyon",
  qualite: "SCI",
  code_parrainage: "",
};

/** Le formulaire tel que le navigateur l'envoie après une confirmation d'inscription. */
function formulaire(valeurs: Record<string, string | null> = {}) {
  const f = new FormData();
  const tout: Record<string, string | null> = { mot_de_passe: MOT_DE_PASSE, confirmation: MOT_DE_PASSE, suite: "/espaces", ...PROFIL_SAISI, cgu: "on", ...valeurs };
  for (const [cle, valeur] of Object.entries(tout)) if (valeur !== null) f.set(cle, valeur);
  return f;
}
/** Le formulaire d'une récupération ordinaire : deux mots de passe, rien d'autre. */
function formulaireRecuperation(valeurs: Record<string, string> = {}) {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries({ mot_de_passe: MOT_DE_PASSE, confirmation: MOT_DE_PASSE, suite: "/espaces", ...valeurs })) f.set(cle, valeur);
  return f;
}

let auth: { getUser: ReturnType<typeof vi.fn>; getClaims: ReturnType<typeof vi.fn>; updateUser: ReturnType<typeof vi.fn>; signOut: ReturnType<typeof vi.fn> };
let rpc: ReturnType<typeof vi.fn>;

/** Un compte qui vient de confirmer son adresse : le profil saisi à l'inscription attend sa validation. */
function compteAConfirmer() {
  auth.getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: { profil_a_confirmer: { nom: "Initial", espace: "proprietaire_direct" } } } } });
}
/** Un compte dont l'inscription est finie : la récupération d'un mot de passe oublié. */
function compteExistant() {
  auth.getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: { nom: "Valide", espace: "proprietaire_direct" } } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.etat = {};
  auth = {
    getUser: vi.fn(),
    getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: "u1", amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  rpc = vi.fn().mockResolvedValue({ error: null });
  const requete = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
  mocks.client.mockResolvedValue({ auth, rpc, from: vi.fn().mockReturnValue(requete) });
  compteAConfirmer();
});

describe("PRO-4 — un refus garde la saisie du profil et la case des conditions, jamais un mot de passe", () => {
  const SAISIE_RENDUE = { espace: "proprietaire_direct", prenom: "Camille", nom: "Corrigé", telephone: "01 00 00 00 00", adresse: "3 rue du Test", code_postal: "69003", ville: "Lyon", qualite: "SCI", code_parrainage: "", cgu: "on" };

  it.each([
    ["mot de passe trop court", { mot_de_passe: "court", confirmation: "court" }, undefined, "mot_de_passe"],
    ["confirmation différente", { confirmation: "une-autre-saisie-2" }, undefined, "confirmation"],
    ["refus d'Auth : mot de passe exposé", {}, { code: "weak_password", message: "Password is known to be weak" }, "mot_de_passe"],
    ["refus d'Auth : même mot de passe", {}, { code: "same_password", message: "same" }, "mot_de_passe"],
    ["refus d'Auth : autre erreur", {}, { code: "unexpected_failure", message: "Database error" }, undefined],
    ["nom manquant", { nom: "" }, undefined, "nom"],
    ["usage inconnu", { espace: "inconnu" }, undefined, "espace"],
    ["code de parrainage mal formé", { code_parrainage: "??" }, undefined, "code_parrainage"],
  ] as const)("%s : le champ est nommé, la saisie revient", async (_cas, valeurs, erreurAuth, champ) => {
    if (erreurAuth) auth.updateUser.mockResolvedValueOnce({ error: erreurAuth });
    const etat = await definirNouveauMotDePasse({}, formulaire(valeurs));
    expect(etat.erreur).toBeTruthy();
    expect(etat.champ).toBe(champ);
    expect(etat.valeurs).toEqual({ ...SAISIE_RENDUE, ...valeurs, mot_de_passe: undefined, confirmation: undefined });
    expect(etat.valeurs).not.toHaveProperty("mot_de_passe");
    expect(etat.valeurs).not.toHaveProperty("confirmation");
    expect(JSON.stringify(etat)).not.toContain(MOT_DE_PASSE);
  });

  it("la case non cochée : l'erreur est à la case, et la case n'est pas rendue cochée", async () => {
    const etat = await definirNouveauMotDePasse({}, formulaire({ cgu: null }));
    expect(etat.champ).toBe("cgu");
    expect(etat.valeurs?.cgu).toBeUndefined();
    expect(etat.valeurs?.nom).toBe("Corrigé");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("l'acceptation non enregistrée : l'erreur est à la case, qui reste cochée", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "indisponible" } });
    const etat = await definirNouveauMotDePasse({}, formulaire());
    expect(etat.champ).toBe("cgu");
    expect(etat.valeurs?.cgu).toBe("on");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("une saisie trop longue est nommée et rendue bornée", async () => {
    const etat = await definirNouveauMotDePasse({}, formulaire({ ville: "v".repeat(24_000) }));
    expect(etat.erreur).toContain("ville");
    expect(etat.champ).toBe("ville");
    expect(etat.valeurs?.ville).toHaveLength(300);
  });

  it("une récupération ordinaire n'a aucun profil à rendre, et ne rend jamais les mots de passe", async () => {
    compteExistant();
    const etat = await definirNouveauMotDePasse({}, formulaireRecuperation({ confirmation: "une-autre-saisie-2" }));
    expect(etat).toEqual({ erreur: "Les deux saisies ne correspondent pas.", champ: "confirmation" });
  });
});

describe("PRO-4 — le formulaire repose la saisie et dit l'erreur au bon champ", () => {
  const PROFIL_INITIAL = { nom: "Initial", prenom: "Avant", espace: "proprietaire_direct", qualite: "Personne physique" };
  const rendre = (etat: EtatNouveauMotDePasse, profil: Record<string, string> | undefined = PROFIL_INITIAL) => {
    mocks.etat = etat;
    return renderToStaticMarkup(createElement(FormulaireNouveauMotDePasse, { suite: "/espaces", profilAConfirmer: profil }));
  };
  const champ = (html: string, nom: string) => html.match(new RegExp(`<input\\b[^>]*\\bname="${nom}"[^>]*>`))?.[0] ?? "";
  const position = (html: string, motif: string) => {
    const i = html.indexOf(motif);
    expect(i, motif).toBeGreaterThanOrEqual(0);
    return i;
  };
  const refus: EtatNouveauMotDePasse = {
    erreur: "Les deux saisies ne correspondent pas.",
    champ: "confirmation",
    valeurs: { espace: "artisan", prenom: "Camille", nom: "Corrigé", ville: "Lyon", qualite: "SCI", code_parrainage: "ABCD1234", cgu: "on" },
  };

  it("avant tout envoi : le profil d'origine, la case jamais cochée d'avance", () => {
    const html = rendre({});
    expect(champ(html, "nom")).toContain('value="Initial"');
    expect(champ(html, "cgu")).not.toContain("checked");
    expect(html).not.toContain('role="alert"');
  });

  // Ce rendu est celui du SERVEUR, avec l'état du refus dès le premier affichage : la page qui revient d'un envoi sans
  // script. Il ne rejoue ni la mise à jour ni la remise à zéro du formulaire par React après une action : c'est là que les
  // deux listes reprenaient leur valeur d'origine (relecture du 23/10, PRO-4 incomplet). Ce cas-là, et le second envoi,
  // sont éprouvés dans un vrai navigateur : premier-mot-de-passe-navigateur.test.ts.
  it("rendu du serveur après un refus (envoi sans script) : la saisie corrigée, les deux listes et la case cochée reviennent", () => {
    const html = rendre(refus);
    expect(champ(html, "nom")).toContain('value="Corrigé"');
    expect(champ(html, "prenom")).toContain('value="Camille"');
    expect(champ(html, "ville")).toContain('value="Lyon"');
    expect(champ(html, "code_parrainage")).toContain('value="ABCD1234"');
    expect(html).toMatch(/<option value="artisan" selected="">/);
    expect(html).toMatch(/<option value="SCI" selected="">/);
    expect(champ(html, "cgu")).toMatch(/checked=""/);
  });

  it("aucun mot de passe n'est jamais reposé, même s'il figurait dans l'état", () => {
    const html = rendre({ ...refus, valeurs: { ...refus.valeurs, mot_de_passe: "fuite-123456789", confirmation: "fuite-123456789" } });
    expect(html).not.toContain("fuite-123456789");
    expect(champ(html, "mot_de_passe")).not.toMatch(/\bvalue=/);
    expect(champ(html, "confirmation")).not.toMatch(/\bvalue=/);
  });

  it("l'erreur de confirmation s'affiche sous la confirmation, qui est marquée invalide et décrite par l'alerte", () => {
    const html = rendre(refus);
    const alerte = position(html, 'role="alert"');
    expect(alerte).toBeGreaterThan(position(html, 'name="confirmation"'));
    expect(alerte).toBeLessThan(position(html, 'type="submit"'));
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    const confirmation = champ(html, "confirmation");
    expect(confirmation).toContain('aria-invalid="true"');
    const id = /aria-describedby="([^"]+)"/.exec(confirmation)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(champ(html, "mot_de_passe")).not.toContain('aria-invalid="true"');
  });

  it("l'erreur de mot de passe s'affiche sous le mot de passe, avant la confirmation", () => {
    const html = rendre({ ...refus, erreur: "Mot de passe refusé.", champ: "mot_de_passe" });
    const alerte = position(html, 'role="alert"');
    expect(alerte).toBeGreaterThan(position(html, 'name="mot_de_passe"'));
    expect(alerte).toBeLessThan(position(html, 'name="confirmation"'));
    expect(champ(html, "mot_de_passe")).toContain('aria-invalid="true"');
  });

  it("l'erreur des conditions s'affiche à la case ; celle du nom, sous le nom", () => {
    const cgu = rendre({ ...refus, erreur: "Acceptez les conditions d’utilisation pour continuer.", champ: "cgu" });
    expect(position(cgu, 'role="alert"')).toBeGreaterThan(position(cgu, 'name="cgu"'));
    expect(position(cgu, 'role="alert"')).toBeLessThan(position(cgu, 'name="mot_de_passe"'));
    expect(champ(cgu, "cgu")).toContain('aria-invalid="true"');
    const nom = rendre({ ...refus, erreur: "Le nom est obligatoire.", champ: "nom" });
    expect(position(nom, 'role="alert"')).toBeGreaterThan(position(nom, 'name="nom"'));
    expect(position(nom, 'role="alert"')).toBeLessThan(position(nom, 'name="telephone"'));
    expect(champ(nom, "nom")).toContain('aria-invalid="true"');
  });

  it("une erreur sans champ (session, service) reste au-dessus du bouton, sans marquer de champ", () => {
    const html = rendre({ erreur: "Session expirée ou lien invalide. Redemandez un e-mail de réinitialisation." });
    expect(position(html, 'role="alert"')).toBeGreaterThan(position(html, 'name="confirmation"'));
    expect(position(html, 'role="alert"')).toBeLessThan(position(html, 'type="submit"'));
    expect(html).not.toContain('aria-invalid="true"');
  });

  it("un champ du profil nommé alors que le profil n'est pas affiché : l'alerte reste visible au-dessus du bouton", () => {
    const html = rendre({ erreur: "Le nom est obligatoire.", champ: "nom" }, undefined);
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(position(html, 'role="alert"')).toBeLessThan(position(html, 'type="submit"'));
  });
});

describe("PRO-5 — après le premier choix, la personne reste connectée et va vers son espace", () => {
  const sortiesGlobales = () => auth.signOut.mock.calls.filter(([options]) => !options || (options as { scope?: string }).scope !== "others");

  it("propriétaire : le mot de passe et le profil sont enregistrés, puis /espaces, sans déconnexion", async () => {
    await expect(definirNouveauMotDePasse({}, formulaire())).rejects.toThrow(/^REDIRECT \/espaces$/);
    expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: MOT_DE_PASSE, data: expect.objectContaining({ nom: "Corrigé", espace: "proprietaire_direct", profil_a_confirmer: null }) });
    // Les AUTRES sessions tombent toujours ; celle-ci reste ouverte, avec son témoin d'activité.
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(sortiesGlobales()).toEqual([]);
    expect(mocks.supprimerCookie).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("log_tech", expect.objectContaining({ evenement: "changement_mot_de_passe" }));
  });

  it("artisan sans invitation : l'inscription de l'entreprise, étape suivante", async () => {
    await expect(definirNouveauMotDePasse({}, formulaire({ espace: "artisan" }))).rejects.toThrow(/^REDIRECT \/artisan\/inscription$/);
    expect(sortiesGlobales()).toEqual([]);
  });

  it.each([
    ["artisan venu d'une invitation", "artisan", "/artisan/invitation/11111111-1111-4111-8111-111111111111"],
    ["personne invitée dans un espace", "invite", "/invitations/22222222-2222-4222-8222-222222222222"],
  ])("%s : retour direct à la page demandée", async (_cas, espace, suite) => {
    await expect(definirNouveauMotDePasse({}, formulaire({ espace, suite }))).rejects.toThrow(`REDIRECT ${suite}`);
    expect(sortiesGlobales()).toEqual([]);
    expect(mocks.supprimerCookie).not.toHaveBeenCalled();
  });

  it("une destination externe n'est jamais suivie", async () => {
    await expect(definirNouveauMotDePasse({}, formulaire({ espace: "invite", suite: "https://exemple.invalid/piege" }))).rejects.toThrow(/^REDIRECT \/espaces$/);
  });

  it("mot de passe oublié d'un compte existant : la déconnexion et le message de connexion restent", async () => {
    compteExistant();
    await expect(definirNouveauMotDePasse({}, formulaireRecuperation())).rejects.toThrow(/^REDIRECT \/connexion\?raison=mot-de-passe-modifie$/);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(sortiesGlobales()).toHaveLength(1);
    expect(mocks.supprimerCookie).toHaveBeenCalledWith(ACTIVITY_COOKIE);
  });

  it("la décision vient du compte, pas du formulaire : un motif glissé dans l'envoi ne garde pas la session", async () => {
    compteExistant();
    await expect(definirNouveauMotDePasse({}, formulaireRecuperation({ motif: "inscription", apresConfirmation: "true" }))).rejects.toThrow("REDIRECT /connexion?raison=mot-de-passe-modifie");
    expect(sortiesGlobales()).toHaveLength(1);
  });
});
