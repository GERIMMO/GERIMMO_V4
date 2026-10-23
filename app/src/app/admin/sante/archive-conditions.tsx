import Link from "next/link";
import { BoutonArchiverConditions } from "./bouton-archiver-conditions";
import { DOCUMENTS_PUBLIES, LIBELLE_DOCUMENT, dateEnLettres, estDocumentConditions, type VersionArchivee } from "@/lib/conditions-versions";
import { formaterDateHeureParis } from "@/lib/heure-paris";

/** Une ligne de `acceptations_sans_version_archivee()`. */
export type AcceptationsSansArchive = {
  document: string;
  version: string;
  acceptations: number;
  premiere: string;
  derniere: string;
};

/**
 * ARCHIVE DES CONDITIONS (24/10/2026, plan de conformité, R12) : la version en vigueur de chaque document publié
 * est-elle archivée, et des acceptations portent-elles sur une version qui ne l'est pas ?
 *
 * Tant que ce contrôle n'est pas vide en production, la clé étrangère des acceptations vers les versions archivées
 * n'est pas posée : elle ferait échouer les inscriptions et les souscriptions. Une migration dédiée la posera.
 * `versions` et `sansArchive` valent `null` quand leur lecture a échoué : on le dit, sans rien conclure.
 */
export function ArchiveConditions({
  versions,
  sansArchive,
  autorise,
}: {
  versions: VersionArchivee[] | null;
  sansArchive: AcceptationsSansArchive[] | null;
  autorise: boolean;
}) {
  const enVigueur = DOCUMENTS_PUBLIES.map((d) => ({
    ...d,
    archivee: versions?.find((v) => v.document === d.document && v.version === d.version) ?? null,
  }));
  const aJour = versions !== null && sansArchive !== null && sansArchive.length === 0 && enVigueur.every((d) => d.archivee);
  const libelle = (document: string) => (estDocumentConditions(document) ? LIBELLE_DOCUMENT[document] : document);
  return (
    <section className="section-ecran" id="archive-conditions" aria-labelledby="titre-archive-conditions">
      <div className="entete-carte mb-3">
        <h2 id="titre-archive-conditions" className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">
          Archive des conditions générales
        </h2>
        <span className={`puce ${aJour ? "puce-loue" : "puce-prep"}`}>{aJour ? "à jour" : "à archiver"}</span>
      </div>
      <div className="loc-carte space-y-3 text-sm">
        {versions === null ? (
          <p role="alert">Les versions archivées n’ont pas pu être lues : aucun état n’est confirmé.</p>
        ) : (
          <ul className="space-y-1">
            {enVigueur.map((d) => (
              <li key={d.document} className="[overflow-wrap:anywhere]">
                {LIBELLE_DOCUMENT[d.document]}, version du {d.dateAffichee} :{" "}
                {d.archivee ? (
                  <>
                    archivée le {formaterDateHeureParis(d.archivee.publiee_le)}, empreinte{" "}
                    <code className="text-[12px]">{d.archivee.empreinte_sha256}</code>.
                  </>
                ) : (
                  <b className="font-semibold">pas encore archivée.</b>
                )}
              </li>
            ))}
          </ul>
        )}
        {sansArchive === null ? (
          <p role="alert">Le contrôle des acceptations n’a pas pu être lu.</p>
        ) : sansArchive.length === 0 ? (
          <p>Toutes les acceptations enregistrées portent sur une version archivée.</p>
        ) : (
          <>
            <p>
              Acceptations enregistrées pour une version qui n’est pas archivée (elles restent valables ; la version
              doit être archivée) :
            </p>
            <ul className="ml-4 list-disc space-y-1">
              {sansArchive.map((a) => (
                <li key={`${a.document}-${a.version}`}>
                  {libelle(a.document)}, version du {dateEnLettres(a.version)} : {a.acceptations} acceptation
                  {Number(a.acceptations) > 1 ? "s" : ""}, du {formaterDateHeureParis(a.premiere)} au{" "}
                  {formaterDateHeureParis(a.derniere)}.
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-[var(--texte-secondaire)]">
          Le bouton lit la page publiée, telle qu’un visiteur la reçoit, et range son texte et l’identité de
          l’éditeur qui s’y affiche, avec leur empreinte. Une version archivée ne se modifie plus : si la page publiée
          change sous la même version, l’archivage est refusé et le relais est alerté. À refaire après chaque mise en
          ligne qui change les conditions.
        </p>
        <BoutonArchiverConditions autorise={autorise} />
        <p>
          <Link href="/conditions/versions" className="lien-discret">
            Versions archivées (page publique) →
          </Link>
        </p>
      </div>
    </section>
  );
}
