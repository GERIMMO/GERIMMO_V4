import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLES_GERANTS, formaterDateHeure } from "@/lib/ged";
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

// Le responsable de l'agence garde la main sur toutes les alertes et peut
// assigner « tout le monde » (revue recette 08/08)
const ROLES_RESPONSABLES = ["admin_agence", "proprietaire_direct"];

export default async function PageAlertes(
  props: PageProps<"/agence/[orgId]/alertes">
) {
  const { orgId } = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const { data: adhesion } = await supabase
    .from("memberships")
    .select("role")
    .eq("account_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .maybeSingle();
  if (!adhesion || !ROLES_GERANTS.includes(adhesion.role)) {
    redirect("/espaces");
  }
  const estResponsable = ROLES_RESPONSABLES.includes(adhesion.role);

  const { data: organisation } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();
  if (!organisation) notFound();

  const { data: ouvertes } = await supabase
    .from("alerts")
    .select("*")
    .eq("organization_id", orgId)
    .eq("statut", "ouverte")
    .order("criticite", { ascending: false })
    .order("echeance", { ascending: true, nullsFirst: false });

  const { data: fermees } = await supabase
    .from("alerts")
    .select("*")
    .eq("organization_id", orgId)
    .eq("statut", "fermee")
    .order("closed_at", { ascending: false })
    .limit(10);

  const { data: donneesMembres } = await supabase.rpc("org_membres_gerants", {
    org: orgId,
  });
  const membres = (donneesMembres ?? []) as {
    account_id: string;
    email: string;
    role: string;
  }[];

  const rangs = (ouvertes ?? []) as AlerteRang[];
  const nbMiennes = rangs.filter((a) => estConfieeAMoi(a, user.id)).length;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-7">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
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
                        fermée le {formaterDateHeure(a.closed_at)} — «{" "}
                        {a.closed_action} »
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
