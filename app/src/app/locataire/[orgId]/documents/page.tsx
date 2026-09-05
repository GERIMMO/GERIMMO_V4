import Link from "next/link";
import { TYPES_DOCUMENT, estExpiree, formaterDate } from "@/lib/ged";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { buttonVariants } from "@/components/ui/button";
import { FormulaireAttestation } from "../formulaire-attestation";

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

function statutAssurance(expire: string | null): { texte: string; classe: string } {
  if (!expire) return { texte: "sans date d'expiration", classe: "text-muted-foreground" };
  // Minuit LOCAL des deux côtés (revue 23/08 : la date seule se parse en UTC,
  // le lendemain de l'expiration affichait encore « expire dans 0 j »)
  const jours = Math.ceil(
    (new Date(`${expire}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
  );
  if (jours < 0) return { texte: `expirée depuis ${-jours} j`, classe: "text-destructive" };
  if (jours <= 30)
    return {
      texte: `expire dans ${jours} j (${formaterDate(expire)})`,
      classe: "text-warning-soft-foreground",
    };
  return { texte: `valide jusqu'au ${formaterDate(expire)}`, classe: "text-success-soft-foreground" };
}

// « Mes documents » (maquette v10) : ce qui est conservé pour moi, et mon
// assurance habitation — l'obligation annuelle — déposée ici.
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
  const quittances = ((echeancier ?? []) as LigneEcheancier[]).filter((l) => l.quittance_id);
  const total = pieces.length + quittances.length;

  // La DERNIÈRE attestation fait foi (recette 21/08) ; pendant la vérification
  // d'un renouvellement, la dernière VALIDÉE non expirée reste en vigueur.
  const attestations = pieces
    .filter((p) => p.type === "attestation_assurance")
    .sort((a, b) => b.depose_le.localeCompare(a.depose_le));
  const assurance = attestations[0];
  const statut = assurance ? statutAssurance(assurance.expire_le) : null;
  const deuxAttestations =
    attestations.some((p) => p.verifie_le && !estExpiree(p.expire_le)) &&
    attestations.some((p) => !p.verifie_le);

  const moisLong = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  const sousTitre = (p: Piece) =>
    [
      TYPES_DOCUMENT[p.type] ?? p.type,
      `déposé le ${formaterDate(p.depose_le)}`,
      p.expire_le ? `expire le ${formaterDate(p.expire_le)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="space-y-4">
      <div className="entete-page">
        <h1>Mes documents</h1>
        {total > 0 && (
          <span className="mono-discret">
            {total} pièce{total > 1 ? "s" : ""} à votre disposition
          </span>
        )}
      </div>

      {/* L'obligation annuelle d'abord : l'assurance, avec le dépôt sur place */}
      <div
        className={`loc-carte ${assurance && !estExpiree(assurance.expire_le) ? "" : "border-l-4 border-l-[var(--or)]"}`}
      >
        <div className="entete-carte !mb-1">
          <h3 className="text-base font-medium">Votre assurance habitation</h3>
          {assurance &&
            (assurance.verifie_le ? (
              estExpiree(assurance.expire_le) ? (
                <span className="loc-tag rouge">Expirée</span>
              ) : (
                <span className="loc-tag vert">Validée</span>
              )
            ) : (
              <span className="loc-tag ambre">En cours de vérification</span>
            ))}
        </div>
        {assurance ? (
          <p className="text-sm text-muted-foreground">
            {assurance.titre || "Attestation déposée"} —{" "}
            <span className={statut?.classe}>{statut?.texte}</span>.
            {deuxAttestations &&
              " Votre attestation validée reste en vigueur pendant la vérification de la nouvelle."}
          </p>
        ) : (
          <p className="text-sm text-destructive-soft-foreground">
            Aucune attestation déposée. L&apos;assurance habitation est obligatoire
            pendant toute la durée du bail — déposez la vôtre ci-dessous, une
            photo lisible suffit.
          </p>
        )}
        <div className="mt-3.5">
          <FormulaireAttestation orgId={orgId} renouvellement={Boolean(assurance)} />
        </div>
      </div>

      <div className="loc-carte">
        <div className="entete-carte">
          <h3 className="text-base font-medium">Conservés pour vous</h3>
          <span className="mono-discret">{total} document{total > 1 ? "s" : ""}</span>
        </div>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
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
                  <b className="block truncate font-medium">Quittance — {moisLong(q.periode)}</b>
                  <small className="block text-muted-foreground">Quittance de loyer</small>
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
        <p className="mt-3 text-xs text-muted-foreground">
          Conservés pendant toute la durée légale — vous n&apos;avez rien à
          archiver.
        </p>
      </div>
    </div>
  );
}
