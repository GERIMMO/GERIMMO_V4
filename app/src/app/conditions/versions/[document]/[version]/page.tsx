import Link from "next/link";
import { notFound } from "next/navigation";
import { CadreLegal } from "@/components/coquille-legale";
import {
  DOCUMENTS_PUBLIES,
  LIBELLE_DOCUMENT,
  dateEnLettres,
  estDocumentConditions,
  lireVersionArchivee,
} from "@/lib/conditions-versions";
import { formaterDateHeureParis, NOTE_FUSEAU } from "@/lib/heure-paris";
import { createClient } from "@/lib/supabase/server";

// Une version archivée des conditions (24/10/2026, plan de conformité, R12), affichée TELLE QU'ELLE A ÉTÉ RANGÉE :
// le HTML de la page publiée ce jour-là (titre, chapeau, articles), dans le cadre des pages légales, précédé de sa
// date d'effet, de sa date d'archivage et de son empreinte. Le texte vient de `versions_conditions`, en ajout seul, où
// seule l'action serveur du super-administrateur écrit, à partir de la page publiée ; son extraction refuse tout code
// actif (lib/conditions-versions.ts). Aucune réécriture ici : l'empreinte affichée est celle de ce texte, octet pour
// octet.

const FORME_VERSION = /^[0-9A-Za-z._-]{1,40}$/;

async function charger(params: Promise<{ document: string; version: string }>) {
  const { document, version: brute } = await params;
  let version: string;
  try {
    version = decodeURIComponent(brute);
  } catch {
    return null;
  }
  if (!estDocumentConditions(document) || !FORME_VERSION.test(version)) return null;
  const archivee = await lireVersionArchivee(await createClient(), document, version);
  return archivee === null ? null : { document, version, archivee };
}

export async function generateMetadata({ params }: PageProps<"/conditions/versions/[document]/[version]">) {
  const lu = await charger(params);
  if (!lu) return { title: "Version introuvable — Gerimmo" };
  return {
    title: `${LIBELLE_DOCUMENT[lu.document]}, version du ${dateEnLettres(lu.version)} — Gerimmo`,
    alternates: { canonical: `/conditions/versions/${lu.document}/${encodeURIComponent(lu.version)}` },
  };
}

export default async function PageVersionArchivee({ params }: PageProps<"/conditions/versions/[document]/[version]">) {
  const lu = await charger(params);
  if (!lu) notFound();
  const { document, version, archivee } = lu;
  const enVigueur = DOCUMENTS_PUBLIES.find((d) => d.document === document);
  return (
    <CadreLegal chemin="/conditions">
      <aside className="loc-carte space-y-1.5 text-sm" aria-label="Version archivée">
        {archivee === undefined ? (
          <p role="alert">Cette version ne peut pas être lue pour le moment. Réessayez plus tard.</p>
        ) : (
          <>
            <p>
              <b className="font-semibold">Version archivée.</b> {LIBELLE_DOCUMENT[document]}, version du{" "}
              {dateEnLettres(version)}, en vigueur à compter du {dateEnLettres(archivee.date_effet)}. Texte rangé le{" "}
              {formaterDateHeureParis(archivee.publiee_le)}, tel que la page publiée l’affichait.
            </p>
            <p className="text-xs text-[var(--texte-secondaire)] [overflow-wrap:anywhere]">
              Empreinte SHA-256 du texte ci-dessous : <code>{archivee.empreinte_sha256}</code>. {NOTE_FUSEAU}
            </p>
          </>
        )}
        <p>
          <Link href="/conditions/versions" className="lien-texte">Toutes les versions archivées</Link>
          {enVigueur && (
            <>
              {" · "}
              <Link href={enVigueur.chemin} className="lien-texte">Version en vigueur</Link>
            </>
          )}
        </p>
      </aside>
      {archivee && <div className="space-y-4" dangerouslySetInnerHTML={{ __html: archivee.texte_html }} />}
    </CadreLegal>
  );
}
