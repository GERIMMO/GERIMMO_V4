import { describe, expect, it } from "vitest";
import { statutAttestationBail } from "@/lib/statut-attestation-bail";

const aujourd = "2026-10-27";

describe("État documentaire d’une attestation du bail", () => {
  it("ne confond pas absence de document et lecture impossible", () => {
    expect(statutAttestationBail(null, aujourd, aujourd)).toEqual({ libelle: "À ajouter", ton: "attention" });
    expect(statutAttestationBail(null, aujourd, aujourd, true)).toEqual({ libelle: "Indisponible", ton: "neutre" });
    expect(statutAttestationBail({ expire_le: "2027-10-27" }, aujourd, aujourd, true)).toEqual({ libelle: "Indisponible", ton: "neutre" });
  });

  it.each([null, "", "inconnue", "2026-02-30", "2026-13-01", "2026-2-03", "2026-12-01T00:00:00Z"])("ne certifie pas une couverture à partir de l’échéance %s", expire_le => {
    expect(statutAttestationBail({ expire_le }, aujourd, aujourd)).toEqual({ libelle: "Couverture à vérifier", ton: "attention" });
  });

  it("annonce un renouvellement quand la date est passée, même pour un bail déjà commencé", () => {
    expect(statutAttestationBail({ expire_le: "2026-10-26" }, aujourd, "2026-09-01")).toEqual({ libelle: "À renouveler", ton: "attention" });
  });

  it("n’annonce pas prématurément l’expiration le dernier jour de couverture", () => {
    expect(statutAttestationBail({ expire_le: aujourd }, aujourd, aujourd)).toEqual({ libelle: "Attestation déposée", ton: "ok" });
  });

  it("distingue une échéance future insuffisante pour l’entrée de l’expiration actuelle", () => {
    const piece = { expire_le: "2026-11-15" };
    expect(statutAttestationBail(piece, aujourd, aujourd).libelle).toBe("Attestation déposée");
    expect(statutAttestationBail(piece, aujourd, "2026-12-01")).toEqual({ libelle: "À renouveler avant l’entrée", ton: "attention" });
    expect(statutAttestationBail(piece, aujourd, "2026-11-15")).toEqual({ libelle: "Attestation déposée", ton: "ok" });
  });

  it("respecte les années bissextiles lors de la validation de la date", () => {
    expect(statutAttestationBail({ expire_le: "2028-02-29" }, aujourd, "2028-02-29").libelle).toBe("Attestation déposée");
    expect(statutAttestationBail({ expire_le: "2027-02-29" }, aujourd, aujourd).libelle).toBe("Couverture à vérifier");
  });

  it("qualifie le dépôt sans déclarer validées les personnes assurées ou le contenu du contrat", () => {
    const resultat = statutAttestationBail({ expire_le: "2027-12-31" }, aujourd, "2027-01-01");
    expect(resultat.libelle).toBe("Attestation déposée");
    expect(resultat.libelle).not.toMatch(/validée|conforme|couverture confirmée/i);
  });
});
