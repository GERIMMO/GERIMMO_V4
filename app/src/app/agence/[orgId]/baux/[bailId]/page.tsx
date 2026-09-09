import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { formaterDate, eur } from "@/lib/ged";
import { TYPES_BAIL, ETATS_BAIL, COULEURS_ETAT_BAIL, COULEURS_ETAT_EDL } from "@/lib/baux";
import { nomComplet } from "@/lib/roles-personnes";
import { premier } from "@/lib/postgrest";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ETATS_ELEMENT, COULEURS_ETAT_ELEMENT } from "./edl/[edlId]/grille-edl";
import {
  FormulaireBailSigne,
  FormulaireReglementCopropriete,
  FormulaireConge,
  FormulaireAnnulerConge,
  BoutonTerminerBail,
  FormulaireCreerEdl,
} from "./formulaires-bail";
import { FormulaireEditionBail } from "./formulaire-edition-bail";
import { FormulaireComplementsBail } from "./formulaire-complements-bail";
import { GenererCongeBailleur } from "./generer-conge-bailleur";
import { GenererAvenant } from "./generer-avenant";
import { CarteCautionnement } from "./carte-cautionnement";
import { CarteBailSigne } from "./carte-bail-signe";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
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
  const { supabase, organisation } = await verifierAccesEspace(orgId);
  const agence = organisation.type === "agence";

  const { data: bail } = await supabase
    .from("baux")
    // Colonnes du cycle de vie + « Compléments du contrat » (bail 100 % rempli, 09/09)
    .select(
      "id, type, etat, loyer_hc, charges, depot_garantie, jour_echeance, lot_id, locataire_principal, document_signe, reglement_copropriete, signe_envoye_le, date_debut, date_fin, revision_irl, charges_mode, irl_trimestre, fixation_loyer, paiement_echeance, lieu_paiement, irl_valeur, duree_reduite_evenement, travaux_recents, travaux_recents_montant, travaux_locataire, honoraires_bailleur, honoraires_locataire, clauses_particulieres, loyer_reference, loyer_reference_majore, complement_loyer, complement_justification, dernier_loyer, dernier_loyer_versement, dernier_loyer_revision, meuble_etudiant"
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
    { data: intentions },
  ] = await Promise.all([
      supabase.from("lots").select("id, nom, bien_id, meuble, bien:biens!lots_bien_id_fkey(zone_tendue)").eq("id", bail.lot_id).maybeSingle(),
      // Les pièces déclarées du lot : leur absence rend l'état des lieux générique.
      supabase
        .from("lot_pieces")
        .select("id", { count: "exact", head: true })
        .eq("lot_id", bail.lot_id),
      bail.locataire_principal
        ? supabase.from("persons").select("nom, prenom, email").eq("id", bail.locataire_principal).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("etats_des_lieux")
        .select("id, type, etat")
        .eq("bail_id", bailId)
        .order("type"),
      supabase
        .from("conges")
        .select("par, date_premiere_presentation, preavis_mois, date_effet, motif, annule_le, annulation_motif")
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
      // Intention de congé transmise depuis l'espace locataire, en attente de
      // la lettre recommandée (le congé s'enregistre à sa réception)
      supabase
        .from("intentions_conge")
        .select("created_at, motif")
        .eq("bail_id", bailId)
        .is("traitee_le", null)
        .order("created_at", { ascending: false }),
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
  // Les garants du bail (id = PERSONNE, pas la ligne) — pour le cautionnement
  const garantsDuBail = lignesColoc
    .filter((l) => l.role === "garant")
    .map((l) => ({ id: l.person_id, nom: l.person_nom }));

  const edlSignes = (edls ?? []).filter((e) => e.etat === "signe");
  const comparatifPossible =
    edlSignes.some((e) => e.type === "entree") && edlSignes.some((e) => e.type === "sortie");
  // Loyers (dès que le bail n'est plus en brouillon)
  const loyersActif = bail.etat !== "brouillon";
  // Restitution du dépôt : dès que le bail est en préavis ou terminé
  const restitutionActif = bail.etat === "preavis" || bail.etat === "termine";

  // Perf 30/08 : trois lectures qui ne dépendent que du bail partaient l'une
  // après l'autre (comparatif, loyers, restitution puis retenues) — une seule
  // vague, les retenues embarquées dans la restitution.
  const vide = { data: [] as never[] };
  const [
    { data: comparatif },
    [
      { data: echeancier },
      { data: encaissements },
      { data: quittances },
      { data: revisions },
      { data: relances },
      { data: regularisations },
      // Encaissement du dépôt : même condition, même aller-retour
      { data: depotEncaissements },
    ],
    { data: restitutionBrute },
  ] = await Promise.all([
    comparatifPossible
      ? supabase.rpc("comparatif_edl", { p_bail: bailId })
      : Promise.resolve({ data: null }),
    loyersActif
      ? Promise.all([
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
      : Promise.resolve([vide, vide, vide, vide, vide, vide, vide]),
    restitutionActif
      ? supabase
          .from("restitutions")
          .select(
            "id, date_remise_cles, delai_mois, depot, impayes, sans_edl_entree, statut, solde, date_emission, envoye_le, retenues(id, libelle, cout, duree_vie_ans, age_ans, montant_retenu, sans_justificatif, created_at)"
          )
          .eq("bail_id", bailId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const ecarts = ((comparatif ?? []) as {
    piece: string | null;
    libelle: string;
    etat_entree: string | null;
    etat_sortie: string | null;
    ecart: boolean;
  }[]).filter((c) => c.ecart);
  const restitution = restitutionBrute as
    | (Restitution & { retenues?: (Retenue & { created_at: string })[] })
    | null;
  const retenues: Retenue[] = [...(restitution?.retenues ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );

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
  // Sprint « Alertes & documents » : plus de bouton « Valider » — le dépôt du
  // bail signé active le bail et loue le lot ; l'état des lieux d'entrée se
  // signe à la remise des clés, avant ou après, et une alerte le rappelle.
  if (bail.etat === "brouillon") {
    if (!edlEntreeSigne && piecesDuLot === 0)
      aFaire.push({
        texte:
          "Déclarer les pièces du lot — sans elles, l'état des lieux ne distingue pas la cuisine de la chambre",
        href: `/agence/${orgId}/parc/${lot?.bien_id}/lots/${bail.lot_id}#pieces`,
      });
    if (!edlEntreeSigne)
      aFaire.push({ texte: "Réaliser et signer l'état des lieux d'entrée (à la remise des clés)", href: "#edl" });
    aFaire.push({
      texte: "Déposer le bail signé (PDF) — il active le bail et loue le lot",
      href: "#bail-signe",
    });
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

      {/* Documents-0 : générer le contrat (nu 01 / meublé 02) depuis le
          brouillon — le PDF sert à imprimer et faire signer ; le dépôt du
          signé reste le seul déclencheur d'activation. */}
      {bail.etat === "brouillon" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Générer le bail</CardTitle>
            <CardDescription>
              Le contrat type ({bail.type === "meuble" ? "logement meublé, inventaire du mobilier annexé" : "logement nu"})
              rempli avec ce que Gerimmo sait déjà — les champs sans donnée
              restent en libellé, la liste vous est donnée. À imprimer, faire
              signer, puis déposer ci-dessous.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bail.locataire_principal ? (
              <BoutonGenererDocument
                orgId={orgId}
                code={bail.type === "meuble" ? "bail_meuble" : "bail_nu"}
                cibleId={bailId}
                cheminRetour={`/agence/${orgId}/baux/${bailId}`}
                libelle="Générer le bail (PDF)"
                variant="default"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Renseignez d&apos;abord le locataire principal (carte « Corriger le
                brouillon ») : le contrat se génère ensuite.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Compléments du contrat (bail 100 % rempli, 09/09) : les conditions
          détaillées que le contrat type imprime — modifiables en brouillon,
          figées ensuite (le composant gère la lecture seule). */}
      <Card id="complements" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Compléments du contrat</CardTitle>
          <CardDescription>
            Les conditions détaillées que le contrat type imprime : fixation et
            paiement du loyer, travaux, honoraires, encadrement en zone tendue.
            Facultatives — un champ vide s&apos;imprime en libellé d&apos;épreuve
            ou en « — ».
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireComplementsBail
            orgId={orgId}
            bailId={bailId}
            defauts={{
              fixation_loyer: bail.fixation_loyer,
              paiement_echeance: bail.paiement_echeance,
              lieu_paiement: bail.lieu_paiement,
              irl_valeur: bail.irl_valeur,
              duree_reduite_evenement: bail.duree_reduite_evenement,
              travaux_recents: bail.travaux_recents,
              travaux_recents_montant: bail.travaux_recents_montant,
              travaux_locataire: bail.travaux_locataire,
              honoraires_bailleur: bail.honoraires_bailleur,
              honoraires_locataire: bail.honoraires_locataire,
              clauses_particulieres: bail.clauses_particulieres,
              loyer_reference: bail.loyer_reference,
              loyer_reference_majore: bail.loyer_reference_majore,
              complement_loyer: bail.complement_loyer,
              complement_justification: bail.complement_justification,
              dernier_loyer: bail.dernier_loyer,
              dernier_loyer_versement: bail.dernier_loyer_versement,
              dernier_loyer_revision: bail.dernier_loyer_revision,
              meuble_etudiant: Boolean(bail.meuble_etudiant),
            }}
            zoneTendue={Boolean(premier(lot?.bien ?? null)?.zone_tendue)}
            meuble={bail.type === "meuble"}
            agence={agence}
            modifiable={bail.etat === "brouillon"}
          />
        </CardContent>
      </Card>

      {/* Cycle du bail */}
      {(bail.etat === "brouillon" || bail.document_signe) && (
        <Card id="bail-signe" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">Bail signé</CardTitle>
            <CardDescription>
              Signature hors plateforme en V0 : le dépôt du PDF signé active le bail
              et loue le lot (contrôles de mise en location au dépôt). Le locataire
              le retrouve dans « Mes documents ».
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {bail.document_signe ? (
              <CarteBailSigne
                orgId={orgId}
                bailId={bailId}
                documentId={bail.document_signe}
                envoyeLe={bail.signe_envoye_le}
                locataireEmail={locataire?.email ?? null}
                // Retour en brouillon possible tant que rien n'a vécu : ni loyer
                // appelé, ni restitution — la base est seule juge.
                corrigeable={
                  bail.etat === "actif" && (echeancier ?? []).length === 0 && !restitution
                }
                actif={bail.etat !== "brouillon"}
              />
            ) : (
              <FormulaireBailSigne orgId={orgId} bailId={bailId} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Documents-0 : la notice d'information (05), annexe obligatoire */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notice d&apos;information</CardTitle>
          <CardDescription>
            Annexe obligatoire au contrat (arrêté du 29 mai 2015) — générée et
            rangée dans Documents, à remettre avec le bail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BoutonGenererDocument
            orgId={orgId}
            code="notice"
            cibleId={bailId}
            cheminRetour={`/agence/${orgId}/baux/${bailId}`}
            libelle="Générer la notice (PDF)"
          />
        </CardContent>
      </Card>

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
        <Card className={(intentions ?? []).length > 0 ? "border-l-4 border-l-[var(--or)]" : undefined}>
          <CardHeader>
            <CardTitle className="text-base">Congé</CardTitle>
            <CardDescription>
              La lettre recommandée part hors de la plateforme : saisissez la date de première présentation. Le
              préavis réduit exige un justificatif.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Le congé ÉMIS par le bailleur (vente, reprise, motif légitime) se
                génère ici ; le formulaire en dessous enregistre un congé REÇU. */}
            <div className="mb-4 border-b border-border pb-4">
              <GenererCongeBailleur
                orgId={orgId}
                bailId={bailId}
                cheminRetour={`/agence/${orgId}/baux/${bailId}`}
              />
            </div>
            {((intentions ?? []) as { created_at: string; motif: string | null }[]).map((it) => (
              <p key={it.created_at} className="mb-3 rounded-lg bg-warning-soft p-3 text-sm">
                <b className="font-semibold">
                  Le locataire a annoncé son départ le {formaterDate(it.created_at)}
                </b>
                {it.motif ? <> — « {it.motif} »</> : null}
                <span className="block text-muted-foreground">
                  À réception de sa lettre recommandée, enregistrez le congé ci-dessous avec la
                  date de première présentation — le locataire verra sa fin de bail confirmée.
                </span>
              </p>
            ))}
            <FormulaireConge
              orgId={orgId}
              bailId={bailId}
              type={bail.type}
              meubleLot={Boolean(lot?.meuble)}
              zoneTendue={Boolean(premier(lot?.bien ?? null)?.zone_tendue)}
            />
          </CardContent>
        </Card>
      )}

      {/* Avenant au bail : modification du contrat en cours, actée par les parties */}
      {(bail.etat === "actif" || bail.etat === "preavis") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Avenant au bail</CardTitle>
            <CardDescription>
              Modifie le contrat en cours (charges, occupants, clauses…) sans le
              refaire — toutes les autres clauses demeurent inchangées ; à faire
              signer par les parties.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GenererAvenant
              orgId={orgId}
              bailId={bailId}
              cheminRetour={`/agence/${orgId}/baux/${bailId}`}
            />
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
                {c.motif && !c.annule_le && (
                  <span className="block text-muted-foreground">Motif : {c.motif}</span>
                )}
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
              <div className="space-y-3 border-t border-border pt-3">
                {edlSortieSigne && <BoutonTerminerBail orgId={orgId} bailId={bailId} />}
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
              colocation
            />
          </CardContent>
        </Card>
      )}

      {/* Garants d'un bail nu ou meublé (hors colocation, qui a sa carte) —
          l'acte de cautionnement se génère dans la carte suivante. */}
      {bail.type !== "colocation" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Garants</CardTitle>
            <CardDescription>
              Rattachez le ou les garants du bail — l&apos;acte de cautionnement
              se génère dans la carte « Cautionnement ».
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
              colocation={false}
            />
          </CardContent>
        </Card>
      )}

      {/* Cautionnement : un acte par garant (réforme 2021 — mention type à
          apposer par la caution), forme solidaire par défaut. */}
      {garantsDuBail.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cautionnement</CardTitle>
            <CardDescription>
              Un acte par garant : forme (solidaire par défaut ou simple),
              plafond garanti, mention type à apposer par la caution.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CarteCautionnement orgId={orgId} bailId={bailId} garants={garantsDuBail} />
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
                Aucun état des lieux. Celui d&apos;entrée se signe à la remise des
                clés — sans lui, aucune retenue ne sera possible à la sortie ; une
                alerte le rappellera dès le dépôt du bail signé.
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

    </main>
  );
}
