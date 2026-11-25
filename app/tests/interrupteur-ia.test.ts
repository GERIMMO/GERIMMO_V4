/**
 * L'INTERRUPTEUR IA DANS L'APPLICATION — mission palier 1 (22/11/2026). Les deux modes, sans base ni réseau.
 *
 * Ce que ces tests tiennent :
 *  1. un seul état (`etatIA`) : activée, désactivée, non connectée ; un écran, dans le doute, propose la saisie manuelle ;
 *  2. les deux gardes de l'application traduisent « desactive » en `IADesactivee`, avec un message neutre ;
 *  3. chaque écran qui propose une fonction assistée la montre IA activée, et montre son équivalent manuel IA coupée
 *     ou non connectée : assistant (liens d'aide), lecture de document (bouton masqué), article (brouillon vierge),
 *     atelier (masqué), réglage du superviseur ;
 *  4. là où un fichier ou un message part chez le fournisseur, l'écran nomme OpenAI et les États-Unis ;
 *  5. la proposition de devis ne tente aucun appel IA coupée et reste une base du catalogue ;
 *  6. la page Santé ne compte plus l'IA désactivée comme un point bloquant, sans masquer une lecture impossible.
 *
 * AUCUN appel réel : `fetch` est simulé. Les règles de la base ont leur test : interrupteur-ia-base.test.ts.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ createClient: vi.fn(), revalidate: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("next/navigation", () => ({ redirect: m.redirect, notFound: vi.fn(), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/actions/conversation-privee", () => ({ demanderAssistantPrive: vi.fn() }));
vi.mock("@/app/actions/lecture-document", () => ({ proposerLectureDocument: vi.fn() }));
vi.mock("@/app/actions/equipes", () => ({ demanderCorrection: vi.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { EQUIVALENTS_MANUELS_IA, cleIAPosee, etatIA, iaDesactiveeParLeSuperviseur, iaUtilisable, motifIANonConnectee, type EtatIA } from "@/lib/etat-ia";
import { IADesactivee, MESSAGE_IA_DESACTIVEE, USAGES_IA, messageGardeIA, reserverAppelIA, reserverAppelIAPrive } from "@/lib/plafond-ia";
import { ErreurIA } from "@/lib/erreur-ia";
import { pointsBloquants, sansAlerteIA, type Verification } from "@/lib/sante-service";
import { proposerDevis } from "@/lib/proposition-devis-ia";
import { FournisseurEtatIA } from "@/components/etat-ia";
import { AssistantPrive } from "@/components/assistant-prive";
import { LectureDocumentAssistee } from "@/components/lecture-document-assistee";
import { InterrupteurIA } from "@/app/admin/parametres/interrupteur-ia";
import { AtelierQualite } from "@/app/admin/equipes/qualite";
import { LimiteAppelsIA } from "@/app/admin/relais/limite-ia";
import { reglerIAActive } from "@/app/actions/plafond-ia";
import { creerArticleVierge } from "@/app/admin/publications/nouvelle/actions";

const fetchSimule = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchSimule);
  fetchSimule.mockReset();
  m.createClient.mockReset(); m.revalidate.mockReset(); m.redirect.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const ETATS: EtatIA[] = ["active", "desactivee", "non_connectee"];
const rpcQuiRend = (data: unknown, error: unknown = null) => ({ rpc: vi.fn(async () => ({ data, error })) }) as unknown as SupabaseClient;
const sous = (etat: EtatIA, enfant: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(FournisseurEtatIA, { etat }, enfant));
/** La production commerciale : la seule situation où le mode pilote ne retient aucun appel (lib/verrou-pilote.ts). */
const COMMERCIAL = { GERIMMO_MODE: "commercial", VERCEL: "1", VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://www.gerimmo.app" };
const AVEC_CLE = { ...COMMERCIAL, OPENAI_API_KEY: "cle-de-test-jamais-reelle" };
/** Une préproduction : la clé est posée, mais le mode pilote suspend les opérations payantes. */
const PILOTE = { OPENAI_API_KEY: "cle-de-test-jamais-reelle", VERCEL: "1", VERCEL_ENV: "preview" };

describe("un seul état de l'IA", () => {
  it("activée et reliée, désactivée, ou activée sans clé", async () => {
    expect(await etatIA(rpcQuiRend(true), AVEC_CLE)).toBe("active");
    expect(await etatIA(rpcQuiRend(true), { ...COMMERCIAL, OPEN_AI_KEY: "ancien-nom" })).toBe("active");
    expect(await etatIA(rpcQuiRend(true), COMMERCIAL)).toBe("non_connectee");
    expect(await etatIA(rpcQuiRend(true), { ...COMMERCIAL, OPENAI_API_KEY: "   " })).toBe("non_connectee");
    expect(await etatIA(rpcQuiRend(false), AVEC_CLE)).toBe("desactivee");
    expect(cleIAPosee({})).toBe(false);
    expect(motifIANonConnectee(AVEC_CLE)).toBeNull();
    expect(motifIANonConnectee(COMMERCIAL)).toBe("cle");
  });

  it("mode pilote : clé posée ou non, les fonctions des espaces ne peuvent pas répondre — l'écran propose le manuel", async () => {
    expect(motifIANonConnectee(PILOTE)).toBe("pilote");
    expect(await etatIA(rpcQuiRend(true), PILOTE)).toBe("non_connectee");
    // Le brief et la rédaction d'article ne consultent pas le mode pilote : eux seuls restent proposés.
    expect(await etatIA(rpcQuiRend(true), PILOTE, { verrouPilote: false })).toBe("active");
    // Sans clé, ou IA désactivée, rien n'est proposé nulle part.
    expect(await etatIA(rpcQuiRend(true), { VERCEL_ENV: "preview" }, { verrouPilote: false })).toBe("non_connectee");
    expect(await etatIA(rpcQuiRend(false), PILOTE, { verrouPilote: false })).toBe("desactivee");
  });

  it("un écran, dans le doute, propose la saisie manuelle : lecture en erreur, vide ou impossible = désactivée", async () => {
    expect(await etatIA(rpcQuiRend(null, { message: "panne" }), AVEC_CLE)).toBe("desactivee");
    expect(await etatIA(rpcQuiRend(null), AVEC_CLE)).toBe("desactivee");
    expect(await etatIA({ rpc: vi.fn(async () => { throw new Error("réseau"); }) } as unknown as SupabaseClient, AVEC_CLE)).toBe("desactivee");
    expect(await etatIA({} as unknown as SupabaseClient, AVEC_CLE)).toBe("desactivee");
    expect(ETATS.filter(iaUtilisable)).toEqual(["active"]);
  });

  it("une tâche de fond, elle, ne se suspend que sur un « non » explicite de la base", async () => {
    expect(await iaDesactiveeParLeSuperviseur(rpcQuiRend(false))).toBe(true);
    expect(await iaDesactiveeParLeSuperviseur(rpcQuiRend(true))).toBe(false);
    expect(await iaDesactiveeParLeSuperviseur(rpcQuiRend(null))).toBe(false);
    expect(await iaDesactiveeParLeSuperviseur(rpcQuiRend(false, { message: "panne" }))).toBe(false);
    expect(await iaDesactiveeParLeSuperviseur({ rpc: async () => { throw new Error("réseau"); } })).toBe(false);
    expect(await iaDesactiveeParLeSuperviseur({ from: () => ({}) })).toBe(false);
    expect(await iaDesactiveeParLeSuperviseur(null)).toBe(false);
  });

  it("chaque usage payant a son équivalent manuel annoncé au superviseur", () => {
    // Neuf usages dans la garde ; la lecture assistée en couvre deux à l'écran (facture, compteur) : dix lignes.
    expect(Object.keys(USAGES_IA)).toHaveLength(9);
    expect(EQUIVALENTS_MANUELS_IA).toHaveLength(10);
    for (const e of EQUIVALENTS_MANUELS_IA) { expect(e.fonction.length).toBeGreaterThan(5); expect(e.manuel.length).toBeGreaterThan(10); }
  });
});

describe("les deux gardes de l'application", () => {
  it("« desactive » devient IADesactivee : un message neutre, ni panne ni limite", async () => {
    await expect(reserverAppelIA(rpcQuiRend("desactive"), "brief")).rejects.toBeInstanceOf(IADesactivee);
    await expect(reserverAppelIAPrive(rpcQuiRend("desactive"), "org", "conversation_privee")).rejects.toBeInstanceOf(IADesactivee);
    await expect(reserverAppelIAPrive(rpcQuiRend("desactive"), "org", "lecture_document")).rejects.toBeInstanceOf(IADesactivee);
    const e = new IADesactivee();
    expect(e).toBeInstanceOf(ErreurIA);
    expect(messageGardeIA(e)).toBe(MESSAGE_IA_DESACTIVEE);
    expect(MESSAGE_IA_DESACTIVEE).not.toMatch(/panne|indisponible|limite|crédit|plafond|demain/i);
    await expect(reserverAppelIA(rpcQuiRend("accorde"), "brief")).resolves.toBeUndefined();
  });
});

describe("assistant « Demander à Gerimmo »", () => {
  const aides = [{ href: "/espace/o/faq", libelle: "Aide et questions fréquentes" }, { href: "/espace/o/regles", libelle: "Les règles à connaître" }];
  const assistant = (etat: EtatIA, avecAides = true) => sous(etat, createElement(AssistantPrive, { orgId: "o", compteId: "c", aides: avecAides ? aides : undefined }));

  it("IA activée : l'assistant est proposé et nomme le destinataire des messages", () => {
    const html = assistant("active");
    expect(html).toContain("Demander à Gerimmo");
    expect(html).toContain("transmis à OpenAI, le prestataire d’IA de Gerimmo, établi aux États-Unis");
    expect(html).not.toContain("data-assistant-remplace");
  });

  it.each(["desactivee", "non_connectee"] as const)("IA %s : l'aide écrite prend sa place, sans formulaire ni bouton d'envoi", (etat) => {
    const html = assistant(etat);
    expect(html).not.toContain("Demander à Gerimmo");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("OpenAI");
    expect(html).toContain("data-assistant-remplace");
    expect(html).toContain('href="/espace/o/faq"');
    expect(html).toContain("Les règles à connaître");
    // Sans lien d'aide à proposer, rien n'est affiché plutôt qu'un cadre vide.
    expect(assistant(etat, false)).toBe("");
  });
});

describe("lecture assistée d'un document", () => {
  const fichier = new File([new Uint8Array([1, 2, 3])], "facture.pdf", { type: "application/pdf" });
  const lecture = (etat: EtatIA, demandeId: string | null = null) => sous(etat, createElement(LectureDocumentAssistee, { orgId: "o", demandeId, fichier, appliquer: () => {} }));

  it("IA activée : le bouton est proposé et dit où part le fichier avant le clic", () => {
    const facture = lecture("active");
    expect(facture).toContain("Préremplir depuis la facture");
    expect(facture).toContain("transmis à OpenAI, le prestataire d’IA de Gerimmo, établi aux États-Unis");
    expect(lecture("active", "11111111-1111-4111-8111-111111111111")).toContain("Lire l’index sur ma photo");
  });

  it.each(["desactivee", "non_connectee"] as const)("IA %s : aucun bouton, la saisie se fait dans le formulaire", (etat) => {
    expect(lecture(etat)).toBe("");
    expect(lecture(etat, "11111111-1111-4111-8111-111111111111")).toBe("");
  });
});

describe("proposition de devis de l'artisan", () => {
  it("IA désactivée : aucun appel au fournisseur, une base du catalogue annoncée sans IA", async () => {
    vi.stubEnv("OPENAI_API_KEY", "cle-de-test-jamais-reelle");
    const p = await proposerDevis("plomberie_canalisation", "Fuite au robinet", [], async () => { throw new IADesactivee(); });
    expect(fetchSimule).not.toHaveBeenCalled();
    expect(p.moteur).toBe("references");
    expect(p.lignes.length).toBeGreaterThan(0);
    expect(p.a_verifier[0]).toBe("Proposition issue du catalogue de références, sans IA : vérifiez chaque ligne.");
    expect(p.a_verifier.join(" ")).not.toMatch(/momentanément indisponible|limite du jour|suspendue/);
  });
});

describe("réglage du superviseur", () => {
  it("IA activée : le panneau propose de la désactiver et liste ce qui remplace chaque fonction", () => {
    const html = renderToStaticMarkup(createElement(InterrupteurIA, { active: true, etat: "active" }));
    expect(html).toContain('data-interrupteur-ia="activee"');
    expect(html).toContain("IA activée");
    expect(html).toContain("Désactiver l’IA");
    expect(html).toContain('name="ia" value="desactiver"');
    for (const e of EQUIVALENTS_MANUELS_IA) expect(html).toContain(e.fonction.replace(/«/g, "«"));
    expect(html).not.toContain("data-ia-non-connectee");
  });

  it("IA désactivée : le panneau le dit et propose de la réactiver", () => {
    const html = renderToStaticMarkup(createElement(InterrupteurIA, { active: false, etat: "desactivee" }));
    expect(html).toContain('data-interrupteur-ia="desactivee"');
    expect(html).toContain("IA désactivée");
    expect(html).toContain("Réactiver l’IA");
    expect(html).toContain('name="ia" value="activer"');
    expect(html).toContain("Aucun appel à l’IA ne part");
  });

  it("IA activée mais non reliée : dit pourquoi aucun appel ne peut partir ; réglage illisible : aucun bouton", () => {
    expect(renderToStaticMarkup(createElement(InterrupteurIA, { active: true, etat: "non_connectee" }))).toContain('data-ia-non-connectee="cle"');
    const pilote = renderToStaticMarkup(createElement(InterrupteurIA, { active: true, etat: "non_connectee", motif: "pilote" }));
    expect(pilote).toContain('data-ia-non-connectee="pilote"');
    expect(pilote).toContain("mode pilote");
    const illisible = renderToStaticMarkup(createElement(InterrupteurIA, { active: null, etat: "desactivee" }));
    expect(illisible).toContain("État indisponible");
    expect(illisible).not.toContain("<button");
  });

  it("l'action refuse un compte qui n'est pas superviseur permanent et n'appelle la base que pour lui", async () => {
    const formulaire = (valeur: string) => { const f = new FormData(); f.set("ia", valeur); return f; };
    const rpc = vi.fn(async (nom: string) => ({ data: nom === "is_permanent_super_admin" ? false : null, error: null }));
    m.createClient.mockResolvedValue({ rpc });
    expect((await reglerIAActive({}, formulaire("desactiver"))).erreur).toBeTruthy();
    expect(rpc.mock.calls.map(([nom]) => nom)).not.toContain("regler_ia_active");

    const rpcSuperviseur = vi.fn(async (nom: string, _args?: unknown) => ({ data: nom === "is_permanent_super_admin" ? true : null, error: null }));
    m.createClient.mockResolvedValue({ rpc: rpcSuperviseur });
    expect((await reglerIAActive({}, formulaire("n-importe-quoi"))).erreur).toBeTruthy();
    expect(rpcSuperviseur.mock.calls.map(([nom]) => nom)).not.toContain("regler_ia_active");
    const coupe = await reglerIAActive({}, formulaire("desactiver"));
    expect(coupe.erreur).toBeUndefined();
    expect(coupe.succes).toBeTruthy();
    expect(rpcSuperviseur).toHaveBeenCalledWith("regler_ia_active", { p_active: false });
    await reglerIAActive({}, formulaire("activer"));
    expect(rpcSuperviseur).toHaveBeenCalledWith("regler_ia_active", { p_active: true });
    expect(m.revalidate).toHaveBeenCalledWith("/", "layout");
  });
});

describe("console : atelier, limite quotidienne, brouillon vierge", () => {
  it("atelier de corrections : proposé IA activée, remplacé par une explication IA désactivée", () => {
    const atelier = (etat: EtatIA) => sous(etat, createElement(AtelierQualite, { preparation: true, demonstration: true, active: true }));
    expect(atelier("active")).toContain("Préparer une proposition");
    expect(atelier("active")).not.toContain("data-atelier-ia-desactivee");
    const coupe = atelier("desactivee");
    expect(coupe).toContain("data-atelier-ia-desactivee");
    expect(coupe).not.toContain("<textarea");
    expect(coupe).toContain("Suivre les corrections dans Gerimmo");
  });

  it("limite quotidienne : rappelle que l'IA désactivée prime, seulement quand c'est le cas", () => {
    const panneau = (ia_active: boolean) => renderToStaticMarkup(createElement(LimiteAppelsIA, {
      reglage: { plafond_jour: 50, modifie_le: "2026-11-22T10:00:00Z", modifie_par: null, ia_active }, jour: { appels: 0, refus: 0 }, lisible: true, auteur: null,
    }));
    expect(panneau(false)).toContain("data-ia-desactivee");
    expect(panneau(false)).toContain('href="/admin/parametres#ia"');
    expect(panneau(true)).not.toContain("data-ia-desactivee");
  });

  it("brouillon vierge : créé sans aucun appel à l'IA, réservé à la supervision, titre exigé", async () => {
    const insert = vi.fn((_valeurs: Record<string, unknown>) => ({ select: () => ({ single: async () => ({ data: { id: "publication-vierge" }, error: null }) }) }));
    const rpc = vi.fn(async (nom: string, _args?: unknown) => ({ data: nom === "is_super_admin" ? true : null, error: null }));
    const titre = (t: string) => { const f = new FormData(); f.set("titre", t); return f; };
    m.createClient.mockResolvedValue({ rpc, from: vi.fn(() => ({ insert })) });
    expect((await creerArticleVierge({}, titre("abc"))).erreur).toMatch(/5 à 180/);
    expect(insert).not.toHaveBeenCalled();
    await creerArticleVierge({}, titre("  Préparer un état des lieux  "));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ statut: "brouillon", titre: "Préparer un état des lieux", chapo: "", corps: "" }));
    expect(rpc).toHaveBeenCalledWith("journaliser_supervision", expect.objectContaining({ p_action: "publication_brouillon_cree" }));
    expect(rpc.mock.calls.map(([nom]) => nom)).not.toContain("reserver_appel_ia");
    expect(fetchSimule).not.toHaveBeenCalled();
    expect(m.redirect).toHaveBeenCalledWith("/admin/publications/publication-vierge");

    m.createClient.mockResolvedValue({ rpc: vi.fn(async () => ({ data: false, error: null })), from: vi.fn(() => ({ insert })) });
    insert.mockClear();
    expect((await creerArticleVierge({}, titre("Un titre correct"))).erreur).toMatch(/supervision/);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("page Santé", () => {
  const ligne = (cle: string, etat: Verification["etat"], usage = "Assistant IA"): Verification => ({ cle, usage, etat, detail: null, prestataire: "OpenAI" as Verification["prestataire"], commande: "Poser la clé" });
  const configuration = [ligne("OPENAI_API_KEY", "manque"), ligne("OPENAI_API_KEY", "manque", "Crédit du compte IA"), ligne("RESEND_API_KEY", "manque", "E-mails")];

  it("IA désactivée : sa clé et son crédit sont marqués « Désactivé » et ne comptent plus ; le reste ne bouge pas", () => {
    expect(pointsBloquants(configuration, [], 0)).toBe(2);
    const neutre = sansAlerteIA(configuration, true);
    expect(neutre.filter((v) => v.cle === "OPENAI_API_KEY").map((v) => [v.etat, v.information, v.commande])).toEqual([["ok", "Désactivé", undefined], ["ok", "Désactivé", undefined]]);
    expect(neutre.find((v) => v.cle === "RESEND_API_KEY")).toEqual(configuration[2]);
    expect(pointsBloquants(neutre, [], 0)).toBe(1);
  });

  it("IA activée : rien n'est neutralisé", () => {
    expect(sansAlerteIA(configuration, false)).toBe(configuration);
  });
});
