// 13 — Demande d'attestation d'assurance : rappel avant (ou après) échéance.
// Cible : le document « attestation d'assurance » qui arrive à expiration.

import type { SupabaseClient } from "@supabase/supabase-js";
import { Fusion, assemblerPage, cartouches, enTete, faitA, formaterDateFr, titre } from "../gabarit";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { adresseOrganisation, nomPersonne, referenceCourte, type PersonneDocument } from "./communs";
import type { Assemblage } from "./index";

export type DonneesRappelAssurance = {
  reference: string;
  echeance: string | null;
  expiree: boolean;
  locataireNom: string;
  logementAdresse: string | null;
  referenceBail: string | null;
  canalReponse: string | null;
  exp: { nom: string; adresse: string | null; email: string | null; telephone: string | null; ville: string | null };
  f: Fusion;
};

export function construireRappelAssurance(d: DonneesRappelAssurance) {
  const f = d.f;
  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe: new Date().toISOString() })}
    ${titre("Attestation d'assurance", `Rappel · échéance du ${f.date(d.echeance)}`, [
      "Article 7 g de la loi n° 89-462 du 6 juillet 1989",
    ])}
    ${cartouches([
      ["Locataire", `<div>${d.locataireNom}</div>`],
      ["Logement loué", `<div>${f.champ(d.logementAdresse, "adresse complète, étage, porte")}</div>`],
    ])}
    <p>${
      d.expiree
        ? `L'attestation d'assurance contre les risques locatifs que vous nous aviez remise est
           <b>arrivée à échéance le ${d.echeance ? formaterDateFr(d.echeance) : ""}</b>. À ce jour, nous ne
           disposons plus de justificatif d'assurance en cours de validité pour votre logement.`
        : `L'attestation d'assurance contre les risques locatifs que vous nous avez remise arrive à
           échéance le ${d.echeance ? formaterDateFr(d.echeance) : ""}.`
    }</p>
    <p>Nous vous remercions de nous faire parvenir, <b>dès son renouvellement</b>, votre nouvelle
    attestation couvrant les risques locatifs (incendie, dégât des eaux, explosion), directement
    depuis votre espace locataire Gerimmo ou à l'adresse suivante : ${f.champ(d.canalReponse, "adresse ou courriel")}.</p>
    <div class="mentions">
      <p>L'assurance du logement est une obligation du locataire pendant toute la durée du bail
      (article 7 g de la loi du 6 juillet 1989). Son défaut, après mise en demeure restée sans
      effet, constitue un motif de résiliation, ou permet au bailleur de souscrire une assurance
      pour le compte du locataire, récupérable par douzième avec le loyer.</p>
    </div>
    ${faitA(f, d.exp.ville, new Date().toISOString())}
  `;
  return assemblerPage({
    f,
    titreDocument: "Demande d'attestation d'assurance",
    nomPied: "Demande d'attestation d'assurance",
    reference: d.reference,
    corps,
  });
}

export async function assemblerRappelAssurance(
  supabase: SupabaseClient,
  orgId: string,
  documentId: string
): Promise<Assemblage> {
  const CHAMPS_PERSONNE =
    "id, nom, prenom, email, telephone, date_naissance, address_line1, postal_code, city, qualite";
  const [{ data: doc }, { data: organisation }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, type, expire_le")
      .eq("id", documentId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("name, type, address_line1, postal_code, city, telephone, email_contact")
      .eq("id", orgId)
      .maybeSingle(),
  ]);
  if (!doc || doc.type !== "attestation_assurance") {
    return { erreur: "Attestation d'assurance introuvable." };
  }
  if (!organisation) return { erreur: "Organisation introuvable." };

  // document_liens est polymorphe (pas de FK vers persons) : deux temps
  const { data: lien } = await supabase
    .from("document_liens")
    .select("entite_id")
    .eq("document_id", documentId)
    .eq("entite", "personne")
    .limit(1)
    .maybeSingle();
  const { data: personne } = lien
    ? await supabase.from("persons").select(CHAMPS_PERSONNE).eq("id", lien.entite_id).maybeSingle()
    : { data: null };
  if (!personne) return { erreur: "L'attestation n'est rattachée à aucune personne." };

  // Le logement : le bail vivant dont cette personne est locataire principal
  const { data: bail } = await supabase
    .from("baux")
    .select(
      "id, locataire_principal, lot:lots!baux_lot_meme_org_fk(nom, etage, bien:biens!lots_bien_id_fkey(address_line1, postal_code, city))"
    )
    .eq("organization_id", orgId)
    .eq("locataire_principal", personne.id)
    .in("etat", ["actif", "preavis"])
    .limit(1)
    .maybeSingle();
  const lot = bail ? premier(bail.lot as UnOuPlusieurs<{ nom: string; etage: string | null; bien: UnOuPlusieurs<{ address_line1: string; postal_code: string; city: string }> }>) : null;
  const bien = lot ? premier(lot.bien) : null;

  const f = new Fusion();
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const document = construireRappelAssurance({
    reference: referenceCourte("ASSU", doc.id),
    echeance: doc.expire_le,
    expiree: Boolean(doc.expire_le && doc.expire_le < aujourdHui),
    locataireNom: f.champ(nomPersonne(personne), "nom et prénom(s) du ou des locataires"),
    logementAdresse: bien
      ? [bien.address_line1, `${bien.postal_code} ${bien.city}`].filter(Boolean).join(", ")
      : null,
    referenceBail: bail ? referenceCourte("BAIL", bail.id) : null,
    canalReponse: organisation.email_contact,
    exp: {
      nom: organisation.name,
      adresse: adresseOrganisation(organisation),
      email: organisation.email_contact,
      telephone: organisation.telephone,
      ville: organisation.city,
    },
    f,
  });

  return {
    document,
    titreGed: "Demande d'attestation d'assurance",
    nomFichier: `rappel-assurance-${aujourdHui}`,
    liens: [
      { entite: "personne", entiteId: personne.id },
      ...(bail ? [{ entite: "bail" as const, entiteId: bail.id }] : []),
    ],
  };
}
