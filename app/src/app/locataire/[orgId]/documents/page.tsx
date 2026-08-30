import Link from "next/link";
import { TYPES_DOCUMENT, estExpiree, formaterDate } from "@/lib/ged";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Mes documents — Gerimmo" };

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
  periode: string;
  quittance_id: string | null;
};

// Écran « Mes documents » — maquette pLocDocs : un tableau des pièces à
// disposition (bail signé, règlement de copropriété, attestations, pièces du
// dossier — sprint « Alertes & documents » pour les pièces du bail), une ligne par
// pièce avec Ouvrir / Télécharger. Les quittances gardent leur page dédiée.
// Besoin de recette du 26/08 : pendant qu'une attestation renouvelée attend
// sa validation, la dernière attestation VALIDÉE reste visible.
export default async function PageDocumentsLocataire(
  props: PageProps<"/locataire/[orgId]/documents">
) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspaceLocataire(orgId);

  const [{ data: piecesBrutes }, { data: echeancier }] = await Promise.all([
    supabase.rpc("mes_pieces_locataire", { p_org: orgId }),
    supabase.rpc("mon_echeancier_locataire", { p_org: orgId }),
  ]);
  const pieces = (piecesBrutes ?? []) as Piece[];
  const quittances = ((echeancier ?? []) as LigneEcheancier[]).filter(
    (l) => l.quittance_id
  );
  const total = pieces.length + quittances.length;

  // Deux attestations peuvent coexister : la validée en vigueur et celle en
  // cours de vérification — on l'explique sous le tableau. Une validée mais
  // EXPIRÉE n'est plus « en vigueur » (revue 26/08).
  const attestations = pieces.filter((p) => p.type === "attestation_assurance");
  const deuxAttestations =
    attestations.some((p) => p.verifie_le && !estExpiree(p.expire_le)) &&
    attestations.some((p) => !p.verifie_le);

  const moisLong = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

  const sousTitre = (p: Piece) => {
    const morceaux = [
      TYPES_DOCUMENT[p.type] ?? p.type,
      `déposé le ${formaterDate(p.depose_le)}`,
    ];
    if (p.expire_le) morceaux.push(`expire le ${formaterDate(p.expire_le)}`);
    return morceaux.join(" · ");
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-[1.125rem] p-4 sm:p-7">
      <div className="entete-page">
        <h1>Mes documents</h1>
        {total > 0 && (
          <span className="mono-discret">
            {total} pièce{total > 1 ? "s" : ""} à votre disposition
          </span>
        )}
      </div>

      <Card>
        <CardContent className="pt-5">
          {total === 0 ? (
            <p className="vide">
              Aucune pièce pour l&apos;instant — votre bail signé, le règlement de
              copropriété, vos quittances et vos attestations apparaîtront ici.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {pieces.map((p) => {
                const nom = p.titre || (TYPES_DOCUMENT[p.type] ?? p.type);
                return (
                  <li
                    key={`${p.source}-${p.document_id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      <b className="block truncate font-medium">{nom}</b>
                      <small className="block text-muted-foreground">{sousTitre(p)}</small>
                    </span>
                    {p.type === "attestation_assurance" &&
                      (p.verifie_le ? (
                        estExpiree(p.expire_le) ? (
                          <span className="puce puce-rouge shrink-0">Expirée</span>
                        ) : (
                          <span className="puce puce-loue shrink-0">Validée</span>
                        )
                      ) : (
                        <span className="puce puce-prep shrink-0">
                          En cours de vérification
                        </span>
                      ))}
                    <span className="flex shrink-0 items-center gap-2">
                      <a
                        href={`/locataire/${orgId}/documents/${p.document_id}/fichier`}
                        target="_blank"
                        rel="noopener"
                        aria-label={`Ouvrir ${nom}`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Ouvrir
                      </a>
                      <a
                        href={`/locataire/${orgId}/documents/${p.document_id}/fichier?mode=telechargement`}
                        target="_blank"
                        rel="noopener"
                        aria-label={`Télécharger ${nom}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Télécharger
                      </a>
                    </span>
                  </li>
                );
              })}
              {quittances.map((q) => (
                <li
                  key={q.quittance_id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <b className="block truncate font-medium">
                      Quittance — {moisLong(q.periode)}
                    </b>
                    <small className="block text-muted-foreground">
                      Quittance de loyer
                    </small>
                  </span>
                  <Link
                    href={`/quittance/${q.quittance_id}`}
                    target="_blank"
                    rel="noopener"
                    aria-label={`Ouvrir la quittance de ${moisLong(q.periode)}`}
                    className={`shrink-0 ${buttonVariants({ variant: "ghost", size: "sm" })}`}
                  >
                    Ouvrir
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {deuxAttestations && (
            <p className="mt-3.5 text-xs text-muted-foreground">
              Votre attestation validée reste en vigueur : elle sera remplacée
              dès que votre agence aura vérifié la nouvelle.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
