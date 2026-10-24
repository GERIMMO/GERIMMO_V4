import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FileDecisions } from "../../../src/app/admin/brief/file-decisions";
import type { DecisionDeFile } from "../../../src/lib/decisions-attendues";
import type { DecisionAffichee } from "../../../src/app/admin/brief/decision-matin";

const decisions: DecisionDeFile[] = [
  ...Array.from({ length: 30 }, (_, i) => ({ cle: `veille:${i}`, titre: `Actualité ${i + 1} — Révision du loyer`, pourquoi: "Une proposition à relire avant diffusion.", source: "veille" as const, source_id: String(i), lien: "/admin/veille", equipe: "conformite" })),
  ...["Envoi au responsable", "Compte rendu"].map((titre, i) => ({ cle: `retour:${i}`, titre, pourquoi: "Un signalement client attend une prise en charge.", source: "retour" as const, source_id: String(i), lien: "/admin/retours?nature=bug", equipe: "qualite" })),
  { cle: "artisan:1", titre: "Vérifier les justificatifs de l’artisan", pourquoi: "Relire les justificatifs.", source: "artisan", source_id: "1", lien: "/admin/artisans", equipe: "incidents" },
  { cle: "publication:1", titre: "Publier un article", pourquoi: "Relire le texte.", source: "publication", source_id: "1", lien: "/admin/marketing", equipe: "marketing" },
];
const cartes: DecisionAffichee[] = decisions.map(d => ({ ...d, id: d.cle, options: [], recommandation: null, statut: "en_attente", motif: null, decide_le: null, validation: true, refus: d.source !== "retour", attestation: d.source === "artisan" ? "J’ai relu les justificatifs." : null }));
const p = new URLSearchParams(location.search);
createRoot(document.getElementById("racine")!).render(<StrictMode><main><h1>Bureau de direction</h1><section><h2>Demandes à examiner</h2><FileDecisions decisions={decisions} signaux={[]} cartes={cartes} vue={p.get("vue") === "decisions" ? "decisions" : "bureau"} categorie={p.get("categorie") ?? undefined} indisponible={p.has("indisponible")} /></section></main></StrictMode>);
