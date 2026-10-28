import { CATEGORIES_FOURNITURE, TYPES_COMPTEUR, indexEnMillUnites } from "./consommations";
import { lireMontantFacultatif } from "./saisie-montant";

export function texteConso(f: FormData, cle: string, max = 150) {
  const v = String(f.get(cle) ?? "").trim();
  if (v.length > max) throw new Error("Une information est trop longue.");
  return v;
}
export function dateConso(v: string, obligatoire = true) {
  if (!v && !obligatoire) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new Error("Vérifiez les dates indiquées.");
  return v;
}
export function centsConso(f: FormData, cle: string, obligatoire = false) {
  const v = lireMontantFacultatif(f.get(cle));
  if ("erreur" in v) throw new Error(v.erreur);
  if (v.montant === null && obligatoire) throw new Error("Indiquez le montant de la facture.");
  return v.montant === null ? null : Math.round(v.montant * 100);
}
export function frequenceConso(f: FormData) {
  const n = Number(texteConso(f, "periodicite_mois") || 1);
  if (![1, 2, 3, 6, 12].includes(n)) throw new Error("Choisissez une fréquence proposée.");
  return n;
}
export function saisieCompteur(f: FormData, aujourdHui: string) {
  const type = texteConso(f, "type") as keyof typeof TYPES_COMPTEUR;
  if (!(type in TYPES_COMPTEUR)) throw new Error("Choisissez le type de compteur.");
  const index = texteConso(f, "index_initial").replace(",", ".");
  indexEnMillUnites(index);
  const date = dateConso(texteConso(f, "date_index_initial"))!;
  const prochaine = dateConso(texteConso(f, "prochaine_demande"))!;
  if (date > aujourdHui) throw new Error("Le relevé de départ ne peut pas être dans le futur.");
  if (prochaine <= date) throw new Error("La prochaine demande doit suivre le relevé de départ.");
  const unite = texteConso(f, "unite") || (type.startsWith("eau") ? "m3" : "kwh");
  if (!["m3", "kwh"].includes(unite)) throw new Error("Vérifiez l’unité du compteur.");
  return { type, unite, libelle: texteConso(f, "libelle", 120) || TYPES_COMPTEUR[type], numero: texteConso(f, "numero", 120) || null,
    emplacement: texteConso(f, "emplacement", 500) || null, index_initial: index, date_index_initial: date,
    periodicite_mois: frequenceConso(f), prochaine_demande: prochaine };
}
export function saisieContrat(f: FormData) {
  const categorie = texteConso(f, "categorie") as keyof typeof CATEGORIES_FOURNITURE;
  const fournisseur = texteConso(f, "fournisseur");
  if (!(categorie in CATEGORIES_FOURNITURE) || !fournisseur) throw new Error("Indiquez le fournisseur et le type de contrat.");
  const preavis = Number(texteConso(f, "preavis_jours") || 30);
  if (!Number.isInteger(preavis) || preavis < 0 || preavis > 366) throw new Error("Le préavis doit être compris entre 0 et 366 jours.");
  return { fournisseur, categorie, reference: texteConso(f, "reference") || null, montant_cents: centsConso(f, "montant"),
    periodicite_mois: frequenceConso(f), echeance: dateConso(texteConso(f, "echeance"), false), preavis_jours: preavis };
}
export function saisieFacture(f: FormData) {
  const reference = texteConso(f, "reference");
  const debut = dateConso(texteConso(f, "periode_debut"))!;
  const fin = dateConso(texteConso(f, "periode_fin"))!;
  if (!reference || fin < debut) throw new Error("Vérifiez la référence et la période de la facture.");
  const total = centsConso(f, "total", true)!;
  const fixes = centsConso(f, "frais_fixes") ?? 0;
  const gestion = centsConso(f, "frais_gestion") ?? 0;
  if (fixes + gestion > total) throw new Error("Les frais ne peuvent pas dépasser le total.");
  const unite = texteConso(f, "unite_consommation");
  if (unite && !["m3", "kwh"].includes(unite)) throw new Error("Vérifiez l’unité de consommation.");
  const conso = texteConso(f, "consommation").replace(",", ".");
  if (conso) indexEnMillUnites(conso);
  return { reference, periode_debut: debut, periode_fin: fin, total_cents: total, frais_fixes_cents: fixes,
    frais_gestion_cents: gestion, unite_consommation: unite || null, consommation: conso || null, date_echeance: dateConso(texteConso(f, "date_echeance"), false) };
}
