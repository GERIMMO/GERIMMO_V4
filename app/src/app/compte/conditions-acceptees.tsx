import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CHEMIN_CONDITIONS_ARTISANS, versionArtisansPubliee, type DocumentAccepte } from "@/lib/conditions-acceptation";
import { dernieresAcceptations, type AcceptationLue } from "@/lib/conditions-acceptation-serveur";
import { dateEnLettres } from "@/lib/conditions-versions";
import { CONDITIONS_VERSION } from "@/lib/editeur";
import { dateParis } from "@/lib/heure-paris-calcul";

// « Mon compte » : la version des conditions que le compte a acceptée, et le lien pour la relire (plan de conformité du
// 23/10/2026, lot 1A ; article 3 : « la version acceptée est consultable depuis Mon compte »). Une ligne par document
// accepté : conditions générales, conditions de l'espace artisan, règles des espaces invités (article 7 des conditions
// générales de la même version).

/** Le libellé de chaque ligne, avant « version du … ». */
const LIBELLE: Record<DocumentAccepte, string> = {
  conditions_clients: "Conditions acceptées",
  conditions_artisans: "Conditions de l’espace artisan acceptées",
  regles_invites: "Règles des espaces invités (article 7 des conditions générales) prises en compte",
};
const ORDRE: DocumentAccepte[] = ["conditions_clients", "conditions_artisans", "regles_invites"];

/**
 * Où relire la version acceptée : sa page archivée si elle l'est ; à défaut, la page en vigueur quand c'est la même
 * version (l'archivage suit chaque mise en ligne, geste du super-administrateur) ; sinon la liste des versions.
 * Les règles des espaces invités se relisent dans les conditions générales qui les portent.
 */
export function lienVersionAcceptee(a: Pick<AcceptationLue, "document" | "version">, archivees: ReadonlySet<string>): string {
  const document = a.document === "conditions_artisans" ? "conditions_artisans" : "conditions_clients";
  if (archivees.has(`${document}/${a.version}`)) return `/conditions/versions/${document}/${encodeURIComponent(a.version)}`;
  if (document === "conditions_clients" && a.version === CONDITIONS_VERSION) return "/conditions";
  if (document === "conditions_artisans" && a.version === versionArtisansPubliee()) return CHEMIN_CONDITIONS_ARTISANS;
  return "/conditions/versions";
}

/** « Conditions acceptées : version du 30 septembre 2026, le 2 octobre 2026 » (jour de Paris). */
export function texteAcceptation(a: AcceptationLue): string {
  const instant = new Date(a.acceptee_le);
  const le = Number.isNaN(instant.getTime()) ? "" : `, le ${dateEnLettres(dateParis(instant))}`;
  return `${LIBELLE[a.document]} : version du ${dateEnLettres(a.version)}${le}`;
}

export async function ConditionsAcceptees({ supabase, compteId }: { supabase: SupabaseClient; compteId: string }) {
  const dernieres = await dernieresAcceptations(supabase, compteId);
  const lignes = dernieres ? ORDRE.flatMap((d) => (dernieres[d] ? [dernieres[d]] : [])) : [];
  // Les versions archivées parmi celles-là (lecture publique) ; une lecture en échec renvoie vers la page en vigueur.
  let archivees = new Set<string>();
  if (lignes.length > 0) {
    const { data } = await supabase
      .from("versions_conditions")
      .select("document, version")
      .in("version", [...new Set(lignes.map((l) => l.version))]);
    archivees = new Set(((data ?? []) as { document: string; version: string }[]).map((v) => `${v.document}/${v.version}`));
  }
  return (
    <div className="loc-carte" id="conditions-acceptees">
      <div className="entete-carte">
        <h2 className="titre-carte leading-[inherit]">Conditions générales</h2>
      </div>
      {dernieres === null ? (
        <p role="alert" className="text-sm">
          Les conditions acceptées ne peuvent pas être lues pour le moment. Réessayez dans un instant.
        </p>
      ) : lignes.length === 0 ? (
        <p className="mesure-lecture text-sm text-muted-foreground">
          Aucune acceptation des conditions n’est enregistrée pour ce compte.{" "}
          <Link href="/conditions" className="lien-discret">
            Consulter les conditions générales en vigueur
          </Link>
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {lignes.map((a) => (
            <li key={a.document}>
              {texteAcceptation(a)} —{" "}
              <Link href={lienVersionAcceptee(a, archivees)} className="lien-discret">
                consulter
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
