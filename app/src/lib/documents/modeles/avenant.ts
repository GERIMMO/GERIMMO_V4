// Avenant au bail : acte des parties qui modifie le contrat en cours sans le
// refaire — objet et modifications saisis au moment du geste (options du
// modèle), toutes les autres clauses demeurent inchangées. Cible : le bail.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Fusion,
  assemblerPage,
  cadreSignature,
  cartouches,
  echapper,
  enTete,
  faitALaSignature,
  section,
  titre,
} from "../gabarit";
import {
  chargerContexteBail,
  expediteur,
  nomPersonne,
  nomsBailleurs,
  nomsLocataires,
  adresseLogement,
  referenceCourte,
  referenceAvenant,
  liensLocataires,
} from "./communs";
import type { Assemblage } from "./index";

export function refusAvenantSelonEtat(etat: string): string | null {
  if (etat === "actif" || etat === "preavis") return null;
  if (etat === "brouillon") return "L’avenant modifie un bail signé et en cours. Ce bail est encore en préparation : modifiez directement le contrat avant sa signature, ou activez d’abord la location s’il est déjà signé.";
  if (etat === "termine") return "Ce bail est terminé : il ne se modifie plus par avenant.";
  return "L’avenant se prépare pour un bail signé et en cours (actif ou en préavis).";
}

export async function assemblerAvenant(
  supabase: SupabaseClient,
  orgId: string,
  bailId: string,
  options?: Record<string, string>
): Promise<Assemblage> {
  const ctx = await chargerContexteBail(supabase, orgId, bailId);
  if ("erreur" in ctx) return ctx;
  // Phase 3 (C06) : l'avenant modifie « le contrat de location conclu entre les parties » — un bail signé et en cours (actif
  // ou en préavis). Un brouillon n'est pas conclu ; un bail terminé ne se modifie plus. Même règle que la liste du catalogue.
  const refusEtat = refusAvenantSelonEtat(ctx.bail.etat);
  if (refusEtat) return { erreur: refusEtat };

  const f = new Fusion();
  const exp = expediteur(ctx);
  const referenceBail = referenceCourte("BAIL", ctx.bail.id);
  const plusieursLocataires = ctx.locataires.length > 1;
  const bailleurPrincipal = ctx.bailleurs[0] ?? null;

  const objetBrut = (options?.objet ?? "").trim();
  // Chaque ligne saisie devient un paragraphe de l'avenant
  const modificationsBrutes = (options?.modifications ?? "").trim();
  const paragraphesModifications = modificationsBrutes
    ? modificationsBrutes
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `<p>${echapper(l)}</p>`)
        .join("")
    : `<p>${f.champ(null, "modifications apportées au bail")}</p>`;

  const corps = `
    ${enTete(f, exp, { libelle: "Contrat", reference: referenceBail, etabliLe: new Date().toISOString() })}
    ${titre("Avenant au bail", "Modification du contrat de location", [
      "Contrat régi par la loi n° 89-462 du 6 juillet 1989",
    ])}
    ${cartouches([
      ["Bailleur", `<div>${nomsBailleurs(f, ctx.bailleurs)}</div>`],
      [plusieursLocataires ? "Locataires" : "Locataire", `<div>${nomsLocataires(f, ctx.locataires)}</div>`],
      ["Logement loué", `<div>${f.champ(adresseLogement(ctx.lot, ctx.bien), "adresse complète, étage, porte")}</div>`],
      ["Bail", `Réf. ${f.champ(referenceBail, "référence du bail")} — prise d'effet le ${f.date(ctx.bail.date_debut)}`],
    ])}
    <p>Le présent avenant modifie le contrat de location conclu entre les parties désignées
    ci-dessus, portant sur le logement désigné ci-dessus. Il en fait partie intégrante et se
    substitue, pour les seuls points qu'il traite, aux stipulations initiales du bail.</p>

    ${section("Objet de l'avenant")}
    <p>${f.champ(objetBrut || null, "objet de l'avenant")}</p>

    ${section("Il est convenu ce qui suit")}
    ${paragraphesModifications}
    <p>Toutes les autres clauses et conditions du bail demeurent inchangées et continuent de
    produire leurs effets. Le présent avenant prend effet à compter de sa signature par
    l'ensemble des parties, sauf stipulation contraire ci-dessus.</p>

    <div class="bloc-signataires">
    ${section("Date et signatures")}
    ${/* Phase 3 (C23) : l'avenant est daté par les parties en le signant, comme le bail — plus du jour de sa génération. */
      faitALaSignature(f, exp.ville, ", en autant d'exemplaires originaux que de parties.")}
    <div class="signatures">
      ${cadreSignature("Le bailleur", f.champ(nomPersonne(bailleurPrincipal), "nom et prénom(s), ou dénomination"))}
      ${cadreSignature(
        plusieursLocataires ? "Les locataires" : "Le locataire",
        ctx.locataires.map((l) => echapper(nomPersonne(l) ?? "")).join("<br/>") ||
          f.champ(null, "nom et prénom(s) du ou des locataires")
      )}
    </div>
    </div>
  `;

  const objetTronque =
    objetBrut.length > 60 ? `${objetBrut.slice(0, 60).trimEnd()}…` : objetBrut;

  return {
    document: assemblerPage({
      f,
      titreDocument: "Avenant au bail",
      nomPied: "Avenant au bail",
      // Phase 3 (C18) : une référence propre à cet avenant (date et heure de génération), plus celle du seul bail.
      reference: referenceAvenant(ctx.bail.id),
      corps,
    }),
    titreGed: objetTronque ? `Avenant — ${objetTronque}` : "Avenant au bail",
    nomFichier: `avenant-${referenceCourte("BAIL", ctx.bail.id).toLowerCase()}`,
    liens: [
      { entite: "bail", entiteId: ctx.bail.id },
      ...liensLocataires(ctx),
    ],
  };
}
