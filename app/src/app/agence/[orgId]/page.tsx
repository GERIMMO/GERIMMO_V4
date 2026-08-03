import Link from "next/link";
import { afficherEcheance } from "@/lib/echeances";
import { verifierAccesEspace } from "@/lib/espace";
import { ETATS_LOT, COULEURS_ETAT_LOT } from "@/lib/parc";
import {
  CRITICITES,
  ORDRE_CRITICITE,
  COULEURS_CRITICITE,
  formaterDate,
} from "@/lib/ged";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Tableau de bord — Gerimmo" };

// Tableau de bord de l'espace agence (posé au S2, complété en continu) :
// l'état du parc, les alertes à traiter, l'activité documentaire.
export default async function PageTableauDeBord(
  props: PageProps<"/agence/[orgId]">
) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);

  const [{ count: nbBiens }, { data: lots }, { data: alertes }, { count: nbDocuments }] =
    await Promise.all([
      supabase
        .from("biens")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabase.from("lots").select("etat").eq("organization_id", orgId),
      supabase
        .from("alerts")
        .select("id, criticite, titre, echeance, created_at")
        .eq("organization_id", orgId)
        .eq("statut", "ouverte")
        .order("created_at", { ascending: true }),
      supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .is("purged_at", null),
    ]);

  const parEtat = new Map<string, number>();
  for (const l of lots ?? []) {
    parEtat.set(l.etat, (parEtat.get(l.etat) ?? 0) + 1);
  }
  const alertesTriees = [...(alertes ?? [])].sort(
    (a, b) =>
      (ORDRE_CRITICITE[a.criticite] ?? 9) - (ORDRE_CRITICITE[b.criticite] ?? 9) ||
      a.created_at.localeCompare(b.created_at)
  );

  const nbAlertes = (alertes ?? []).length;
  const nbCritiques = (alertes ?? []).filter((a) => a.criticite === "critique").length;

  return (
    <main className="mx-auto w-full max-w-5xl p-7">
      <h1 className="mb-6 text-2xl font-semibold">Tableau de bord</h1>

      {/* Charte 04 — cartes de chiffre clé : libellé en capitales, chiffre en
          Cormorant. « Un seul bloc graphite par rangée : celui qui porte le
          chiffre le plus important » — ici les alertes quand il y en a, le parc
          sinon, puisque c'est ce qui appelle une action. */}
      <div className="mb-[1.125rem] grid gap-[1.125rem] sm:grid-cols-3">
        <Link href={`/agence/${orgId}/parc`}>
          <Card className={`h-full ${nbAlertes === 0 ? "bg-primary text-primary-foreground" : ""}`}>
            <CardHeader>
              <CardDescription className={nbAlertes === 0 ? "libelle-champ text-primary-foreground/70" : "libelle-champ"}>
                Parc géré
              </CardDescription>
              <CardTitle className={`chiffre-cle ${nbAlertes === 0 ? "text-primary-foreground" : ""}`}>
                {nbBiens ?? 0} bien{(nbBiens ?? 0) > 1 ? "s" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-3 gap-y-1.5">
              {[...parEtat.entries()].map(([etat, nb]) => (
                <span
                  key={etat}
                  className={`badge-statut shrink-0 ${nbAlertes === 0 ? "text-primary-foreground/80" : COULEURS_ETAT_LOT[etat] ?? ""}`}
                >
                  {nb} lot{nb > 1 ? "s" : ""} {ETATS_LOT[etat]?.toLowerCase() ?? etat}
                </span>
              ))}
              {parEtat.size === 0 && (
                <span className="text-sm text-muted-foreground">Aucun lot</span>
              )}
            </CardContent>
          </Card>
        </Link>
        <Link href={`/agence/${orgId}/alertes`}>
          <Card className={`h-full ${nbAlertes > 0 ? "bg-primary text-primary-foreground" : ""}`}>
            <CardHeader>
              <CardDescription className={nbAlertes > 0 ? "libelle-champ text-primary-foreground/70" : "libelle-champ"}>
                À traiter
              </CardDescription>
              <CardTitle className={`chiffre-cle ${nbAlertes > 0 ? "text-primary-foreground" : ""}`}>
                {nbAlertes}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-sm ${nbAlertes > 0 ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                {nbAlertes === 0
                  ? "Rien en attente"
                  : `dont ${nbCritiques} critique${nbCritiques > 1 ? "s" : ""}`}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href={`/agence/${orgId}/documents`}>
          <Card className="h-full">
            <CardHeader>
              <CardDescription className="libelle-champ">Documents</CardDescription>
              <CardTitle className="chiffre-cle">{nbDocuments ?? 0}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">classés dans l&apos;agence</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">À traiter en priorité</CardTitle>
          <CardDescription>
            Les alertes ouvertes, la plus critique et la plus ancienne d&apos;abord.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {alertesTriees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune alerte ouverte — tout est traité.
            </p>
          ) : (
            <ul className="divide-y">
              {alertesTriees.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
                  <span
                    className={`badge-statut shrink-0 ${COULEURS_CRITICITE[a.criticite] ?? ""}`}
                  >
                    {CRITICITES[a.criticite] ?? a.criticite}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{a.titre}</span>
                  {afficherEcheance(a.echeance) && (
                    <span className={`shrink-0 text-xs ${afficherEcheance(a.echeance)!.classe}`}>
                      {afficherEcheance(a.echeance)!.texte}
                    </span>
                  )}
                  <Link
                    href={`/agence/${orgId}/alertes`}
                    className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Traiter
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
