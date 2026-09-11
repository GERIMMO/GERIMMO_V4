import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { eur, formaterDate, moisEnFrancais } from "@/lib/ged";
import { initiales, nomComplet } from "@/lib/roles-personnes";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Mandats & rapports — Gerimmo" };

// Mandats & rapports (maquette v6, admin d'agence) : chaque mandat actif avec
// son mandant, ses lots, son dernier rapport de gestion et l'état du
// versement. Les gestes (générer, envoyer, verser) restent sur la fiche du
// mandant — cette page est la tour de contrôle.
export default async function PageMandats(props: PageProps<"/agence/[orgId]/mandats">) {
  const { orgId } = await props.params;
  const { supabase, role, estProprietaire } = await verifierAccesEspace(orgId);
  if (estProprietaire || role !== "admin_agence") notFound();

  const [
    { data: mandats, error: e1 },
    { data: lignes, error: e2 },
    { data: rapports, error: e3 },
    { data: personnes, error: e4 },
  ] = await Promise.all([
    supabase
      .from("mandats")
      .select("id, person_id, etat, date_debut")
      .eq("organization_id", orgId)
      .in("etat", ["actif", "preavis", "a_signer"])
      .order("created_at"),
    supabase
      .from("mandat_lignes")
      .select("mandat_id")
      .eq("organization_id", orgId)
      .is("date_fin", null),
    supabase
      .from("rapports_gestion")
      .select("mandat_id, mois, net, envoye_le, versement_montant, versement_date")
      .eq("organization_id", orgId)
      .order("mois", { ascending: false }),
    supabase
      .from("persons")
      .select("id, nom, prenom")
      .eq("organization_id", orgId),
  ]);
  // Un échec de lecture ne doit pas se déguiser en « aucun mandat » (audit
  // 09/09). Il était rendu dans .vide — la classe de l'ÉTAT VIDE, centrée et
  // grisée : l'échec ressemblait exactement à ce qu'il n'était pas.
  const lecturesEnEchec = [
    e1 && "les mandats",
    e2 && "les lots sous mandat",
    e3 && "les rapports de gestion",
    e4 && "les mandants",
  ].filter((x): x is string => Boolean(x));
  if (lecturesEnEchec.length > 0) {
    return (
      <main className="mx-auto w-full max-w-4xl p-4 sm:p-7">
        <div className="entete-page mb-4">
          <h1>Mandats &amp; rapports</h1>
        </div>
        <div className="err" role="alert">
          <p className="font-medium">
            {lecturesEnEchec.length > 1
              ? "Plusieurs lectures ont échoué"
              : "Une lecture a échoué"}{" "}
            : {lecturesEnEchec.join(", ")}.
          </p>
          <p className="mt-1">
            Ce n’est pas une agence sans mandat : c’est la lecture qui n’a pas
            abouti. Rechargez la page dans un instant — et n’en concluez rien
            sur les versements en attente.
          </p>
        </div>
      </main>
    );
  }

  const noms = new Map(
    ((personnes ?? []) as { id: string; nom: string; prenom: string | null }[]).map((p) => [
      p.id,
      p,
    ])
  );
  const lotsParMandat = new Map<string, number>();
  for (const l of (lignes ?? []) as { mandat_id: string }[]) {
    lotsParMandat.set(l.mandat_id, (lotsParMandat.get(l.mandat_id) ?? 0) + 1);
  }
  const dernierRapport = new Map<
    string,
    { mois: string; net: number | null; envoye_le: string | null;
      versement_montant: number | null; versement_date: string | null }
  >();
  for (const r of (rapports ?? []) as {
    mandat_id: string; mois: string; net: number | null;
    envoye_le: string | null; versement_montant: number | null; versement_date: string | null;
  }[]) {
    if (!dernierRapport.has(r.mandat_id)) dernierRapport.set(r.mandat_id, r);
  }
  // Les états s'affichent en français, jamais en valeur d'enum (audit 09/09)
  const ETATS_MANDAT: Record<string, string> = {
    a_signer: "à signer",
    preavis: "préavis",
  };
  const liste = ((mandats ?? []) as {
    id: string; person_id: string; etat: string; date_debut: string | null;
  }[]);
  // Rapport envoyé sans versement : c'est l'attente qui coûte la confiance
  const enAttenteVersement = liste.filter((m) => {
    const r = dernierRapport.get(m.id);
    return r && r.envoye_le && !r.versement_date;
  }).length;

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-7">
      <div className="entete-page mb-2">
        <h1>Mandats &amp; rapports</h1>
        {/* La requête écarte les mandats résiliés : dire « en cours », sinon
            le compte de tête se lit comme le nombre de mandats de l'agence. */}
        <span className="mono-discret">
          {liste.length} mandat{liste.length > 1 ? "s" : ""} en cours
        </span>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Chaque mandat, son mandant, son dernier rapport de gestion et l&apos;état du
        versement — les gestes se font sur la fiche du mandant.
      </p>

      {enAttenteVersement > 0 && (
        <div
          className="mb-4 border-l-[3px] border-l-[var(--or)] bg-[var(--or-clair)] p-3 text-sm"
          role="status"
        >
          {/* Le compte porte sur le DERNIER rapport de chaque mandat — c'est
              exactement ce que les puces « versement attendu » montrent plus
              bas. « n rapports envoyés » laissait croire à un total de
              rapports, et les deux chiffres ne se recoupaient pas. */}
          <b className="font-semibold">
            {enAttenteVersement} mandat{enAttenteVersement > 1 ? "s" : ""} dont le dernier
            rapport est envoyé sans versement émis.
          </b>{" "}
          <span className="text-muted-foreground">
            Le mandant reçoit son compte rendu, puis attend son argent — c&apos;est le
            versement qui clôt le mois.
          </span>
        </div>
      )}

      {liste.length === 0 ? (
        <div className="vide-guide">
          <p className="titre">Aucun mandat en cours</p>
          <p className="explication">
            Un mandat de gestion lie l&apos;agence à un propriétaire bailleur : c&apos;est
            lui qui ouvre les rapports de gestion et les versements. Il se crée
            depuis la fiche du propriétaire mandant, dans Personnes.
          </p>
        </div>
      ) : (
        <div className="colonne-liste">
          {liste.map((m) => {
            const p = noms.get(m.person_id);
            const r = dernierRapport.get(m.id);
            const nbLots = lotsParMandat.get(m.id) ?? 0;
            return (
              <div key={m.id} className="rang">
                <span aria-hidden className="avatar">
                  {p ? initiales(p.nom, p.prenom) : "◇"}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate">
                    {p ? nomComplet(p) : "Mandant"}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {nbLots} lot{nbLots > 1 ? "s" : ""}
                      {m.date_debut ? ` · depuis le ${formaterDate(m.date_debut)}` : ""}
                    </span>
                  </b>
                  <span className="montant block text-xs text-muted-foreground">
                    {r
                      ? `Rapport de ${moisEnFrancais(r.mois)} — ${
                          r.versement_date
                            ? `versé ${r.versement_montant != null ? eur(Number(r.versement_montant)) : ""} le ${formaterDate(r.versement_date)}`
                            : r.envoye_le
                              ? `envoyé le ${formaterDate(r.envoye_le)} · versement à émettre`
                              : "généré, à envoyer"
                        }`
                      : "Aucun rapport de gestion encore généré"}
                  </span>
                </span>
                {/* Puces et action groupées : sous 640px le .rang wrappe (socle
                    10/09) et le groupe passe entier sous le nom au lieu
                    d'écraser celui-ci ou de déborder de l'écran */}
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {m.etat !== "actif" && (
                    <span className="puce puce-prep">{ETATS_MANDAT[m.etat] ?? m.etat}</span>
                  )}
                  {r && r.envoye_le && !r.versement_date && (
                    <span className="puce puce-encre">versement attendu</span>
                  )}
                  <Link
                    href={`/agence/${orgId}/personnes/${m.person_id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Fiche mandant
                  </Link>
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Le rapport mensuel se génère sur la fiche du mandant (encaissé, honoraires
        au taux du mandat, net) ; son envoi et le versement y sont tracés. Le
        mandant reçoit — il n&apos;a pas d&apos;accès à l&apos;application (décision
        du 25/07).
      </p>
    </main>
  );
}
