import Link from "next/link";
import { SuiviSignatureDevisArtisan } from "@/components/suivi-signature-devis-artisan";
import { CalendarDays, FileText, MapPin, ShieldCheck, Wrench } from "lucide-react";
import { chargerPreparationDevis } from "@/lib/parcours-devis-serveur";
import { RenvoyerEmail } from "./renvoyer-email";
import { notFound } from "next/navigation";
import { titreIncident } from "@/lib/incidents";
import { decalerJour } from "@/lib/agenda-gestion";
import { aujourdhuiParis } from "@/lib/ged";
import {
  chargerFicheArtisan,
  chargerPhotosDemande,
  chargerSollicitations,
  chargerVersionsDevis,
  verifierAccesArtisan,
  type LigneSollicitation,
} from "../../acces";
import { PhotosDeLaDemande } from "../../photos-demande";
import {
  dateSimple,
  demandeAChiffrer,
  euros,
  jourCourt,
  libelle,
  NATURES_TRAVAUX,
  STATUTS_SOLLICITATION,
} from "../../libelles";
import { VersionsPrecedentes } from "./versions-precedentes";
import {
  Avertissement,
  Carte,
  CLASSE_AIDE,
  Etiquette,
  LigneInfo,
  MarqueAgence,
  Retour,
  TitreSection,
} from "../../ui";
import { FormulaireAvecReprise } from "./formulaire-avec-reprise";
import styles from "./devis.module.css";

/** Le titre suit l'écran : un formulaire de réponse, ou le récapitulatif d'une demande close. */
export async function generateMetadata(
  props: PageProps<"/artisan/devis/[sollicitationId]">
) {
  const { sollicitationId } = await props.params;
  const sollicitations = await chargerSollicitations();
  const demande = sollicitations.lignes.find((l) => l.sollicitation_id === sollicitationId);
  return {
    title: demande && !demandeAChiffrer(demande.statut) ? "Demande de devis" : "Répondre à une demande",
  };
}

const TON_STATUT: Record<LigneSollicitation["statut"], "alerte" | "ok" | "encre" | "neutre"> = {
  envoyee: "alerte",
  retenue: "ok",
  devis_depose: "encre",
  declinee: "neutre",
  non_retenue: "neutre",
  expiree: "neutre",
  annulee: "neutre",
  refusee: "neutre",
  revision_demandee: "alerte",
};

/**
 * Répondre à une demande de devis.
 *
 * CE QUE L'ÉCRAN MONTRE EST EXACTEMENT CE QUE LA BASE REND : nature des
 * travaux, catégorie, description du désordre, commune, agence. Pas l'adresse
 * exacte, pas l'occupant — il chiffre un désordre, il n'a pas encore de
 * rendez-vous chez quelqu'un. L'adresse précise arrive avec la mission, s'il
 * est retenu.
 *
 * La décennale exigée est AFFICHÉE quand la nature des travaux la réclame
 * (RM-8.2.9) : il ne serait pas ici si la sienne n'était pas valide — le
 * filtre l'aurait écarté de la recherche — mais il doit savoir que la mission
 * en dépend, et qu'elle est REVÉRIFIÉE au moment où l'agence retient un devis.
 */
export default async function PageRepondreDevis(
  props: PageProps<"/artisan/devis/[sollicitationId]">
) {
  const { user } = await verifierAccesArtisan();
  const { sollicitationId } = await props.params;

  // D16 (14/10) : les photos jointes par le locataire, que la base ne rend que pour une demande encore vivante.
  // D18 (livraison 2) : l'historique des versions de son devis (les siennes seules).
  const [{ fiche }, sollicitations, photos, versions] = await Promise.all([
    chargerFicheArtisan(),
    chargerSollicitations(),
    chargerPhotosDemande(sollicitationId, null),
    chargerVersionsDevis(sollicitationId),
  ]);
  const demande = sollicitations.lignes.find(
    (l) => l.sollicitation_id === sollicitationId
  );
  if (!demande) notFound();
  // Une demande close n'attend plus rien, mais elle se relit : la liste la
  // montre coupée à trois lignes, et y renvoyer laissait l'artisan sans moyen
  // de lire la description entière ni de retrouver son devis (tour du 24/09).
  // D18 (livraison 2) : une demande en révision est de nouveau ouverte au chiffrage.
  const close = !demandeAChiffrer(demande.statut);
  const enRevision = demande.statut === "revision_demandee";
  const versionSuivante = (demande.version ?? 1) + 1;
  let preparation: Awaited<ReturnType<typeof chargerPreparationDevis>>["preparation"] = null;
  let erreurPreparation: string | undefined;
  // Audit final (DOC-08) : l'adresse de l'entreprise figure sur le devis, qui ne se valide pas sans elle. Elle se
  // signale dès l'ouverture, avec le chemin pour la compléter, plutôt qu'au moment de générer le PDF.
  let adresseManquante = false;
  try {
    const chargement = await chargerPreparationDevis(sollicitationId);
    preparation = chargement.preparation;
    adresseManquante = !chargement.profil.adresse?.trim();
  }
  catch { erreurPreparation = "Le service de préparation est momentanément indisponible. Vos devis déjà envoyés restent consultables."; }

  // Trente jours : la validité par défaut du module 9, celle que la base
  // appliquerait si le champ restait vide. Le jour est celui de Paris : le
  // serveur est en UTC, et entre minuit et 2 h (heure d'été) le jour UTC est
  // celui de la veille.
  const echeanceParDefaut = decalerJour(aujourdhuiParis(), 30);
  // Une validité au jour même est déjà dépassée pour la base : le champ refuse dès l'étape 2 (DOC-08).
  const validiteMinimum = decalerJour(aujourdhuiParis(), 1);

  const decennaleManquante = demande.decennale_requise && fiche?.decennale_valide === false;

  return (
    <div className={styles.page}>
      <Retour href="/artisan/devis">Demandes de devis</Retour>
      <header className={styles.entete}>
        <div className={styles.titre}>
          <span className={styles.iconeTitre}><FileText size={24} aria-hidden /></span>
          <div><p className={styles.surtitre}>{close ? "Votre demande de devis" : enRevision ? `Préparer la version ${versionSuivante}` : "Préparer votre devis"}</p><h1>{titreIncident(demande.categorie)}</h1></div>
        </div>
        <div className={styles.client}>
          <MarqueAgence nom={demande.agence_nom} />
          <span className="flex flex-wrap items-center gap-2">
          {demande.urgence === "urgente" && <Etiquette ton="alerte">Urgent</Etiquette>}
            <Etiquette ton={close ? TON_STATUT[demande.statut] : enRevision ? "alerte" : "attente"}>
              {close ? libelle(STATUTS_SOLLICITATION, demande.statut) : enRevision ? "Révision demandée" : "À chiffrer"}
            </Etiquette>
          </span>
        </div>
      </header>
      <section className={styles.demande} aria-label="La demande du client">
        <div className={styles.description}>
          <h2>La demande du client</h2>
          <p>
          {demande.description || "Aucune description transmise."}
          </p>
        </div>
        <ul className={styles.reperes}>
          <li><MapPin size={16} aria-hidden /><span>{[demande.ville, demande.code_postal].filter(Boolean).join(" · ") || "Commune non communiquée"}</span></li>
          <li><Wrench size={16} aria-hidden /><span>{libelle(NATURES_TRAVAUX, demande.nature_travaux)}</span></li>
          <li><CalendarDays size={16} aria-hidden /><span>Reçue le {jourCourt(demande.envoyee_le)}</span></li>
          <li><ShieldCheck size={16} aria-hidden /><span>Décennale {demande.decennale_requise ? "exigée" : "non exigée"}</span></li>
        </ul>
        {!close && <p className={styles.confidentialite}>L’adresse exacte et le contact de l’occupant seront disponibles si votre devis est retenu.</p>}
      </section>

      <PhotosDeLaDemande photos={photos.photos} erreur={photos.erreur} base={`/artisan/devis/${sollicitationId}/photos`} />

      {/* D18 (livraison 2) : ce que le client demande, et jusqu'à quand répondre. Le texte est le sien, tel quel. */}
      {enRevision && (
        <section className="rounded-xl border-2 border-[var(--destructive-soft-foreground)] bg-[var(--destructive-soft)] p-4" aria-label="Révision demandée" data-revision-demandee>
          <h2 className="text-lg font-semibold">Le client demande une révision de votre devis</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-[0.9375rem]">
            Ce qui est demandé&nbsp;: « {demande.revision_motif ?? "aucune précision transmise"} »
          </p>
          <p className="mt-2 text-[0.9375rem]">
            {demande.revision_avant
              ? `Répondez avant le ${dateSimple(demande.revision_avant)} : envoyez la version ${versionSuivante} en disant ce qui change, ou renoncez. Sans réponse à cette date, la demande sera close.`
              : `Envoyez la version ${versionSuivante} en disant ce qui change, ou renoncez.`}
          </p>
          <p className={`mt-2 ${CLASSE_AIDE}`}>Votre version {demande.version ?? 1} reste consultable ci-dessous ; le formulaire est prérempli avec elle.</p>
        </section>
      )}

      {close ? (
        <Carte>
          <TitreSection>Ma réponse</TitreSection>
          {preparation?.statut === "envoye" && <div className="mb-4 rounded-xl border border-[var(--filet)] p-4">
            <p className="font-semibold">Devis enregistré dans les deux espaces Gerimmo</p>
            {preparation.email_statut === "envoye" ? <p className="mt-1 text-sm text-emerald-800">E-mail avec le PDF transmis au demandeur.</p> : <><p className="mt-1 text-sm text-amber-900">Le devis est disponible sur Gerimmo, mais l’e-mail n’a pas pu être envoyé.</p><RenvoyerEmail id={sollicitationId} revision={preparation.revision}/></>}
          </div>}
          {/* D18 (livraison 1) : le client a refusé ce devis ; son motif est transmis tel quel, il n'y a rien d'autre à faire. */}
          {demande.statut === "refusee" && (
            <div className="mb-4 rounded-xl border border-[var(--filet)] p-4" data-devis-refuse>
              <p className="font-semibold">Votre devis n’a pas été retenu&nbsp;: le client l’a refusé.</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-[0.9375rem]">
                Motif transmis&nbsp;: « {demande.decision_motif ?? "aucun motif transmis"} »
              </p>
              <p className={`mt-2 ${CLASSE_AIDE}`}>Cette demande est close&nbsp;: vous n’avez rien d’autre à faire. Votre devis reste consultable ci-dessous.</p>
            </div>
          )}
          {/* L'état est l'étiquette de l'en-tête ; ici, ce qu'il a répondu. */}
          <div>
            {demande.montant_ttc_cents !== null && (
              <LigneInfo libelle="Montant">{euros(demande.montant_ttc_cents)} TTC</LigneInfo>
            )}
            {demande.valide_jusqu_au && (
              <LigneInfo libelle="Valable jusqu’au">{dateSimple(demande.valide_jusqu_au)}</LigneInfo>
            )}
          </div>
          {demande.montant_ttc_cents !== null ? (
            <a
              href={`/api/devis/${demande.sollicitation_id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
            >
              Ouvrir mon devis PDF Gerimmo
            </a>
          ) : (
            <p className={`mt-3 ${CLASSE_AIDE}`}>
              Aucun devis n’a été envoyé pour cette demande.
            </p>
          )}
        </Carte>
      ) : (
        <>
          {decennaleManquante && (
            <Avertissement>
              Ces travaux exigent une décennale valide, et la vôtre ne l’est plus.
              Elle est revérifiée au moment où votre interlocuteur retient un devis&nbsp;:{" "}
              <Link href="/artisan/attestations" className="font-semibold underline underline-offset-4">
                mettez-la à jour
              </Link>
              , sinon le vôtre ne pourra pas être retenu.
            </Avertissement>
          )}

          {adresseManquante && (
            <Avertissement>
              L’adresse de votre entreprise manque&nbsp;: elle figure sur le devis, qui ne pourra pas être validé sans elle.{" "}
              <Link href="/artisan/entreprise#documents" className="font-semibold underline underline-offset-4">
                Compléter ma fiche entreprise
              </Link>
            </Avertissement>
          )}

          <FormulaireAvecReprise
            key={`${user.id}:${sollicitationId}`}
            compteId={user.id}
            initiale={preparation}
            erreurPreparation={erreurPreparation}
            sollicitationId={sollicitationId}
            echeanceParDefaut={echeanceParDefaut}
            validiteMinimum={validiteMinimum}
            versionSuivante={enRevision ? versionSuivante : undefined}
          />
        </>
      )}

      {/* D18 (livraison 2) : l'historique de ses versions, en lecture seule. */}
      <SuiviSignatureDevisArtisan sollicitationId={demande.sollicitation_id}/>
      <VersionsPrecedentes sollicitationId={demande.sollicitation_id} versions={versions.lignes} erreur={versions.erreur} versionCourante={close ? null : demande.version ?? null} />
    </div>
  );
}
