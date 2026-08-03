import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formaterDateHeure } from "@/lib/ged";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BoutonPurge } from "./bouton-purge";

export const metadata = { title: "Journaux et conservation — Gerimmo" };

const SORTS: Record<string, string> = {
  suppression: "Suppression",
  anonymisation: "Anonymisation",
  conservation: "Conservation justifiée",
};

export default async function PageJournaux() {
  const supabase = await createClient();
  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) redirect("/espaces");

  const [
    { data: regles },
    { data: audit },
    { data: technique },
    { data: acces },
    { count: enAttente },
  ] = await Promise.all([
    supabase.from("retention_rules").select("*").order("data_type"),
    supabase
      .from("audit_log")
      .select("action, organization_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("tech_log")
      .select("evenement, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("acces_pieces_log")
      .select("action, created_at, document:documents(type, titre)")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("purge_fichiers")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          <Link href="/admin" className="hover:underline">
            Console d&apos;administration
          </Link>{" "}
          / Journaux et conservation
        </p>
        <h1 className="text-2xl font-semibold">Journaux et conservation</h1>
      </div>

      <div className="mb-6">
        <BoutonPurge fichiersEnAttente={enAttente ?? 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Règles de conservation ({(regles ?? []).length})
            </CardTitle>
            <CardDescription>
              La matrice A2 : chaque durée découle d&apos;une finalité écrite,
              chaque type a un sort final. Appliquée chaque nuit (03h00) et à
              la demande ci-dessus.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Type de donnée</th>
                  <th className="py-2 pr-4">Finalité</th>
                  <th className="py-2 pr-4">Déclencheur</th>
                  <th className="py-2 pr-4">Durée</th>
                  <th className="py-2">Sort final</th>
                </tr>
              </thead>
              <tbody>
                {(regles ?? []).map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{r.libelle}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.finalite}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.declencheur}</td>
                    <td className="py-2 pr-4">
                      {r.duree_mois === 0
                        ? "Immédiate"
                        : r.duree_mois % 12 === 0
                          ? `${r.duree_mois / 12} an(s)`
                          : `${r.duree_mois} mois`}
                    </td>
                    <td className="py-2">{SORTS[r.sort] ?? r.sort}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Journal d&apos;audit</CardTitle>
            <CardDescription>
              Actions sensibles, conservées 3 ans (traversées super admin,
              purges…).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(audit ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Vide.</p>
            ) : (
              <ul className="divide-y">
                {(audit ?? []).map((l, i) => (
                  <li key={i} className="py-2 text-sm">
                    <span className="font-medium">{l.action}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formaterDateHeure(l.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Journal technique</CardTitle>
            <CardDescription>
              Événements de compte et erreurs, conservés 6 mois.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(technique ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Vide.</p>
            ) : (
              <ul className="divide-y">
                {(technique ?? []).map((l, i) => (
                  <li key={i} className="py-2 text-sm">
                    <span className="font-medium">{l.evenement}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formaterDateHeure(l.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Journal d&apos;accès aux pièces
            </CardTitle>
            <CardDescription>
              Toute consultation ou téléchargement d&apos;un document est
              tracé — conservé 1 an.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(acces ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Vide.</p>
            ) : (
              <ul className="divide-y">
                {(acces ?? []).map((l, i) => {
                  const doc = l.document as unknown as {
                    type: string;
                    titre: string | null;
                  } | null;
                  return (
                    <li key={i} className="py-2 text-sm">
                      <span className="font-medium">{l.action}</span>
                      <span className="ml-2 text-muted-foreground">
                        {doc?.titre ?? "(document purgé)"}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formaterDateHeure(l.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
