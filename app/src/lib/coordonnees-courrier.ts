import { emailValide } from "./marque-organisation";

export function adresseOuverture(form: FormData) {
  const lire = (cle: string) => String(form.get(cle) ?? "").trim();
  return { adresse: lire("adresse"), code_postal: lire("code_postal"), ville: lire("ville") };
}

export function adresseManquante(adresse: { adresse?: string; code_postal?: string; ville?: string }) {
  if (!adresse.adresse?.trim()) return "Renseignez l’adresse postale pour vos courriers.";
  if (!adresse.code_postal?.trim()) return "Renseignez le code postal pour vos courriers.";
  if (!adresse.ville?.trim()) return "Renseignez la ville pour vos courriers.";
  return null;
}

export function coordonneesCourrierIncompletes(o: { address_line1: string | null; postal_code: string | null; city: string | null; email_contact: string | null }) {
  return !o.address_line1?.trim() || !o.postal_code?.trim() || !o.city?.trim() || !emailValide(o.email_contact?.trim() || "");
}
