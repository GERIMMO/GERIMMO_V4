"use server";
import { jourValide } from "@/lib/presentation-document";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { aujourdhuiParis } from "@/lib/ged";
import { estUuid } from "@/lib/identifiants";

export type EtatQualificationDiagnostic = {
  erreur?: string;
  succes?: string;
  valeurs?: Record<string, string>;
};

export async function enregistrerQualificationDiagnostic(
  orgId: string,
  bienId: string,
  lotId: string,
  _etat: EtatQualificationDiagnostic,
  formData: FormData,
): Promise<EtatQualificationDiagnostic> {
  const type = String(formData.get("type") ?? "");
  const situation = String(formData.get("situation") ?? "");
  const date = String(formData.get("date_installation") ?? "").trim();
  const annee = String(formData.get("annee_installation") ?? "").trim();
  const valeurs = { type, situation, date_installation: date, annee_installation: annee };
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé.", valeurs };
  if (![orgId, bienId, lotId].every(estUuid)) return { erreur: "Ce lot est introuvable.", valeurs };
  if (type !== "electricite" && type !== "gaz") return { erreur: "Diagnostic non reconnu.", valeurs };
  if (!["plus_15_ans", "date_connue", "annee_connue", "absente", "inconnue"].includes(situation)
    || (situation === "absente" && type !== "gaz")) {
    return { erreur: "Choisissez la situation de cette installation.", valeurs };
  }
  let dateInstallation: string | null = null;
  let anneeInstallation: number | null = null;
  if (situation === "date_connue") {
    if (!jourValide(date) || date < "1800-01-01" || date > aujourdhuiParis()) {
      return { erreur: "Indiquez une date d’installation valide, au plus tard aujourd’hui.", valeurs };
    }
    dateInstallation = date;
  }
  if (situation === "annee_connue") {
    const anneeActuelle = Number(aujourdhuiParis().slice(0, 4));
    if (!/^\d{4}$/.test(annee) || Number(annee) < 1800 || Number(annee) > anneeActuelle) {
      return { erreur: `Indiquez une année d’installation entre 1800 et ${anneeActuelle}.`, valeurs };
    }
    anneeInstallation = Number(annee);
  }

  try {
    const { data: lot, error: erreurLot } = await supabase.from("lots")
      .select("id").eq("id", lotId).eq("bien_id", bienId).eq("organization_id", orgId).maybeSingle();
    if (erreurLot) return { erreur: "Le lot n’a pas pu être vérifié. Réessayez.", valeurs };
    if (!lot) return { erreur: "Ce lot est introuvable ou inaccessible.", valeurs };

    const { data, error } = await supabase.from("qualifications_diagnostics_lot")
      .upsert({ organization_id: orgId, lot_id: lotId, type, situation, date_installation: dateInstallation, annee_installation: anneeInstallation },
        { onConflict: "organization_id,lot_id,type" })
      .select("type").single();
    if (error || !data) return { erreur: "La réponse n’a pas pu être enregistrée. Réessayez.", valeurs };
  } catch {
    return { erreur: "La confirmation est indisponible. Vos choix sont conservés, réessayez.", valeurs };
  }

  for (const racine of ["espace", "agence"]) {
    revalidatePath(`/${racine}/${orgId}/parc`);
    revalidatePath(`/${racine}/${orgId}/parc/${bienId}`);
    revalidatePath(`/${racine}/${orgId}/parc/${bienId}/lots/${lotId}`);
    revalidatePath(`/${racine}/${orgId}/baux`, "layout");
  }
  return { succes: "Réponse enregistrée." };
}
