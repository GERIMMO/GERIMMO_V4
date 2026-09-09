import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eur, formaterDate, aujourdhuiParis } from "@/lib/ged";
import { buttonVariants } from "@/components/ui/button";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";

// Accueil de l'espace propriétaire (maquette PC v1 du 05/09) : son patrimoine
// en un regard — lots, encaissé, fiscalité — la liste de ce qui l'attend, et
// à droite la veille réglementaire (DPE) et son abonnement. Tout est réel :
// alertes, diagnostics, écritures.
export async function AccueilProprietaire({
  supabase,
  orgId,
  organisation,
  prenom = null,
}: {
  supabase: SupabaseClient;
  orgId: string;
  organisation: { name: string; status: string; essai_fin: string | null };
  // Prénom du compte connecté (métadonnées d'inscription) — audit 09/09
  prenom?: string | null;
}) {
  const moisCourant = `${aujourdhuiParis().slice(0, 7)}-01`;
  const [
    { data: lots },
    { count: nbBiens },
    { data: encaissements },
    { data: alertes },
    { data: dpe },
  ] = await Promise.all([
    supabase.from("lots").select("id, etat").eq("organization_id", orgId).neq("etat", "archive"),
    supabase.from("biens").select("*", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase
      .from("encaissements")
      .select("montant")
      .eq("organization_id", orgId)
      .gte("date_paiement", moisCourant),
    supabase
      .from("alerts")
      .select("id, titre, criticite, echeance")
      .eq("organization_id", orgId)
      .eq("statut", "ouverte")
      .order("echeance", { ascending: true, nullsFirst: false })
      .limit(5),
    // Veille réglementaire : DPE F et G — interdiction de louer (G depuis
    // 2025, F au 1ᵉʳ janvier 2028, loi Climat et résilience)
    supabase
      .from("diagnostics")
      .select("classe_dpe, lot:lots(nom, etat)")
      .eq("organization_id", orgId)
      .eq("type", "dpe")
      .in("classe_dpe", ["F", "G"])
      .is("archived_at", null),
  ]);

  const nbLots = (lots ?? []).length;
  const loues = (lots ?? []).filter((l) => l.etat === "loue" || l.etat === "preavis").length;
  const vacants = nbLots - loues;
  const encaisse = (encaissements ?? []).reduce((s, e) => s + Number(e.montant), 0);
  const nomMois = new Date().toLocaleDateString("fr-FR", { month: "long", timeZone: "Europe/Paris" });
  const passoires = ((dpe ?? []) as {
    classe_dpe: string;
    lot: UnOuPlusieurs<{ nom: string; etat: string }>;
  }[]).map((d) => ({ classe: d.classe_dpe, lot: premier(d.lot) }));
  // Grille tarifaire actée (05/09, remplace celle du 25/07) : 1ᵉʳ bien offert,
  // 5,99 €/bien/mois ensuite
  const biensPayants = Math.max(0, (nbBiens ?? 0) - 1);
  const totalMensuel = biensPayants * 5.99;
  const aujourdhui = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-7">
      <div>
        <p className="mono-discret normal-case">{aujourdhui}</p>
        <h1 className="mt-0.5">Bonjour{prenom ? ` ${prenom}` : ""},</h1>
        <p className="text-sm text-muted-foreground">
          Voici l&apos;essentiel de votre patrimoine — {organisation.name}.
        </p>
      </div>

      <div className="loc-hero">
        <span className="loc-vignette" aria-hidden>
          {(organisation.name?.[0] ?? "G").toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="font-heading text-xl text-[var(--encre)]">
            {nbLots} lot{nbLots > 1 ? "s" : ""} en gestion directe
          </p>
          <p className="text-[13px] text-muted-foreground">
            {loues} loué{loues > 1 ? "s" : ""} · {vacants} vacant{vacants > 1 ? "s" : ""} — aucun
            honoraire de gestion, jamais
          </p>
          <Link
            href={`/agence/${orgId}/parc`}
            className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-2.5`}
          >
            Voir mes lots →
          </Link>
        </div>
        <div className="loc-citation">
          Vos biens, tenus
          <br />
          au carré.
        </div>
      </div>

      <div className="loc-grille">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="loc-carte loc-kpi">
              <p className="text-[13px] font-semibold text-[var(--encre)]">Encaissé en {nomMois}</p>
              <p className="v">{eur(encaisse)}</p>
              <p className="text-xs text-muted-foreground">
                quittances émises à l&apos;encaissement
              </p>
              <Link href={`/agence/${orgId}/comptabilite`} className="lien-discret mt-3 block text-[13px]">
                Voir mes loyers →
              </Link>
            </div>
            <div className="loc-carte loc-kpi">
              <p className="text-[13px] font-semibold text-[var(--encre)]">Fiscalité</p>
              <p className="v" style={{ fontSize: 20 }}>Récap 2044</p>
              <p className="text-xs text-muted-foreground">
                alimenté par votre livre, rubrique par rubrique, quote-part comprise
              </p>
              <Link
                href={`/agence/${orgId}/comptabilite/fiscal`}
                className="lien-discret mt-3 block text-[13px]"
              >
                Voir mon récapitulatif →
              </Link>
            </div>
            <div className="loc-carte loc-kpi">
              <p className="text-[13px] font-semibold text-[var(--encre)]">Mes lots</p>
              <p className="v">
                {loues} / {nbLots || "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                lot{nbLots > 1 ? "s" : ""} loué{loues > 1 ? "s" : ""}
              </p>
              <span className={`loc-tag mt-2.5 ${vacants ? "ambre" : "vert"}`}>
                {nbLots === 0
                  ? "Créez votre premier bien"
                  : vacants
                    ? `${vacants} lot${vacants > 1 ? "s" : ""} à relouer`
                    : "✓ Plein régime"}
              </span>
            </div>
          </div>

          <div className="loc-carte border-l-4 border-l-[var(--or)]">
            <div className="entete-carte">
              <h3 className="font-heading text-lg">À faire</h3>
              <Link href={`/agence/${orgId}/alertes`} className="lien-discret text-[13px]">
                Toutes mes alertes →
              </Link>
            </div>
            {(alertes ?? []).length === 0 ? (
              <p className="text-sm text-success-soft-foreground">
                Rien ne vous attend — tout est en ordre.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(alertes ?? []).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      {a.titre}
                      {a.echeance && (
                        <small className="block text-muted-foreground">
                          échéance le {formaterDate(a.echeance)}
                        </small>
                      )}
                    </span>
                    {a.criticite === "critique" && (
                      <span className="puce puce-rouge shrink-0">critique</span>
                    )}
                    <Link
                      href={`/agence/${orgId}/alertes?traiter=${a.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Traiter
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {passoires.length > 0 && (
            <div className="loc-carte border-l-4 border-l-[var(--destructive)]">
              <div className="entete-carte !mb-1">
                <h3 className="text-base font-medium">Veille réglementaire</h3>
                <span className="loc-tag rouge">
                  {passoires.length} alerte{passoires.length > 1 ? "s" : ""}
                </span>
              </div>
              {passoires.map((p, ix) => (
                <p key={ix} className="mt-1.5 text-sm">
                  <b className="font-semibold">
                    DPE classe {p.classe} — {p.lot?.nom ?? "lot"}.
                  </b>{" "}
                  <span className="text-muted-foreground">
                    {p.classe === "G"
                      ? "Location interdite (loi Climat) : des travaux de rénovation énergétique sont nécessaires avant toute mise en location."
                      : "Location interdite à partir du 1ᵉʳ janvier 2028 sans travaux — mieux vaut anticiper avant la remise en location."}
                  </span>
                </p>
              ))}
            </div>
          )}
          <div className="loc-carte">
            <div className="entete-carte !mb-1">
              <h3 className="text-base font-medium">Mon abonnement</h3>
              <span className={`loc-tag ${organisation.status === "essai" ? "ambre" : "vert"}`}>
                {organisation.status === "essai" ? "essai gratuit" : "actif"}
              </span>
            </div>
            <div className="ligne-info">
              <span>1ᵉʳ bien — offert</span>
              <span>0 €</span>
            </div>
            {biensPayants > 0 && (
              <div className="ligne-info">
                <span>
                  {biensPayants} bien{biensPayants > 1 ? "s" : ""} supplémentaire
                  {biensPayants > 1 ? "s" : ""} × 5,99 €
                </span>
                <span>{eur(totalMensuel)}/mois</span>
              </div>
            )}
            <Link
              href={`/agence/${orgId}/abonnement`}
              className="lien-discret mt-2.5 block text-[13px]"
            >
              Voir mon abonnement →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
