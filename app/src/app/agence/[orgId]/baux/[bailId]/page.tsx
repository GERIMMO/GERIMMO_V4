import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { formaterDate, eur } from "@/lib/ged";
import { TYPES_BAIL, ETATS_BAIL, COULEURS_ETAT_BAIL, COULEURS_ETAT_EDL } from "@/lib/baux";
import { nomComplet } from "@/lib/roles-personnes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ETATS_ELEMENT, COULEURS_ETAT_ELEMENT } from "./edl/[edlId]/grille-edl";
import {
  FormulaireBailSigne,
  BoutonValiderBail,
  FormulaireReglementCopropriete,
  FormulaireConge,
  FormulaireAnnulerConge,
  FormulaireCreerEdl,
} from "./formulaires-bail";
import { FormulaireEditionBail } from "./formulaire-edition-bail";
import { FormulaireInventaire, type LigneInventaire } from "./formulaire-inventaire";
import { FormulaireColocation, type LigneColoc } from "./formulaire-colocation";
import {
  FormulaireLoyers,
  type LigneEcheance,
  type Encaissement,
  type Quittance,
  type Revision,
  type RelanceLigne,
  type RegulLigne,
} from "./formulaire-loyers";
import {
  FormulaireRestitution,
  type Restitution,
  type Retenue,
} from "./formulaire-restitution";
import { FormulaireDepot, type EncaissementDepot } from "./formulaire-depot";

export const metadata = { title: "Bail — Gerimmo" };

export default async function PageBail(props: PageProps<"/agence/[orgId]/baux/[bailId]">) {
  const { orgId, bailId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);

  const { data: bail } = await supabase
    .from("baux")
    .select(
      "id, type, etat, loyer_hc, charges, depot_garantie, jour_echeance, lot_id, locataire_principal, document_signe, reglement_copropriete, date_debut, date_fin, revision_irl, charges_mode, irl_trimestre"
    )
    .eq("id", bailId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!bail) notFound();

  const [
    { data: lot },
    { count: piecesDuLot },
    { data: locataire },
    { data: edls },
    { data: conges },
    { data: inventaire },
    { data: personnes },
    { data: bailPersonnes },
  ] = await Promise.all([
      supabase.from("lots").select("id, nom, bien_id").eq("id", bail.lot_id).maybeSingle(),
      // Les pièces déclarées du lot : leur absence rend l'état des lieux générique.
      supabase
        .from("lot_pieces")
        .select("id", { count: "exact", head: true })
        .eq("lot_id", bail.lot_id),
      bail.locataire_principal
        ? supabase.from("persons").select("nom, prenom").eq("id", bail.locataire_principal).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("etats_des_lieux")
        .select("id, type, etat")
        .eq("bail_id", bailId)
        .order("type"),
      supabase
        .from("conges")
        .select("par, date_premiere_presentation, preavis_mois, date_effet, annule_le, annulation_motif")
        .eq("bail_id", bailId)
        .order("created_at", { ascending: false }),
      supabase
        .from("inventaire_lignes")
        .select("id, piece, designation, quantite, etat, observation")
        .eq("bail_id", bailId)
        .order("ordre")
        .order("created_at"),
      supabase
        .from("persons")
        .select("id, nom, prenom")
        .eq("organization_id", orgId)
        .order("nom"),
      supabase
        .from("bail_personnes")
        .select("id, person_id, role, quote_part, surface_privative, garant_de")
        .eq("bail_id", bailId),
    ]);

  // Résolution des noms pour la colocation (colocataires + garants nominatifs)
  const nomsPersonnes = new Map(
    ((personnes ?? []) as { id: string; nom: string; prenom: string | null }[]).map((p) => [
      p.id,
      nomComplet(p),
    ])
  );
  const lignesColoc: LigneColoc[] = (
    (bailPersonnes ?? []) as {
      id: string;
      person_id: string;
      role: string;
      quote_part: number | null;
      surface_privative: number | null;
      garant_de: string | null;
    }[]
  ).map((l) => ({
    id: l.id,
    person_id: l.person_id,
    person_nom: nomsPersonnes.get(l.person_id) ?? "Personne",
    role: l.role,
    quote_part: l.quote_part,
    surface_privative: l.surface_privative,
    garant_de: l.garant_de,
    garant_de_nom: l.garant_de ? nomsPersonnes.get(l.garant_de) ?? null : null,
  }));

  const edlSignes = (edls ?? []).filter((e) => e.etat === "signe");
  const { data: comparatif } =
    edlSignes.some((e) => e.type === "entree") && edlSignes.some((e) => e.type === "sortie")
      ? await supabase.rpc("comparatif_edl", { p_bail: bailId })
      : { data: null };
  const ecarts = ((comparatif ?? []) as {
    piece: string | null;
    libelle: string;
    etat_entree: string | null;
    etat_sortie: string | null;
    ecart: boolean;
  }[]).filter((c) => c.ecart);

  // Loyers (dès que le bail n'est plus en brouillon)
  const loyersActif = bail.etat !== "brouillon";
  const [
    { data: echeancier },
    { data: encaissements },
    { data: quittances },
    { data: revisions },
    { data: relances },
    { data: regularisations },
    // Encaissement du dépôt : même condition, même aller-retour
    { data: depotEncaissements },
  ] = loyersActif
    ? await Promise.all([
        supabase.rpc("etat_loyers_bail", { p_bail: bailId }),
        supabase
          .from("encaissements")
          .select("id, montant, date_paiement, mode, note")
          .eq("bail_id", bailId)
          .order("date_paiement", { ascending: false }),
        supabase
          .from("quittances")
          .select("id, appel_id, montant, date_emission, email_envoye_at, est_quittance")
          .eq("bail_id", bailId),
        supabase
          .from("revisions_loyer")
          .select("id, date_effet, ancien_loyer, nouveau_loyer, irl_reference, irl_nouveau")
          .eq("bail_id", bailId)
          .order("date_effet", { ascending: false }),
        supabase
          .from("relances")
          .select("id, niveau, date_envoi, date_premiere_presentation, numero_recommande")
          .eq("bail_id", bailId)
          .order("date_envoi", { ascending: false }),
        supabase
          .from("regularisations_charges")
          .select("id, annee, provisions, charges_reelles, ecart")
          .eq("bail_id", bailId)
          .order("annee", { ascending: false }),
        supabase
          .from("depot_encaissements")
          .select("id, montant, date_encaissement, moyen, versant_libelle, versant_person_id")
          .eq("bail_id", bailId)
          .order("date_encaissement"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  // Restitution du dépôt : dès que le bail est en préavis ou terminé
  const restitutionActif = bail.etat === "preavis" || bail.etat === "termine";
  const { data: restitution } = restitutionActif
    ? await supabase
        .from("restitutions")
        .select(
          "id, date_remise_cles, delai_mois, depot, impayes, sans_edl_entree, statut, solde, date_emission"
        )
        .eq("bail_id", bailId)
        .maybeSingle()
    : { data: null };
  const { data: retenues } = restitution
    ? await supabase
        .from("retenues")
        .select("id, libelle, cout, duree_vie_ans, age_ans, montant_retenu")
        .eq("restitution_id", (restitution as { id: string }).id)
        .order("created_at")
    : { data: [] };

  // « À faire maintenant » : la page suit le cycle de vie du bail, mais un
  // agent qui débute ne connaît pas l'ordre — on le déduit des données et on
  // l'affiche en tête, chaque étape pointant vers sa carte. 3 étapes maximum :
  // au-delà, la liste redevient du bruit.
  const edlEntreeSigne = (edls ?? []).some((e) => e.type === "entree" && e.etat === "signe");
  const edlSortieSigne = (edls ?? []).some((e) => e.type === "sortie" && e.etat === "signe");
  const depotEncaisse = ((depotEncaissements ?? []) as { montant: number }[]).reduce(
    (s, e) => s + Number(e.montant),
    0
  );
  const resteDepot = Number(bail.depot_garantie ?? 0) - depotEncaisse;
  const aFaire: { texte: string; href: string }[] = [];
  // Prérequis de la validation (décision 29/08) : bail signé déposé, EDL
  // d'entrée signé — puis « Valider » en bas de l'écran.
  const prerequisValidation = [
    { libelle: "Bail signé déposé", ok: Boolean(bail.document_signe), href: "#bail-signe" },
    { libelle: "État des lieux d'entrée signé", ok: edlEntreeSigne, href: "#edl" },
  ];
  if (bail.etat === "brouillon") {
    if (!bail.document_signe)
      aFaire.push({ texte: "Déposer le bail signé (PDF)", href: "#bail-signe" });
    if (!edlEntreeSigne && piecesDuLot === 0)
      aFaire.push({
        texte:
          "Déclarer les pièces du lot — sans elles, l'état des lieux ne distingue pas la cuisine de la chambre",
        href: `/agence/${orgId}/parc/${lot?.bien_id}/lots/${bail.lot_id}#pieces`,
      });
    if (!edlEntreeSigne)
      aFaire.push({ texte: "Réaliser et signer l'état des lieux d'entrée", href: "#edl" });
    aFaire.push({ texte: "Valider le bail (contrôles automatiques, puis lot loué)", href: "#validation" });
  } else {
    // Déclarer les pièces vient AVANT l'état des lieux : une fois signé, il est
    // figé, et une grille sans pièces ne rattache aucune dégradation à un endroit.
    if (!edlEntreeSigne && piecesDuLot === 0)
      aFaire.push({
        texte:
          "Déclarer les pièces du lot — sans elles, l'état des lieux ne distingue pas la cuisine de la chambre",
        href: `/agence/${orgId}/parc/${lot?.bien_id}/lots/${bail.lot_id}#pieces`,
      });
    if (!edlEntreeSigne)
      aFaire.push({
        texte: "Faire signer l'état des lieux d'entrée — sans lui, aucune retenue possible à la sortie",
        href: "#edl",
      });
    if (resteDepot > 0)
      aFaire.push({
        texte: `Encaisser le dépôt de garantie (reste ${eur(resteDepot)})`,
        href: "#depot",
      });
    if ((echeancier ?? []).length === 0)
      aFaire.push({ texte: "Générer l'échéancier des loyers", href: "#loyers" });
    if (bail.etat === "preavis" && !edlSortieSigne)
      aFaire.push({
        texte: `Prévoir l'état des lieux de sortie${bail.date_fin ? ` (départ le ${formaterDate(bail.date_fin)})` : ""}`,
        href: "#edl",
      });
    if ((bail.etat === "preavis" || bail.etat === "termine") && edlSortieSigne && !restitution)
      aFaire.push({ texte: "Démarrer la restitution du dépôt de garantie", href: "#restitution" });
    if (restitution && (restitution as { statut: string }).statut === "en_cours")
      aFaire.push({ texte: "Finaliser le décompte de restitution", href: "#restitution" });
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        {lot && (
          <Link
            href={`/agence/${orgId}/parc/${lot.bien_id}/lots/${lot.id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {lot.nom}
          </Link>
        )}
        <p className="eyebrow mt-1">Bail {TYPES_BAIL[bail.type] ?? bail.type}</p>
        <div className="entete-page">
          <div className="flex flex-wrap items-center gap-3">
            {/* Le titre porte qui habite où — le type de bail vit dans l'eyebrow */}
            <h1>{locataire ? nomComplet(locataire) : lot?.nom ?? "Bail"}</h1>
            <span className={COULEURS_ETAT_BAIL[bail.etat] ?? "puce puce-grise"}>
              {ETATS_BAIL[bail.etat] ?? bail.etat}
            </span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {!locataire && <>Locataire : — · </>}
          {/* « 1050 € HC » : un nombre brut et une abréviation. Le loyer se lit
              mieux formaté, et « hors charges » s'écrit en toutes lettres. */}
          {bail.loyer_hc
            ? `${eur(Number(bail.loyer_hc))} hors charges`
            : "loyer non fixé"}
          {bail.charges ? ` + ${eur(Number(bail.charges))} de charges` : ""}
          {bail.date_fin ? ` · fin le ${formaterDate(bail.date_fin)}` : ""}
        </p>
      </div>

      {/* La prochaine action évidente, dérivée de l'état du bail */}
      {aFaire.length > 0 && (
        <div className="border-l-[3px] border-l-[var(--or)] bg-accent p-4">
          <p className="text-sm font-semibold">À faire maintenant</p>
          <ol className="mt-2 space-y-1.5">
            {aFaire.slice(0, 3).map((a, i) => (
              <li key={a.href + i} className="flex items-center gap-2 text-sm">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {i + 1}
                </span>
                <a href={a.href} className="min-w-0 flex-1 underline-offset-2 hover:underline">
                  {a.texte}
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Brouillon corrigeable (recette 21/08) : la saisie de création se
          reprend ici tant que le bail n'est pas signé. */}
      {bail.etat === "brouillon" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Corriger le brouillon</CardTitle>
            <CardDescription>
              Type, locataire, date d&apos;entrée, montants — tout se reprend tant
              que le bail n&apos;est pas signé.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireEditionBail
              orgId={orgId}
              bailId={bailId}
              personnes={(personnes ?? []) as { id: string; nom: string; prenom: string | null }[]}
              defauts={{
                type: bail.type,
                locataire_principal: bail.locataire_principal,
                date_debut: bail.date_debut,
                loyer_hc: bail.loyer_hc,
                charges: bail.charges,
                charges_mode: bail.charges_mode,
                depot_garantie: bail.depot_garantie,
                jour_echeance: bail.jour_echeance,
                irl_trimestre: bail.irl_trimestre,
                revision_irl: bail.revision_irl,
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Cycle du bail */}
      {bail.etat === "brouillon" && (
        <Card id="bail-signe" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">Bail signé</CardTitle>
            <CardDescription>
              Signature hors plateforme en V0 : déposez le PDF signé, il conditionne la
              validation du bail.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {bail.document_signe ? (
              <p className="text-sm text-success-soft-foreground">
                Bail signé déposé.{" "}
                <a
                  href={`/agence/${orgId}/documents/${bail.document_signe}/fichier`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--bleu)] underline-offset-2 hover:underline"
                >
                  Le consulter
                </a>
              </p>
            ) : (
              <FormulaireBailSigne orgId={orgId} bailId={bailId} />
            )}
          </CardContent>
        </Card>
      )}

      <Card id="reglement-copro" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Règlement de copropriété</CardTitle>
          <CardDescription>
            Facultatif — les extraits du règlement annexés au bail quand le lot est en
            copropriété.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {bail.reglement_copropriete ? (
            <p className="text-sm text-success-soft-foreground">
              Règlement déposé.{" "}
              <a
                href={`/agence/${orgId}/documents/${bail.reglement_copropriete}/fichier`}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--bleu)] underline-offset-2 hover:underline"
              >
                Le consulter
              </a>
            </p>
          ) : (
            <FormulaireReglementCopropriete orgId={orgId} bailId={bailId} />
          )}
        </CardContent>
      </Card>

      {bail.etat === "actif" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Congé</CardTitle>
            <CardDescription>
              La lettre recommandée part hors de la plateforme : saisissez la date de première présentation. Le
              préavis réduit exige un justificatif.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireConge orgId={orgId} bailId={bailId} type={bail.type} />
          </CardContent>
        </Card>
      )}

      {(conges ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {bail.etat === "preavis" ? "Congé en cours" : "Congés"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(conges ?? []).map((c, i) => (
              <p key={i} className={c.annule_le ? "text-muted-foreground" : undefined}>
                Donné par {c.par === "bailleur" ? "le bailleur" : "le locataire"}, présentation
                le {formaterDate(c.date_premiere_presentation)}, préavis {c.preavis_mois} mois
                → effet le <span className="font-medium">{formaterDate(c.date_effet)}</span>
                {/* Un congé annulé reste au dossier : il a existé. */}
                {c.annule_le && (
                  <span className="badge-statut ml-2 text-muted-foreground">
                    annulé le {formaterDate(c.annule_le)}
                    {c.annulation_motif ? ` — ${c.annulation_motif}` : ""}
                  </span>
                )}
              </p>
            ))}
            {bail.etat === "preavis" && (
              <div className="border-t border-border pt-3">
                <FormulaireAnnulerConge orgId={orgId} bailId={bailId} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loyers & quittances */}
      {loyersActif && (
        <Card id="loyers" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">Loyers & quittances</CardTitle>
            <CardDescription>
              Échéancier, encaissements (imputés du plus ancien au plus récent) et
              quittances (émises après paiement intégral ; un partiel reste un reçu).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireLoyers
              orgId={orgId}
              bailId={bailId}
              echeancier={(echeancier ?? []) as LigneEcheance[]}
              encaissements={(encaissements ?? []) as Encaissement[]}
              quittances={(quittances ?? []) as Quittance[]}
              revisionIrl={Boolean(bail.revision_irl)}
              revisions={(revisions ?? []) as Revision[]}
              relances={(relances ?? []) as RelanceLigne[]}
              regularisations={(regularisations ?? []) as RegulLigne[]}
              chargesForfait={bail.charges_mode === "forfait"}
            />
          </CardContent>
        </Card>
      )}

      {/* Dépôt de garantie — encaissement */}
      {loyersActif && (
        <Card id="depot" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">Dépôt de garantie</CardTitle>
            <CardDescription>
              Encaissement à l&apos;entrée : plafond légal contrôlé, versant tiers tracé,
              encaissement partiel possible. Restitué en fin de bail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireDepot
              orgId={orgId}
              bailId={bailId}
              depotDu={Number(bail.depot_garantie ?? 0)}
              encaissements={(depotEncaissements ?? []) as EncaissementDepot[]}
              personnes={((personnes ?? []) as { id: string; nom: string; prenom: string | null }[]).map(
                (p) => ({ id: p.id, nom: nomComplet(p) })
              )}
              locataireNom={locataire ? nomComplet(locataire) : "Le locataire"}
            />
          </CardContent>
        </Card>
      )}

      {/* Colocation (bail unique) : colocataires + garants */}
      {bail.type === "colocation" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Colocataires & garants</CardTitle>
            <CardDescription>
              Bail unique solidaire : ajoutez les colocataires (quote-part) et les
              garants (nominatifs).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireColocation
              orgId={orgId}
              bailId={bailId}
              personnes={((personnes ?? []) as { id: string; nom: string; prenom: string | null }[]).map(
                (p) => ({ id: p.id, nom: nomComplet(p) })
              )}
              lignes={lignesColoc}
              principal={{
                id: bail.locataire_principal ?? "",
                nom: locataire ? nomComplet(locataire) : "—",
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Inventaire du mobilier (bail meublé) */}
      {bail.type === "meuble" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inventaire du mobilier</CardTitle>
            <CardDescription>
              Annexe obligatoire du bail meublé (décret 2015-1437), reprise dans
              l&apos;état des lieux.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireInventaire
              orgId={orgId}
              bailId={bailId}
              lignes={(inventaire ?? []) as LigneInventaire[]}
            />
          </CardContent>
        </Card>
      )}

      {/* États des lieux */}
      <Card id="edl" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">États des lieux</CardTitle>
          <CardDescription>
            Grille générée depuis le lot, saisie pièce par pièce, figée à la signature.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(edls ?? []).length === 0 ? (
            // Sans EDL d'entrée signé, le logement est réputé remis en bon état :
            // aucune retenue ne sera possible à la sortie (RM-2.4.3).
            bail.etat === "brouillon" ? (
              <p className="text-sm text-muted-foreground">
                Aucun état des lieux. L&apos;état des lieux d&apos;entrée signé est requis
                pour valider le bail.
              </p>
            ) : (
              <div className="border-l-[3px] border-l-destructive bg-destructive-soft p-3">
                <p className="text-sm font-medium text-destructive-soft-foreground">
                  Aucun état des lieux d&apos;entrée
                </p>
                <p className="mt-0.5 text-sm text-destructive-soft-foreground">
                  Le bail est {ETATS_BAIL[bail.etat]?.toLowerCase() ?? bail.etat} : sans
                  état des lieux d&apos;entrée signé, le logement sera réputé remis en
                  bon état et <strong>aucune retenue ne pourra être faite sur le
                  dépôt de garantie</strong>.
                </p>
              </div>
            )
          ) : (
            <ul className="space-y-2">
              {(edls ?? []).map((e) => (
                <li key={e.id} className="flex items-center gap-3">
                  <span className="w-20 text-sm font-medium">
                    {e.type === "entree" ? "Entrée" : "Sortie"}
                  </span>
                  <span className={COULEURS_ETAT_EDL[e.etat] ?? "puce puce-grise"}>
                    {e.etat === "signe" ? "Signé" : "En cours"}
                  </span>
                  <Link
                    href={`/agence/${orgId}/baux/${bailId}/edl/${e.id}`}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    Ouvrir la grille
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {(edls ?? []).length < 2 && <FormulaireCreerEdl orgId={orgId} bailId={bailId} />}
        </CardContent>
      </Card>

      {/* Restitution du dépôt de garantie */}
      {restitutionActif && (
        <Card id="restitution" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">Restitution du dépôt de garantie</CardTitle>
            <CardDescription>
              Après la remise des clés : impayés imputés d&apos;abord, retenues avec
              décote de vétusté justifiées, solde de tout compte dans le délai légal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireRestitution
              orgId={orgId}
              bailId={bailId}
              restitution={(restitution ?? null) as Restitution | null}
              retenues={(retenues ?? []) as Retenue[]}
            />
          </CardContent>
        </Card>
      )}

      {/* Comparatif entrée/sortie */}
      {comparatif && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comparatif entrée / sortie</CardTitle>
            <CardDescription>
              Les écarts d&apos;état entre l&apos;entrée et la sortie sont mis en évidence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ecarts.length === 0 ? (
              <p className="text-sm text-success-soft-foreground">
                Aucun écart : le logement est rendu dans le même état.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {ecarts.map((c) => (
                  <li
                    key={`${c.piece ?? ""}-${c.libelle}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="w-44 shrink-0 truncate">
                      {c.piece ? <span className="text-muted-foreground">{c.piece} · </span> : null}
                      {c.libelle}
                    </span>
                    <span
                      className={
                        (c.etat_entree && COULEURS_ETAT_ELEMENT[c.etat_entree]) || "puce puce-grise"
                      }
                    >
                      {c.etat_entree ? ETATS_ELEMENT[c.etat_entree] ?? c.etat_entree : "—"}
                    </span>
                    <span aria-hidden className="text-muted-foreground">→</span>
                    <span
                      className={
                        (c.etat_sortie && COULEURS_ETAT_ELEMENT[c.etat_sortie]) || "puce puce-grise"
                      }
                    >
                      {c.etat_sortie ? ETATS_ELEMENT[c.etat_sortie] ?? c.etat_sortie : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Valider — en bas de l'écran, une fois le bail préparé (décision 29/08) */}
      {bail.etat === "brouillon" && (
        <Card id="validation" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">Valider le bail</CardTitle>
            <CardDescription>
              Contrôles automatiques (détention 100 %, diagnostics valides, un seul bail en
              cours sur le lot) → le lot passe loué.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BoutonValiderBail orgId={orgId} bailId={bailId} prerequis={prerequisValidation} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
