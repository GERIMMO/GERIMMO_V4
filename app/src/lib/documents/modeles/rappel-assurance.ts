// 13 — Demande d'attestation d'assurance : rappel avant (ou après) échéance.
// Cible : le document « attestation d'assurance » qui arrive à expiration.

import type { SupabaseClient } from "@supabase/supabase-js";
import { aujourdhuiParis } from "@/lib/ged";
import { Fusion, assemblerPage, blocSignatureEmetteur, cartouches, enTete, faitA, formaterDateFr, titre } from "../gabarit";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { adresseLogement, chargerDetenteursLot, expediteur, nomPersonne, referenceCourte, signatureOrganisation } from "./communs";
import type { Assemblage } from "./index";

export type DonneesRappelAssurance = {
  reference: string;
  echeance: string | null;
  expiree: boolean;
  locataireNom: string;
  logementAdresse: string | null;
  referenceBail: string | null;
  canalReponse: string | null;
  /** C58 : le locataire a un espace locataire actif dans cet espace de travail (sinon le courrier n'en parle pas). */
  espaceLocataire: boolean;
  exp: ReturnType<typeof expediteur>;
  signatureImg?: string | null;
  f: Fusion;
};

export function construireRappelAssurance(d: DonneesRappelAssurance) {
  const f = d.f;
  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe: new Date().toISOString() })}
    ${/* Phase 3 (C57) : le titre dit ce qu'est le document — une demande adressée au locataire, comme le pied de page et le
       classement — et non « Attestation d'assurance », qu'un tiers pouvait prendre pour le justificatif lui-même. */
      titre("Demande d'attestation d'assurance", `Rappel · échéance du ${f.date(d.echeance)}`, [
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
    attestation couvrant les risques locatifs (incendie, dégât des eaux, explosion), ${
      d.espaceLocataire ? "directement depuis votre espace locataire Gerimmo ou " : ""
    }à l'adresse suivante : ${f.champ(d.canalReponse, "adresse ou courriel")}.</p>
    <div class="mentions">
      <p>L'assurance du logement est une obligation du locataire pendant toute la durée du bail
      (article 7 g de la loi du 6 juillet 1989). Son défaut, après mise en demeure restée sans
      effet, constitue un motif de résiliation, ou permet au bailleur de souscrire une assurance
      pour le compte du locataire, récupérable par douzième avec le loyer.</p>
    </div>
    ${faitA(f, d.exp.ville, new Date().toISOString())}
    ${blocSignatureEmetteur(d.exp.nom, d.signatureImg ?? null)}
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
    "id, nom, prenom, email, telephone, date_naissance, address_line1, postal_code, city, qualite, account_id";
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
      "id, locataire_principal, chambre:lot_chambres!baux_chambre_meme_lot_fk(nom), lot:lots!baux_lot_meme_org_fk(id, nom, etage, bien:biens!lots_bien_id_fkey(address_line1, postal_code, city))"
    )
    .eq("organization_id", orgId)
    .eq("locataire_principal", personne.id)
    .in("etat", ["actif", "preavis"])
    .limit(1)
    .maybeSingle();
  const lot = bail ? premier(bail.lot as UnOuPlusieurs<{ id: string; nom: string; etage: string | null; bien: UnOuPlusieurs<{ address_line1: string; postal_code: string; city: string }> }>) : null;
  const bien = lot ? premier(lot.bien) : null;
  // C59 : le logement loué s'imprime comme dans les autres documents du bail (adresseLogement : immeuble, lot, étage) ; un
  // contrat individuel de colocation y ajoute sa chambre, comme chargerContexteBail.
  const chambre = bail ? premier((bail as { chambre?: UnOuPlusieurs<{ nom: string }> }).chambre ?? null) : null;

  // C56 : le rappel est émis et signé comme les autres documents du bail, par ses détenteurs hors espace d'agence (expediteur).
  // Il l'était au nom de l'espace de travail, avec son téléphone. Sans bail en cours (aucun lot connu), l'organisation émet.
  const detenteurs = lot && organisation.type !== "agence" ? await chargerDetenteursLot(supabase, lot.id) : [];
  if (!detenteurs) return { erreur: "Les bailleurs du logement ne peuvent pas être vérifiés. Réessayez." };

  // C58 : « votre espace locataire Gerimmo » seulement si le locataire en a un, ouvert (compte rattaché et accès actif, comme
  // la fiche de la personne le lit). Sinon, ou si l'accès ne peut pas être vérifié, le courrier ne donne que l'adresse de dépôt.
  let espaceLocataire = false;
  if (personne.account_id) {
    const { data: acces, error: erreurAcces } = await supabase.rpc("statut_acces_locataire", { p_org: orgId, p_person_id: personne.id });
    const statut = acces as { role?: string; status?: string } | null;
    espaceLocataire = !erreurAcces && statut?.role === "locataire" && statut.status === "active";
  }

  const f = new Fusion();
  const aujourdHui = aujourdhuiParis();
  const document = construireRappelAssurance({
    reference: referenceCourte("ASSU", doc.id),
    echeance: doc.expire_le,
    expiree: Boolean(doc.expire_le && doc.expire_le < aujourdHui),
    locataireNom: f.champ(nomPersonne(personne), "nom et prénom(s) du ou des locataires"),
    logementAdresse: lot && bien ? adresseLogement({ nom: chambre ? `${lot.nom} · ${chambre.nom}` : lot.nom, etage: lot.etage }, bien) : null,
    referenceBail: bail ? referenceCourte("BAIL", bail.id) : null,
    canalReponse: organisation.email_contact,
    espaceLocataire,
    exp: expediteur({ organisation, bailleurs: detenteurs }),
    signatureImg: await signatureOrganisation(supabase, orgId),
    f,
  });

  return {
    document,
    // Phase 3 (C64) : deux demandes classées le même jour se distinguent par le locataire concerné (« Nom Prénom »).
    titreGed: `Demande d'attestation d'assurance — ${nomPersonne(personne)}`,
    nomFichier: `rappel-assurance-${aujourdHui}`,
    liens: [
      { entite: "personne", entiteId: personne.id },
      ...(bail ? [{ entite: "bail" as const, entiteId: bail.id }] : []),
    ],
  };
}
