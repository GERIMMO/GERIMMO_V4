import { ApercuDocumentEspace } from "@/components/apercu-document-espace";
import { etatAssuranceLocataire } from "@/lib/assurance-locataire";
import { OngletsDossier } from "@/components/onglets-dossier";
import { RubriqueDossier } from "@/components/rubrique-dossier";
import { deElide } from "@/lib/elision";
import { disponibilitesQuittances } from "@/lib/quittance-conforme";
import { TitreEcran } from "@/components/titre-ecran";
import { libelleDocumentLoyer } from "@/lib/documents-loyer";
import Link from "next/link";
import { CONSERVATION_DOCUMENTS_LOCATAIRE } from "@/lib/locataire-textes";
import {
  TYPES_DOCUMENT,
  aujourdhuiParis,
  estARenouveler,
  estExpiree,
  formaterDate,
} from "@/lib/ged";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { buttonVariants } from "@/components/ui/button";
import { FormulaireAttestation } from "../formulaire-attestation";
import { DepotSignature } from "./depot-signature";
import { DepotPiece, type DemandePiece } from "./depot-piece";
import { aEchoue, LectureImpossible, PanneLecture } from "../panne-lecture";

export const metadata = { title: "Mes documents" };

// Rangs de « Conservés pour vous » : le titre est un lien, les actions
// passent sous lui au téléphone (voir la liste).
const TITRE_RANG =
  "-mx-2 min-w-0 flex-1 rounded-md px-2 py-1 transition-colors hover:bg-[var(--survol)]";
const ACTIONS_RANG = "flex shrink-0 basis-full items-center gap-2 sm:basis-auto";

type Piece = {
  document_id: string;
  type: string;
  titre: string | null;
  mime_type: string;
  depose_le: string;
  expire_le: string | null;
  verifie_le: string | null;
  source: "dossier" | "bail";
};

type LigneEcheancier = {
  statut: string;
  periode: string;
  quittance_id: string | null;
};

function statutAssurance(expire: string | null, verifiee: boolean): { texte: string; classe: string } {
  if (!expire) return { texte: "sans date d'expiration", classe: "text-muted-foreground" };
  // Minuit LOCAL des deux côtés (revue 23/08 : la date seule se parse en UTC,
  // le lendemain de l'expiration affichait encore « expire dans 0 j »), mais
  // sur l'horloge de PARIS depuis la revue du 11/09 : le compte partait de
  // minuit serveur (UTC sur Vercel) et basculait un jour trop tôt entre
  // minuit et 2 h. Les SEUILS, eux, ne se recalculent plus ici — estExpiree
  // et estARenouveler sont la définition unique que lisent aussi l'accueil du
  // locataire, l'espace agence et la fonction SQL documents_a_renouveler.
  const jours = Math.round(
    (new Date(`${expire}T00:00:00`).getTime() -
      new Date(`${aujourdhuiParis()}T00:00:00`).getTime()) / 86400000
  );
  if (estExpiree(expire)) return { texte: `expirée depuis ${-jours} j`, classe: "text-destructive" };
  if (estARenouveler(expire))
    return {
      texte: `expire dans ${jours} j (${formaterDate(expire)})`,
      classe: "text-warning-soft-foreground",
    };
  return { texte: `échéance le ${formaterDate(expire)}`, classe: verifiee ? "text-success-soft-foreground" : "text-muted-foreground" };
}

// « Mes documents » (maquette v10) : ce qui est conservé pour moi, et mon
// assurance habitation — l'obligation annuelle — déposée ici.
export default async function PageDocumentsLocataire(
  props: PageProps<"/locataire/[orgId]/documents">
) {
  const { orgId } = await props.params;
  const { supabase, adhesionActive } = await verifierAccesEspaceLocataire(orgId);

  const [
    { data: piecesBrutes, error: ePieces },
    { data: echeancier, error: eEcheancier },
    { data: demandesBrutes, error: eDemandes },
    { data: signaturesBrutes, error: eSignatures },
  ] = await Promise.all([
    supabase.rpc("mes_pieces_locataire", { p_org: orgId }),
    supabase.rpc("mon_echeancier_locataire", { p_org: orgId }),
    supabase.rpc("mes_pieces_demandees", { p_org: orgId }),
    supabase.rpc("mes_demandes_signature", { p_org: orgId }),
  ]);
  const aSigner = ((signaturesBrutes ?? []) as {
    id: string;
    document_id: string;
    titre: string | null;
    demandee_le: string;
  }[]);
  const demandes = (demandesBrutes ?? []) as DemandePiece[];
  const pieces = [...new Map(((piecesBrutes ?? []) as Piece[]).map(p => [p.document_id, p])).values()];
  const quittances = ((echeancier ?? []) as LigneEcheancier[]).filter((l) => l.quittance_id);
  const disponibilites = await disponibilitesQuittances(supabase, quittances.map(q => q.quittance_id));
  const total = pieces.length + quittances.filter(q => disponibilites[q.quittance_id!] === "disponible").length;
  const enPreparation = quittances.filter(q => disponibilites[q.quittance_id!] !== "disponible").length;

  // La DERNIÈRE attestation fait foi (recette 21/08) ; pendant la vérification
  // d'un renouvellement, la dernière VALIDÉE non expirée reste en vigueur.
  const attestations = pieces
    .filter((p) => p.type === "attestation_assurance")
    .sort((a, b) => b.depose_le.localeCompare(a.depose_le));
  const assurance = attestations[0];
  const etatAssurance = etatAssuranceLocataire(assurance);
  const statut = assurance && etatAssurance.dateConnue ? statutAssurance(assurance.expire_le, Boolean(assurance.verifie_le)) : null;
  const deuxAttestations =
    attestations.some((p) => etatAssuranceLocataire(p).validee) &&
    attestations.some((p) => !p.verifie_le);

  const moisLong = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  const sousTitre = (p: Piece) =>
    [
      TYPES_DOCUMENT[p.type] ?? "Document",
      `déposé le ${formaterDate(p.depose_le)}`,
      p.expire_le ? `expire le ${formaterDate(p.expire_le)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  // Sans cette lecture, la carte d'assurance GRONDAIT le locataire pour une
  // attestation qu'il avait déposée — la requête seule avait échoué.
  const lecturePiecesKO = aEchoue(ePieces);

  return (
    <div className="space-y-4">
      <div className="entete-page">
        <TitreEcran rubrique="documents">Mes documents</TitreEcran>
        {/* Un seul compte, un seul mot — celui du menu (24/09 : « 2 pièces »
            ici, « 2 documents » sur la carte en dessous). */}
        {total > 0 && (
          <span className="mono-discret">
            {total} document{total > 1 ? "s" : ""} disponible{total > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {aEchoue(ePieces, eEcheancier, eDemandes, eSignatures) && (
        <PanneLecture quoi="vos documents" />
      )}

      {enPreparation > 0 && <p className="rounded-xl border border-[var(--filet)] bg-[var(--warning-soft)] p-4 text-sm" role="status">
        {enPreparation} justificatif{enPreparation > 1 ? "s" : ""} de loyer en préparation ou à vérifier. Les boutons de téléchargement apparaîtront dès que les informations nécessaires seront complètes. <Link href={`/locataire/${orgId}/contact`} className="underline">Contacter mon gestionnaire</Link>
      </p>}

      <OngletsDossier libelle="Rubriques de mes documents"
        initiale={aSigner.length || demandes.length || (adhesionActive && (!etatAssurance.nonExpiree)) ? "documents-a-transmettre" : "documents-disponibles"}
        rubriques={[
          { id: "documents-a-transmettre", titre: "À transmettre", contenu: <>
      {/* Les pièces que votre gestionnaire attend (RM-0b.2.5) */}
      {aSigner.length > 0 && adhesionActive && (
        <div className="loc-carte border-l-4 border-l-[var(--or)]">
          <div className="entete-carte !mb-1">
            <h2 className="titre-carte text-base font-medium">
              {aSigner.length > 1 ? "Documents à signer" : "Un document à signer"}
            </h2>
            <span className="loc-tag ambre">à signer</span>
          </div>
          <div className="divide-y divide-border">
            {aSigner.map((d) => (
              <DepotSignature key={d.id} orgId={orgId} demande={d} />
            ))}
          </div>
        </div>
      )}

      {demandes.length > 0 && (
        <div className="loc-carte border-l-4 border-l-[var(--or)]">
          <div className="entete-carte !mb-0">
            <h2 className="titre-carte text-base font-medium">
              {demandes.length > 1 ? "Des pièces vous sont demandées" : "Une pièce vous est demandée"}
            </h2>
            <span className="loc-tag ambre">à déposer</span>
          </div>
          <div className="divide-y divide-border">
            {demandes.map((d) => (
              <DepotPiece key={d.id} orgId={orgId} demande={d} />
            ))}
          </div>
        </div>
      )}

      {/* L'obligation annuelle d'abord : l'assurance, avec le dépôt sur place.
          id="assurance" : les lignes d'assurance de l'accueil pointent sur
          /documents#assurance — sur 390 px cette carte est le 3ᵉ bloc, sous
          « Documents à signer » et « Des pièces vous sont demandées », c'est-
          à-dire précisément quand il y a le plus à faire (relevé 11/09).
          scroll-mt : l'en-tête .loc-haut est collant (globals.css:627). */}
      <div
        id="assurance"
        className={`loc-carte scroll-mt-24 ${lecturePiecesKO || etatAssurance.validee ? "" : "border-l-4 border-l-[var(--or)]"}`}
      >
        <div className="entete-carte !mb-1">
          <h2 className="titre-carte text-base font-medium">Votre assurance habitation</h2>
          {/* Filet doré et badge du menu disaient « à faire » ; l'en-tête,
              lui, ne disait rien — contrairement à ses voisines (24/09). */}
          {!lecturePiecesKO && !assurance && adhesionActive && (
            <span className="loc-tag ambre">à déposer</span>
          )}
          {!lecturePiecesKO && assurance && (
            <span className={`loc-tag ${etatAssurance.validee ? "vert" : etatAssurance.dateConnue && !etatAssurance.nonExpiree ? "rouge" : "ambre"}`}>
              {etatAssurance.libelle}
            </span>
          )}
        </div>
        {lecturePiecesKO ? (
          <LectureImpossible quoi="l'état de votre assurance" />
        ) : assurance ? (
          <p className="text-sm text-muted-foreground">
            {assurance.titre || "Attestation déposée"} —{" "}
            <span className={statut?.classe}>{statut?.texte ?? "date d’expiration à vérifier avec votre gestionnaire"}</span>.
            {deuxAttestations &&
              " Votre attestation validée reste en vigueur pendant la vérification de la nouvelle."}
          </p>
        ) : (
          adhesionActive ? null : (
            <p className="text-sm text-muted-foreground">
              Bail terminé — plus d&apos;attestation à fournir.
            </p>
          )
        )}
        {adhesionActive && (
          <RubriqueDossier id="depot-assurance" titre={assurance ? "Déposer une nouvelle attestation" : "Ajouter mon attestation"} resume="PDF ou photo lisible" ouverte={!assurance}>
            <FormulaireAttestation orgId={orgId} renouvellement={Boolean(assurance)} sansTitre />
          </RubriqueDossier>
        )}
      </div>
</> },
          { id: "documents-disponibles", titre: "Mes fichiers", contenu: <>

      <div className="loc-carte">
        <div className="entete-carte">
          <h2 className="titre-carte text-base font-medium">Documents disponibles</h2>
        </div>
        {aEchoue(ePieces, eEcheancier) ? (
          <LectureImpossible quoi="les pièces conservées pour vous" />
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune pièce pour l&apos;instant — votre bail signé, le règlement de
            copropriété, vos quittances et vos attestations apparaîtront ici.
          </p>
        ) : (
          // Chaque rang se clique sur son titre (24/09) : seul un « Ouvrir »
          // fantôme, à 800 px du titre, ouvrait le fichier. Le titre reprend
          // le lien d'« Ouvrir » (hors tabulation : le bouton reste la cible
          // du clavier) ; les deux boutons, en contour, se lisent comme des
          // boutons et tombent sous le titre au téléphone. line-clamp-2 et
          // non truncate : le mois d'un reçu, seule chose qui le distingue
          // d'un autre, disparaissait dans l'ellipse.
          <ul className="divide-y divide-border">
            {pieces.map((p) => {
              const nom = p.titre || (TYPES_DOCUMENT[p.type] ?? "Document");
              const fichier = `/locataire/${orgId}/documents/${p.document_id}/fichier`;
              return (
                <li
                  key={`${p.source}-${p.document_id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm"
                >
                  <div className={TITRE_RANG}>
                    <b className="line-clamp-2 font-medium">{nom}</b>
                    <small className="block text-muted-foreground">{sousTitre(p)}</small>
                  </div>
                  {/* Liens stylés en bouton : hors du filet tactile du socle
                      (button/select), d'où le min-h au pointeur grossier */}
                  <span className={ACTIONS_RANG}>
                    <ApercuDocumentEspace fichier={fichier} titre={nom} mime={p.mime_type}/>
                    <a
                      href={`${fichier}?mode=telechargement`}
                      target="_blank"
                      rel="noopener"
                      aria-label={`Télécharger ${nom}`}
                      className={`pointer-coarse:min-h-10 ${buttonVariants({ variant: "outline", size: "sm" })}`}
                    >
                      Télécharger
                    </a>
                  </span>
                </li>
              );
            })}
            {quittances.map((q) => {
              const libelle = `${q.statut === "paye" ? "la" : "le"} ${libelleDocumentLoyer(q.statut)} ${deElide(moisLong(q.periode))}`;
              if (disponibilites[q.quittance_id!] !== "disponible") return <li key={q.quittance_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div><b className="font-medium first-letter:uppercase">{libelleDocumentLoyer(q.statut)} — {moisLong(q.periode)}</b>
                  <p className="text-xs text-muted-foreground">{disponibilites[q.quittance_id!] === "lecture_impossible" ? "Disponibilité à vérifier. Réessayez dans un instant." : "Des informations du document restent à compléter par votre gestionnaire."}</p></div>
                <span className="loc-tag ambre">{disponibilites[q.quittance_id!] === "lecture_impossible" ? "À vérifier" : "En préparation"}</span>
              </li>;
              return (
                <li
                  key={q.quittance_id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm"
                >
                  <Link
                    href={`/quittance/${q.quittance_id}`}
                    target="_blank"
                    rel="noopener"
                    tabIndex={-1}
                    className={TITRE_RANG}
                  >
                    <b className="line-clamp-2 font-medium first-letter:uppercase">
                      {libelleDocumentLoyer(q.statut)} — {moisLong(q.periode)}
                    </b>
                    <small className="block text-muted-foreground">Justificatif de paiement du loyer</small>
                  </Link>
                  {/* Les mêmes deux gestes que les pièces, dans la même colonne
                      (24/09) : le reçu n'avait qu'« Ouvrir », décalé à droite,
                      et ne se téléchargeait pas d'ici. La quittance n'a pas de
                      fichier : « Télécharger » ouvre sa page en mode
                      impression (?imprimer=1), d'où « Enregistrer en PDF ». */}
                  <span className={ACTIONS_RANG}>
                    <Link
                      href={`/quittance/${q.quittance_id}`}
                      target="_blank"
                      rel="noopener"
                      aria-label={`Ouvrir ${libelle}`}
                      className={`pointer-coarse:min-h-10 ${buttonVariants({ variant: "outline", size: "sm" })}`}
                    >
                      Ouvrir
                    </Link>
                    <Link
                      href={`/quittance/${q.quittance_id}?imprimer=1`}
                      target="_blank"
                      rel="noopener"
                      aria-label={`Enregistrer en PDF ${libelle}`}
                      className={`pointer-coarse:min-h-10 ${buttonVariants({ variant: "outline", size: "sm" })}`}
                    >
                      {/* Le geste réel (27/09) : la feuille d'impression, d'où
                          « Enregistrer en PDF » — pas un téléchargement. */}
                      Enregistrer en PDF
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {/* Une seule promesse de conservation, la même que « Mes paiements »
            (27/09) : « rien à archiver » contredisait la matrice RGPD, qui
            prévoit un archivage puis une anonymisation. */}
        <p className="mt-3 text-[13px] text-muted-foreground">
          {CONSERVATION_DOCUMENTS_LOCATAIRE}
        </p>
      </div></> },
        ]} />

    </div>
  );
}
