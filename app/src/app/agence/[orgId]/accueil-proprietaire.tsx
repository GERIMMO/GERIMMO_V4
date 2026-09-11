import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eur, formaterDate, aujourdhuiParis } from "@/lib/ged";
import { buttonVariants } from "@/components/ui/button";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { actionsAttendues, sansAlertesDoublonnees } from "@/lib/actions-attendues";
import { ParcoursDemarrage } from "@/components/parcours-demarrage";

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
    { data: alertesBrutes },
    { data: dpe, error: erreurDpe },
    // « À faire » ne repose plus sur les seules alertes (audit 09/09) : la
    // même source que la fiche bail — impayés, EDL d'entrée, diagnostics
    // obligatoires, pièces expirées — sinon l'accueil disait « tout est en
    // ordre » pendant que le bail affichait trois blocages.
    aFaireBaux,
    { data: lotsEngagesBruts, error: erreurLotsEngages },
  ] = await Promise.all([
    supabase
      .from("lots")
      .select("id, nom, etat, bien_id")
      .eq("organization_id", orgId)
      .neq("etat", "archive"),
    supabase.from("biens").select("*", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase
      .from("encaissements")
      .select("montant")
      .eq("organization_id", orgId)
      .gte("date_paiement", moisCourant),
    supabase
      .from("alerts")
      .select("id, titre, criticite, echeance, type, details")
      .eq("organization_id", orgId)
      .eq("statut", "ouverte")
      .order("echeance", { ascending: true, nullsFirst: false })
      .limit(5),
    // Veille réglementaire : DPE F et G — interdiction de louer (G depuis
    // 2025, F au 1ᵉʳ janvier 2028, loi Climat et résilience)
    supabase
      .from("diagnostics")
      .select("classe_dpe, lot:lots!diagnostics_lot_id_fkey(nom, etat)")
      .eq("organization_id", orgId)
      .eq("type", "dpe")
      .in("classe_dpe", ["F", "G"])
      .is("archived_at", null),
    actionsAttendues(supabase, orgId),
    // Lots déjà engagés : bail vivant OU seulement commencé. Sert au rappel
    // « prêt à louer, aucun bail » ci-dessous.
    supabase
      .from("baux")
      .select("lot_id")
      .eq("organization_id", orgId)
      .in("etat", ["brouillon", "actif", "preavis"]),
  ]);

  // Une alerte qui répète un item calculé (EDL d'entrée) ne s'affiche pas deux fois
  const alertes = sansAlertesDoublonnees(
    ((alertesBrutes ?? []) as {
      id: string;
      titre: string;
      criticite: string;
      echeance: string | null;
      type: string;
      details: Record<string, unknown> | null;
    }[]),
    aFaireBaux
  );

  // Relevé du 11/09 : la carte « À faire » ne pouvait structurellement RIEN
  // dire d'un lot prêt à louer. `actionsAttendues` part des baux « actif » ou
  // « preavis » (lib/actions-attendues) : un lot disponible SANS bail n'y
  // apparaît jamais, et il n'existe dans l'application ni page « Baux » ni
  // bouton « Nouveau bail » — le propriétaire qui revenait le lendemain
  // n'avait, depuis son accueil, aucun rappel de l'étape suivante.
  // Une lecture en échec ne rend pas de verdict : sans la liste des baux, on
  // ne peut pas affirmer qu'un lot n'en a pas.
  const lotsEngages = new Set(
    ((lotsEngagesBruts ?? []) as { lot_id: string }[]).map((b) => b.lot_id)
  );
  const lotsSansBail = erreurLotsEngages
    ? []
    : ((lots ?? []) as { id: string; nom: string; etat: string; bien_id: string }[]).filter(
        (l) => l.etat === "disponible" && !lotsEngages.has(l.id)
      );

  // « Disponible » ne veut pas dire « prêt ». La garde de transition ne
  // revérifie les blocages qu'au passage brouillon → disponible : un lot rendu
  // disponible il y a huit mois porte aujourd'hui un ERP périmé — sa validité
  // est de six mois — sans que rien ne l'ait fait redescendre. Écrire « il ne
  // lui manque que son bail » sans avoir lu les blocages, c'est l'affirmer au
  // hasard, et sur le cas le plus courant (relevé du 11/09).
  // On les lit donc, lot par lot, pour les seuls lots qu'on affiche — trois au
  // plus : `lots_blocages_location(p_org)` ne renverrait rien ici, elle ne
  // regarde que les lots en brouillon.
  const candidats = lotsSansBail.slice(0, 3);
  const blocagesParLot = new Map<string, string[] | null>();
  await Promise.all(
    candidats.map(async (l) => {
      const { data, error } = await supabase.rpc("lot_blocages_location", { p_lot: l.id });
      // Lecture en échec : on ne dit ni « prêt » ni « bloqué ».
      blocagesParLot.set(l.id, error ? null : ((data ?? []) as string[]));
    })
  );
  const lotsAouer = candidats.map((l) => ({ ...l, blocages: blocagesParLot.get(l.id) ?? null }));

  const nbLots = (lots ?? []).length;
  const loues = (lots ?? []).filter((l) => l.etat === "loue" || l.etat === "preavis").length;
  const vacants = nbLots - loues;
  const encaisse = (encaissements ?? []).reduce((s, e) => s + Number(e.montant), 0);
  const nomMois = new Date().toLocaleDateString("fr-FR", { month: "long", timeZone: "Europe/Paris" });
  // Le bloc « Veille réglementaire » ne s'affiche que s'il a quelque chose à
  // dire : sans distinction, une LECTURE EN ÉCHEC se lisait exactement comme
  // « aucune passoire » (constat du 11/09 : la requête échouait à chaque
  // chargement et le propriétaire d'un lot classé G ne voyait rien). Une
  // interdiction de louer ne se déduit pas d'une absence : on l'énonce.
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

      {/* Le chemin du démarrage, avant le reste tant qu'il reste une étape :
          celui qui vient de s'inscrire n'a ni chiffre ni action à lire, il a
          besoin de savoir par où commencer. Le bloc disparaît de lui-même une
          fois le premier bail actif. */}
      <ParcoursDemarrage supabase={supabase} orgId={orgId} />

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
              {/* Relevé du 11/09 : sur un parc VIDE, `vacants` vaut 0 — la
                  pastille sortait donc en `vert`, couleur de succès, pour dire
                  « Créez votre premier bien », et n'était qu'un <span> : un
                  verdict de réussite sur un patrimoine inexistant, sans le
                  geste. Le ton passe en attente, et la pastille devient le
                  lien. Le hero porte déjà « Voir mes lots → » : un lien
                  discret ici, pas un second bouton or (charte 04). */}
              {nbLots === 0 ? (
                <Link
                  href={`/agence/${orgId}/parc/nouveau`}
                  className="loc-tag ambre mt-2.5 hover:underline"
                >
                  Créer mon premier bien →
                </Link>
              ) : (
                <span className={`loc-tag mt-2.5 ${vacants ? "ambre" : "vert"}`}>
                  {vacants
                    ? `${vacants} lot${vacants > 1 ? "s" : ""} à relouer`
                    : "✓ Plein régime"}
                </span>
              )}
            </div>
          </div>

          <div className="loc-carte border-l-4 border-l-[var(--or)]">
            <div className="entete-carte">
              <h3 className="font-heading text-lg">À faire</h3>
              <Link href={`/agence/${orgId}/alertes`} className="lien-discret text-[13px]">
                Toutes mes alertes →
              </Link>
            </div>
            {aFaireBaux.length === 0 && alertes.length === 0 && lotsAouer.length === 0 ? (
              <p className="text-sm text-success-soft-foreground">
                Rien ne vous attend — tout est en ordre.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {/* Ce que la fiche de chaque bail affiche comme blocage —
                    même calcul, même liste (source commune) */}
                {aFaireBaux.map((a) => (
                  <li
                    key={a.cle}
                    className="flex flex-wrap items-center gap-2 py-2.5 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      {a.titre}
                      {a.detail && (
                        <small className="block text-muted-foreground">{a.detail}</small>
                      )}
                    </span>
                    {a.critique && <span className="puce puce-rouge shrink-0">critique</span>}
                    <Link
                      href={a.href}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Résoudre
                    </Link>
                  </li>
                ))}
                {/* Un lot prêt dont le bail reste à écrire : le seul formulaire
                    de création vit derrière l'ancre #baux de sa fiche. */}
                {lotsAouer.map((l) => {
                  const bloque = l.blocages !== null && l.blocages.length > 0;
                  const illisible = l.blocages === null;
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        {l.nom} —{" "}
                        {illisible
                          ? "disponible, aucun bail"
                          : bloque
                            ? `${l.blocages!.length} point${l.blocages!.length > 1 ? "s" : ""} à régler avant la mise en location`
                            : "prêt à louer, aucun bail"}
                        <small className="block text-muted-foreground">
                          {illisible
                            ? "Ce qui reste à faire avant la mise en location n'a pas pu être lu : la fiche du lot le dira."
                            : bloque
                              ? l.blocages!.slice(0, 2).join(" · ")
                              : "Le lot est disponible : il ne lui manque que son bail."}
                        </small>
                      </span>
                      <Link
                        href={`/agence/${orgId}/parc/${l.bien_id}/lots/${l.id}${bloque || illisible ? "" : "#baux"}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        {bloque || illisible ? "Ouvrir le lot" : "Créer le bail"}
                      </Link>
                    </li>
                  );
                })}
                {lotsSansBail.length > 3 && (
                  <li className="py-2.5 text-sm">
                    {/* Le compte vient de la liste COMPLÈTE : `lotsAouer` s'arrête
                        à trois, c'est la seule tranche dont on ait lu les
                        blocages. Et on n'écrit plus « prêts à louer » pour des
                        lots qu'on n'a pas examinés — seulement « sans bail ». */}
                    <Link href={`/agence/${orgId}/parc`} className="lien-discret">
                      {lotsSansBail.length - 3} autre
                      {lotsSansBail.length - 3 > 1 ? "s" : ""} lot
                      {lotsSansBail.length - 3 > 1 ? "s" : ""} disponible
                      {lotsSansBail.length - 3 > 1 ? "s" : ""} sans bail →
                    </Link>
                  </li>
                )}
                {alertes.map((a) => (
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
          {erreurDpe && (
            <div className="loc-carte border-l-4 border-l-[var(--destructive)]">
              <div className="entete-carte !mb-1">
                <h3 className="text-base font-medium">Veille réglementaire</h3>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Les diagnostics de performance énergétique n&apos;ont pas pu être lus.
                Cet encadré ne dit donc rien de vos lots : rechargez la page, et si
                l&apos;échec persiste, vérifiez les DPE depuis chaque fiche de bien.
              </p>
            </div>
          )}
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
