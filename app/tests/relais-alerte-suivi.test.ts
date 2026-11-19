import { rendreServeur } from "./fixtures/rendu-serveur";
/**
 * Incident du 12 au 19/11/2026 : l'alerte e-mail de 5 h a échoué huit jours de suite sans destinataire, et rien d'autre
 * que l'e-mail ne pouvait le dire. La console lit désormais le registre des passages (`relais_alertes_envois`) et
 * affiche un bandeau sur l'accueil et sur « Santé et connexions » quand l'alerte attendue n'est pas confirmée partie.
 *
 *  — partie : « envoye », « envoi_partiel » (signalé à part) et « rien_a_signaler » ; pas « echec », « non_configure »,
 *    un « en_cours » passé l'échéance, ni un jour sans rang ;
 *  — l'échéance : 5 h 30 à Paris, été comme hiver ; avant, la veille fait foi, sauf passage du jour déjà terminé ;
 *  — une série : les jours de suite sans passage réussi, comptés jusqu'au jour attendu, avec la date du premier ;
 *  — jamais : aucun passage réussi dans le registre ; illisible : le dit, sans conclure.
 * Lecture seule : aucun envoi, aucune écriture.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BandeauAlerteQuotidienne } from "../src/components/bandeau-alerte-quotidienne";
import type { PassageRelais } from "../src/lib/relais-alerte";
import {
  echeanceAlerteQuotidienne,
  lirePassagesRelais,
  messageAlerteQuotidienne,
  suivreAlerteQuotidienne,
  type SuiviAlerteQuotidienne,
} from "../src/lib/relais-alerte-suivi";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/app/admin/sante/lancer-mission", () => ({ LancerMission: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }), usePathname: () => "/admin/brief", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/admin/brief/actions", () => ({ analyserBriefIA: vi.fn(), preparerPointDuMatin: vi.fn(), marquerPointLu: vi.fn(), deciderDecisionDuMatin: vi.fn() }));
import PageSante from "../src/app/admin/sante/page";
import PageBrief from "../src/app/admin/brief/page";

/** Un passage terminé à 5 h 00 à Paris (04 h UTC en hiver). */
const passage = (jour: string, statut: string, extra: Partial<PassageRelais> = {}): PassageRelais => ({
  jour, statut, destinataires: 2, envoyes: statut === "envoye" ? 2 : 0, points: 1, compteurs: {},
  commence_le: `${jour}T04:00:00Z`, termine_le: statut === "en_cours" ? null : `${jour}T04:00:30Z`, ...extra,
});
/** Une heure de Paris, en novembre (UTC+1). */
const paris = (jour: string, heure: string) => new Date(`${jour}T${heure}:00+01:00`);
const suivre = (passages: PassageRelais[] | null, maintenant: Date) => suivreAlerteQuotidienne(passages, maintenant);
const message = (s: SuiviAlerteQuotidienne) => messageAlerteQuotidienne(s);
const tout = (s: SuiviAlerteQuotidienne) => { const m = message(s); return m ? [m.titre, ...m.details].join(" ") : ""; };

describe("l'échéance de l'alerte quotidienne : 5 h 30 à Paris, été comme hiver", () => {
  it("04 h 30 UTC en hiver, 03 h 30 UTC en été, y compris autour du changement d'heure du 25/10", () => {
    expect(echeanceAlerteQuotidienne("2026-11-19").toISOString()).toBe("2026-11-19T04:30:00.000Z");
    expect(echeanceAlerteQuotidienne("2026-07-10").toISOString()).toBe("2026-07-10T03:30:00.000Z");
    expect(echeanceAlerteQuotidienne("2026-10-24").toISOString()).toBe("2026-10-24T03:30:00.000Z");
    expect(echeanceAlerteQuotidienne("2026-10-25").toISOString()).toBe("2026-10-25T04:30:00.000Z");
  });

  it("en été, à 05 h 29 la veille fait foi ; à 05 h 31 le jour même", () => {
    const passages = [passage("2026-07-09", "envoye")];
    expect(suivre(passages, new Date("2026-07-10T03:29:00Z"))).toMatchObject({ etat: "attendue", jourAttendu: "2026-07-09" });
    expect(suivre(passages, new Date("2026-07-10T03:31:00Z"))).toMatchObject({ etat: "en_defaut", jourAttendu: "2026-07-10", joursEnDefaut: 1 });
  });
});

describe("partie : aucun bandeau", () => {
  it("l'e-mail du jour est parti vers toutes les adresses", () => {
    const s = suivre([passage("2026-11-18", "envoye"), passage("2026-11-19", "envoye")], paris("2026-11-19", "08:00"));
    expect(s).toMatchObject({ etat: "partie", jourAttendu: "2026-11-19", joursEnDefaut: 0, depuis: null });
    expect(s.dernierReussi?.jour).toBe("2026-11-19");
    expect(message(s)).toBeNull();
  });

  it("« rien à signaler » est un passage réussi : rien ne devait partir", () => {
    const s = suivre([passage("2026-11-19", "rien_a_signaler", { points: 0 })], paris("2026-11-19", "08:00"));
    expect(s.etat).toBe("partie");
    expect(message(s)).toBeNull();
  });

  it("le passage du jour déjà réussi avant l'échéance fait foi aussitôt", () => {
    expect(suivre([passage("2026-11-18", "echec"), passage("2026-11-19", "envoye")], paris("2026-11-19", "05:05")).etat).toBe("partie");
  });

  it("l'ordre des rangs et un jour à venir (horloge décalée) ne changent rien", () => {
    const s = suivre([passage("2026-11-20", "echec"), passage("2026-11-17", "echec"), passage("2026-11-19", "envoye"), passage("2026-11-18", "envoye")], paris("2026-11-19", "08:00"));
    expect(s).toMatchObject({ etat: "partie", jourAttendu: "2026-11-19" });
    expect(s.dernier?.jour).toBe("2026-11-19");
  });
});

describe("pas encore attendue : aucun bandeau", () => {
  it("avant 5 h 30, sans passage du jour, la veille partie", () => {
    const s = suivre([passage("2026-11-18", "envoye")], paris("2026-11-19", "04:00"));
    expect(s).toMatchObject({ etat: "attendue", jourAttendu: "2026-11-18", joursEnDefaut: 0, passageAttendu: { jour: "2026-11-18" } });
    expect(message(s)).toBeNull();
  });

  it("avant 5 h 30, un passage du jour encore « en cours » n'est pas un échec", () => {
    const s = suivre([passage("2026-11-18", "rien_a_signaler"), passage("2026-11-19", "en_cours")], paris("2026-11-19", "05:01"));
    expect(s.etat).toBe("attendue");
    expect(message(s)).toBeNull();
  });
});

describe("série d'échecs : le bandeau dit depuis quand et combien de jours", () => {
  it("l'incident du 12 au 19/11 : huit jours sans destinataire, relais non configuré", () => {
    const passages = [passage("2026-11-11", "envoye")];
    for (let j = 12; j <= 19; j++) passages.push(passage(`2026-11-${j}`, "non_configure", { destinataires: 0 }));
    const s = suivre(passages, paris("2026-11-19", "09:00"));
    expect(s).toMatchObject({ etat: "en_defaut", jourAttendu: "2026-11-19", joursEnDefaut: 8, depuis: "2026-11-12" });
    const m = message(s)!;
    expect(m.titre).toBe("L’alerte quotidienne n’est pas partie depuis le 12/11 (8 jours).");
    const texte = tout(s);
    expect(texte).toContain("Passage du 19/11 : relais non configuré, aucun e-mail envoyé");
    expect(texte).toContain("GERIMMO_RELAIS_EMAILS");
    expect(texte).toContain("Dernier passage réussi : 11/11/2026 05:00 — e-mail envoyé à 2 adresses");
  });

  it("un jour sans rang compte comme un échec : la tâche n'a pas été reçue", () => {
    const s = suivre([passage("2026-11-17", "envoye")], paris("2026-11-19", "07:00"));
    expect(s).toMatchObject({ etat: "en_defaut", joursEnDefaut: 2, depuis: "2026-11-18", passageAttendu: null });
    expect(tout(s)).toContain("Le 19/11, aucun passage n’a été consigné.");
    expect(tout(s)).toContain("La tâche planifiée « alerte du relais » n’a laissé aucune trace");
  });

  it("avant l'échéance du jour, la série s'arrête à la veille", () => {
    const s = suivre([passage("2026-11-17", "envoye"), passage("2026-11-18", "echec")], paris("2026-11-19", "04:00"));
    expect(s).toMatchObject({ etat: "en_defaut", jourAttendu: "2026-11-18", joursEnDefaut: 1, depuis: "2026-11-18" });
    expect(message(s)!.titre).toBe("L’alerte quotidienne n’est pas partie depuis le 18/11 (1 jour).");
    expect(tout(s)).toContain("Le service d’e-mail n’a confirmé aucun envoi");
  });

  it("seul ce matin manque : « l'alerte de ce matin n'est pas partie »", () => {
    const s = suivre([passage("2026-11-18", "envoye"), passage("2026-11-19", "echec")], paris("2026-11-19", "09:00"));
    expect(s).toMatchObject({ etat: "en_defaut", joursEnDefaut: 1, depuis: "2026-11-19" });
    expect(message(s)!.titre).toBe("L’alerte quotidienne de ce matin n’est pas partie.");
  });

  it("un échec du jour déjà consigné avant l'échéance se montre aussitôt", () => {
    const s = suivre([passage("2026-11-18", "envoye"), passage("2026-11-19", "echec")], paris("2026-11-19", "05:05"));
    expect(s).toMatchObject({ etat: "en_defaut", jourAttendu: "2026-11-19", joursEnDefaut: 1 });
  });

  it("un passage resté « en cours » après l'échéance a été coupé", () => {
    const s = suivre([passage("2026-11-18", "envoye"), passage("2026-11-19", "en_cours")], paris("2026-11-19", "06:00"));
    expect(s).toMatchObject({ etat: "en_defaut", joursEnDefaut: 1 });
    expect(tout(s)).toContain("passage interrompu avant sa fin");
    expect(tout(s)).not.toContain("passage en cours");
  });

  it("un envoi partiel compte comme parti pour la série", () => {
    const s = suivre([passage("2026-11-17", "envoi_partiel", { envoyes: 1 }), passage("2026-11-18", "echec"), passage("2026-11-19", "echec")], paris("2026-11-19", "09:00"));
    expect(s).toMatchObject({ etat: "en_defaut", joursEnDefaut: 2, depuis: "2026-11-18" });
  });
});

describe("envoi partiel, jamais parti, registre illisible", () => {
  it("partiel : dit combien d'adresses l'ont reçue", () => {
    const s = suivre([passage("2026-11-19", "envoi_partiel", { envoyes: 1, destinataires: 2 })], paris("2026-11-19", "09:00"));
    expect(s.etat).toBe("partielle");
    expect(message(s)!.titre).toBe("L’alerte quotidienne de ce matin n’est partie que vers 1 adresse sur 2.");
    const veille = suivre([passage("2026-11-18", "envoi_partiel", { envoyes: 1, destinataires: 3 })], paris("2026-11-19", "04:00"));
    expect(message(veille)!.titre).toBe("L’alerte quotidienne du 18/11 n’est partie que vers 1 adresse sur 3.");
  });

  it("registre vide : jamais partie", () => {
    const s = suivre([], paris("2026-11-19", "09:00"));
    expect(s).toMatchObject({ etat: "jamais", dernierReussi: null, dernier: null });
    expect(message(s)!.titre).toBe("L’alerte quotidienne n’est jamais partie.");
    expect(tout(s)).toContain("Le registre des passages ne contient aucun passage réussi.");
  });

  it("des passages, aucun réussi : jamais partie, avec le dernier résultat et quoi vérifier", () => {
    const s = suivre([passage("2026-11-18", "non_configure", { destinataires: 0 }), passage("2026-11-19", "non_configure", { destinataires: 0 })], paris("2026-11-19", "09:00"));
    expect(s.etat).toBe("jamais");
    expect(tout(s)).toContain("Dernier passage : 19/11/2026 05:00 — relais non configuré");
    expect(tout(s)).toContain("GERIMMO_RELAIS_EMAILS");
  });

  it("registre illisible : le dit, sans conclure", () => {
    const s = suivre(null, paris("2026-11-19", "09:00"));
    expect(s).toMatchObject({ etat: "illisible", jourAttendu: null });
    expect(message(s)!.titre).toBe("L’état de l’alerte quotidienne n’a pas pu être lu.");
  });
});

describe("la lecture du registre", () => {
  function client(reponse: { data: unknown; error: unknown } | Error) {
    const appels: unknown[][] = [];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "order"]) q[m] = (...a: unknown[]) => { appels.push([m, ...a]); return q; };
    q.limit = (...a: unknown[]) => { appels.push(["limit", ...a]); return reponse instanceof Error ? Promise.reject(reponse) : Promise.resolve(reponse); };
    return { db: { from: (t: string) => { appels.push(["from", t]); return q; } }, appels };
  }

  it("lit les derniers passages, sans adresse, du plus récent au plus ancien", async () => {
    const { db, appels } = client({ data: [passage("2026-11-19", "envoye")], error: null });
    expect(await lirePassagesRelais(db)).toHaveLength(1);
    expect(appels).toEqual([
      ["from", "relais_alertes_envois"],
      ["select", "jour,statut,destinataires,envoyes,points,compteurs,commence_le,termine_le"],
      ["order", "jour", { ascending: false }],
      ["limit", 200],
    ]);
  });

  it("une erreur ou une exception : null (illisible), jamais une liste vide", async () => {
    expect(await lirePassagesRelais(client({ data: null, error: { message: "refus" } }).db)).toBeNull();
    expect(await lirePassagesRelais(client(new Error("réseau")).db)).toBeNull();
  });
});

describe("le bandeau", () => {
  const rendre = (s: SuiviAlerteQuotidienne) => renderToStaticMarkup(createElement(BandeauAlerteQuotidienne, { suivi: s }));

  it("rien quand l'alerte est partie ou pas encore attendue", () => {
    expect(rendre(suivre([passage("2026-11-19", "envoye")], paris("2026-11-19", "09:00")))).toBe("");
    expect(rendre(suivre([passage("2026-11-18", "envoye")], paris("2026-11-19", "04:00")))).toBe("");
  });

  it("en défaut : le titre, les précisions et le lien vers l'alerte e-mail du relais", () => {
    const html = rendre(suivre([passage("2026-11-11", "envoye")], paris("2026-11-19", "09:00")));
    // Région nommée par son titre ; ni `alert` ni `status`, que ces pages réservent au résultat des gestes.
    expect(html).toContain('aria-labelledby="alerte-quotidienne-titre"');
    expect(html).toContain('<strong id="alerte-quotidienne-titre">');
    expect(html).not.toMatch(/role="(alert|status)"/);
    expect(html).toContain('data-etat="en_defaut"');
    expect(html).toContain("L’alerte quotidienne n’est pas partie depuis le 12/11 (8 jours).");
    expect(html).toContain('href="/admin/relais#alerte-email"');
  });
});

describe("l'accueil de la supervision et l'écran Santé affichent le bandeau", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(paris("2026-11-19", "09:00")); });
  afterEach(() => { vi.useRealTimers(); mocks.createClient.mockReset(); });

  /** Toutes les lectures rendent une liste vide, sauf le registre des passages. */
  function client(passages: PassageRelais[] | null) {
    return {
      rpc: async () => ({ data: null, error: null }),
      from: (table: string) => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "like", "in", "is", "gte", "lte", "lt", "gt", "neq", "not", "or", "order", "limit", "eq", "range"]) q[m] = () => q;
        q.maybeSingle = () => Promise.resolve({ data: { valeurs: {}, revision: 1 }, error: null });
        q.single = () => Promise.resolve({ data: null, error: null });
        const reponse = table !== "relais_alertes_envois" ? { data: [], error: null, count: 0 } : passages === null ? { data: null, error: { message: "refus" } } : { data: passages, error: null };
        q.then = (ok: (r: unknown) => unknown) => Promise.resolve(reponse).then(ok);
        return q;
      },
    };
  }
  const accueil = async () => rendreServeur(await PageBrief({ searchParams: Promise.resolve({}) }));

  it("accueil « Aujourd’hui » : le bandeau sous le titre, avec le lien vers le détail", async () => {
    mocks.createClient.mockResolvedValue(client([passage("2026-11-11", "envoye"), passage("2026-11-19", "echec")]));
    const html = await accueil();
    expect(html).toContain("L’alerte quotidienne n’est pas partie depuis le 12/11 (8 jours).");
    expect(html).toContain('href="/admin/relais#alerte-email"');
    expect(html.indexOf("id=\"alerte-quotidienne\"")).toBeGreaterThan(html.indexOf("Aujourd’hui"));
  });

  it("accueil : rien quand l'alerte de ce matin est partie", async () => {
    mocks.createClient.mockResolvedValue(client([passage("2026-11-19", "rien_a_signaler")]));
    expect(await accueil()).not.toContain("id=\"alerte-quotidienne\"");
  });

  it("Santé, série d'échecs : le bandeau est en tête de l'écran", async () => {
    mocks.createClient.mockResolvedValue(client([passage("2026-11-11", "envoye"), passage("2026-11-19", "non_configure", { destinataires: 0 })]));
    const html = await rendreServeur(await PageSante());
    expect(html).toContain("L’alerte quotidienne n’est pas partie depuis le 12/11 (8 jours).");
    expect(html.indexOf("id=\"alerte-quotidienne\"")).toBeLessThan(html.indexOf("aria-label=\"État des contrôles\""));
  });

  it("Santé, alerte partie ce matin : pas de bandeau", async () => {
    mocks.createClient.mockResolvedValue(client([passage("2026-11-19", "envoye")]));
    const html = await rendreServeur(await PageSante());
    expect(html).not.toContain("id=\"alerte-quotidienne\"");
  });

  it("Santé, registre illisible : le dit", async () => {
    mocks.createClient.mockResolvedValue(client(null));
    expect(await rendreServeur(await PageSante())).toContain("L’état de l’alerte quotidienne n’a pas pu être lu.");
  });
});
