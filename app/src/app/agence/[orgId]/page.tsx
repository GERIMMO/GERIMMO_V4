import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import {
  afficherEcheance,
  dateRendezVous,
  echeanceRapport,
  resumerBlocage,
} from "@/lib/echeances";
import { cibleBlocage } from "@/lib/parc";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { CRITICITES, ORDRE_CRITICITE, COULEURS_CRITICITE, formaterDate } from "@/lib/ged";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Tableau de bord — Gerimmo" };

const eur = (n: number) =>
  `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`;

type Alerte = {
  id: string;
  type: string;
  criticite: string;
  titre: string;
  echeance: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

// Tableau de bord de l'espace agence. Il répond à une seule question : « que
// dois-je faire, et qu'est-ce qui est déjà en retard ? » — d'où le tri par
// échéance plutôt que par date de création, et la séparation nette entre ce qui
// est dépassé et ce qui vient.
export default async function PageTableauDeBord(props: PageProps<"/agence/[orgId]">) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);

  const [
    { count: nbBiens },
    { data: lots },
    { data: alertesBrutes },
    { count: nbDocuments },
    { data: dernierDoc },
    { data: rapports },
  ] = await Promise.all([
    supabase.from("biens").select("*", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("lots").select("id, nom, etat, bien_id").eq("organization_id", orgId),
    supabase
      .from("alerts")
      .select("id, type, criticite, titre, echeance, details, created_at")
      .eq("organization_id", orgId)
      .eq("statut", "ouverte"),
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("purged_at", null),
    supabase
      .from("documents")
      .select("created_at")
      .eq("organization_id", orgId)
      .is("purged_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("rapports_gestion")
      .select("id, mois, statut, mandat:mandats(date_rapport, person:persons(nom, prenom))")
      .eq("organization_id", orgId)
      .eq("statut", "a_valider")
      .order("mois"),
  ]);

  const alertes = (alertesBrutes ?? []) as Alerte[];

  // « Cette semaine » : les rendez-vous datés des quinze prochains jours, quelle
  // que soit leur origine — une alerte qui arrive à terme, un rapport à valider.
  // Le jour de la semaine en tête : on repère « jeudi » plus vite qu'une date.
  type RendezVous = {
    cle: string;
    date: string;
    titre: string;
    detail: string;
    depassee?: boolean;
  };
  const rendezVous: RendezVous[] = [];
  const lotsActifs = (lots ?? []).filter((l) => l.etat !== "archive");
  const nomsLots = new Map(lotsActifs.map((l) => [l.id, { nom: l.nom, bienId: l.bien_id }]));
  const nbLoues = lotsActifs.filter((l) => l.etat === "loue" || l.etat === "preavis").length;
  const enPreparation = lotsActifs.filter((l) => l.etat === "brouillon");

  // Ce qui bloque chaque lot en préparation : on ne garde que le premier motif,
  // le détail vit sur la fiche du lot.
  const blocages = new Map(
    await Promise.all(
      enPreparation.slice(0, 6).map(async (l) => {
        const { data } = await supabase.rpc("lot_blocages_location", { p_lot: l.id });
        return [l.id, ((data ?? []) as string[])[0] ?? null] as const;
      })
    )
  );

  // Tri par urgence réelle : l'échéance d'abord (les sans-date en fin), puis la
  // criticité, puis l'ancienneté.
  const triees = [...alertes].sort((a, b) => {
    if (a.echeance && b.echeance) {
      const parDate = a.echeance.localeCompare(b.echeance);
      if (parDate !== 0) return parDate;
    } else if (a.echeance !== b.echeance) {
      return a.echeance ? -1 : 1;
    }
    return (
      (ORDRE_CRITICITE[a.criticite] ?? 9) - (ORDRE_CRITICITE[b.criticite] ?? 9) ||
      a.created_at.localeCompare(b.created_at)
    );
  });
  const aujourdhui = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const depassees = triees.filter((a) => a.echeance && a.echeance < aujourdhui);
  const aVenir = triees.filter((a) => !a.echeance || a.echeance >= aujourdhui);
  const plusUrgente = depassees[0]
    ? afficherEcheance(depassees[0].echeance, new Date(), "long")
    : null;

  // Contexte d'une alerte : le lot concerné et le montant en jeu, tirés du
  // détail que chaque alerte transporte.
  for (const a of alertes) {
    const e = afficherEcheance(a.echeance);
    if (e && !e.depassee && e.jours <= 15) {
      const d = (a.details ?? {}) as Record<string, unknown>;
      const lot = typeof d.lot_id === "string" ? nomsLots.get(d.lot_id) : undefined;
      rendezVous.push({
        cle: `a-${a.id}`,
        date: a.echeance!,
        titre: a.titre,
        detail: lot ? lot.nom : (CRITICITES[a.criticite] ?? a.criticite),
      });
    }
  }
  for (const r of (rapports ?? []) as unknown as {
    id: string;
    mois: string;
    mandat: UnOuPlusieurs<{
      date_rapport: number;
      person: UnOuPlusieurs<{ nom: string; prenom: string | null }>;
    }>;
  }[]) {
    const m = premier(r.mandat);
    const p = premier(m?.person);
    // Un rapport n'est pas dû le premier jour du mois qu'il couvre, mais le jour
    // convenu au mandat, le mois suivant. Prendre `mois` tel quel faisait
    // apparaître le rapport de juin dans « cette semaine » au mois d'août.
    const echeance = echeanceRapport(r.mois, m?.date_rapport ?? 10);
    const e = afficherEcheance(echeance);
    // Les rapports en retard restent affichés : les masquer reviendrait à faire
    // disparaître du travail qui reste à faire.
    if (!e || (!e.depassee && e.jours > 15)) continue;
    const qui = p ? `${p.nom}${p.prenom ? ` ${p.prenom}` : ""}` : "Mandant";
    rendezVous.push({
      cle: `r-${r.id}`,
      date: echeance,
      titre: `Rapport de gestion de ${new Date(r.mois).toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" })}`,
      detail: e.depassee ? `${qui} · ${e.texte.toLowerCase()}` : `${qui} · à valider avant envoi`,
      depassee: e.depassee,
    });
  }
  rendezVous.sort((a, b) => a.date.localeCompare(b.date));

  const contexte = (a: Alerte) => {
    const d = (a.details ?? {}) as Record<string, unknown>;
    const lot = typeof d.lot_id === "string" ? nomsLots.get(d.lot_id) : undefined;
    const montant =
      typeof d.solde === "number"
        ? d.solde
        : typeof d.montant === "number"
          ? d.montant
          : typeof d.net === "number"
            ? d.net
            : null;
    return { lot, montant, libelle: typeof d.libelle === "string" ? d.libelle : null };
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-7 sm:py-7">
      <div className="mb-[1.125rem] flex flex-wrap items-baseline justify-between gap-3">
        <h1>Tableau de bord</h1>
        <p className="libelle-champ">
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Europe/Paris",
          })}
          {" · "}
          {new Date().toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Paris",
          })}
        </p>
      </div>

      {/* Trois chiffres clés. Charte : l'or signale — un liseré sur celui qui
          appelle une action, jamais un aplat. */}
      <div className="mb-[1.125rem] grid gap-[1.125rem] sm:grid-cols-3">
        <Link href={`/agence/${orgId}/alertes`}>
          <Card className={`h-full ${depassees.length > 0 ? "border-l-2 border-l-[var(--or)]" : ""}`}>
            <CardContent className="space-y-1">
              <p className="libelle-champ">À traiter</p>
              <p className="flex items-baseline gap-2">
                <span className="chiffre-cle">{alertes.length}</span>
                <span className="text-sm text-muted-foreground">
                  alerte{alertes.length > 1 ? "s" : ""} ouverte{alertes.length > 1 ? "s" : ""}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {plusUrgente ? (
                  <>
                    La plus urgente est <span className={plusUrgente.classe}>{plusUrgente.texte}</span>
                  </>
                ) : alertes.length > 0 ? (
                  "Aucune n'est en retard"
                ) : (
                  "Rien en attente"
                )}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/agence/${orgId}/parc`}>
          <Card className="h-full">
            <CardContent className="space-y-1">
              <p className="libelle-champ">Parc</p>
              <p className="flex items-baseline gap-2">
                <span className="chiffre-cle">{nbBiens ?? 0}</span>
                <span className="text-sm text-muted-foreground">
                  bien{(nbBiens ?? 0) > 1 ? "s" : ""} · {lotsActifs.length} lot
                  {lotsActifs.length > 1 ? "s" : ""}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {nbLoues} loué{nbLoues > 1 ? "s" : ""} · {enPreparation.length} en préparation
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/agence/${orgId}/documents`}>
          <Card className="h-full">
            <CardContent className="space-y-1">
              <p className="libelle-champ">Documents</p>
              <p className="flex items-baseline gap-2">
                <span className="chiffre-cle">{nbDocuments ?? 0}</span>
                <span className="text-sm text-muted-foreground">
                  pièce{(nbDocuments ?? 0) > 1 ? "s" : ""} déposée{(nbDocuments ?? 0) > 1 ? "s" : ""}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {dernierDoc ? `Dernier dépôt : ${formaterDate(dernierDoc.created_at)}` : "Aucun dépôt"}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-[1.125rem] lg:grid-cols-[1.6fr_1fr]">
        {/* À traiter en priorité */}
        <Card>
          <CardContent>
            <div className="flex items-baseline justify-between gap-3 pb-3">
              <h2 className="text-[1.1rem]">À traiter en priorité</h2>
              <Link
                href={`/agence/${orgId}/alertes`}
                className="text-[0.8125rem] text-muted-foreground hover:text-foreground"
              >
                Toutes les alertes
              </Link>
            </div>

            {alertes.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Rien à traiter — tout est à jour.</p>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5">
                  <span className="libelle-champ">Alerte</span>
                  <span className="libelle-champ">Échéance</span>
                </div>

                {[
                  { titre: "Échéance dépassée", liste: depassees, retard: true },
                  { titre: "À venir", liste: aVenir, retard: false },
                ].map(
                  (groupe) =>
                    groupe.liste.length > 0 && (
                      <div key={groupe.titre}>
                        <p className="flex items-center justify-end gap-2 border-b border-border bg-[var(--filet-leger)] px-3 py-1.5">
                          {groupe.retard && (
                            <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
                          )}
                          <span className="libelle-champ">{groupe.titre}</span>
                          <span className="libelle-champ">· {groupe.liste.length}</span>
                        </p>
                        <ul>
                          {groupe.liste.slice(0, groupe.retard ? 99 : 4).map((a) => {
                            const ech = afficherEcheance(a.echeance);
                            const { lot, montant, libelle } = contexte(a);
                            return (
                              <li
                                key={a.id}
                                className={`flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 ${
                                  a.criticite === "critique"
                                    ? "border-l-2 border-l-destructive pl-3"
                                    : groupe.retard
                                      ? "border-l-2 border-l-[var(--or)] pl-3"
                                      : ""
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  {a.criticite !== "normale" && (
                                    <p className={`badge-statut ${COULEURS_CRITICITE[a.criticite] ?? ""}`}>
                                      {CRITICITES[a.criticite] ?? a.criticite}
                                    </p>
                                  )}
                                  <p className="truncate font-medium">{a.titre}</p>
                                  {(lot || montant !== null || libelle) && (
                                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted-foreground">
                                      {lot && (
                                        <span className="badge-statut rounded-[3px] border border-border px-1.5 py-0.5 text-muted-foreground">
                                          {lot.nom}
                                        </span>
                                      )}
                                      {libelle && <span className="truncate">{libelle}</span>}
                                      {montant !== null && <span>{eur(montant)}</span>}
                                    </p>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                  <div className="text-right">
                                    {ech ? (
                                      <>
                                        <p className={`text-[0.8125rem] ${ech.classe}`}>{ech.texte}</p>
                                        {/* Au-delà de quinze jours, le texte relatif est déjà la
                                            date : la répéter dessous ne dit rien de plus. */}
                                        {ech.texte !== formaterDate(a.echeance) && (
                                          <p className="text-[0.8125rem] text-muted-foreground">
                                            {formaterDate(a.echeance)}
                                          </p>
                                        )}
                                      </>
                                    ) : (
                                      <p className="text-[0.8125rem] text-muted-foreground">
                                        sans échéance
                                      </p>
                                    )}
                                  </div>
                                  <span className="relative">
                                    <Link
                                      href={`/agence/${orgId}/alertes`}
                                      className={buttonVariants({
                                        size: "sm",
                                        variant:
                                          a.criticite === "critique" ? "destructive" : "outline",
                                      })}
                                    >
                                      Traiter
                                    </Link>
                                    {/* Le repère et le rouge vont ensemble, et
                                        seulement au critique : deux signaux pour une
                                        seule idée, sinon ni l'un ni l'autre n'alerte. */}
                                    {a.criticite === "critique" && (
                                      <span
                                        aria-hidden
                                        className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-[var(--or)] text-[0.625rem] font-medium text-[var(--encre)]"
                                      >
                                        !
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Colonne de droite */}
        <div className="space-y-[1.125rem]">
          <Card>
            <CardContent>
              <h2 className="pb-2 text-[1.1rem]">Cette semaine</h2>
              {rendezVous.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Rien de programmé dans les quinze jours.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {rendezVous.slice(0, 5).map((r) => (
                    <li key={r.cle} className="flex gap-3 py-2.5">
                      <span
                        className={`libelle-champ w-14 shrink-0 pt-0.5${r.depassee ? " text-destructive" : ""}`}
                      >
                        {dateRendezVous(r.date)}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm">{r.titre}</span>
                        <span className="block text-[0.8125rem] text-muted-foreground">
                          {r.detail}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-baseline justify-between gap-3 pb-2">
                <h2 className="text-[1.1rem]">Lots en préparation</h2>
                {enPreparation.length > 6 && (
                  <Link
                    href={`/agence/${orgId}/parc`}
                    className="text-[0.8125rem] text-muted-foreground hover:text-foreground"
                  >
                    Voir les {enPreparation.length}
                  </Link>
                )}
              </div>
              {enPreparation.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">Aucun lot en préparation.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {enPreparation.slice(0, 6).map((l) => {
                    const motif = blocages.get(l.id);
                    const cible = motif
                      ? cibleBlocage(motif, { orgId, bienId: l.bien_id, lotId: l.id })
                      : null;
                    return (
                      <li key={l.id} className="flex items-center gap-3 py-2.5">
                        <span className="badge-statut shrink-0 rounded-[3px] border border-border px-1.5 py-0.5 text-muted-foreground">
                          {l.nom}
                        </span>
                        <Link
                          href={cible?.href ?? `/agence/${orgId}/parc/${l.bien_id}/lots/${l.id}`}
                          className="min-w-0 flex-1 truncate text-sm hover:underline"
                        >
                          {motif ? resumerBlocage(motif) : "Prêt à publier"}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
