import { describe, expect, it } from "vitest";
import { extraireAnalyseBrief } from "@/lib/brief-ia";

const analyse = {
  constat: "Deux incidents critiques ouverts.",
  prochaine_action: "Examiner les signalements.",
  justification: "Le service passe avant l'acquisition.",
  inconnues: "La cause et l'impact restent inconnus.",
};

describe("brief IA consultatif", () => {
  it("lit le contenu structuré même après un autre item de sortie", () => {
    expect(extraireAnalyseBrief({ output: [
      { type: "reasoning", content: [] },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify(analyse) }] },
    ] })).toEqual(analyse);
  });

  it("rejette une réponse incomplète ou trop longue plutôt que d'afficher un verdict non vérifiable", () => {
    expect(extraireAnalyseBrief({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ ...analyse, inconnues: "" }) }] }] })).toBeNull();
    expect(extraireAnalyseBrief({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ ...analyse, constat: "x".repeat(1201) }) }] }] })).toBeNull();
    expect(extraireAnalyseBrief({ output: [{ content: [{ type: "refusal", refusal: "Non" }] }] })).toBeNull();
  });
});
