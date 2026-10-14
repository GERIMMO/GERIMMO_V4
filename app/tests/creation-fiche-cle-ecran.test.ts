/**
 * Décision D31 (PR178-A-03) côté écran : après une réponse perdue à la création d'une fiche, le bouton ne reste plus
 * désactivé pour toujours. La demande porte une clé (`creation_id`) conservée avec la copie locale ; la renvoyer est sans
 * risque de doublon. Une copie d'avant cette décision (création incertaine, aucune clé) garde l'ancienne protection.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enregistrerFicheAvecJustificatifs, type BilanCreationFiche, type JustificatifPrepare } from "../src/lib/creation-fiche-personne";
import { validerBrouillonPersonne } from "../src/lib/brouillons-personne-incident";

afterEach(() => vi.unstubAllGlobals());

const CLE = "7f1d6c7e-9b0a-4a54-8f31-0c2f4a6d9a10";
const FICHE = "3c1d7a52-1f0e-4f6b-8d2b-5b9a2f4e6c11";
const avecCle = () => { const f = new FormData(); f.set("nom", "Martin"); f.set("creation_id", CLE); return f; };
const demande: JustificatifPrepare = { id: "demande", type: "justificatif", titre: "Domicile", mode: "demande" };

function banc() {
  const memoires: BilanCreationFiche[] = [];
  return {
    memoires,
    memoriser: async (b: BilanCreationFiche) => { memoires.push(structuredClone(b)); },
    deposer: vi.fn(),
    demander: vi.fn().mockResolvedValue({ succes: "Demande préparée." }),
  };
}

describe("D31 : renvoyer après une réponse perdue", () => {
  it("avec la clé, le renvoi n'est plus bloqué et rejoue la même demande", async () => {
    vi.stubGlobal("location", { href: "https://exemple.test/agence/1/personnes" });
    vi.stubGlobal("fetch", async () => ({ type: "basic", status: 200 }));
    const b = banc();
    const creer = vi.fn()
      .mockRejectedValueOnce(new Error("réseau coupé"))
      .mockResolvedValueOnce({ succes: "Fiche créée.", personneCreee: { id: FICHE } });

    const premier = await enregistrerFicheAvecJustificatifs("org", avecCle(), [demande], {}, { ...b, creer });
    expect(premier.creationIncertaine).toBe(true);
    expect(premier.erreur).toMatch(/relancer l’envoi/);
    expect(premier.erreur).toMatch(/ne sera pas créée une seconde fois/);

    const reprise = await enregistrerFicheAvecJustificatifs("org", avecCle(), [demande], premier, { ...b, creer });
    expect(creer).toHaveBeenCalledTimes(2);
    // Les deux envois portent la MÊME clé : c'est ce qui permet au serveur de retrouver la fiche.
    expect((creer.mock.calls[0][2] as FormData).get("creation_id")).toBe(CLE);
    expect((creer.mock.calls[1][2] as FormData).get("creation_id")).toBe(CLE);
    expect(reprise.personneCreee?.id).toBe(FICHE);
    expect(reprise.creationIncertaine).toBeUndefined();
    expect(reprise.terminee).toBe(true);
    expect(b.demander).toHaveBeenCalledTimes(1);
  });

  it("sans clé, une copie déjà marquée incertaine garde l'ancienne protection : rien n'est renvoyé", async () => {
    const b = banc();
    const creer = vi.fn();
    const f = new FormData(); f.set("nom", "Martin");
    const bilan = await enregistrerFicheAvecJustificatifs("org", f, [], { creationIncertaine: true }, { ...b, creer });
    expect(bilan.erreur).toMatch(/Vérifiez la liste des fiches/);
    expect(creer).not.toHaveBeenCalled();
  });

  it("une demande dont les informations ont changé depuis est refusée : aucun justificatif n'est envoyé, la marque d'incertitude est levée", async () => {
    const b = banc();
    const creer = vi.fn().mockResolvedValue({
      erreur: "Cette demande a déjà créé la fiche avec les informations précédentes. Ouvrez la fiche enregistrée pour y reporter vos modifications.",
      ficheExistante: { id: FICHE },
    });
    const bilan = await enregistrerFicheAvecJustificatifs("org", avecCle(), [demande], { creationIncertaine: true }, { ...b, creer });
    expect(bilan.ficheExistante?.id).toBe(FICHE);
    expect(bilan.personneCreee).toBeUndefined();
    expect(bilan.creationIncertaine).toBeUndefined();
    expect(b.demander).not.toHaveBeenCalled();
    expect(b.memoires.at(-1)?.creationIncertaine).toBeUndefined();
  });

  it("une session expirée garde son message dédié, avec ou sans clé", async () => {
    vi.stubGlobal("location", { href: "https://exemple.test/agence/1/personnes" });
    vi.stubGlobal("fetch", async () => ({ type: "opaqueredirect" }));
    const b = banc();
    const bilan = await enregistrerFicheAvecJustificatifs("org", avecCle(), [], {}, { ...b, creer: vi.fn().mockRejectedValue(new Error("redirigé")) });
    expect(bilan.creationIncertaine).toBeUndefined();
    expect(bilan.erreur).toMatch(/session/i);
  });
});

describe("D31 : la clé suit la copie locale", () => {
  const copie = (extra: Record<string, unknown> = {}) => ({
    role: "locataire", morale: false, etape: 4, lotId: "",
    valeurs: Object.fromEntries(["nom", "prenom", "date_naissance", "commune_naissance", "email", "telephone", "address_line1", "postal_code", "city"].map((k) => [k, "test"])),
    pieces: [], bilan: { creationIncertaine: true }, ...extra,
  });

  it("garde la clé de la demande à la relecture", () => {
    expect(validerBrouillonPersonne(copie({ creationId: CLE }))?.creationId).toBe(CLE);
  });

  it("accepte une copie d'avant la décision (sans clé)", () => {
    const reprise = validerBrouillonPersonne(copie());
    expect(reprise).not.toBeNull();
    expect(reprise?.creationId).toBeUndefined();
  });

  it("refuse une clé qui n'est pas un identifiant", () => {
    expect(validerBrouillonPersonne(copie({ creationId: "pas-un-uuid" }))).toBeNull();
  });

  it("garde la fiche existante désignée par le serveur dans le bilan", () => {
    expect(validerBrouillonPersonne(copie({ creationId: CLE, bilan: { ficheExistante: { id: FICHE }, erreur: "x" } }))?.bilan.ficheExistante?.id).toBe(FICHE);
  });
});

describe("D31 : l'écran", () => {
  const source = readFileSync(resolve(__dirname, "../src/app/agence/[orgId]/personnes/formulaire-personne.tsx"), "utf8");

  it("n'ouvre plus le bouton « Créer la fiche » à tous les cas : il ne se ferme que sans clé", () => {
    expect(source).not.toMatch(/BoutonEnvoi disabled=\{etat\.creationIncertaine\}/);
    expect(source).toMatch(/const envoiBloque = Boolean\(etat\.creationIncertaine\) && !creationId;/);
    expect(source).toMatch(/<BoutonEnvoi disabled=\{envoiBloque\}/);
  });

  it("envoie la clé avec la demande et la conserve dans la copie locale", () => {
    expect(source).toMatch(/name="creation_id" value=\{creationId\}/);
    expect(source).toMatch(/useMemo\(\(\) => \(\{ role: role as BrouillonPersonne\["role"\], morale, etape, valeurs, pieces, lotId, creationId \}\)/);
  });

  it("une copie d'avant la décision, déjà marquée incertaine, ne reçoit pas de clé neuve", () => {
    expect(source).toMatch(/initial\?\.creationId \?\? \(initial\?\.bilan\.creationIncertaine \? undefined : crypto\.randomUUID\(\)\)/);
  });
});
