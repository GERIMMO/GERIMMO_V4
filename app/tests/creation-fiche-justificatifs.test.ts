import { describe, expect, it, vi } from "vitest";
import { enregistrerFicheAvecJustificatifs, type JustificatifPrepare } from "@/lib/creation-fiche-personne";

const depot = (): JustificatifPrepare => ({ id: "depot", type: "piece_identite", titre: "Identité", mode: "depot", fichier: new File(["%PDF-1.7\n%%EOF"], "identite.pdf", { type: "application/pdf" }) });
const demande: JustificatifPrepare = { id: "demande", type: "justificatif", titre: "Domicile", mode: "demande" };
function actions() {
  return {
    creer: vi.fn().mockResolvedValue({ succes: "Fiche créée.", personneCreee: { id: "personne" } }),
    deposer: vi.fn().mockResolvedValue({ succes: "Pièce ajoutée au dossier." }),
    demander: vi.fn().mockResolvedValue({ succes: "Demande préparée." }),
  };
}
describe("création d’une fiche avec justificatifs", () => {
  it("permet de créer la fiche sans justificatifs", async () => {
    const a = actions();
    const bilan = await enregistrerFicheAvecJustificatifs("org", new FormData(), [], {}, a);
    expect(bilan.terminee).toBe(true); expect(a.deposer).not.toHaveBeenCalled(); expect(a.demander).not.toHaveBeenCalled();
    expect(a.creer.mock.calls[0][2].get("rester_dans_parcours")).toBe("1");
  });
  it("attend la confirmation de la personne avant les dépôts et demandes", async () => {
    const a = actions(); a.creer.mockResolvedValue({ erreur: "Email déjà utilisé." });
    const bilan = await enregistrerFicheAvecJustificatifs("org", new FormData(), [depot(), demande], {}, a);
    expect(bilan.erreur).toBe("Email déjà utilisé."); expect(a.deposer).not.toHaveBeenCalled(); expect(a.demander).not.toHaveBeenCalled();
  });
  it("envoie chaque fichier séparément et rattache les opérations à la même fiche", async () => {
    const a = actions(); const p = depot(); const f = new FormData(); f.set("nom", "Test"); f.set("document", p.fichier!);
    const bilan = await enregistrerFicheAvecJustificatifs("org", f, [p, demande], {}, a);
    expect(bilan.terminee).toBe(true); expect(a.creer.mock.calls[0][2].has("document")).toBe(false);
    expect(a.deposer.mock.calls[0].slice(0,2)).toEqual(["org", "personne"]);
    expect(a.deposer.mock.calls[0][3].get("fichier")).toBe(p.fichier);
    expect(a.demander.mock.calls[0][3].get("libelle")).toBe("Domicile");
  });
  it("reprend seulement la pièce refusée sans doubler la personne ni les demandes", async () => {
    const a = actions(); a.deposer.mockResolvedValueOnce({ erreur: "Fichier incomplet." });
    const premier = await enregistrerFicheAvecJustificatifs("org", new FormData(), [depot(), demande], {}, a);
    expect(premier.personneCreee?.id).toBe("personne"); expect(premier.terminee).toBe(false);
    const reprise = await enregistrerFicheAvecJustificatifs("org", new FormData(), [depot(), demande], premier, a);
    expect(reprise.terminee).toBe(true); expect(a.creer).toHaveBeenCalledTimes(1); expect(a.demander).toHaveBeenCalledTimes(1); expect(a.deposer).toHaveBeenCalledTimes(2);
  });
  it("ne renvoie pas automatiquement une demande si sa réponse a été perdue", async () => {
    const a = actions(); a.demander.mockRejectedValue(new Error("connexion perdue"));
    const premier = await enregistrerFicheAvecJustificatifs("org", new FormData(), [demande], {}, a);
    const reprise = await enregistrerFicheAvecJustificatifs("org", new FormData(), [demande], premier, a);
    expect(reprise.terminee).toBe(false); expect(reprise.pieces?.demande.incertain).toBe(true); expect(a.demander).toHaveBeenCalledTimes(1);
  });
  it("conserve l’avertissement de notification sans recréer la demande", async () => {
    const a = actions(); a.demander.mockResolvedValue({ succes: "Demande enregistrée.", avertissement: "Email non envoyé." });
    const bilan = await enregistrerFicheAvecJustificatifs("org", new FormData(), [demande], {}, a);
    expect(bilan.terminee).toBe(true); expect(bilan.pieces?.demande.avertissement).toBe("Email non envoyé.");
  });
  it.each([
    { ...demande, titre: " " },
    { ...depot(), fichier: undefined },
    { ...depot(), fichier: new File(["test"], "test.exe") },
    { ...depot(), fichier: new File([new Uint8Array(10 * 1024 * 1024 + 1)], "grand.pdf") },
  ])("refuse une préparation invalide avant toute création", async p => {
    const a = actions(); expect((await enregistrerFicheAvecJustificatifs("org", new FormData(), [p], {}, a)).erreur).toBeTruthy(); expect(a.creer).not.toHaveBeenCalled();
  });
});
