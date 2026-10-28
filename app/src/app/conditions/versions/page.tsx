import Link from "next/link";
import { CadreLegal } from "@/components/coquille-legale";
import {
  DOCUMENTS_CONDITIONS,
  DOCUMENTS_PUBLIES,
  LIBELLE_DOCUMENT,
  dateEnLettres,
  listerVersionsArchivees,
  releveApresEffet,
} from "@/lib/conditions-versions";
import { formaterDateParis } from "@/lib/heure-paris";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";
import { createClientPublic } from "@/lib/supabase/public";

export const metadata = metadonneesPubliques({
  titre: "Versions archivées des conditions générales — Gerimmo",
  description:
    "Les versions archivées des conditions générales de Gerimmo, telles qu'elles étaient publiées, avec leur date d'effet et leur empreinte.",
  chemin: "/conditions/versions",
});

// La liste publique des versions archivées (24/10/2026, plan de conformité, R12) : chaque version publiée des
// conditions reste lisible telle qu'elle a été acceptée (table `versions_conditions`, ajout seul, lecture publique).
// Rien ici n'est contractuel : la page renvoie au texte archivé de chaque version, et à la version en vigueur.

// Page publique relue toutes les heures (audit final, PUB-05) : lecture sans cookie.
export const revalidate = 3600;

export default async function PageVersionsConditions() {
  const db = createClientPublic();
  const versions = db ? await listerVersionsArchivees(db) : null;
  return (
    <CadreLegal chemin="/conditions">
      <div>
        <h1>Versions archivées des conditions générales</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chaque version archivée est rangée telle que la page publiée l’affichait, et ne se modifie plus. Son
          empreinte SHA-256 permet de vérifier que le texte n’a pas changé depuis.
        </p>
      </div>

      {versions === null ? (
        <section className="loc-carte text-sm">
          <p role="alert">Les versions archivées ne peuvent pas être lues pour le moment. Réessayez plus tard.</p>
        </section>
      ) : (
        DOCUMENTS_CONDITIONS.map((document) => {
          const publiee = DOCUMENTS_PUBLIES.find((d) => d.document === document);
          const archives = versions.filter((v) => v.document === document);
          if (!publiee && archives.length === 0) return null;
          return (
            <section key={document} className="loc-carte space-y-3 text-sm leading-relaxed" aria-labelledby={`versions-${document}`}>
              <h2 id={`versions-${document}`} className="text-[length:var(--pas-section)]">{LIBELLE_DOCUMENT[document]}</h2>
              {publiee && (
                <p>
                  Version en vigueur :{" "}
                  <Link href={publiee.chemin} className="lien-texte">
                    version du {publiee.dateAffichee}
                  </Link>
                  .
                </p>
              )}
              {archives.length === 0 ? (
                <p className="text-[var(--texte-secondaire)]">Aucune version n’est encore archivée.</p>
              ) : (
                <ul className="divide-y divide-[var(--filet)]">
                  {archives.map((v) => {
                    const releve = releveApresEffet(v);
                    return (
                    <li key={v.version} className="space-y-1 py-2.5">
                      <Link href={`/conditions/versions/${v.document}/${encodeURIComponent(v.version)}`} className="lien-texte font-semibold">
                        Version du {dateEnLettres(v.version)}
                      </Link>
                      <p>
                        En vigueur à compter du {dateEnLettres(v.date_effet)} ; archivée le {formaterDateParis(v.publiee_le)}.
                      </p>
                      {/* Relecture adverse du 24/10 (I2). */}
                      {releve && (
                        <p>
                          Archivée après sa date d’effet : texte relevé le {dateEnLettres(releve)} ; des corrections ont pu
                          intervenir entre le {dateEnLettres(v.date_effet)} et cette date sous la même version.
                        </p>
                      )}
                      <p className="text-[var(--texte-secondaire)]">{v.resume_modifications}</p>
                      <p className="text-xs text-[var(--texte-secondaire)] [overflow-wrap:anywhere]">
                        Empreinte SHA-256 : <code>{v.empreinte_sha256}</code>
                      </p>
                    </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })
      )}
    </CadreLegal>
  );
}
