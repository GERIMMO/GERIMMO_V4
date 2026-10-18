/**
 * D46-B (15/10/2026) — la console dit la vérité sur l'alerte e-mail du relais :
 *  — « Alerte e-mail quotidienne à 5 h (heure de Paris) vers N adresses », adresses MASQUÉES ; ou « Relais non
 *    configuré » quand la variable est absente ou vide ; les adresses invalides ignorées sont signalées ;
 *  — la date et le résultat du dernier passage, et du dernier e-mail envoyé ;
 *  — l'écran Santé ne prétend plus que le veto marketing est le seul e-mail d'alerte.
 * Aucune adresse réelle : des adresses d'exemple.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlerteEmailRelais } from "../src/app/admin/relais/alerte-email-relais";
import { lireAdressesRelais, type PassageRelais } from "../src/lib/relais-alerte";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/app/admin/sante/lancer-mission", () => ({ LancerMission: () => null }));
import PageSante from "../src/app/admin/sante/page";

afterEach(() => {
  vi.unstubAllEnvs();
});

const recent = (heures: number) => new Date(Date.now() - heures * 3_600_000).toISOString();
const passage = (p: Partial<PassageRelais>): PassageRelais => ({
  jour: "2026-10-15", statut: "rien_a_signaler", destinataires: 2, envoyes: 0, points: 0, commence_le: recent(2), termine_le: recent(2), ...p,
});
const rendre = (adresses: string | undefined, passages: PassageRelais[] | null) =>
  renderToStaticMarkup(createElement(AlerteEmailRelais, { adresses: lireAdressesRelais(adresses), passages })).replace(/\s+/g, " ");

describe("l'écran de l'alerte e-mail du relais", () => {
  it("variable absente : « relais non configuré », sans fausse promesse", () => {
    const html = rendre(undefined, []);
    expect(html).toContain("Relais non configuré : aucune alerte e-mail ne part.");
    expect(html).toContain("GERIMMO_RELAIS_EMAILS");
    expect(html).not.toContain("Alerte e-mail quotidienne à 5 h");
    expect(html).toContain("Aucun passage du relais enregistré pour l’instant.");
    // Non configuré : pas d'avertissement de retard (rien n'est censé partir).
    expect(html).not.toContain("depuis plus de 26 heures");
  });

  it("deux adresses : le nombre et les adresses masquées, jamais les adresses entières", () => {
    const html = rendre("relais@example.com, second@example.org", [passage({})]);
    expect(html).toContain("Alerte e-mail quotidienne à 5 h (heure de Paris) vers 2 adresses : re•••is@example.com, se•••nd@example.org.");
    expect(html).not.toContain("relais@example.com");
    expect(html).not.toContain("second@example.org");
    expect(html).toContain("l’arrêt d’urgence ne les coupe pas");
    expect(html).toContain("Sans rien à signaler, aucun e-mail ne part.");
  });

  // Décision du 15/10 : envoi immédiat pour les urgences ; la console le dit, avec le délai et l'arrêt d'urgence.
  // Relecture du 15/10 : un passage automatique toutes les 10 minutes (pg_cron) constate les urgences puis les envoie :
  // la console donne le délai réel depuis l'événement, et le filet du matin si ce passage est en panne.
  it("relais configuré : « Urgences : e-mail immédiat, au plus 11 min après l’événement ; autres alertes : e-mail quotidien à 5 h (Paris) »", () => {
    const html = rendre("relais@example.com, second@example.org", [passage({})]);
    expect(html).toContain("Urgences : e-mail immédiat, au plus 11 min après l’événement ; autres alertes : e-mail quotidien à 5 h (Paris).");
    expect(html).not.toContain("délai au plus 1 min");
    expect(html).toContain("Un passage automatique constate les urgences toutes les 10 minutes, jour et nuit, et envoie leur e-mail dans la foulée : il part au plus 11 minutes après l’événement.");
    expect(html).toContain("Si ce passage ne fonctionne pas, l’e-mail de 5 h le signale, et les urgences ne sont plus constatées qu’au passage des équipes, chaque matin entre 4 h et 12 h (heure de Paris), ou quand on actualise le relais.");
    expect(html).not.toContain("lendemain matin");
    expect(html).toContain("dont le passage automatique des urgences, s’il n’atteint plus le serveur");
    expect(html).toContain("Son e-mail immédiat part une seule fois, sans son texte, au plus 6 fois par heure");
    expect(html).toContain("au-delà, ou si l’envoi échoue, les urgences en attente partent groupées au passage suivant ou dans l’e-mail de 5 h, qui rappelle aussi les urgences des dernières 24 h, envoyées ou non.");
    expect(html).toContain("l’arrêt d’urgence ne les coupe pas : ce sont des alertes au dirigeant, sans effet sur les utilisateurs");
  });

  it("relais non configuré : aucune promesse d'e-mail immédiat", () => {
    const html = rendre(undefined, []);
    expect(html).not.toContain("Urgences : e-mail immédiat");
    expect(html).not.toContain("Un passage automatique constate les urgences");
    expect(html).toContain("Relais non configuré : aucune alerte e-mail ne part.");
  });

  it("signale les adresses invalides ignorées", () => {
    const html = rendre("relais@example.com, pas-une-adresse", [passage({})]);
    expect(html).toContain("vers 1 adresse : re•••is@example.com.");
    expect(html).toContain("1 adresse du réglage est invalide ou en trop et a été ignorée.");
    expect(html).not.toContain("pas-une-adresse");
  });

  it("montre la date et le résultat du dernier passage, et du dernier e-mail envoyé", () => {
    const html = rendre("relais@example.com, second@example.org", [
      passage({ jour: "2026-10-15", statut: "rien_a_signaler", commence_le: "2026-10-15T03:00:05Z", termine_le: "2026-10-15T03:00:07Z" }),
      passage({ jour: "2026-10-14", statut: "envoye", envoyes: 2, points: 3, commence_le: "2026-10-14T03:00:05Z", termine_le: "2026-10-14T03:00:09Z" }),
    ]);
    expect(html).toContain("Dernier passage : 15/10/2026 05:00 — rien à signaler, aucun e-mail envoyé.");
    expect(html).toContain("Dernier e-mail envoyé : 14/10/2026 05:00 — e-mail envoyé à 2 adresses (3 points signalés).");
  });

  it("dit un échec, un envoi partiel et un relais non configuré tels qu'ils ont été consignés", () => {
    expect(rendre("relais@example.com", [passage({ statut: "echec", points: 1 })])).toContain("échec de l’envoi : aucun e-mail confirmé (1 point signalé)");
    expect(rendre("relais@example.com", [passage({ statut: "envoi_partiel", envoyes: 1, destinataires: 2, points: 2 })]))
      .toContain("e-mail envoyé à 1 adresse sur 2 ; les autres envois ont échoué (2 points signalés)");
    expect(rendre("relais@example.com", [passage({ statut: "non_configure", points: 1 })])).toContain("relais non configuré, aucun e-mail envoyé");
  });

  it("un e-mail de 5 h parti pour le seul rappel des urgences ne dit pas « 0 point » (décision du 15/10)", () => {
    expect(rendre("relais@example.com", [passage({ statut: "envoye", envoyes: 1, points: 0, compteurs: { urgences_24h: 2 } })]))
      .toContain("e-mail envoyé à 1 adresse (rappel de 2 urgences des dernières 24 h)");
    expect(rendre("relais@example.com", [passage({ statut: "envoye", envoyes: 1, points: 3, compteurs: { urgences_24h: 1 } })]))
      .toContain("e-mail envoyé à 1 adresse (3 points signalés, 1 urgence rappelée)");
  });

  it("configuré mais sans passage depuis plus de 26 h : le dit", () => {
    expect(rendre("relais@example.com", [passage({ commence_le: recent(30), termine_le: recent(30) })])).toContain("Aucun passage du relais depuis plus de 26 heures");
    expect(rendre("relais@example.com", [])).toContain("Aucun passage du relais depuis plus de 26 heures");
    expect(rendre("relais@example.com", [passage({})])).not.toContain("depuis plus de 26 heures");
  });

  it("registre illisible : le dit plutôt que d'afficher « aucun passage »", () => {
    const html = rendre("relais@example.com", null);
    expect(html).toContain("Le dernier passage du relais n’a pas pu être lu.");
    expect(html).not.toContain("Aucun passage du relais enregistré");
  });
});

describe("l'écran Santé et l'alerte e-mail du relais", () => {
  function client() {
    return {
      rpc: async () => ({data:null,error:null}),
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "like", "in", "is", "gte", "order", "limit", "eq"]) q[m] = () => q;
        q.maybeSingle = () => Promise.resolve({ data: { valeurs: {}, revision: 1 }, error: null });
        q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
        return q;
      },
    };
  }

  // Relecture du 15/10 : l'écran ne présente plus « deux e-mails d'alerte » comme les seuls ; il nomme les trois envois réels.
  it("relais non configuré : les trois e-mails d'alerte sont nommés, et les deux du relais disent qu'ils ne partent pas", async () => {
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "");
    mocks.createClient.mockResolvedValue(client());
    const html = renderToStaticMarkup(await PageSante());
    expect(html).toContain("Cet écran ne prévient personne");
    expect(html).toContain("Gerimmo envoie trois e-mails d’alerte : le veto d’une publication marketing, au superviseur, avant sa parution ; l’alerte quotidienne du relais, à 5 h (heure de Paris), et l’e-mail immédiat des urgences du mode vacances, qui ne partent pas : le relais n’est pas configuré, aucune tâche en échec n’est signalée par e-mail.");
    expect(html).not.toContain("Le seul e-mail d’alerte de Gerimmo");
    expect(html).not.toContain("L’autre e-mail d’alerte");
  });

  it("relais configuré : les trois envois, 5 h (heure de Paris), le délai de l'e-mail immédiat, le nombre d'adresses, masquées", async () => {
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.com,second@example.org");
    mocks.createClient.mockResolvedValue(client());
    const html = renderToStaticMarkup(await PageSante());
    expect(html).toContain("Gerimmo envoie trois e-mails d’alerte : le veto d’une publication marketing, au superviseur, avant sa parution ; l’alerte quotidienne du relais, à 5 h (heure de Paris), qui signale aussi les tâches en échec ou absentes sur les dernières 24 h ; et l’e-mail immédiat des urgences du mode vacances, au plus 11 minutes après l’événement. Ces deux derniers partent vers 2 adresses : re•••is@example.com, se•••nd@example.org.");
    expect(html).not.toContain("L’autre e-mail d’alerte");
    expect(html).not.toContain("relais@example.com");
    expect(html).toContain("/admin/relais#alerte-email");
  });
});
