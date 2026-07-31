import { verifierAccesEspaceLocataire } from "@/lib/espace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormulaireAttestation } from "./formulaire-attestation";

export const metadata = { title: "Mon espace — Gerimmo" };

type Piece = {
  document_id: string;
  type: string;
  titre: string | null;
  expire_le: string | null;
};

function statutAssurance(expire: string | null): { texte: string; classe: string } {
  if (!expire) return { texte: "sans date d'expiration", classe: "text-muted-foreground" };
  const jours = Math.ceil(
    (new Date(expire).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
  );
  if (jours < 0) return { texte: `expirée depuis ${-jours} j`, classe: "text-destructive" };
  if (jours <= 30)
    return { texte: `expire dans ${jours} j (${expire})`, classe: "text-warning-soft-foreground" };
  return { texte: `valide jusqu'au ${expire}`, classe: "text-success-soft-foreground" };
}

export default async function PageLocataire(props: PageProps<"/locataire/[orgId]">) {
  const { orgId } = await props.params;
  const { supabase, personne } = await verifierAccesEspaceLocataire(orgId);

  const { data: pieces } = await supabase.rpc("mon_dossier_locataire", { p_org: orgId });
  const assurance = ((pieces ?? []) as Piece[]).find((p) => p.type === "attestation_assurance");

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Bonjour{personne?.prenom ? ` ${personne.prenom}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          Votre espace locataire — déposez et suivez votre attestation d&apos;assurance.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attestation d&apos;assurance habitation</CardTitle>
          <CardDescription>
            Obligation annuelle. Déposez la nouvelle attestation avant l&apos;échéance —
            votre agence est notifiée à chaque dépôt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {assurance ? (
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">{assurance.titre || "Attestation déposée"}</p>
              <p className={statutAssurance(assurance.expire_le).classe}>
                {statutAssurance(assurance.expire_le).texte}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune attestation déposée pour l&apos;instant.
            </p>
          )}
          <FormulaireAttestation orgId={orgId} renouvellement={Boolean(assurance)} />
        </CardContent>
      </Card>
    </main>
  );
}
