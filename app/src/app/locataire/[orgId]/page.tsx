import Link from "next/link";
import { estARenouveler, estExpiree, eur, formaterDate } from "@/lib/ged";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { buttonVariants } from "@/components/ui/button";
import { CarteGestionnaire, CarteUrgence } from "./cartes-laterales";
import { aEchoue, LectureImpossible, PanneLecture } from "./panne-lecture";
import type { IncidentLocataire } from "./incidents-locataire";
import type { BailLocataire } from "./types";

export const metadata = { title: "Mon espace — Gerimmo" };

// Accueil de l'espace locataire (maquette v10) : l'essentiel du logement en
// un regard — ce qui l'attend, le logement, le prochain loyer, les documents,
// les demandes — et à droite, qui s'occupe de moi.
export default async function PageAccueilLocataire(props: PageProps<"/locataire/[orgId]">) {
  const { orgId } = await props.params;
  const { supabase, personne, adhesionActive } = await verifierAccesEspaceLocataire(orgId);

  const [
    { data: baux, error: eBaux },
    { data: echeancier, error: eEcheancier },
    { data: pieces, error: ePieces },
    { data: incidentsBruts, error: eIncidents },
    { data: gestionnaires, error: eGestionnaire },
    { data: annonces, error: eAnnonces },
    { data: piecesDemandees, error: eDemandes },
    { data: signatures, error: eSignatures },
    { data: creneaux, error: eCreneaux },
  ] = await Promise.all([
    supabase.rpc("mon_bail_locataire", { p_org: orgId }),
    supabase.rpc("mon_echeancier_locataire", { p_org: orgId }),
    supabase.rpc("mes_pieces_locataire", { p_org: orgId }),
    supabase.rpc("mes_incidents_locataire", { p_org: orgId }),
    supabase.rpc("mon_gestionnaire_locataire", { p_org: orgId }),
    supabase.rpc("mes_annonces_locataire", { p_org: orgId }),
    // Les deux lectures que le menu faisait déjà de son côté : elles
    // alimentent « Ce qui vous attend » (occasion relevée le 11/09) et
    // remettent l'accueil d'accord avec le badge « Mes documents ».
    supabase.rpc("mes_pieces_demandees", { p_org: orgId }),
    supabase.rpc("mes_demandes_signature", { p_org: orgId }),
    // Le rendez-vous à choisir : c'est le SEUL geste que l'intervention demande
    // au locataire, et il n'apparaissait que dans « Mes demandes ». Celui qui
    // n'ouvre pas cet écran ne sait pas qu'on attend sa disponibilité, et le
    // dossier s'arrête là (RM-19.2.3, constat du 11/09).
    supabase.rpc("mes_creneaux_locataire", { p_org: orgId }),
  ]);
  const bail = ((baux ?? []) as BailLocataire[])[0];
  const lignes = (echeancier ?? []) as {
    periode: string;
    montant_du: number;
    montant_couvert: number;
    statut: string;
    quittance_id: string | null;
  }[];
  const prochaine = lignes.find((l) => l.statut !== "paye");
  const mesPieces = (pieces ?? []) as {
    type: string;
    depose_le: string;
    expire_le: string | null;
    verifie_le: string | null;
  }[];
  const attestations = mesPieces
    .filter((p) => p.type === "attestation_assurance")
    .sort((a, b) => b.depose_le.localeCompare(a.depose_le));
  const derniere = attestations[0];
  const attestationValide = Boolean(derniere && !estExpiree(derniere.expire_le));
  // Même vocabulaire que la page Documents : déposée mais pas encore validée
  // par le gestionnaire = « en cours de vérification », pas « à jour »
  const assuranceEnVerification = attestationValide && !derniere?.verifie_le;
  // « En cours de vérification » et « un renouvellement est déjà déposé » ne
  // sont pas la même chose, et c'est la seconde seule qui doit faire taire le
  // rappel de J-30. `assuranceEnVerification` est vraie pour TOUTE dernière
  // attestation non validée — y compris celle déposée il y a onze mois que
  // personne n'a jamais vérifiée (rien ne force la vérification : le dépôt ne
  // pose qu'une alerte côté agence). À J-30, ce dossier-là affichait un
  // message rassurant et ne réclamait rien, pendant que /documents disait
  // « expire dans 20 j » et que le badge du menu s'allumait (relevé du 11/09).
  // Le bon test existait cinq écrans plus loin, dans documents/page.tsx : une
  // attestation VALIDÉE et non expirée, ET une autre qui attend le
  // gestionnaire. On le reprend plutôt que d'en écrire un cinquième.
  const renouvellementDepose =
    attestations.some((p) => p.verifie_le && !estExpiree(p.expire_le)) &&
    attestations.some((p) => !p.verifie_le);
  // Même règle que le badge du menu (audit 06/09) : sans bail actif, aucune
  // assurance n'est réclamée — sinon l'accueil s'alarmait quand le menu, lui,
  // ne comptait rien.
  const assuranceAJour = !bail || attestationValide;
  // RM-0b.5.1 et le tableau des seuils de [[Dossier locataire]] : le rappel de
  // renouvellement est dû AU LOCATAIRE à J-30. Relevé du 11/09 : l'accueil
  // lisait estExpiree (strict « < aujourd'hui ») et affichait « ✓ Assurance à
  // jour » la veille de l'expiration pendant que /documents disait déjà
  // « expire dans 1 j ». estARenouveler est le seuil déjà en service côté
  // agence et en base (documents_a_renouveler) — on le réutilise, on n'en
  // écrit pas un quatrième. RM-0b.6.4 : cela alerte, cela ne verrouille rien.
  // « Aucune alerte si le bail se termine avant l'échéance »
  // ([[Dossier locataire]], sous le tableau des seuils). Un locataire en
  // préavis dont le bail s'achève dans vingt jours n'a pas à renouveler une
  // assurance pour cinq jours de couverture.
  const bailFiniAvantEcheance = Boolean(
    bail?.date_fin && derniere?.expire_le && bail.date_fin <= derniere.expire_le
  );
  const assuranceARenouveler =
    Boolean(bail) &&
    attestationValide &&
    !bailFiniAvantEcheance &&
    estARenouveler(derniere?.expire_le);
  const quittances = lignes.filter((l) => l.quittance_id);
  const quittancesDispo = quittances.length;
  // mon_echeancier_locataire trie par période croissante : la dernière ligne
  // quittancée est la quittance la plus récente.
  const derniereQuittance = quittances[quittances.length - 1];
  const nbDocuments = mesPieces.length + quittancesDispo;
  // Le compteur ne disait pas ce qu'il comptait (relevé 11/09) : /documents
  // porte déjà la quittance, le bail et les attestations, et l'accueil les
  // cachait derrière un nombre. On ne nomme que ce qui est réellement là.
  const contenuDocuments = [
    quittancesDispo > 0 ? "vos quittances" : null,
    mesPieces.some((p) => p.type === "bail") ? "votre bail" : null,
    mesPieces.some((p) => p.type === "attestation_assurance") ? "vos attestations" : null,
  ].filter((m): m is string => Boolean(m));
  const enumererFr = (mots: string[]) =>
    mots.length > 1 ? `${mots.slice(0, -1).join(", ")} et ${mots[mots.length - 1]}` : mots[0];
  const incidentsEnCours = ((incidentsBruts ?? []) as IncidentLocataire[]).filter(
    (i) => i.etat !== "clos"
  );
  // Incidents mis à la charge du locataire dont la fenêtre de contestation lui
  // est encore ouverte. Conditions COPIÉES du bouton « Contester » de la liste
  // (incidents-locataire.tsx:99-103) : réservé au DÉCLARANT — les colocataires
  // sont informés mais les fonctions en base n'acceptent que lui — tant que le
  // dossier n'est pas clos et que la contestation n'a pas déjà été déposée.
  // Revue du 11/09 : annoncer « Voir / contester » à un colocataire l'enverrait
  // sur une carte sans bouton. RM-7.2.5 : la contestation est tracée, jamais
  // bloquante.
  const aContester = incidentsEnCours.filter(
    (i) =>
      i.est_declarant &&
      (i.imputation === "locataire" || i.imputation === "degradation_fautive") &&
      !i.imputation_contestee_le
  );
  const gestionnaire = ((gestionnaires ?? []) as {
    agence: string;
    telephone: string | null;
    email_contact: string | null;
    agent_email: string | null;
  }[])[0];
  const nbPiecesDemandees = ((piecesDemandees ?? []) as unknown[]).length;
  const nbSignatures = ((signatures ?? []) as unknown[]).length;
  const creneauxAChoisir = (creneaux ?? []) as { intervention_id: string; categorie: string }[];
  const interventionsAPlanifier = new Set(creneauxAChoisir.map((c) => c.intervention_id)).size;

  const moisLong = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  const aujourdhui = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
  const enRetard = prochaine && (prochaine.statut === "impaye" || prochaine.statut === "partiel");
  const resteADevoir = prochaine
    ? Number(prochaine.montant_du) - Number(prochaine.montant_couvert)
    : 0;

  // « Ce qui vous attend » : tout ce que le menu comptait déjà en badges, dit
  // en clair et avec le geste à côté. Le loyer en retard y prend sa place —
  // il avait sa propre carte plus bas, qui répétait la même chose.
  const aFaire: { cle: string; titre: string; detail: string; href: string; action: string }[] = [];
  if (eCreneaux) {
    // La lecture des rendez-vous a échoué. Ne rien dire ferait croire au
    // locataire qu'on n'attend rien de lui — et le dossier s'arrêterait là,
    // sans que personne ne sache pourquoi. On ne prétend pas non plus qu'un
    // rendez-vous attend : on dit qu'on n'a pas pu vérifier.
    aFaire.push({
      cle: "creneau-illisible",
      titre: "Un rendez-vous attend peut-être votre choix",
      detail:
        "Nous n'avons pas pu le vérifier à l'instant. Ouvrez « Mes demandes » : s'il y a des dates à choisir, elles s'y trouvent.",
      href: `/locataire/${orgId}/demandes`,
      action: "Vérifier",
    });
  } else if (interventionsAPlanifier > 0) {
    aFaire.push({
      cle: "creneau",
      titre:
        interventionsAPlanifier > 1
          ? `${interventionsAPlanifier} rendez-vous attendent votre choix`
          : "Un rendez-vous attend votre choix",
      detail:
        "L'artisan a proposé des dates. Tant que vous n'en choisissez pas une, l'intervention n'est pas programmée.",
      href: `/locataire/${orgId}/demandes`,
      action: "Choisir",
    });
  }
  if (bail && enRetard && prochaine) {
    aFaire.push({
      cle: "loyer",
      titre: `Loyer de ${moisLong(prochaine.periode)} à régler`,
      detail:
        prochaine.statut === "partiel"
          ? `Il reste ${eur(resteADevoir)} à régler par virement à votre gestionnaire.`
          : `${eur(resteADevoir)} à régler par virement à votre gestionnaire.`,
      href: `/locataire/${orgId}/loyers`,
      action: "Mes paiements",
    });
  }
  if (bail && !assuranceAJour) {
    aFaire.push({
      cle: "assurance",
      titre: derniere
        ? "Votre attestation d'assurance a expiré"
        : "Votre attestation d'assurance manque",
      detail:
        "L'assurance habitation est obligatoire pendant toute la durée du bail — une photo lisible suffit.",
      href: `/locataire/${orgId}/documents#assurance`,
      action: "Déposer",
    });
  } else if (assuranceARenouveler && !renouvellementDepose && derniere) {
    // Seul un renouvellement RÉELLEMENT déposé fait taire le rappel : réclamer
    // une pièce qu'on a déjà entre les mains contredirait la pastille.
    aFaire.push({
      cle: "assurance",
      titre: `Votre attestation d'assurance expire le ${formaterDate(derniere.expire_le)}`,
      detail:
        "L'assurance habitation est obligatoire pendant toute la durée du bail — déposez la nouvelle attestation dès que votre assureur vous l'envoie, une photo lisible suffit.",
      href: `/locataire/${orgId}/documents#assurance`,
      action: "Renouveler",
    });
  }
  if (aContester.length > 0) {
    // Une ligne, même pour plusieurs dossiers : « Ce qui vous attend » est une
    // liste de gestes, pas un journal.
    const seul = aContester.length === 1 ? aContester[0] : undefined;
    aFaire.push({
      cle: "imputation",
      titre: seul
        ? `Votre signalement ${seul.numero} est à votre charge`
        : `${aContester.length} signalements sont mis à votre charge`,
      detail:
        seul?.imputation_justification ||
        "Votre gestionnaire a tranché qui paie la réparation. Vous pouvez contester : c'est tracé et cela ne bloque rien.",
      href: `/locataire/${orgId}/demandes`,
      action: "Voir / contester",
    });
  }
  if (nbSignatures > 0) {
    aFaire.push({
      cle: "signature",
      titre:
        nbSignatures > 1
          ? `${nbSignatures} documents à signer`
          : "Un document à signer",
      detail: "À télécharger, signer, puis redéposer — votre gestionnaire est prévenu.",
      href: `/locataire/${orgId}/documents`,
      action: "Ouvrir",
    });
  }
  if (nbPiecesDemandees > 0) {
    aFaire.push({
      cle: "pieces",
      titre:
        nbPiecesDemandees > 1
          ? `${nbPiecesDemandees} pièces vous sont demandées`
          : "Une pièce vous est demandée",
      detail: "Votre gestionnaire les attend pour compléter votre dossier.",
      href: `/locataire/${orgId}/documents`,
      action: "Déposer",
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mono-discret sans-majuscules">{aujourdhui}</p>
        <h1 className="mt-0.5">
          Bonjour{personne?.prenom ? ` ${personne.prenom}` : ""},
        </h1>
        <p className="text-sm text-muted-foreground">
          Voici l&apos;essentiel pour votre logement.
        </p>
      </div>

      {aEchoue(
        eBaux,
        eEcheancier,
        ePieces,
        eIncidents,
        eGestionnaire,
        eAnnonces,
        eDemandes,
        eSignatures
      ) && <PanneLecture quoi="l'essentiel de votre logement" />}

      {bail && (
        <div className="loc-hero">
          <span className="loc-vignette" aria-hidden>
            {(bail.ville?.[0] ?? bail.lot_nom[0] ?? "G").toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-heading text-xl text-[var(--encre)]">{bail.lot_nom}</p>
            <p className="text-[13px] text-muted-foreground">{bail.adresse}</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {[
                bail.surface_m2 != null ? `${Number(bail.surface_m2).toLocaleString("fr-FR")} m²` : null,
                bail.pieces != null ? `${bail.pieces} pièce${bail.pieces > 1 ? "s" : ""}` : null,
                bail.etage ? `étage ${bail.etage}` : null,
                bail.meuble ? "meublé" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {/* Le bail signé avait deux portes (/logement et /documents) et
                l'accueil n'en nommait aucune (relevé 11/09). La route
                /bail/fichier refait elle-même le contrôle d'accès — parcours
                1.14, locataire principal ou colocataire, bail actif ou en
                préavis : le lien ne déplace aucun droit. document_signe est
                déjà porté par mon_bail_locataire, aucune lecture de plus.
                pointer-coarse:min-h-10 : les liens stylés en bouton sm (28 px)
                échappent au filet tactile du socle. */}
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Link
                href={`/locataire/${orgId}/logement`}
                className={`pointer-coarse:min-h-10 ${buttonVariants({ variant: "outline", size: "sm" })}`}
              >
                Voir les détails →
              </Link>
              {bail.document_signe && (
                <a
                  href={`/locataire/${orgId}/bail/fichier`}
                  target="_blank"
                  rel="noopener"
                  className={`pointer-coarse:min-h-10 ${buttonVariants({ variant: "outline", size: "sm" })}`}
                >
                  Consulter mon bail signé
                </a>
              )}
            </div>
          </div>
          <div className="loc-citation">
            Un chez-vous plus serein,
            <br />
            au quotidien.
          </div>
        </div>
      )}

      {aFaire.length > 0 && (
        <div className="loc-carte border-l-4 border-l-[var(--or)]">
          <div className="entete-carte !mb-1">
            <h3 className="text-base font-medium">Ce qui vous attend</h3>
            <span className="loc-tag ambre">
              {aFaire.length} point{aFaire.length > 1 ? "s" : ""}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {aFaire.map((t) => (
              <li
                key={t.cle}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <b className="block font-medium">{t.titre}</b>
                  <small className="block text-muted-foreground">{t.detail}</small>
                </span>
                <Link
                  href={t.href}
                  className={`shrink-0 ${buttonVariants({ variant: "outline", size: "sm" })}`}
                >
                  {t.action}
                </Link>
              </li>
            ))}
          </ul>
          {enRetard && (
            <p className="mt-3 text-xs text-muted-foreground">
              Une difficulté de paiement ? Écrivez à votre gestionnaire : une
              solution se trouve toujours plus tôt que tard.
            </p>
          )}
        </div>
      )}

      {/* Annonces de l'agence pour l'immeuble (backend v10) */}
      {((annonces ?? []) as { id: string; texte: string }[]).map((a) => (
        <div key={a.id} className="loc-carte border-l-4 border-l-[var(--or)]">
          <p className="text-sm">
            <b className="font-semibold">Dans votre immeuble</b> — {a.texte}
          </p>
        </div>
      ))}

      <div className="loc-grille">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="loc-carte loc-kpi">
            <p className="text-[13px] font-semibold text-[var(--encre)]">Prochain loyer</p>
            {eEcheancier ? (
              <div className="mt-2">
                <LectureImpossible quoi="votre échéancier" />
              </div>
            ) : bail && prochaine ? (
              <>
                <p className="v montant">{eur(resteADevoir)}</p>
                <p className="text-xs text-muted-foreground capitalize">{moisLong(prochaine.periode)}</p>
                <span className={`loc-tag mt-2.5 ${enRetard ? "rouge" : "vert"}`}>
                  {prochaine.statut === "impaye"
                    ? "En retard — régularisez vite"
                    : prochaine.statut === "partiel"
                      ? "Partiellement réglé"
                      : "✓ À jour"}
                </span>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Rien à régler pour l&apos;instant.
              </p>
            )}
            <Link href={`/locataire/${orgId}/loyers`} className="lien-discret mt-3 block">
              Voir mes paiements →
            </Link>
          </div>
          <div className="loc-carte loc-kpi">
            <p className="text-[13px] font-semibold text-[var(--encre)]">Mes documents</p>
            {ePieces || eEcheancier ? (
              <div className="mt-2">
                <LectureImpossible quoi="vos documents" />
              </div>
            ) : (
              <>
                <p className="v">{nbDocuments}</p>
                <p className="text-xs text-muted-foreground">
                  {nbDocuments === 0
                    ? "Aucune pièce pour l'instant"
                    : contenuDocuments.length > 0
                      ? enumererFr(contenuDocuments)
                      : `pièce${nbDocuments > 1 ? "s" : ""} à votre disposition`}
                </p>
                <span
                  className={`loc-tag mt-2.5 ${
                    !bail
                      ? "bleu"
                      : renouvellementDepose || assuranceEnVerification || assuranceARenouveler || !attestationValide
                        ? "ambre"
                        : "vert"
                  }`}
                >
                  {!bail
                    ? "Aucune pièce attendue"
                    : renouvellementDepose
                      ? "Renouvellement déposé — en cours de vérification"
                      : assuranceARenouveler && derniere
                        ? `Assurance à renouveler avant le ${formaterDate(derniere.expire_le)}`
                        : assuranceEnVerification
                          ? "Assurance en cours de vérification"
                          : attestationValide
                            ? "✓ Assurance à jour"
                            : "Assurance à déposer"}
                </span>
              </>
            )}
            {/* L'accueil comptait les quittances sans jamais en ouvrir une
                (relevé 11/09) : quittance_id est déjà dans l'échéancier lu
                ligne 30, aucune requête de plus. Le lien se pose ici et non
                sur « Prochain loyer », qui affiche le mois IMPAYÉ : deux mois
                différents sous un seul montant se lisent de travers. Même
                page authentifiée qu'ailleurs — le périmètre est porté par la
                RPC quittance_detail (RM-3.12.2), pas par l'emplacement du
                lien. Pas de nouvel onglet : sur un téléphone, le retour par
                le sélecteur d'onglets coûte plus cher que le bouton Retour. */}
            {derniereQuittance?.quittance_id && (
              <Link
                href={`/quittance/${derniereQuittance.quittance_id}`}
                className="lien-discret mt-3 block"
              >
                Dernière quittance — {moisLong(derniereQuittance.periode)} →
              </Link>
            )}
            <Link href={`/locataire/${orgId}/documents`} className="lien-discret mt-3 block">
              Voir mes documents →
            </Link>
          </div>
          <div className="loc-carte loc-kpi">
            <p className="text-[13px] font-semibold text-[var(--encre)]">Mon logement</p>
            {eIncidents ? (
              <div className="mt-2">
                <LectureImpossible quoi="vos demandes" />
              </div>
            ) : incidentsEnCours.length === 0 ? (
              <>
                <p className="mt-1.5 font-heading text-xl text-[var(--encre)]">
                  Tout est en ordre
                </p>
                <span className="loc-tag vert mt-2.5">✓ Aucun incident en cours</span>
              </>
            ) : (
              <>
                <p className="v">{incidentsEnCours.length}</p>
                <p className="text-xs text-muted-foreground">
                  demande{incidentsEnCours.length > 1 ? "s" : ""} en cours de traitement
                </p>
                {/* La pastille disait « Suivie(s) par votre gestionnaire »
                    même quand l'imputation venait d'être mise à la charge du
                    locataire et que sa fenêtre de contestation était ouverte
                    (relevé 11/09) : à ce moment-là, c'est lui qui a la main.
                    RM-19.2.3 : le statut se lit depuis l'accueil. */}
                <span className="loc-tag ambre mt-2.5">
                  {aContester.length > 1
                    ? "Des décisions vous attendent"
                    : aContester.length === 1
                      ? "Une décision vous attend"
                      : `Suivie${incidentsEnCours.length > 1 ? "s" : ""} par votre gestionnaire`}
                </span>
              </>
            )}
            {/* Les DEUX portes, au lieu d'une qui bascule : le ternaire
                d'origine retirait « Signaler un problème » dès qu'un dossier
                était ouvert — c'est-à-dire au moment où un second incident
                est le plus probable, et où plus aucun écran ne menait au
                formulaire (relevé 11/09). Bail terminé, /incident n'est qu'un
                cul-de-sac : on ne propose alors que l'historique. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              {adhesionActive && (
                <Link href={`/locataire/${orgId}/incident`} className="lien-discret">
                  Signaler un problème →
                </Link>
              )}
              {(incidentsEnCours.length > 0 || !adhesionActive) && (
                <Link href={`/locataire/${orgId}/demandes`} className="lien-discret">
                  Suivre mes demandes
                  {incidentsEnCours.length > 0 ? ` (${incidentsEnCours.length})` : ""} →
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <CarteGestionnaire orgId={orgId} gestionnaire={gestionnaire} />
          <CarteUrgence />
        </div>
      </div>
    </div>
  );
}
