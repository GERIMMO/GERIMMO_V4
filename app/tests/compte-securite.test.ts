import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  etatSecondFacteur,
  libelleFacteur,
  nomPourNouveauFacteur,
  verdictMotDePasse,
} from "@/lib/compte";
import { changerMonMotDePasse } from "@/app/actions/compte";
import { ecranSansDonnees } from "@/lib/retours";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
  connexion: vi.fn(),
  sortieJetable: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser, updateUser: mocks.updateUser, signOut: mocks.signOut },
    rpc: mocks.rpc,
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { signInWithPassword: mocks.connexion, signOut: mocks.sortieJetable },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemple.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "cle";
  mocks.getUser.mockResolvedValue({ data: { user: { id: "compte", email: "moi@exemple.test" } } });
  mocks.connexion.mockResolvedValue({ data: {}, error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});

function saisie(actuel: string, nouveau: string, confirmation = nouveau) {
  const f = new FormData();
  f.set("mot_de_passe_actuel", actuel);
  f.set("mot_de_passe", nouveau);
  f.set("confirmation", confirmation);
  return f;
}

const ANCIEN = "ancien-mot-de-passe";
const NOUVEAU = "nouveau-mot-de-passe";

describe("Sécurité du compte : changer son mot de passe sans passer par un email", () => {
  it("refuse une saisie incomplète ou incohérente avant tout appel réseau", () => {
    expect(verdictMotDePasse("", NOUVEAU, NOUVEAU)).toMatch(/actuel/i);
    expect(verdictMotDePasse(ANCIEN, "court", "court")).toMatch(/12/);
    expect(verdictMotDePasse(ANCIEN, ANCIEN, ANCIEN)).toMatch(/différent/i);
    expect(verdictMotDePasse(ANCIEN, NOUVEAU, "autre-chose-encore")).toMatch(/correspondent/i);
    expect(verdictMotDePasse(ANCIEN, NOUVEAU, NOUVEAU)).toBeNull();
  });

  it("n’écrit rien tant que le mot de passe actuel n’est pas vérifié", async () => {
    mocks.connexion.mockResolvedValue({ data: null, error: { message: "Invalid login credentials" } });
    const etat = await changerMonMotDePasse({}, saisie(ANCIEN, NOUVEAU));
    expect(etat.erreur).toMatch(/actuel/i);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("vérifie sur un client jetable, jamais sur la session en cours, et referme derrière lui", async () => {
    await changerMonMotDePasse({}, saisie(ANCIEN, NOUVEAU));
    expect(mocks.connexion).toHaveBeenCalledWith({ email: "moi@exemple.test", password: ANCIEN });
    expect(mocks.sortieJetable).toHaveBeenCalled();
  });

  it("change le mot de passe, éjecte les AUTRES appareils, garde celui-ci, et journalise", async () => {
    const etat = await changerMonMotDePasse({}, saisie(ANCIEN, NOUVEAU));
    expect(etat.message).toBeTruthy();
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: NOUVEAU });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "log_tech",
      expect.objectContaining({ evenement: "changement_mot_de_passe" })
    );
  });

  it("dit pourquoi un mot de passe est refusé, sans jargon ni code d’erreur", async () => {
    mocks.updateUser.mockResolvedValue({ error: { code: "weak_password", message: "Password is known to be weak" } });
    const etat = await changerMonMotDePasse({}, saisie(ANCIEN, NOUVEAU));
    expect(etat.erreur).toMatch(/fuites de données connues/i);
    expect(etat.erreur).not.toMatch(/weak_password/);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("ne prétend pas avoir changé quoi que ce soit si la session a expiré", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await changerMonMotDePasse({}, saisie(ANCIEN, NOUVEAU))).toHaveProperty("erreur");
    expect(mocks.connexion).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});

describe("Sécurité du compte : l’état du second facteur", () => {
  const verifie = { id: "f1", status: "verified", friendly_name: "Application Gerimmo 2026-09-19T08:30:00" };
  const enAttente = { id: "f2", status: "unverified", friendly_name: "Application Gerimmo 2026-09-19T09:00:00" };

  it("ne compte pas une configuration interrompue comme une protection", () => {
    expect(etatSecondFacteur([], "aal1")).toBe("aucun");
    expect(etatSecondFacteur([enAttente], "aal1")).toBe("aucun");
  });

  it("exige un code AVANT de proposer le retrait, puisque Supabase le refuserait", () => {
    // C'est le mur du 19/09 : facteur vérifié + session aal1 = 403 au retrait.
    expect(etatSecondFacteur([verifie], "aal1")).toBe("a-confirmer");
    expect(etatSecondFacteur([verifie], null)).toBe("a-confirmer");
    expect(etatSecondFacteur([verifie, enAttente], "aal2")).toBe("actif");
  });

  it("nomme les applications en français, et sait relire ce qu’elle a écrit", () => {
    const formater = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
    expect(libelleFacteur(verifie, formater)).toBe("Application ajoutée le 19/09/2026");
    expect(libelleFacteur({ id: "f3" }, formater)).toBe("Application d'authentification");
    expect(libelleFacteur({ id: "f4", friendly_name: "Application Gerimmo pas-une-date" }, formater)).toBe(
      "Application Gerimmo pas-une-date"
    );
    const nom = nomPourNouveauFacteur(new Date("2026-09-19T08:30:00Z"));
    expect(nom).toBe("Application Gerimmo 2026-09-19T08:30:00");
    expect(libelleFacteur({ id: "f5", friendly_name: nom }, formater)).toBe("Application ajoutée le 19/09/2026");
  });
});

describe("Sécurité du compte : ce que voit le journal des retours", () => {
  it("garde /compte lisible sans le confondre avec un dossier", () => {
    expect(ecranSansDonnees("/compte")).toBe("/compte");
  });
});
