import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  CRITICITES,
  COULEURS_CRITICITE,
  ROLES_GERANTS,
  formaterDate,
  formaterDateHeure,
} from "@/lib/ged";
import { escaladerAlerte, fermerAlerte } from "@/app/actions/alertes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormulaireAlerte } from "./formulaire-alerte";

export const metadata = { title: "Alertes — Gerimmo" };

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
  const emailParCompte = new Map<string, string>(
    membres.map((m) => [m.account_id, m.email])
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          <Link href={`/agence/${orgId}`} className="hover:underline">
            {organisation.name}
          </Link>{" "}
          / Alertes
        </p>
        <h1 className="text-2xl font-semibold">Alertes</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Ouvertes ({(ouvertes ?? []).length})
              </CardTitle>
              <CardDescription>
                Une alerte se ferme par l&apos;action qui la résout — dites ce
                qui a été fait. L&apos;escalade la déplace nominativement, sans
                la dupliquer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(ouvertes ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune alerte ouverte.</p>
              ) : (
                <ul className="divide-y">
                  {(ouvertes ?? []).map((a) => {
                    const escaladeLiee = escaladerAlerte.bind(null, orgId, a.id);
                    const fermetureLiee = fermerAlerte.bind(null, orgId, a.id);
                    const nbEscalades = Array.isArray(a.escalades)
                      ? a.escalades.length
                      : 0;
                    return (
                      <li key={a.id} className="space-y-2 py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`badge-statut shrink-0 ${COULEURS_CRITICITE[a.criticite] ?? ""}`}
                          >
                            {CRITICITES[a.criticite] ?? a.criticite}
                          </span>
                          <span className="font-medium">{a.titre}</span>
                          {a.echeance && (
                            <span className="text-muted-foreground">
                              échéance {formaterDate(a.echeance)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Assignée à :{" "}
                          {a.assignee_account_id
                            ? (emailParCompte.get(a.assignee_account_id) ?? "—")
                            : "personne"}
                          {nbEscalades > 0 && ` · ${nbEscalades} escalade(s)`}
                          {" · créée le "}
                          {formaterDateHeure(a.created_at)}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {a.criticite !== "informative" && (
                            <form action={escaladeLiee} className="flex items-center gap-1">
                              <select
                                name="vers"
                                required
                                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                                defaultValue=""
                              >
                                <option value="" disabled>
                                  Escalader vers…
                                </option>
                                {membres
                                  .filter(
                                    (m) => m.account_id !== a.assignee_account_id
                                  )
                                  .map((m) => (
                                    <option key={m.account_id} value={m.account_id}>
                                      {m.email}
                                    </option>
                                  ))}
                              </select>
                              <Button variant="outline" size="sm" type="submit">
                                Escalader
                              </Button>
                            </form>
                          )}
                          <form action={fermetureLiee} className="flex flex-1 items-center gap-1">
                            <input
                              name="action_effectuee"
                              required
                              placeholder="Action effectuée (ferme l'alerte)…"
                              className="h-8 min-w-40 flex-1 rounded-md border border-input bg-transparent px-2 text-xs"
                            />
                            <Button variant="outline" size="sm" type="submit">
                              Fermer
                            </Button>
                          </form>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

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
              Les alertes automatiques (assurances, diagnostics…) arriveront
              avec leurs modules ; ici, création manuelle.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireAlerte orgId={orgId} membres={membres} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
