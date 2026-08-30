// Contexte partagé des modèles de documents : l'expéditeur (l'organisation),
// le bailleur (les détenteurs du lot), le locataire et le logement — les
// mêmes cartouches reviennent d'une épreuve à l'autre.

import type { SupabaseClient } from "@supabase/supabase-js";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { Fusion, type EnTeteExpediteur } from "../gabarit";

export type PersonneDocument = {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  date_naissance: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  qualite: string | null;
};

export type ContexteBail = {
  organisation: {
    name: string;
    type: string;
    address_line1: string | null;
    postal_code: string | null;
    city: string | null;
    telephone: string | null;
    email_contact: string | null;
  };
  bail: {
    id: string;
    type: string;
    etat: string;
    date_debut: string | null;
    date_fin: string | null;
    loyer_hc: number | null;
    charges: number | null;
    charges_mode: string | null;
    depot_garantie: number | null;
    jour_echeance: number;
    irl_trimestre: string | null;
    revision_irl: boolean | null;
    locataire_principal: string | null;
  };
  lot: {
    id: string;
    nom: string;
    surface_m2: number | null;
    pieces: number | null;
    etage: string | null;
    meuble: boolean;
    identifiant_fiscal: string | null;
    description: string | null;
  };
  bien: {
    id: string;
    nom: string;
    type: string;
    address_line1: string | null;
    postal_code: string | null;
    city: string | null;
    annee_construction: number | null;
    copropriete: boolean;
    zone_tendue: boolean;
    syndic_nom: string | null;
  };
  bailleurs: (PersonneDocument & { quote_part: number })[];
  locataires: PersonneDocument[]; // principal en premier, puis colocataires
  garants: (PersonneDocument & { garant_de: string | null })[];
};

export async function chargerContexteBail(
  supabase: SupabaseClient,
  orgId: string,
  bailId: string
): Promise<ContexteBail | { erreur: string }> {
  const CHAMPS_PERSONNE =
    "id, nom, prenom, email, telephone, date_naissance, address_line1, postal_code, city, qualite";

  const [{ data: organisation }, { data: bail }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, type, address_line1, postal_code, city, telephone, email_contact")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("baux")
      .select(
        `id, type, etat, date_debut, date_fin, loyer_hc, charges, charges_mode,
         depot_garantie, jour_echeance, irl_trimestre, revision_irl, locataire_principal,
         lot:lots!baux_lot_meme_org_fk(id, nom, surface_m2, pieces, etage, meuble,
           identifiant_fiscal, description,
           bien:biens!lots_bien_id_fkey(id, nom, type, address_line1, postal_code, city,
             annee_construction, copropriete, zone_tendue, syndic_nom))`
      )
      .eq("id", bailId)
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);
  if (!organisation) return { erreur: "Organisation introuvable." };
  if (!bail) return { erreur: "Bail introuvable." };

  const lot = premier(bail.lot as UnOuPlusieurs<ContexteBail["lot"] & { bien: UnOuPlusieurs<ContexteBail["bien"]> }>);
  const bien = lot ? premier(lot.bien) : null;
  if (!lot || !bien) return { erreur: "Lot introuvable pour ce bail." };

  const [{ data: detentions }, { data: bailPersonnes }, { data: principal }] = await Promise.all([
    supabase
      .from("detentions")
      .select(`quote_part, person:persons!detentions_person_id_fkey(${CHAMPS_PERSONNE})`)
      .eq("lot_id", lot.id)
      .is("date_fin", null),
    supabase
      .from("bail_personnes")
      .select(`role, garant_de, person:persons!bail_personnes_person_meme_org_fk(${CHAMPS_PERSONNE})`)
      .eq("bail_id", bailId),
    bail.locataire_principal
      ? supabase.from("persons").select(CHAMPS_PERSONNE).eq("id", bail.locataire_principal).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const bailleurs = (detentions ?? [])
    .map((d) => {
      const p = premier(d.person as UnOuPlusieurs<PersonneDocument>);
      return p ? { ...p, quote_part: Number(d.quote_part) } : null;
    })
    .filter((p): p is PersonneDocument & { quote_part: number } => p !== null);

  const locataires: PersonneDocument[] = [];
  if (principal) locataires.push(principal as PersonneDocument);
  const garants: ContexteBail["garants"] = [];
  for (const bp of bailPersonnes ?? []) {
    const p = premier(bp.person as UnOuPlusieurs<PersonneDocument>);
    if (!p) continue;
    if (bp.role === "colocataire" && p.id !== bail.locataire_principal) locataires.push(p);
    if (bp.role === "garant") garants.push({ ...p, garant_de: bp.garant_de });
  }

  return {
    organisation,
    bail: { ...bail, id: bail.id },
    lot,
    bien,
    bailleurs,
    locataires,
    garants,
  };
}

// ------------------------------------------------------------------
// Formats partagés
// ------------------------------------------------------------------
export function nomPersonne(p: { nom: string; prenom: string | null } | null | undefined): string | null {
  if (!p) return null;
  return [p.nom, p.prenom].filter(Boolean).join(" ");
}

export function adressePersonne(p: PersonneDocument | null | undefined): string | null {
  if (!p?.address_line1) return null;
  return [p.address_line1, [p.postal_code, p.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

export function adresseOrganisation(o: ContexteBail["organisation"]): string | null {
  if (!o.address_line1) return null;
  return [o.address_line1, [o.postal_code, o.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

export function adresseLogement(lot: ContexteBail["lot"], bien: ContexteBail["bien"]): string {
  const complement = [lot.nom !== "Lot unique" ? lot.nom : null, lot.etage ? `étage ${lot.etage}` : null]
    .filter(Boolean)
    .join(", ");
  return [bien.address_line1, `${bien.postal_code ?? ""} ${bien.city ?? ""}`.trim(), complement]
    .filter(Boolean)
    .join(", ");
}

// L'expéditeur de l'en-tête : l'organisation qui génère (agence ou parc du
// propriétaire) — le « Fait à » vient de sa ville.
export function expediteur(ctx: Pick<ContexteBail, "organisation">): EnTeteExpediteur & { ville: string | null } {
  return {
    nom: ctx.organisation.name,
    adresse: adresseOrganisation(ctx.organisation),
    email: ctx.organisation.email_contact,
    telephone: ctx.organisation.telephone,
    ville: ctx.organisation.city,
  };
}

// Le nom du bailleur tel que les épreuves l'affichent : les détenteurs joints
export function nomsBailleurs(f: Fusion, bailleurs: ContexteBail["bailleurs"]): string {
  return f.champ(
    bailleurs.map((b) => nomPersonne(b)).filter(Boolean).join(", ") || null,
    "nom et prénom(s), ou dénomination"
  );
}

export function nomsLocataires(f: Fusion, locataires: PersonneDocument[]): string {
  return f.champ(
    locataires.map((l) => nomPersonne(l)).filter(Boolean).join(", ") || null,
    "nom et prénom(s) du ou des locataires"
  );
}

// Référence courte et stable d'un objet (les épreuves montrent « référence »)
export function referenceCourte(prefixe: string, id: string): string {
  return `${prefixe}-${id.slice(0, 8).toUpperCase()}`;
}
