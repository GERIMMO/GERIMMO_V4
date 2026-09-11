/**
 * Les créneaux du locataire : conversion d'une demi-journée en deux instants.
 *
 * Pourquoi ce fichier existe : le locataire donne « le 25 octobre, matin »,
 * l'application écrit deux `timestamptz` en base. Entre les deux il y a un
 * fuseau — et deux fois par an, une bascule d'heure. Un décalage d'une heure
 * ne casse rien de visible : il envoie simplement l'artisan une heure trop tôt
 * ou trop tard chez quelqu'un. C'est le genre de défaut qu'aucun test d'écran
 * n'attrape.
 */
import { describe, expect, it } from "vitest";
import {
  CRENEAUX_MINIMUM,
  DEMI_JOURNEES,
  demiJournee,
  instantParis,
} from "@/app/locataire/[orgId]/demandes/creneaux";

describe("Créneaux proposés par le locataire", () => {
  it("RM-10.2.2 : trois créneaux, c'est le minimum, et il est dit au même endroit", () => {
    expect(CRENEAUX_MINIMUM).toBe(3);
  });

  it("deux demi-journées, chacune avec un début avant sa fin", () => {
    expect(DEMI_JOURNEES).toHaveLength(2);
    for (const d of DEMI_JOURNEES) {
      expect(d.debut < d.fin).toBe(true);
    }
    expect(demiJournee("matin")?.debut).toBe("08:00");
    expect(demiJournee("apres_midi")?.fin).toBe("18:00");
    expect(demiJournee("nuit")).toBeUndefined();
  });

  it("l'été (UTC+2) : 8 h à Paris, c'est 6 h UTC", () => {
    expect(instantParis("2026-07-15", "08:00")).toBe("2026-07-15T06:00:00.000Z");
    expect(instantParis("2026-07-15", "14:00")).toBe("2026-07-15T12:00:00.000Z");
  });

  it("l'hiver (UTC+1) : la même heure murale, un instant différent", () => {
    expect(instantParis("2026-12-15", "08:00")).toBe("2026-12-15T07:00:00.000Z");
    expect(instantParis("2026-12-15", "18:00")).toBe("2026-12-15T17:00:00.000Z");
  });

  it("le jour même de la bascule d'heure d'hiver (25 octobre 2026)", () => {
    // Le changement a lieu à 3 h du matin : le matin proposé est déjà en
    // heure d'hiver, l'après-midi aussi.
    expect(instantParis("2026-10-25", "08:00")).toBe("2026-10-25T07:00:00.000Z");
    expect(instantParis("2026-10-24", "08:00")).toBe("2026-10-24T06:00:00.000Z");
  });

  it("une saisie qui n'est pas une date rend null plutôt qu'un instant faux", () => {
    expect(instantParis("", "08:00")).toBeNull();
    expect(instantParis("25/10/2026", "08:00")).toBeNull();
    expect(instantParis("2026-10-25", "8h")).toBeNull();
  });
});
