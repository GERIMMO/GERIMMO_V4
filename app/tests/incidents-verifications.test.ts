import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionDuJour } from "@/lib/actions-du-jour";
import { chargerIncidentsVerifications, type IncidentVerification } from "@/lib/incidents-verifications";
import { fauxClient, table } from "./faux-postgrest";

const orgId = "11111111-1111-4111-8111-111111111111";
const id = (numero: number) => `00000000-0000-4000-8000-${String(numero).padStart(12, "0")}`;
const incident = (numero: number, patch: Partial<IncidentVerification> = {}) => ({
  id: id(numero), organization_id: orgId, etat: "declare", categorie: "plomberie_canalisation",
  description: "Fuite sous l'évier", imputation: null, imputation_justification: null,
  imputation_contestation: null, declarant_person_id: id(999), ...patch,
});
const alerte = (incidentId: unknown): ActionDuJour => ({
  cle: `alerte-${String(incidentId)}`, source: "alerte", type: "incident_a_qualifier",
  nature: "Incident", criticite: "normale", titre: "Incident à qualifier", detail: null,
  echeance: null, href: null, alerte: {
    id: "alerte", type: "incident_a_qualifier", criticite: "normale", titre: "Incident à qualifier",
    echeance: null, created_at: "2026-10-26T10:00:00Z", assignee_account_id: null,
    assigned_all: true, escalades: null, details: { incident_id: incidentId },
  },
});
const lire = (db: ReturnType<typeof fauxClient>, actions: ActionDuJour[]) =>
  chargerIncidentsVerifications(db as unknown as SupabaseClient, orgId, actions);

describe("incidents ouverts depuis les vérifications du propriétaire", () => {
  it("ne lit rien sans identifiant valide ni pour les autres sources", async () => {
    const db = fauxClient({});
    const lecture = vi.spyOn(db, "from");
    const autre: ActionDuJour = {
      cle: "bail", source: "bail", nature: "Bail", criticite: "normale", titre: "Bail à vérifier",
      detail: null, echeance: null, href: `/espace/${orgId}/baux/${id(1)}`,
    };
    const actions = [autre, ...[null, undefined, "", "intrus", 42, { id: id(1) }].map(alerte)];
    expect(await lire(db, actions)).toEqual({ incidents: new Map(), indisponible: false });
    expect(await lire(db, [])).toEqual({ incidents: new Map(), indisponible: false });
    expect(lecture).not.toHaveBeenCalled();
  });

  it("relit l'état courant et filtre à la fois l'organisation et les dossiers demandés", async () => {
    const courant = incident(1, {
      etat: "qualifie", imputation: "proprietaire", imputation_justification: "Canalisation vétuste",
      imputation_contestation: "Je demande une vérification",
    });
    const db = fauxClient({ incidents: table("incidents", [
      courant, incident(2), { ...incident(3), organization_id: "autre-organisation" },
    ]) });
    const resultat = await lire(db, [alerte(id(1)), alerte(id(3))]);
    const { organization_id: _organisation, ...attendu } = courant;
    expect(resultat.incidents).toEqual(new Map([[id(1), attendu]]));
    expect(resultat.indisponible).toBe(true);
    expect(resultat.incidents.has(id(2))).toBe(false);
    expect(resultat.incidents.has(id(3))).toBe(false);
  });

  it("ne charge qu'une fois un dossier partagé par plusieurs alertes", async () => {
    const db = fauxClient({ incidents: table("incidents", [incident(1)]) });
    const lecture = vi.spyOn(db, "from");
    const resultat = await lire(db, Array.from({ length: 110 }, () => alerte(id(1))));
    expect(resultat.incidents.size).toBe(1);
    expect(resultat.indisponible).toBe(false);
    expect(lecture).toHaveBeenCalledExactlyOnceWith("incidents");
  });

  it("signale un dossier supprimé ou inaccessible sans inventer d'état exploitable", async () => {
    const db = fauxClient({ incidents: table("incidents", []) });
    expect(await lire(db, [alerte(id(1))])).toEqual({ incidents: new Map(), indisponible: true });
  });

  it("conserve tous les dossiers d'un portefeuille dépassant un lot de lecture", async () => {
    const lignes = Array.from({ length: 205 }, (_, index) => incident(index + 1));
    const db = fauxClient({ incidents: table("incidents", lignes) });
    const lecture = vi.spyOn(db, "from");
    const resultat = await lire(db, lignes.map(ligne => alerte(ligne.id)));
    expect(resultat.incidents.size).toBe(205);
    expect(resultat.indisponible).toBe(false);
    expect(lecture).toHaveBeenCalledTimes(3);
    expect([...resultat.incidents.keys()]).toEqual(lignes.map(ligne => ligne.id));
  });

  it("rend un état indisponible en cas d'erreur de lecture", async () => {
    const db = fauxClient({ incidents: table("incidents", [incident(1)], "lecture refusée") });
    expect(await lire(db, [alerte(id(1))])).toEqual({ incidents: new Map(), indisponible: true });
  });

  it("rend un état indisponible après une exception réseau", async () => {
    const db = fauxClient({});
    vi.spyOn(db, "from").mockImplementation(() => { throw new Error("réseau indisponible"); });
    expect(await lire(db, [alerte(id(1))])).toEqual({ incidents: new Map(), indisponible: true });
  });

  it("écarte une lecture partielle si un lot suivant échoue", async () => {
    const lignes = Array.from({ length: 101 }, (_, index) => incident(index + 1));
    const db = fauxClient({ incidents: table("incidents", lignes) });
    const lecteur = db.from;
    let appels = 0;
    vi.spyOn(db, "from").mockImplementation(nom => {
      if (++appels > 1) throw new Error("connexion interrompue");
      return lecteur(nom);
    });
    expect(await lire(db, lignes.map(ligne => alerte(ligne.id))))
      .toEqual({ incidents: new Map(), indisponible: true });
  });
});
