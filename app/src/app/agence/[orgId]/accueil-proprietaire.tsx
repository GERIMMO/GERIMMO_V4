import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eur, formaterDate, aujourdhuiParis } from "@/lib/ged";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { chargerActionsDuJour, type ActionDuJour } from "@/lib/actions-du-jour";
import { ParcoursDemarrage } from "@/components/parcours-demarrage";

// Statut de l'organisation (enum public.organization_status) : un compte
// suspendu ou archivé ne doit pas s'afficher « actif ».
const TON_GRIS = "bg-[var(--filet-leger)] text-[var(--texte-secondaire)]";
const STATUTS_ABONNEMENT: Record<string, { libelle: string; ton: string }> = {
  essai: { libelle: "essai gratuit", ton: "ambre" },
  active: { libelle: "actif", ton: "vert" },
  suspendue: { libelle: "suspendu", ton: "rouge" },
  archivee: { libelle: "clôturé", ton: TON_GRIS },
};
const STATUT_ABONNEMENT_INCONNU = { libelle: "à vérifier", ton: TON_GRIS };

// Accueil de l'espace propriétaire (maquette PC v1 du 05/09) : son patrimoine
// en un regard — lots, encaissé, fiscalité — la liste de ce qui l'attend, et
// à droite la veille réglementaire (DPE) et son abonnement. Tout est réel :
// alertes, diagnostics, écritures.
export async function AccueilProprietaire({
  supabase,
  orgId,
  organisation,
  prenom = null,
  userId,
}: {
  supabase: SupabaseClient;
  orgId: string;
  organisation: { name: string; status: string; essai_fin: string | null };
  /** Le compte connecté : le plan du jour se lit pour lui (mêmes lectures que la pastille « Alertes »). */
  userId: string;
  // Prénom du compte connecté (métadonnées d'inscription) — audit 09/09
  prenom?: string | null;
}) {
  const moisCourant = `${aujourdhuiParis().slice(0, 7)}-01`;
  const [
    { data: lots, error: erreurLots },
    { data: etatAbonnementBrut, error: erreurAbonnement },
    { data: tranchesBrut },
    { data: encaissements, error: erreurEncaissements },
    { data: dpe, error: erreurDpe },
    // « À faire » lit LE plan du jour (25/09, D03) — le même calcul que la
    // pastille « Alertes » de la barre et que la page Alertes
    // (lib/actions-du-jour) : baux bloqués, alertes ouvertes dédoublonnées,
    // rapports à valider. L'accueil additionnait ses propres lectures (cinq
    // alertes, les actions sur les baux) et disait « 2 à faire » quand la page
    // Alertes disait « journée dégagée ».
    lecturePlan,
    { data: lotsEngagesBruts, error: erreurLotsEngages },
  ] = await Promise.all([
    supabase
      .from("lots")
      .select("id, nom, etat, bien_id")
      .eq("organization_id", orgId)
      .neq("etat", "archive"),
    // Le décompte de l'abonnement vient de la base, comme sur la page
    // Abonnement (25/09) : l'accueil comptait les biens et multipliait par un
    // 5,99 en dur — deux calculs du même montant finissent par diverger, et la
    // grille (`tarif_tranches`) vit en base.
    supabase.rpc("etat_abonnement", { p_org: orgId }),
    supabase.rpc("detail_tranches_abonnement", { p_org: orgId }),
    supabase
      .from("encaissements")
      .select("montant")
      .eq("organization_id", orgId)
      .gte("date_paiement", moisCourant),
    // Veille réglementaire : DPE F et G — interdiction de louer (G depuis
    // 2025, F au 1ᵉʳ janvier 2028, loi Climat et résilience)
    supabase
      .from("diagnostics")
      .select("classe_dpe, lot:lots!diagnostics_lot_id_fkey(nom, etat)")
      .eq("organization_id", orgId)
      .eq("type", "dpe")
      .in("classe_dpe", ["F", "G"])
      .is("archived_at", null),
    // Le propriétaire direct voit tout son parc : pas de portefeuille.
    chargerActionsDuJour(supabase, orgId, { userId, portefeuille: null }),
    // Lots déjà engagés : bail vivant OU seulement commencé. Sert au rappel
    // « prêt à louer, aucun bail » ci-dessous.
    supabase
      .from("baux")
      .select("lot_id")
      .eq("organization_id", orgId)
      .in("etat", ["brouillon", "actif", "preavis"]),
  ]);

  const { plan, erreurs: erreursPlan } = lecturePlan;
  const erreurAlertes = erreursPlan.alertes || erreursPlan.rapports;
  // Les rangs du plan, dans l'ordre de la page Alertes : les baux à débloquer,
  // puis ce qui est en retard, puis ce qui vient.
  const actionsDuJour: ActionDuJour[] = [...plan.surLesBaux, ...plan.enRetard, ...plan.aVenir];
  // Le geste d'un rang : l'écran qui résout (bail, rapport, incident) ou la
  // pop-up « Traiter » de la page Alertes, ouverte d'emblée sur l'alerte.
  const cibleAction = (a: ActionDuJour): string =>
    a.source === "alerte" ? (a.href ?? `/agence/${orgId}/alertes?traiter=${a.alerte.id}`) : a.href;
  const gesteAction = (a: ActionDuJour) =>
    a.source === "bail" ? "Résoudre" : a.source === "rapport" ? "Valider" : "Traiter";

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

  // Une lecture tombée ne rend pas de verdict : ni « tout est en ordre », ni
  // « 0 € encaissé », ni « 0 lot ». On le dit en tête, et chaque chiffre
  // concerné s'efface plutôt que d'afficher un zéro trompeur.
  const lectureEnEchec =
    [erreurLots, erreurAbonnement, erreurEncaissements, erreurLotsEngages].some((e) => e != null) ||
    erreurAlertes;
  const aFaireIncertain = erreurLots != null || erreurAlertes || erreurLotsEngages != null;

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
  // Grille tarifaire actée (05/09) : 1ᵉʳ bien offert, un prix par bien
  // ensuite — le prix est celui de la base, tranche par tranche.
  const etatAbonnement =
    ((etatAbonnementBrut ?? []) as { unites_facturees: number; mensuel: number }[])[0] ?? null;
  const tranches = (tranchesBrut ?? []) as {
    rang: number;
    unites: number;
    prix_unitaire: number;
    sous_total: number;
  }[];
  const biensPayants = etatAbonnement?.unites_facturees ?? 0;
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
        <h1 className="mt-0.5">Bonjour{prenom ? ` ${prenom},` : ""}</h1>
        <p className="text-sm text-muted-foreground">
          Voici l&apos;essentiel de votre patrimoine — {organisation.name}.
        </p>
      </div>

      {/* Le chemin du démarrage, avant le reste tant qu'il reste une étape :
          celui qui vient de s'inscrire n'a ni chiffre ni action à lire, il a
          besoin de savoir par où commencer. Le bloc disparaît de lui-même une
          fois le premier bail actif. */}
      <ParcoursDemarrage supabase={supabase} orgId={orgId} estProprietaire />

      {lectureEnEchec && (
        <div className="err !mb-0" role="alert">
          <b className="font-semibold">Lecture impossible pour une partie de votre espace.</b>{" "}
          Certains chiffres ou actions ci-dessous peuvent manquer : ce n&apos;est pas
          qu&apos;il n&apos;y a rien, la connexion a échoué. Rechargez la page dans un instant.
        </div>
      )}

      {/* PLUS DE HERO (24/09). La vignette « P » (l'initiale de
          l'organisation), le slogan souligné d'or et « 0 loué · 1 vacant »
          redisaient la tuile « Mes lots » juste en dessous — sur téléphone,
          une demi-hauteur d'écran pour un chiffre déjà affiché. Son titre
          (« 1 lot en gestion directe ») passe dans la tuile. */}
      <div className="loc-grille">
        <div className="space-y-4">
          {/* Des tuiles ENTIÈRES cliquables, la tuile de la charte (`a.kpi`,
              flèche comprise) : seul un lien de 13 px en dernière ligne
              réagissait, ni le chiffre ni le titre (24/09). */}
          <div className="grille-kpi">
            <Link href={`/agence/${orgId}/loyers`} className="kpi bleu">
              <span className="eyebrow">Encaissé en {nomMois}</span>
              <span className="chiffre montant block">
                {erreurEncaissements ? "—" : eur(encaisse)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {/* Ce que le chiffre compte, pas le mécanisme qui le produit */}
                {!erreurLots && loues === 0 && encaisse === 0
                  ? "aucun bail actif : rien à encaisser pour l'instant"
                  : "loyers encaissés ce mois-ci"}
              </span>
            </Link>
            {/* Un parc vide mène à la création du premier bien : la tuile
                entière porte le geste (un lien dans un lien n'est pas permis). */}
            <Link
              href={`/agence/${orgId}/parc${!erreurLots && nbLots === 0 ? "/nouveau" : ""}`}
              className={`kpi ${erreurLots ? "" : vacants > 0 || nbLots === 0 ? "ambre" : "vert"}`}
            >
              <span className="eyebrow">Mes lots</span>
              <span className="chiffre block">
                {erreurLots ? "—" : <>{loues} / {nbLots || "—"}</>}
              </span>
              <span className="block text-xs text-muted-foreground">
                {erreurLots
                  ? "vos lots en gestion directe"
                  : `${nbLots} lot${nbLots > 1 ? "s" : ""} en gestion directe · ${loues} loué${loues > 1 ? "s" : ""}`}
              </span>
              {/* Relevé du 11/09 : sur un parc VIDE, `vacants` vaut 0 — la
                  pastille sortait en `vert` pour dire « Créez votre premier
                  bien ». Le ton passe en attente. « À louer » et non « à
                  relouer » (24/09) : un lot qui n'a jamais été loué ne se
                  reloue pas, et c'est le mot unique pour cette notion. */}
              {erreurLots ? null : (
                <span
                  className={`loc-tag mt-2.5 ${nbLots === 0 || vacants ? "ambre" : "vert"}`}
                >
                  {nbLots === 0
                    ? "Créer mon premier bien"
                    : vacants
                      ? `${vacants} lot${vacants > 1 ? "s" : ""} à louer`
                      : "✓ Plein régime"}
                </span>
              )}
            </Link>
          </div>
          {/* La fiscalité n'est pas un chiffre : un lien, sous les chiffres,
              plutôt qu'une tuile de prose déguisée en indicateur (24/09). */}
          <div>
            <Link
              href={`/agence/${orgId}/comptabilite/fiscal`}
              className="lien-discret text-[13px]"
            >
              Mon récapitulatif fiscal (2044)&nbsp;→
            </Link>
          </div>

          <div className="loc-carte border-l-4 border-l-[var(--or)]">
            {/* Un seul gabarit de titre de carte sur les deux accueils (24/09) */}
            <div className="entete-carte">
              <h2 className="text-[length:var(--pas-sous-titre)]">À faire</h2>
              <Link href={`/agence/${orgId}/alertes`} className="lien-discret text-[13px]">
                {plan.total > 0 ? `${plan.total} à traiter` : "Toutes mes alertes"}&nbsp;→
              </Link>
            </div>
            {actionsDuJour.length === 0 ? (
              aFaireIncertain ? (
                <p className="text-sm text-destructive-soft-foreground" role="alert">
                  Impossible de vérifier ce qui vous attend : la lecture a échoué.
                  Rechargez la page dans un instant.
                </p>
              ) : (
                <p className="text-sm text-success-soft-foreground">
                  Rien ne vous attend — tout est en ordre.
                </p>
              )
            ) : (
              <ul className="divide-y divide-border">
                {/* TOUT LE RANG EST LE LIEN (24/09) : seul le petit bouton de
                    droite réagissait, ni le titre ni le reste du rang. Le
                    geste devient un mot-flèche discret à droite. */}
                {/* Les mêmes rangs, dans le même ordre, que la page Alertes
                    (source commune : lib/actions-du-jour). */}
                {actionsDuJour.map((a) => (
                  <li key={a.cle}>
                    <Link href={cibleAction(a)} className="rang px-2 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        {a.titre}
                        {(a.detail || a.echeance) && (
                          <small className="block text-muted-foreground">
                            {[a.detail, a.echeance ? `échéance le ${formaterDate(a.echeance)}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        )}
                      </span>
                      {a.criticite === "critique" && (
                        <span className="loc-tag rouge shrink-0">critique</span>
                      )}
                      <span className="lien-discret shrink-0">{gesteAction(a)}&nbsp;→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* AVANT LA MISE EN LOCATION — à part de « À faire » (25/09, D03).
              Un lot disponible dont le DPE ou l'ERP manque n'est pas une
              alerte : la page Alertes ne le reprend pas, la fiche du lot le
              dit. Rangé sous « Toutes mes alertes », il faisait lire « 2 points
              à régler » ici et « journée dégagée » là-bas. La carte porte son
              propre chemin, vers Mes lots. */}
          {(lotsAouer.length > 0 || lotsSansBail.length > 3) && (
            <div className="loc-carte">
              <div className="entete-carte">
                <h2 className="text-[length:var(--pas-sous-titre)]">Avant la mise en location</h2>
                <Link href={`/agence/${orgId}/parc`} className="lien-discret text-[13px]">
                  Mes lots&nbsp;→
                </Link>
              </div>
              <ul className="divide-y divide-border">
                {/* Un lot prêt dont le bail reste à écrire : le seul formulaire
                    de création vit derrière l'ancre #baux de sa fiche. */}
                {lotsAouer.map((l) => {
                  const bloque = l.blocages !== null && l.blocages.length > 0;
                  const illisible = l.blocages === null;
                  return (
                    <li key={l.id}>
                      <Link
                        href={`/agence/${orgId}/parc/${l.bien_id}/lots/${l.id}${bloque || illisible ? "" : "#baux"}`}
                        className="rang px-2 py-2.5 text-sm"
                      >
                        <span className="min-w-0 flex-1">
                          {l.nom} —{" "}
                          {illisible
                            ? "disponible, aucun bail"
                            : bloque
                              ? `${l.blocages!.length} point${l.blocages!.length > 1 ? "s" : ""} à régler avant de louer`
                              : "prêt à louer, aucun bail"}
                          <small className="block text-muted-foreground">
                            {illisible
                              ? "Ce qui reste à faire avant la mise en location n'a pas pu être lu : la fiche du lot le dira."
                              : bloque
                                ? l.blocages!.slice(0, 2).join(" · ")
                                : "Le lot est disponible : il ne lui manque que son bail."}
                          </small>
                        </span>
                        <span className="lien-discret shrink-0">
                          {bloque || illisible ? "Ouvrir le lot" : "Créer le bail"}&nbsp;→
                        </span>
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
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {erreurDpe && (
            <div className="loc-carte border-l-4 border-l-[var(--destructive)]">
              <div className="entete-carte !mb-1">
                <h2 className="text-[length:var(--pas-sous-titre)]">Veille réglementaire</h2>
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
                <h2 className="text-[length:var(--pas-sous-titre)]">Veille réglementaire</h2>
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
          {/* La carte entière mène à l'abonnement (24/09) : seul le lien de la
              dernière ligne réagissait. */}
          <Link
            href={`/agence/${orgId}/abonnement`}
            className="loc-carte block transition-colors hover:border-[var(--marque)]"
          >
            <div className="entete-carte !mb-1">
              <h2 className="text-[length:var(--pas-sous-titre)]">Mon abonnement</h2>
              <span className={`loc-tag ${(STATUTS_ABONNEMENT[organisation.status] ?? STATUT_ABONNEMENT_INCONNU).ton}`}>
                {(STATUTS_ABONNEMENT[organisation.status] ?? STATUT_ABONNEMENT_INCONNU).libelle}
              </span>
            </div>
            {/* Un prix ne se coupe pas (24/09) : « 5,99 » d'un côté, « € »
                seul à la ligne de l'autre. Espace insécable dans le libellé,
                valeur d'un seul tenant. */}
            <div className="ligne-info">
              <span>1ᵉʳ bien — offert</span>
              <span className="shrink-0 whitespace-nowrap">0&nbsp;€</span>
            </div>
            {erreurAbonnement ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Le montant n&apos;a pas pu être lu — ce n&apos;est pas 0 € : la
                page Abonnement le dira.
              </p>
            ) : (
              biensPayants > 0 &&
              etatAbonnement &&
              (tranches.length > 0 ? (
                <>
                  {tranches.map((tr) => (
                    <div key={tr.rang} className="ligne-info">
                      <span>
                        {tr.unites} bien{tr.unites > 1 ? "s" : ""} supplémentaire
                        {tr.unites > 1 ? "s" : ""}{" "}
                        <span className="whitespace-nowrap">× {eur(tr.prix_unitaire)}</span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap">{eur(tr.sous_total)}/mois</span>
                    </div>
                  ))}
                  {tranches.length > 1 && (
                    <div className="ligne-info font-medium">
                      <span>Total mensuel</span>
                      <span className="shrink-0 whitespace-nowrap">{eur(etatAbonnement.mensuel)}/mois</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="ligne-info">
                  <span>
                    {biensPayants} bien{biensPayants > 1 ? "s" : ""} supplémentaire
                    {biensPayants > 1 ? "s" : ""}
                  </span>
                  <span className="shrink-0 whitespace-nowrap">{eur(etatAbonnement.mensuel)}/mois</span>
                </div>
              ))
            )}
            <span className="lien-discret mt-2.5 block text-[13px]">
              Voir mon abonnement&nbsp;→
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
