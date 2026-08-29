import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { formaterDateHeure, ROLES_RESPONSABLES } from "@/lib/ged";
import { estConfieeAMoi } from "@/lib/alertes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormulaireAlerte } from "./formulaire-alerte";
import { ListeAlertes, type AlerteRang } from "./liste-alertes";

export const metadata = { title: "Alertes — Gerimmo" };

export default async function PageAlertes(
  props: PageProps<"/agence/[orgId]/alertes">
) {
  const { orgId } = await props.params;
  // « Traiter » depuis le tableau de bord ou la cloche (recette 22/08) : la
  // pop-up de traitement de cette alerte s'ouvre à l'arrivée sur la page.
  const { traiter } = await props.searchParams;
  const traiterId = typeof traiter === "string" ? traiter : undefined;
  const { supabase, user, role, organisation } = await verifierAccesEspace(orgId);
  const estResponsable = ROLES_RESPONSABLES.includes(role);

  // Trois lectures indépendantes : en parallèle plutôt qu'en cascade
  const [{ data: ouvertes }, { data: fermees }, { data: donneesMembres }] =
    await Promise.all([
      supabase
        .from("alerts")
        .select(
          "id, criticite, titre, echeance, created_at, assignee_account_id, assigned_all, escalades, details"
        )
        .eq("organization_id", orgId)
        .eq("statut", "ouverte")
        .order("criticite", { ascending: false })
        .order("echeance", { ascending: true, nullsFirst: false }),
      supabase
        .from("alerts")
        .select("id, titre, closed_at, closed_action, closed_by")
        .eq("organization_id", orgId)
        .eq("statut", "fermee")
        .order("closed_at", { ascending: false })
        .limit(10),
      supabase.rpc("org_membres_gerants", { org: orgId }),
    ]);
  const membres = (donneesMembres ?? []) as {
    account_id: string;
    email: string;
    role: string;
  }[];

  const rangs = (ouvertes ?? []) as AlerteRang[];
  const nbMiennes = rangs.filter((a) => estConfieeAMoi(a, user.id)).length;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href={`/agence/${orgId}`} className="hover:underline">
              {organisation.name}
            </Link>{" "}
            / Alertes
          </p>
          <h1>Alertes</h1>
        </div>
        <span className="mono-discret">
          {`${nbMiennes} à traiter · ${rangs.length - nbMiennes} confiée${rangs.length - nbMiennes > 1 ? "s" : ""} à d'autres`}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <ListeAlertes
            orgId={orgId}
            alertes={rangs}
            membres={membres}
            monCompte={user.id}
            estResponsable={estResponsable}
            ouvrirAlerteId={traiterId}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fermées récemment</CardTitle>
              <CardDescription>
                Conservées 1 an après fermeture (règle de conservation), puis
                purgées.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(fermees ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune.</p>
              ) : (
                <ul className="divide-y">
                  {(fermees ?? []).map((a) => (
                    <li key={a.id} className="py-2 text-sm">
                      <span className="font-medium">{a.titre}</span>
                      <span className="ml-2 text-muted-foreground">
                        {/* Sans auteur : fermée par l'événement d'origine (29/08) */}
                        {a.closed_by ? "fermée" : "fermée automatiquement"} le{" "}
                        {formaterDateHeure(a.closed_at)} — « {a.closed_action} »
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Créer une alerte</CardTitle>
            <CardDescription>
              Gerimmo en crée déjà tout seul — diagnostic périmé, état des lieux
              à faire, rapport à valider. Servez-vous d&apos;ici pour ce qui ne
              rentre pas dans ces cases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireAlerte
              orgId={orgId}
              membres={membres}
              estResponsable={estResponsable}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
