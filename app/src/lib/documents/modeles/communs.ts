// Contexte partagé des modèles de documents : l'expéditeur (l'organisation),
// le bailleur (les détenteurs du lot), le locataire et le logement — les
// mêmes cartouches reviennent d'une épreuve à l'autre.

import { createHash } from "node:crypto";
import type { MentionsContrat } from "@/lib/mentions-contrat";
import type { SupabaseClient } from "@supabase/supabase-js";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { mentionEtage } from "@/lib/etage";
import { Fusion, facultatif, formaterDateFr, moisEnToutesLettres, type EnTeteExpediteur } from "../gabarit";

// Réservés au recalcul de l’empreinte d’un circuit de signature déjà enregistré. Deux époques distinctes :
// - `presentationArchivee` : la présentation d’avant #331 (expéditeur = l’espace, ni SIREN ni signatures d’indivision),
//   avec la mise en forme d’alors (feuille g7, typographie archivée) ;
// - `typographieArchivee` : la présentation d’aujourd’hui avec la seule mise en forme d’avant la version g8 (feuille g7,
//   typographie archivée) — un bail préparé entre la mise en ligne de #331 et celle de la version g8 (reprise du lot 35).
export const presentationArchivee = Symbol("presentationArchivee");
export const typographieArchivee = Symbol("typographieArchivee");
export type OptionsContrat = Record<string, string> & { [presentationArchivee]?: true; [typographieArchivee]?: true };

export type PersonneDocument = {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  date_naissance: string | null;
  commune_naissance: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  qualite: string | null;
  siren?: string | null;
};

export type ChambreDocument = { id: string; nom: string; surface_m2: number; volume_m3: number; description: string; espaces_partages: string; equipements: string | null };
export type ContexteBail = {
  chambre?: ChambreDocument | null;
  plafondColocation?: number | null;
  organisation: {
    name: string;
    type: string;
    address_line1: string | null;
    postal_code: string | null;
    city: string | null;
    telephone: string | null;
    email_contact: string | null;
    siret: string | null;
    carte_pro: string | null;
    garantie_financiere: string | null;
    iban: string | null;
  };
  bail: MentionsContrat & {
    id: string;
    type: string;
    chambre_id?: string | null;
    etat: string;
    date_debut: string | null;
    date_fin: string | null;
    /** Zone tendue figée au bail à sa signature (RM-1.1.7) — null avant la migration du 27/09. */
    zone_tendue?: boolean | null;
    loyer_hc: number | null;
    charges: number | null;
    charges_mode: string | null;
    depot_garantie: number | null;
    jour_echeance: number;
    irl_trimestre: string | null;
    revision_irl: boolean | null;
    locataire_principal: string | null;
    // Compléments du contrat (bail 100 % rempli, 09/09)
    fixation_loyer: string | null;
    paiement_echeance: string;
    lieu_paiement: string | null;
    irl_valeur: number | null;
    duree_reduite_evenement: string | null;
    travaux_recents: string | null;
    travaux_recents_montant: number | null;
    travaux_locataire: string | null;
    honoraires_bailleur: number | null;
    honoraires_locataire: number | null;
    clauses_particulieres: string | null;
    loyer_reference: number | null;
    loyer_reference_majore: number | null;
    complement_loyer: number | null;
    complement_justification: string | null;
    dernier_loyer: number | null;
    dernier_loyer_versement: string | null;
    dernier_loyer_revision: string | null;
    precedente_location?: string | null;
    precedent_loyer_revise?: boolean | null;
    meuble_etudiant: boolean;
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
    chauffage: string | null;
    eau_chaude: string | null;
    locaux_privatifs: string | null;
    // Les équipements structurés du lot (catalogue de l'agence)
    equipements: string[];
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
    parties_communes: string | null;
    acces_tic: string | null;
  };
  bailleurs: (PersonneDocument & { quote_part: number })[];
  locataires: PersonneDocument[]; // principal en premier, puis colocataires
  garants: (PersonneDocument & { garant_de: string | null })[];
};

// Les colonnes d'une personne que lisent les documents (bailleurs, occupants, garants).
// Reprise du lot 43 : les selects la citent directement. L'alias local `const CHAMPS_PERSONNE = CHAMPS_PERSONNE_DOCUMENT`
// (lot 37) les rendait illisibles par tests/embeds-ambigus.test.ts, qui ne résout que les constantes littérales du fichier.
const CHAMPS_PERSONNE_DOCUMENT =
  "id, nom, prenom, email, telephone, date_naissance, commune_naissance, address_line1, postal_code, city, qualite, siren";

export async function chargerContexteBail(
  supabase: SupabaseClient,
  orgId: string,
  bailId: string
): Promise<ContexteBail | { erreur: string }> {
  const [{ data: organisation, error: erreurOrganisation }, { data: bail, error: erreurBail }] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "name, type, address_line1, postal_code, city, telephone, email_contact, siret, carte_pro, garantie_financiere, iban"
      )
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("baux")
      .select(
        `id, chambre_id, type, etat, date_debut, date_fin, zone_tendue, loyer_hc, charges, charges_mode,
         depot_garantie, jour_echeance, irl_trimestre, revision_irl, locataire_principal,
         fixation_loyer, paiement_echeance, lieu_paiement, irl_valeur,
         duree_reduite_evenement, travaux_recents, travaux_recents_montant,
         travaux_locataire, honoraires_bailleur, honoraires_locataire,
         clauses_particulieres, loyer_reference, loyer_reference_majore,
         complement_loyer, complement_justification, dernier_loyer,
         dernier_loyer_versement, dernier_loyer_revision, precedente_location, precedent_loyer_revise, meuble_etudiant,
         date_conclusion_prevue, servitude_residence_principale, encadrement_loyer, zone_honoraires,
         honoraires_edl_bailleur, honoraires_edl_locataire, dpe_depenses_min, dpe_depenses_max, dpe_annees_reference,
         clause_resolutoire_assurance, clause_resolutoire_troubles, clause_resolutoire_servitude,
         lot:lots!baux_lot_meme_org_fk(id, nom, surface_m2, pieces, etage, meuble,
           identifiant_fiscal, description, chauffage, eau_chaude, locaux_privatifs,
           bien:biens!lots_bien_id_fkey(id, nom, type, address_line1, postal_code, city,
             annee_construction, copropriete, zone_tendue, syndic_nom,
             parties_communes, acces_tic))`
      )
      .eq("id", bailId)
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);
  if (erreurOrganisation || erreurBail) return { erreur: "Les informations du bail ne peuvent pas être chargées. Réessayez." };
  if (!organisation) return { erreur: "Organisation introuvable." };
  if (!bail) return { erreur: "Bail introuvable." };

  const lot = premier(
    bail.lot as UnOuPlusieurs<
      Omit<ContexteBail["lot"], "equipements"> & { bien: UnOuPlusieurs<ContexteBail["bien"]> }
    >
  );
  const bien = lot ? premier(lot.bien) : null;
  if (!lot || !bien) return { erreur: "Lot introuvable pour ce bail." };

  let chambre: ChambreDocument | null = null;
  let plafondColocation: number | null = null;
  if (bail.chambre_id) {
    const [{ data: piece, error }, { data: logement, error: erreurLogement }] = await Promise.all([
      supabase.from("lot_chambres").select("id, nom, surface_m2, volume_m3, description, espaces_partages, equipements").eq("id", bail.chambre_id).eq("lot_id", lot.id).eq("organization_id", orgId).maybeSingle(),
      supabase.from("lots").select("colocation_loyer_reference").eq("id", lot.id).eq("organization_id", orgId).maybeSingle(),
    ]);
    if (error || !piece || erreurLogement || !logement) return { erreur: "La chambre et le plafond du logement ne peuvent pas être vérifiés." };
    chambre = piece;
    plafondColocation = logement.colocation_loyer_reference;
  }

  // Les équipements du lot (liste fermée du catalogue de l'agence) — ils
  // remplissent « Éléments d'équipement du logement » du contrat type
  const { data: lignesEquipements, error: erreurEquipements } = await supabase
    .from("lot_equipements")
    .select("equipement:equipements_catalogue(nom)")
    .eq("lot_id", lot.id);
  if (erreurEquipements) return { erreur: "Les équipements du logement ne peuvent pas être chargés. Réessayez." };
  const equipements = ((lignesEquipements ?? []) as { equipement: UnOuPlusieurs<{ nom: string }> }[])
    .map((l) => premier(l.equipement)?.nom)
    .filter((n): n is string => Boolean(n))
    .sort((a, b) => a.localeCompare(b, "fr"));

  const [{ data: detentions, error: erreurDetentions }, { data: bailPersonnes, error: erreurPersonnes }, { data: principal, error: erreurPrincipal }] = await Promise.all([
    supabase
      .from("detentions")
      .select(`quote_part, person:persons!detentions_person_id_fkey(${CHAMPS_PERSONNE_DOCUMENT})`)
      .eq("lot_id", lot.id)
      .is("date_fin", null),
    supabase
      .from("bail_personnes")
      .select(`role, garant_de, person:persons!bail_personnes_person_meme_org_fk(${CHAMPS_PERSONNE_DOCUMENT})`)
      .eq("bail_id", bailId),
    bail.locataire_principal
      ? supabase.from("persons").select(CHAMPS_PERSONNE_DOCUMENT).eq("id", bail.locataire_principal).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (erreurDetentions || erreurPersonnes || erreurPrincipal) return { erreur: "Les bailleurs et les occupants ne peuvent pas être vérifiés. Réessayez." };

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
    chambre,
    plafondColocation,
    bail: { ...bail, id: bail.id },
    lot: { ...lot, nom: chambre ? `${lot.nom} · ${chambre.nom}` : lot.nom, equipements },
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

export function adresseOrganisation(o: {
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
}): string | null {
  if (!o.address_line1) return null;
  return [o.address_line1, [o.postal_code, o.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

// L'étage du lot tel qu'il s'imprime dans une adresse : la règle vit dans lib/etage.ts, partagée avec les écrans.
export { mentionEtage } from "@/lib/etage";

// `archivee` : l'adresse telle que l'imprimait un bail préparé pour la signature avant la version g8 (recalcul de
// l'empreinte de son circuit, voir `typographie` dans gabarit.ts) : « étage » toujours ajouté.
// Phase 3 (C59) : seules les colonnes imprimées sont exigées, pour qu'un modèle qui lit le lot sans passer par
// `chargerContexteBail` (rappel d'assurance) imprime le logement complet comme les autres documents du bail.
export function adresseLogement(
  lot: Pick<ContexteBail["lot"], "nom" | "etage">,
  bien: Pick<ContexteBail["bien"], "address_line1" | "postal_code" | "city">,
  archivee = false
): string {
  const nom = lot.nom !== "Lot unique" ? lot.nom : null;
  const etage = archivee ? (lot.etage ? `étage ${lot.etage}` : null) : mentionEtage(lot.etage, nom);
  const complement = [nom, etage]
    .filter(Boolean)
    .join(", ");
  return [bien.address_line1, `${bien.postal_code ?? ""} ${bien.city ?? ""}`.trim(), complement]
    .filter(Boolean)
    .join(", ");
}

// S39 (reprise du lot 37) : le logement comme ADRESSE POSTALE, ligne par ligne, pour le bloc destinataire d'un courrier :
// l'étage et la porte (complément de distribution), puis la voie, puis le code postal et la commune, en dernière ligne. Le nom
// du lot (« T3 — 4e étage », « Studio meublé ») est un libellé de gestion, pas un élément d'adresse : il reste dans « Locaux
// concernés ». Le bloc reprenait `adresseLogement`, la commune au milieu de l'adresse et suivie du nom du lot.
export function adressePostaleLogement(
  lot: Pick<ContexteBail["lot"], "etage">,
  bien: Pick<ContexteBail["bien"], "address_line1" | "postal_code" | "city">
): string[] {
  return [mentionEtage(lot.etage), bien.address_line1, `${bien.postal_code ?? ""} ${bien.city ?? ""}`.trim()]
    .map((ligne) => ligne?.trim() ?? "")
    .filter(Boolean);
}

// L'expéditeur de l'en-tête : l'organisation qui génère (agence ou parc du
// propriétaire) — le « Fait à » vient de sa ville. Type structurel minimal :
// certains modèles chargent l'organisation avec leurs propres colonnes.
export function expediteur(ctx: {
  organisation: { name:string; type?:string; address_line1:string|null; postal_code:string|null; city:string|null; telephone:string|null; email_contact:string|null };
  bailleurs?: PersonneDocument[];
}): EnTeteExpediteur & { ville: string | null } {
  // Un même espace peut gérer un patrimoine personnel et plusieurs SCI.
  // Les documents d'un bail sont émis par ses détenteurs, pas par le nom du parc.
  if(ctx.organisation.type && ctx.organisation.type!=="agence" && ctx.bailleurs?.length){
    const uniques=(valeurs:(string|null|undefined)[])=>[...new Set(valeurs.filter((v):v is string=>Boolean(v)))].join(" · ")||null;
    const emailBailleurs = uniques(ctx.bailleurs.map(p=>p.email?.trim()));
    const contactGestion = ctx.organisation.email_contact?.trim() || null;
    return {nom:uniques(ctx.bailleurs.map(nomPersonne)) ?? ctx.organisation.name,
      adresse:ctx.bailleurs.every(p=>adressePersonne(p))?uniques(ctx.bailleurs.map(adressePersonne)):null,
      email:emailBailleurs ?? contactGestion, ...(!emailBailleurs && contactGestion ? { contactGestion: true } : {}),
      telephone:uniques(ctx.bailleurs.map(p=>p.telephone)),
      ville:ctx.bailleurs[0]?.city??null, emetteur:"detenteurs"};
  }
  return {nom:ctx.organisation.name,adresse:adresseOrganisation(ctx.organisation),email:ctx.organisation.email_contact,telephone:ctx.organisation.telephone,ville:ctx.organisation.city,emetteur:"espace"};
}

// Les détenteurs actuels d'un lot (détention sans date de fin), lus comme dans le contexte d'un bail. Pour un document
// rattaché au lot sans passer par un bail (rappel d'assurance, compte rendu d'intervention) : ce sont eux que `expediteur`
// retient hors espace d'agence. `null` si la lecture échoue : l'appelant refuse alors le document plutôt que de
// revenir au nom de l'espace.
export async function chargerDetenteursLot(
  supabase: SupabaseClient,
  lotId: string
): Promise<ContexteBail["bailleurs"] | null> {
  const { data, error } = await supabase
    .from("detentions")
    .select(`quote_part, person:persons!detentions_person_id_fkey(${CHAMPS_PERSONNE_DOCUMENT})`)
    .eq("lot_id", lotId)
    .is("date_fin", null);
  if (error) return null;
  return ((data ?? []) as { quote_part: unknown; person: UnOuPlusieurs<PersonneDocument> }[])
    .map((d) => {
      const p = premier(d.person);
      return p ? { ...p, quote_part: Number(d.quote_part) } : null;
    })
    .filter((p): p is PersonneDocument & { quote_part: number } => p !== null);
}

// Phase 3 (C82) : un document des parties communes (incident sans lot) n'a pas de lot dont lire les détenteurs ; ce sont ceux
// des logements de l'immeuble, chacun une fois. `null` si une lecture échoue, comme `chargerDetenteursLot`.
export async function chargerDetenteursBien(
  supabase: SupabaseClient,
  bienId: string
): Promise<ContexteBail["bailleurs"] | null> {
  const lots = await supabase.from("lots").select("id").eq("bien_id", bienId);
  if (lots.error) return null;
  const ids = ((lots.data ?? []) as { id: string }[]).map((l) => l.id);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("detentions")
    .select(`quote_part, person:persons!detentions_person_id_fkey(${CHAMPS_PERSONNE_DOCUMENT})`)
    .in("lot_id", ids)
    .is("date_fin", null);
  if (error) return null;
  const parPersonne = new Map<string, PersonneDocument & { quote_part: number }>();
  for (const d of (data ?? []) as { quote_part: unknown; person: UnOuPlusieurs<PersonneDocument> }[]) {
    const p = premier(d.person);
    if (p && !parPersonne.has(p.id)) parPersonne.set(p.id, { ...p, quote_part: Number(d.quote_part) });
  }
  return [...parPersonne.values()];
}

// Phase 3 (C41, C52, C70, C71) : l'interlocuteur vers lequel un document renvoie le locataire. Il n'y a de « gestionnaire »
// que dans un espace d'agence ; ailleurs le bailleur gère lui-même, et c'est lui que le locataire contacte. Le modèle garde
// son article (« votre gestionnaire », « avec le bailleur »). Lot 47 : la règle vit dans un module pur, partagé avec les
// e-mails et les écrans du locataire (composants client compris) ; les modèles la reprennent d'ici, sans changement.
export { interlocuteurLocataire } from "@/lib/interlocuteur-locataire";

// Phase 3 (C16, C24) : le cadre où signe le bailleur d'un document du bail. « ou son mandataire » seulement dans un espace
// d'agence ; un propriétaire qui gère lui-même n'a pas de mandataire.
export function libelleSignataireBailleur(typeOrganisation: string | null | undefined): string {
  return typeOrganisation === "agence" ? "Le bailleur ou son mandataire" : "Le bailleur";
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

// Les liens « personne » d'un document adressé aux locataires du bail : le
// principal ET les colocataires (audit 09/09 — un colocataire ne voyait
// jamais les PDF de son bail, seul le principal était rattaché).
export function liensLocataires(
  ctx: Pick<ContexteBail, "bail" | "locataires">
): { entite: "personne"; entiteId: string }[] {
  const ids = new Set<string>();
  if (ctx.bail.locataire_principal) ids.add(ctx.bail.locataire_principal);
  for (const l of ctx.locataires) if (l.id) ids.add(l.id);
  return [...ids].map((id) => ({ entite: "personne" as const, entiteId: id }));
}

// Référence courte et stable d'un objet (les épreuves montrent « référence »)
export function referenceCourte(prefixe: string, id: string): string {
  return `${prefixe}-${id.slice(0, 8).toUpperCase()}`;
}

// Phase 3 (C18, C24) : la référence d'un avenant le distingue des autres avenants du même bail. Tirée du seul bail, elle était
// la même pour tous ses avenants.
// Reprise du lot 40 : elle se tire du bail ET du contenu de l'avenant (`contenu` : objet et modifications, ou parties, date
// d'effet et accord du remplacement), et non plus de l'heure de génération : « AVT-2DFB98CB-3F9A1C07 ». Le même avenant garde donc
// la même référence d'une génération à l'autre — copie rangée en GED, PDF préparé pour la signature électronique, PDF relu
// avant l'envoi —, deux avenants différents du même bail en ont deux. L'heure changeait la référence à chaque minute ; or
// les pages de signature l'impriment (« Référence : … ») et l'empreinte du circuit la lit : un avenant préparé ne
// correspondait plus à lui-même au moment de l'envoi.
export function referenceAvenant(bailId: string, contenu: Record<string, string | null | undefined>): string {
  const canonique = JSON.stringify(
    Object.keys(contenu)
      .sort()
      .map((cle) => [cle, (contenu[cle] ?? "").replace(/\r\n?/g, "\n").trim()])
  );
  return `${referenceCourte("AVT", bailId)}-${createHash("sha256").update(canonique).digest("hex").slice(0, 8).toUpperCase()}`;
}

// La signature préenregistrée de l'organisation, en data-URI prête à
// s'imprimer — null si aucune n'est déposée (profil de l'organisation).
export async function signatureOrganisation(
  supabase: SupabaseClient,
  orgId: string
): Promise<string | null> {
  const { data: autorise, error: erreurDroit } = await supabase.rpc("peut_utiliser_signature_organisation", { p_org: orgId });
  if (erreurDroit) throw new Error("Impossible de vérifier le droit d’utiliser la signature de l’organisation.");
  if (!autorise) return null;
  const { data: org } = await supabase
    .from("organizations")
    .select("signature_path")
    .eq("id", orgId)
    .maybeSingle();
  const chemin = (org as { signature_path?: string | null } | null)?.signature_path;
  if (!chemin) return null;
  const { data: fichier } = await supabase.storage.from("documents").download(chemin);
  if (!fichier) return null;
  const octets = Buffer.from(await fichier.arrayBuffer());
  const mime = chemin.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${octets.toString("base64")}`;
}

// Libellé des charges selon le mode du bail (audit métier du 27/09 : les
// documents écrivaient « Provision ou forfait » alors que le mode est connu).
export function libelleCharges(mode: string | null | undefined): string {
  if (mode === "forfait") return "Forfait de charges";
  if (mode === "provision") return "Provision sur charges";
  return "Provision ou forfait de charges";
}

// Phase 3 (C50, C72) : un document qui demande un règlement par virement donne le compte où verser. La source est celle de
// l'avis d'échéance : l'IBAN du profil de l'espace (organizations.iban). Connu, il s'imprime ; inconnu, l'information est à
// renseigner (le PDF n'est pas produit, la liste « À renseigner » mène au profil — ou-renseigner.ts). Il s'imprimait « — »,
// et le locataire recevait une demande de virement sans compte. Un autre mode de paiement ne l'exige pas (« — » s'il manque).
export const LIBELLE_COORDONNEES_BANCAIRES = "coordonnées bancaires (IBAN) du compte qui reçoit les loyers";
export function demandeVirement(lieuPaiement: string | null | undefined): boolean {
  return /virement/i.test(lieuPaiement ?? "");
}
export function coordonneesBancaires(f: Fusion, lieuPaiement: string | null | undefined, iban: string | null | undefined): string {
  return demandeVirement(lieuPaiement) ? f.champ(iban, LIBELLE_COORDONNEES_BANCAIRES) : facultatif(iban);
}

// Bornes d'un terme de loyer (audit du 27/09) : du 1er au dernier jour du
// mois, sauf terme au prorata, borné à l'entrée et/ou à la sortie du bail —
// la période imprimée doit être celle que le montant rémunère.
export function bornesTerme(
  periodeIso: string,
  prorata: boolean,
  dateDebut: string | null | undefined,
  dateFin: string | null | undefined
): { du: string; au: string } {
  const [a, m] = periodeIso.slice(0, 7).split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  let du = `${a}-${pad(m)}-01`;
  let au = `${a}-${pad(m)}-${pad(new Date(Date.UTC(a, m, 0)).getUTCDate())}`;
  if (prorata) {
    const debut = dateDebut?.slice(0, 10);
    const fin = dateFin?.slice(0, 10);
    if (debut && debut > du && debut <= au) du = debut;
    if (fin && fin < au && fin >= du) au = fin;
  }
  return { du, au };
}

// La période d'un terme dans un tableau d'échéances (phase 3, C67 et C68) : le mois en toutes lettres (« novembre 2026 »), pas
// la date technique « 2026-11-01 ». Un terme au prorata le dit, avec les bornes que son montant rémunère (bornesTerme) :
// « février 2025 — prorata du 15/02 au 28/02 ». Si les dates du bail ne bornent pas le mois, il le dit sans inventer de dates.
export function libellePeriodeTerme(
  periodeIso: string | null | undefined,
  prorata: boolean,
  dateDebut: string | null | undefined,
  dateFin: string | null | undefined
): string {
  if (!periodeIso || !/^\d{4}-\d{2}/.test(periodeIso)) return periodeIso ?? "";
  const mois = moisEnToutesLettres(periodeIso);
  if (!prorata) return mois;
  const entier = bornesTerme(periodeIso, false, null, null);
  const { du, au } = bornesTerme(periodeIso, true, dateDebut, dateFin);
  if (du === entier.du && au === entier.au) return `${mois} — au prorata`;
  const jourMois = (iso: string) => formaterDateFr(iso).slice(0, 5);
  return `${mois} — prorata du ${jourMois(du)} au ${jourMois(au)}`;
}
