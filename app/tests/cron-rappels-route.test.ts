/**
 * La route de rappel de rendez-vous — ses verrous, et ce que chacun lit (18/09).
 *
 * Comme les deux autres tâches, elle porte la clé `service_role`. On vérifie
 * qu'elle REFUSE de tourner quand un réglage manque, et que le message n'écrit
 * pas la même chose au locataire, qui doit être là, et à l'artisan, qui doit
 * venir.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/cron/rappels/route";
import {
  corpsRappel,
  sujetRappel,
  jourDuRendezVous,
  heureDuRendezVous,
  creneauEnToutesLettres,
  type Rappel,
} from "../src/lib/rappel-email";
import { proxy } from "../src/proxy";

const SECRET = "secret-de-recette-suffisamment-long";

function appel(entete?: string): Request {
  return new Request("https://exemple.fr/api/cron/rappels", {
    headers: entete ? { authorization: entete } : {},
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("la route refuse plutôt que de s'ouvrir", () => {
  it("sans CRON_SECRET, elle ne tourne pas du tout", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const r = await GET(appel(`Bearer ${SECRET}`));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ erreur: expect.stringContaining("CRON_SECRET") });
  });

  it("sans en-tête, ou avec le mauvais secret : 401", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(appel())).status).toBe(401);
    expect((await GET(appel("Bearer faux"))).status).toBe(401);
    expect((await GET(appel(`Bearer ${"x".repeat(SECRET.length)}`))).status).toBe(401);
    expect((await GET(appel(SECRET))).status).toBe(401);
  });

  it("avec le bon secret mais sans clé de service, elle s'arrête aussi", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const r = await GET(appel(`Bearer ${SECRET}`));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({
      erreur: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"),
    });
  });
});

describe("les tâches attendent un accord individuel", () => {
  it("/api/cron/rappels ne part pas vers /connexion", async () => {
    const r = await proxy(new NextRequest("https://exemple.fr/api/cron/rappels"));
    expect(r.status).toBe(403);
    expect(r.headers.get("location")).toBeNull();
  });
});

describe("l'heure est dite à Paris, pas en UTC", () => {
  it("un rendez-vous de 9 h à Paris se lit 9 h, même en heure d'été", async () => {
    // 07:00 UTC en juillet = 9 h à Paris. Dit en UTC, le locataire arriverait
    // deux heures trop tôt.
    expect(heureDuRendezVous("2026-07-06T07:00:00Z")).toBe("09 h 00");
    // Et en heure d'hiver, 08:00 UTC = 9 h.
    expect(heureDuRendezVous("2026-12-07T08:00:00Z")).toBe("09 h 00");
  });

  it("le jour porte son nom de semaine", () => {
    expect(jourDuRendezVous("2026-07-06T07:00:00Z")).toBe("lundi 6 juillet");
  });

  it("le créneau se dit en entier, ou à défaut par son début", () => {
    expect(creneauEnToutesLettres("2026-07-06T07:00:00Z", "2026-07-06T09:00:00Z")).toBe(
      "de 09 h 00 à 11 h 00"
    );
    expect(creneauEnToutesLettres("2026-07-06T07:00:00Z")).toBe("à 09 h 00");
    expect(creneauEnToutesLettres("2026-07-06T07:00:00Z", null)).toBe("à 09 h 00");
  });
});

describe("chacun lit ce qui le concerne", () => {
  const base: Rappel = {
    echeance: "veille",
    destinataire: "locataire",
    prenom: "Marc",
    emetteur: "Agence Test",
    artisan: "Plomberie Durand",
    lot: "Lot 3 — 2e gauche",
    adresseBien: "9 rue du Rappel",
    debutPrevu: "2026-07-06T07:00:00Z",
    finPrevue: "2026-07-06T09:00:00Z",
    incidentNumero: "INC-RAPPEL-001",
    categorie: "plomberie_canalisation",
  };

  it("au locataire : être là, et quoi faire s'il ne peut pas", () => {
    const html = corpsRappel(base);
    expect(html).toMatch(/permettre l'accès/i);
    expect(html).toContain("Plomberie Durand");
    // On ne lui parle pas du numéro de dossier : ce n'est pas sa question.
    expect(html).not.toContain("INC-RAPPEL-001");
  });

  it("à l'artisan : où aller, quel désordre, quel dossier", () => {
    const html = corpsRappel({ ...base, destinataire: "artisan", prenom: null });
    expect(html).toContain("9 rue du Rappel");
    expect(html).toContain("INC-RAPPEL-001");
    expect(html).toMatch(/fiabilité/i);
    // Et on ne lui demande pas de donner accès à son propre logement.
    expect(html).not.toMatch(/permettre l'accès/i);
  });

  it("« demain » n'est écrit que la veille", () => {
    // À J-7, « demain » serait faux d'une semaine : le jour est alors nommé.
    expect(corpsRappel(base)).toMatch(/<strong>demain<\/strong>/);
    const j7 = corpsRappel({ ...base, echeance: "j7" });
    expect(j7).not.toMatch(/<strong>demain<\/strong>/);
    expect(j7).toContain("lundi 6 juillet");
  });

  it("le sujet distingue les deux échéances", () => {
    expect(sujetRappel(base)).toMatch(/demain/i);
    expect(sujetRappel({ ...base, echeance: "j7" })).toBe("Intervention prévue lundi 6 juillet");
  });
});
