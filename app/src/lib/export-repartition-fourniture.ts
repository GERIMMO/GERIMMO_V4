import type { RepartitionFourniture } from "./proposition-repartition";

export function csvRepartitionFourniture(r: RepartitionFourniture, lots: { id: string; nom: string }[]) {
  const euros = (n?: number) => n == null ? "" : (Number(n) / 100).toFixed(2).replace(".", ",");
  const cellule = (v: string | number) => {
    let s = String(v);
    if (/^[\s\uFEFF]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const lignes: (string | number)[][] = [
    ["Décompte", r.id, "Statut", r.statut === "validee" ? "Validé" : "Brouillon"],
    ["Empreinte de la version", r.empreinte],
    ["Facture", r.source?.facture?.reference ?? r.facture_id, "Fournisseur", r.source?.contrat?.fournisseur ?? ""],
    ["Période du", r.source?.facture?.periode_debut ?? "", "Au", r.source?.facture?.periode_fin ?? ""],
    ["Validation", r.validee_le ?? ""], [],
    ["Logement", "Bail", "Période du", "Au", "Clé variable", "Clé frais fixes", "Variable (€)", "Frais fixes (€)", "Total (€)", "À la charge de"],
    ...r.lignes.map(l => [lots.find(x => x.id === l.lot_id)?.nom ?? "Logement", l.bail_id ?? "Vacance", l.periode_debut ?? r.source?.facture?.periode_debut ?? "", l.periode_fin ?? r.source?.facture?.periode_fin ?? "", l.poids, l.poids_fixe ?? l.poids, euros(l.variable_cents), euros(l.fixe_cents), euros(l.montant_cents), l.recuperable ? "Locataire" : "Propriétaire"]),
    [], ["Écart non réparti — propriétaire (€)", euros(r.source?.ecart_non_reparti_cents ?? 0)],
    ["Frais de gestion — propriétaire (€)", euros(r.source?.frais_gestion_cents ?? 0)],
    ["Total locataires (€)", euros(r.total_recuperable_cents)], ["Total propriétaire, écarts et frais compris (€)", euros(r.total_proprietaire_cents)],
    ["Total facture (€)", euros(Number(r.total_recuperable_cents) + Number(r.total_proprietaire_cents))], ["Méthode", r.motif],
    ["Provisions", "Ce décompte ne crée pas un nouvel appel de charges. Les provisions déjà versées doivent être déduites lors de la régularisation."],
  ];
  return "\uFEFF" + lignes.map(l => l.map(cellule).join(";")).join("\r\n");
}
