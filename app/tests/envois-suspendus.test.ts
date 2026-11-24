/**
 * LES QUATRE INTERRUPTEURS D'ENVOI AUTOMATIQUE, CÔTÉ CONSOLE (audit palier 1 du 22/11/2026, P1-08).
 *
 * Le panneau des paramètres généraux et le geste du superviseur :
 *  - à la livraison, cinq envois « Fermé » (quatre jusqu'au 24/11/2026 ; le cinquième vient de la décision Q37), chacun avec une confirmation obligatoire avant d'ouvrir ;
 *  - un envoi ouvert se referme sans confirmation ;
 *  - réglage illisible : aucun bouton, plutôt qu'un état supposé ;
 *  - l'action n'appelle la base que pour un superviseur permanent, et jamais pour ouvrir sans confirmation.
 *
 * Les règles de la base ont leur test (envois-suspendus-base.test.ts), les tâches aussi (envois-suspendus-missions).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ createClient: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));

import { reglerEnvoiAutomatique } from "@/app/actions/envois-automatiques-reglage";
import { EnvoisAutomatiques } from "@/app/admin/parametres/envois-automatiques";
import { envoisOuverts, FLUX_ENVOIS_AUTOMATIQUES, LIBELLES_ENVOIS_AUTOMATIQUES, phraseAccords, type EtatEnvoisAutomatiques } from "@/lib/envois-suspendus";

const FERMES: EtatEnvoisAutomatiques = { avis_echeance: false, relance_loyer: false, rappel_rendez_vous: false, relance_invitation: false, relance_report_rdv: false };
const rendre = (etat: EtatEnvoisAutomatiques | null) => renderToStaticMarkup(createElement(EnvoisAutomatiques, { etat }));
/** Le bloc d'un envoi dans le panneau. */
const bloc = (html: string, flux: string) => new RegExp(`<li[^>]*data-envoi-automatique="${flux}"[\\s\\S]*?</li>`).exec(html)?.[0] ?? "";

beforeEach(() => { m.createClient.mockReset(); m.revalidate.mockReset(); });

describe("le panneau du superviseur", () => {
  // Décision du dirigeant du 24/11/2026 (Q37, lot D4) : ce test affirmait « quatre envois ». La relance d'une demande de report est le cinquième,
  // avec son interrupteur, fermé par défaut comme les autres : le compte passe à cinq, rien d'autre ne change.
  it("à la livraison : cinq envois fermés, chacun avec sa confirmation obligatoire avant d'ouvrir", () => {
    const html = rendre(FERMES);
    expect(html).toContain('data-envois-automatiques="0"');
    expect(html).toContain("Tous fermés");
    expect(html.match(/data-envoi-automatique="/g)).toHaveLength(5);
    expect(FLUX_ENVOIS_AUTOMATIQUES).toEqual(["avis_echeance", "relance_loyer", "rappel_rendez_vous", "relance_invitation", "relance_report_rdv"]);
    for (const flux of FLUX_ENVOIS_AUTOMATIQUES) {
      const b = bloc(html, flux);
      expect(b, flux).toContain('data-ouvert="non"');
      expect(b, flux).toContain(LIBELLES_ENVOIS_AUTOMATIQUES[flux].titre);
      expect(b, flux).toContain("Fermé");
      expect(b, flux).toContain("Ouvrir cet envoi");
      expect(b, flux).toContain(`name="flux" value="${flux}"`);
      expect(b, flux).toContain('name="choix" value="ouvrir"');
      // La confirmation : une case à cocher obligatoire, reliée à son libellé.
      expect(b, flux).toMatch(new RegExp(`<input[^>]*id="confirmation-${flux}"[^>]*type="checkbox"[^>]*required`));
      expect(b, flux).toContain(`for="confirmation-${flux}"`);
      expect(b, flux).toContain("de vrais e-mails partiront");
    }
    // Le panneau dit ce que « fermé » veut dire, et ce qui garde un envoi ouvert.
    expect(html).toContain("rien n’est envoyé et rien n’est perdu");
    expect(html).toContain("arrêt d’urgence");
    expect(html).toContain("journal de la supervision");
  });

  it("un envoi ouvert se referme sans confirmation ; les autres restent à ouvrir", () => {
    const html = rendre({ ...FERMES, relance_loyer: true });
    expect(html).toContain('data-envois-automatiques="1"');
    // Q37 : « sur 5 » depuis le cinquième envoi.
    expect(html).toContain("1 ouvert sur 5");
    const ouvert = bloc(html, "relance_loyer");
    expect(ouvert).toContain('data-ouvert="oui"');
    expect(ouvert).toContain("Fermer cet envoi");
    expect(ouvert).toContain('name="choix" value="fermer"');
    expect(ouvert).not.toContain('type="checkbox"');
    for (const flux of ["avis_echeance", "rappel_rendez_vous", "relance_invitation", "relance_report_rdv"]) expect(bloc(html, flux), flux).toContain("Ouvrir cet envoi");
    expect(rendre({ avis_echeance: true, relance_loyer: true, rappel_rendez_vous: true, relance_invitation: false, relance_report_rdv: false })).toContain("3 ouverts sur 5");
  });

  it("réglage illisible : le panneau le dit et n'offre aucun bouton", () => {
    const html = rendre(null);
    expect(html).toContain('data-envois-automatiques="illisible"');
    expect(html).toContain("État indisponible");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("<button");
    expect(html).not.toContain("data-envoi-automatique=");
  });

  it("avant d'ouvrir un envoi soumis à l'accord des espaces, le panneau dit combien l'ont déjà donné", () => {
    const accords = { avis_echeance: 2, relance_loyer: 0 };
    const ferme = renderToStaticMarkup(createElement(EnvoisAutomatiques, { etat: FERMES, accords }));
    expect(bloc(ferme, "avis_echeance")).toContain("2 espaces ont déjà donné leur accord : leurs e-mails partiront dès l’ouverture.");
    expect(bloc(ferme, "relance_loyer")).toContain("Aucun espace n’a donné son accord");
    // Les deux autres envois ne dépendent d'aucun accord d'espace : rien à dire.
    for (const flux of ["rappel_rendez_vous", "relance_invitation"]) expect(bloc(ferme, flux), flux).not.toContain("data-accords-espaces");
    expect(phraseAccords("avis_echeance", false, { avis_echeance: 1, relance_loyer: 0 })).toBe("1 espace a déjà donné son accord : ses e-mails partiront dès l’ouverture.");
    expect(phraseAccords("avis_echeance", true, { avis_echeance: 3, relance_loyer: 0 })).toBe("3 espaces ont donné leur accord.");
    expect(phraseAccords("relance_loyer", true, { avis_echeance: 0, relance_loyer: 0 })).toContain("rien ne part pour le moment");
    // Compte non lu : aucune phrase plutôt qu'un chiffre supposé.
    expect(phraseAccords("avis_echeance", false, { avis_echeance: null, relance_loyer: null })).toBeNull();
    expect(phraseAccords("avis_echeance", false, undefined)).toBeNull();
    expect(phraseAccords("rappel_rendez_vous", false, accords)).toBeNull();
  });

  it("le compte des envois ouverts", () => {
    expect(envoisOuverts(null)).toBeNull();
    expect(envoisOuverts(FERMES)).toBe(0);
    expect(envoisOuverts({ ...FERMES, avis_echeance: true, relance_invitation: true })).toBe(2);
  });
});

describe("le geste du superviseur", () => {
  const formulaire = (champs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };
  const superviseur = () => {
    const rpc = vi.fn(async (nom: string, _args?: unknown) => ({ data: nom === "is_permanent_super_admin" ? true : null, error: null }));
    m.createClient.mockResolvedValue({ rpc });
    return rpc;
  };

  it.each([
    ["un envoi inconnu", { flux: "mise_en_demeure", choix: "ouvrir", confirmation: "oui" }],
    ["aucun envoi", { choix: "ouvrir", confirmation: "oui" }],
    ["un choix inconnu", { flux: "avis_echeance", choix: "basculer", confirmation: "oui" }],
    ["aucun choix", { flux: "avis_echeance" }],
  ])("refuse %s sans rien demander à la base", async (_libelle, champs) => {
    superviseur();
    expect((await reglerEnvoiAutomatique({}, formulaire(champs))).erreur).toBeTruthy();
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it("n'ouvre jamais sans la confirmation cochée — et ne demande rien à la base", async () => {
    superviseur();
    for (const confirmation of [undefined, "", "non", "on"]) {
      const r = await reglerEnvoiAutomatique({}, formulaire({ flux: "relance_loyer", choix: "ouvrir", ...(confirmation === undefined ? {} : { confirmation }) }));
      expect(r.erreur, String(confirmation)).toContain("confirmation");
      expect(r.flux).toBe("relance_loyer");
    }
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it("refuse un compte qui n'est pas superviseur permanent : le réglage n'est pas appelé", async () => {
    const rpc = vi.fn(async (nom: string) => ({ data: nom === "is_permanent_super_admin" ? false : null, error: null }));
    m.createClient.mockResolvedValue({ rpc });
    expect((await reglerEnvoiAutomatique({}, formulaire({ flux: "avis_echeance", choix: "ouvrir", confirmation: "oui" }))).erreur).toContain("superviseur permanent");
    expect((await reglerEnvoiAutomatique({}, formulaire({ flux: "avis_echeance", choix: "fermer" }))).erreur).toContain("superviseur permanent");
    // Le contrôle lui-même en erreur vaut refus.
    m.createClient.mockResolvedValue({ rpc: vi.fn(async () => ({ data: true, error: { message: "indisponible" } })) });
    expect((await reglerEnvoiAutomatique({}, formulaire({ flux: "avis_echeance", choix: "fermer" }))).erreur).toBeTruthy();
    expect(rpc.mock.calls.map(([nom]) => nom)).not.toContain("regler_envoi_automatique");
    expect(m.revalidate).not.toHaveBeenCalled();
  });

  it("superviseur permanent : ouvre avec confirmation, ferme sans, pour l'envoi désigné et lui seul", async () => {
    const rpc = superviseur();
    const ouvre = await reglerEnvoiAutomatique({}, formulaire({ flux: "rappel_rendez_vous", choix: "ouvrir", confirmation: "oui" }));
    expect(ouvre).toMatchObject({ flux: "rappel_rendez_vous" });
    expect(ouvre.erreur).toBeUndefined();
    expect(ouvre.succes).toContain(LIBELLES_ENVOIS_AUTOMATIQUES.rappel_rendez_vous.titre);
    expect(rpc).toHaveBeenCalledWith("regler_envoi_automatique", { p_flux: "rappel_rendez_vous", p_ouvert: true });
    const ferme = await reglerEnvoiAutomatique({}, formulaire({ flux: "rappel_rendez_vous", choix: "fermer" }));
    expect(ferme.erreur).toBeUndefined();
    expect(ferme.succes).toContain("ne part plus");
    expect(rpc).toHaveBeenCalledWith("regler_envoi_automatique", { p_flux: "rappel_rendez_vous", p_ouvert: false });
    expect(rpc.mock.calls.filter(([nom]) => nom === "regler_envoi_automatique")).toHaveLength(2);
    expect(m.revalidate).toHaveBeenCalledWith("/admin/parametres");
  });

  it("si la base refuse l'enregistrement, l'écran le dit et n'annonce pas un succès", async () => {
    const rpc = vi.fn(async (nom: string) => nom === "is_permanent_super_admin" ? { data: true, error: null } : { data: null, error: { message: "refus" } });
    m.createClient.mockResolvedValue({ rpc });
    const r = await reglerEnvoiAutomatique({}, formulaire({ flux: "avis_echeance", choix: "ouvrir", confirmation: "oui" }));
    expect(r.erreur).toContain("n’a pas pu être enregistré");
    expect(r.succes).toBeUndefined();
    expect(m.revalidate).not.toHaveBeenCalled();
  });
});
