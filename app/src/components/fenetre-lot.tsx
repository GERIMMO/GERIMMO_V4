"use client";

import Link from "next/link";
import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  chargerFicheLot,
  chargerDocumentsDuLot,
  chargerComptabiliteDuLot,
  chargerEcheancierLocataire,
  chargerRelancesDuLot,
  chargerHistoriqueDuLot,
  envoyerRapportDuLot,
  type FicheLot,
  type DocumentDuLot,
  type EcritureDuLot,
  type TermeDuLot,
  type TermeLocataire,
  type RapportDuLot,
  type EchelonRelance,
  type EvenementDuLot,
  type EtatEnvoiRapport,
} from "@/app/actions/fiche-lot";
import { ajouterEcriture, type EtatCompta } from "@/app/actions/compta";
import { encaisserReste } from "@/app/actions/quittancement";
import { ajouterEncaissement, ajouterRelance, type EtatLoyers } from "@/app/actions/loyers";
import { Modale } from "@/components/ui/modale";
import { BadgeStatut, type TonStatut } from "@/components/badge-statut";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { buttonVariants } from "@/components/ui/button";
import { afficherToast } from "@/components/ui/toast";
import { ETATS_LOT, TYPES_BIEN, formaterSurface } from "@/lib/parc";
import { TYPES_BAIL, ETATS_BAIL, STATUTS_APPEL_LOYER } from "@/lib/baux";
import { TYPES_DOCUMENT, eur, formaterDate, moisEnFrancais } from "@/lib/ged";
import { CATEGORIES_INCIDENT } from "@/lib/incidents";

// LA FENÊTRE DU LOT — sur le gabarit remis par l'humain le 12/09.
//
// « Voilà exactement ce que je veux sur le bouton lot. » Le gabarit apporte
// quatre choses que la première version n'avait pas : un en-tête qui porte
// l'état du lot en pastilles, un BANDEAU D'ACTION en tête (l'impayé et les
// gestes qui le règlent, avant tout le reste), des ONGLETS à la place des deux
// volets, et un historique.
//
// DEUX ENDROITS OÙ LE GABARIT ALLAIT PLUS VITE QUE LE PRODUIT.
//
// 1. Il dessine QUATRE étapes de relance, dont « commandement de payer ». Le
//    produit en connaît trois, et c'est juste : le commandement est un acte
//    d'huissier, que ni l'agence ni la plateforme ne délivrent. Un bouton qui
//    ne peut rien déclencher promet un pouvoir qu'on n'a pas.
// 2. Il montre une vignette photographique du bien. Aucune photo de lot
//    n'existe dans le produit. Plutôt qu'une image d'illustration — qui ferait
//    croire que la photo est celle DU lot —, la vignette porte le monogramme
//    de l'adresse, comme l'espace locataire le fait déjà.
//
// LES COULEURS VIENNENT DES JETONS, jamais du gabarit (module 17, marque
// blanche) : une agence qui change ses couleurs doit voir cette fenêtre
// changer avec elle. Le gabarit donne la FORME, la charte donne le ton.
//
// LA PORTÉE VIENT DE LA BASE. `fiche_lot.portee` dit à quel titre on regarde
// ce lot ; un locataire n'a ni les mêmes onglets, ni les mêmes gestes, et il
// ne reçoit même pas les colonnes qui ne le regardent pas.

type Ouvrir = (lotId: string, libelle?: string) => void;
const ContexteFenetre = createContext<Ouvrir | null>(null);

/**
 * Le bouton qui ouvre la fenêtre. Il enveloppe le rang rendu côté serveur :
 * la liste reste un composant serveur, seule la poignée est cliente.
 *
 * Hors fournisseur, ou sans lot à ouvrir, il se comporte comme un lien vers la
 * fiche complète : mieux vaut une page qu'un bouton mort.
 */
export function BoutonLot({
  lotId,
  libelle,
  href,
  className,
  children,
  ...props
}: {
  lotId: string;
  /** Le nom du lot, pour que la fenêtre s'ouvre déjà titrée. */
  libelle?: string;
  href: string;
  className?: string;
  children: ReactNode;
} & Omit<React.ComponentProps<"button">, "children" | "className">) {
  const ouvrir = useContext(ContexteFenetre);
  if (!ouvrir || !lotId) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={() => ouvrir(lotId, libelle)}
      {...props}
    >
      {children}
    </button>
  );
}

export function FenetreLotProvider({
  orgId,
  lotInitial = null,
  children,
}: {
  orgId: string;
  lotInitial?: string | null;
  children: ReactNode;
}) {
  const [ouvert, setOuvert] = useState<{ id: string; libelle?: string } | null>(
    lotInitial ? { id: lotInitial } : null
  );
  const ouvrir = useCallback<Ouvrir>((id, libelle) => setOuvert({ id, libelle }), []);
  return (
    <ContexteFenetre.Provider value={ouvrir}>
      {children}
      {ouvert && (
        <FenetreLot
          key={ouvert.id}
          orgId={orgId}
          lotId={ouvert.id}
          libelle={ouvert.libelle}
          fermer={() => setOuvert(null)}
        />
      )}
    </ContexteFenetre.Provider>
  );
}

type Onglet = "resume" | "documents" | "compta" | "historique";

function FenetreLot({
  orgId,
  lotId,
  libelle,
  fermer,
}: {
  orgId: string;
  lotId: string;
  libelle?: string;
  fermer: () => void;
}) {
  const [fiche, setFiche] = useState<FicheLot | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("resume");
  // Le rechargement de la fiche après un geste qui change les chiffres : un
  // encaissement doit faire tomber l'impayé de l'en-tête, pas seulement du
  // tableau où l'on a cliqué.
  const [tour, setTour] = useState(0);
  const rafraichir = useCallback(() => setTour((t) => t + 1), []);

  useEffect(() => {
    let vivant = true;
    chargerFicheLot(lotId).then((r) => {
      if (!vivant) return;
      if (r.erreur) setErreur(r.erreur);
      else setFiche(r.donnees ?? null);
    });
    return () => {
      vivant = false;
    };
  }, [lotId, tour]);

  const locataire = fiche?.portee === "locataire";
  const ficheComplete = !fiche
    ? null
    : locataire
      ? `/locataire/${orgId}/bail`
      : `/agence/${orgId}/parc/${fiche.bien_id}/lots/${fiche.lot_id}`;

  const onglets: { cle: Onglet; libelle: string }[] = [
    { cle: "resume", libelle: "Résumé" },
    { cle: "documents", libelle: "Documents" },
    { cle: "compta", libelle: locataire ? "Mes loyers" : "Comptabilité" },
    { cle: "historique", libelle: "Historique" },
  ];

  return (
    <Modale
      tresLarge
      titre={fiche?.lot_nom ?? libelle ?? "Lot"}
      entete={<EnteteLot fiche={fiche} libelle={libelle} />}
      fermer={fermer}
      pied={
        ficheComplete && fiche ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono-discret flex-1 normal-case">
              {fiche.bien_nom} · {fiche.ville}
            </span>
            {!locataire && (
              <Link
                href={`/agence/${orgId}/parc?sel=bien:${fiche.bien_id}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Fiche du bien
              </Link>
            )}
            <Link href={ficheComplete} className={buttonVariants({ size: "sm" })}>
              {locataire ? "Voir mon bail en entier" : "Ouvrir la fiche complète"}
            </Link>
          </div>
        ) : null
      }
    >
      {erreur && (
        <p className="err mb-0" role="alert">
          {erreur}
        </p>
      )}
      {!fiche && !erreur && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Lecture du lot…
        </p>
      )}

      {fiche && (
        <>
          <BandeauAction orgId={orgId} fiche={fiche} rafraichir={rafraichir} />

          {/* Les onglets : une seule question à la fois. Les deux volets de la
              première version obligeaient à faire défiler la fenêtre entière
              pour atteindre la comptabilité. */}
          <div
            role="tablist"
            aria-label="Sections du lot"
            className="-mx-5 flex gap-1 overflow-x-auto border-b border-border px-5"
          >
            {onglets.map((o) => (
              <button
                key={o.cle}
                role="tab"
                type="button"
                aria-selected={onglet === o.cle}
                onClick={() => setOnglet(o.cle)}
                className={`min-h-11 shrink-0 border-b-2 px-3 text-[13.5px] transition-colors ${
                  onglet === o.cle
                    ? "border-b-[var(--or)] font-semibold text-[var(--encre)]"
                    : "border-b-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.libelle}
              </button>
            ))}
          </div>

          {onglet === "resume" && (
            <OngletResume orgId={orgId} fiche={fiche} allerA={setOnglet} />
          )}
          {onglet === "documents" && <OngletDocuments orgId={orgId} fiche={fiche} />}
          {onglet === "compta" &&
            (locataire ? (
              <OngletMesLoyers orgId={orgId} />
            ) : (
              <OngletComptabilite orgId={orgId} fiche={fiche} rafraichir={rafraichir} />
            ))}
          {onglet === "historique" && <OngletHistorique lotId={fiche.lot_id} />}
        </>
      )}
    </Modale>
  );
}

/* ── L'en-tête ────────────────────────────────────────────────────────── */

function EnteteLot({ fiche, libelle }: { fiche: FicheLot | null; libelle?: string }) {
  const locataire = fiche?.portee === "locataire";
  const impaye = Number(fiche?.impaye_echu ?? 0);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      {/* LA VIGNETTE PORTE UN MONOGRAMME, PAS UNE PHOTO. Le gabarit montre une
          image du bien ; le produit n'en stocke aucune, et une image
          d'illustration ferait croire que c'est celle de ce lot-là. */}
      <span
        aria-hidden
        className="hidden size-14 shrink-0 items-center justify-center border border-[var(--sur-encre)]/20 bg-[var(--sur-encre)]/10 font-heading text-2xl text-[var(--sur-encre)]/80 sm:flex"
      >
        {(fiche?.ville?.[0] ?? fiche?.lot_nom?.[0] ?? "G").toUpperCase()}
      </span>
      <div className="min-w-0">
        <p className="mono-discret text-[var(--sur-encre)]/70">
          {fiche ? `${fiche.lot_nom} · ${fiche.ville}` : "Lot"}
        </p>
        <h3 className="mt-0.5 truncate text-[var(--sur-encre)]">
          {fiche ? `${TYPES_BIEN[fiche.bien_type] ?? fiche.bien_type} — ${fiche.adresse}` : (libelle ?? "Chargement…")}
        </h3>
        {fiche && (
          <>
            <p className="text-[12.5px] text-[var(--sur-encre)]/70">
              {[
                fiche.surface_m2 !== null ? formaterSurface(fiche.surface_m2) : null,
                fiche.pieces !== null ? `${fiche.pieces} pièce${fiche.pieces > 1 ? "s" : ""}` : null,
                fiche.etage ? `étage ${fiche.etage}` : null,
                fiche.meuble ? "meublé" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Pastille ton="neutre">{ETATS_LOT[fiche.lot_etat] ?? fiche.lot_etat}</Pastille>
              {impaye > 0 ? (
                <Pastille ton="alerte">Impayé {eur(impaye)}</Pastille>
              ) : (
                fiche.bail_id && <Pastille ton="ok">À jour de loyer</Pastille>
              )}
              {!locataire &&
                (fiche.mandat_id ? (
                  <Pastille ton="neutre">Sous mandat · {Number(fiche.taux_honoraires ?? 0)} %</Pastille>
                ) : (
                  <Pastille ton="neutre">Hors mandat de gestion</Pastille>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Pastille posée SUR l'encre : les tons de la charte n'y seraient pas lisibles. */
function Pastille({ ton, children }: { ton: "ok" | "alerte" | "neutre"; children: ReactNode }) {
  const tons = {
    ok: "bg-[var(--success)]/25 text-[var(--success-soft)]",
    alerte: "bg-[var(--destructive)]/30 text-[var(--destructive-soft)]",
    neutre: "bg-[var(--sur-encre)]/12 text-[var(--sur-encre)]/85",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${tons[ton]}`}>
      {children}
    </span>
  );
}

/* ── Le bandeau d'action ──────────────────────────────────────────────── */

/**
 * Ce qui appelle un geste, EN TÊTE, avec les gestes à côté.
 *
 * C'est le cœur du gabarit : on n'ouvre pas un lot pour le lire, on l'ouvre
 * parce que quelque chose s'y passe. L'impayé, l'échelle de relance là où on
 * en est, et les trois boutons qui la font avancer — encaisser, encaisser une
 * partie, monter d'un cran.
 */
function BandeauAction({
  orgId,
  fiche,
  rafraichir,
}: {
  orgId: string;
  fiche: FicheLot;
  rafraichir: () => void;
}) {
  const locataire = fiche.portee === "locataire";
  const impaye = Number(fiche.impaye_echu);
  const [echelle, setEchelle] = useState<EchelonRelance[] | null>(null);

  useEffect(() => {
    if (locataire || impaye <= 0) return;
    let vivant = true;
    chargerRelancesDuLot(fiche.lot_id).then((r) => {
      if (vivant && !r.erreur) setEchelle(r.donnees ?? []);
    });
    return () => {
      vivant = false;
    };
  }, [locataire, impaye, fiche.lot_id]);

  if (impaye <= 0) {
    // Rien à régler : on le dit une fois, sobrement. Un bandeau vert
    // permanent sur chaque lot apprend à ne plus regarder le bandeau.
    const blocages = fiche.blocages ?? [];
    if (blocages.length === 0 && fiche.incidents_ouverts === 0) return null;
    return (
      <section
        aria-label="Ce qui attend un geste"
        className="-mx-5 border-l-[3px] border-l-warning bg-warning-soft px-5 py-3 text-sm text-warning-soft-foreground"
      >
        <ul className="space-y-1">
          {fiche.incidents_ouverts > 0 && (
            <li>
              {fiche.incidents_ouverts}{" "}
              {locataire
                ? `signalement${fiche.incidents_ouverts > 1 ? "s" : ""} en cours de traitement.`
                : `incident${fiche.incidents_ouverts > 1 ? "s" : ""} encore ouvert${fiche.incidents_ouverts > 1 ? "s" : ""}.`}
            </li>
          )}
          {blocages.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section
      aria-label="Impayé à traiter"
      className="-mx-5 border-l-[3px] border-l-destructive bg-destructive-soft px-5 py-4"
    >
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <span className="font-heading text-2xl leading-none font-semibold text-destructive">
          {eur(impaye)}
        </span>
        <div className="min-w-[200px] flex-1 text-[13px] text-muted-foreground">
          <b className="text-foreground">
            {fiche.termes_impayes} terme{fiche.termes_impayes > 1 ? "s" : ""} échu
            {fiche.termes_impayes > 1 ? "s" : ""}
          </b>
          {locataire
            ? " — le montant qu'il vous reste à régler."
            : " — le propriétaire est informé à chaque étape."}
          {!locataire && echelle && echelle.length > 0 && (
            <EchelleRelance echelons={echelle} />
          )}
        </div>
        {!locataire && fiche.bail_id && (
          <GestesImpaye
            orgId={orgId}
            bailId={fiche.bail_id}
            echelle={echelle}
            rafraichir={rafraichir}
          />
        )}
      </div>
    </section>
  );
}

/**
 * L'échelle de relance, entière — franchie, courante, à venir.
 *
 * Le produit en compte TROIS (`relances.niveau`). Le gabarit en dessinait
 * quatre, la dernière étant le commandement de payer : c'est un acte
 * d'huissier, que la plateforme ne délivre pas, et un bouton qui ne peut rien
 * déclencher promet un pouvoir qu'on n'a pas.
 */
function EchelleRelance({ echelons }: { echelons: EchelonRelance[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {echelons.map((e) => {
        const franchi = Boolean(e.envoye_le);
        return (
          <span
            key={e.niveau}
            title={
              e.envoye_le
                ? `Envoyée le ${formaterDate(e.envoye_le)}${e.recommande ? ` · recommandé ${e.recommande}` : ""}`
                : "Pas encore envoyée"
            }
            className={`rounded-full border px-2.5 py-0.5 text-[10.5px] ${
              franchi
                ? "border-destructive bg-destructive text-[var(--ivoire)]"
                : "border-border bg-background text-muted-foreground"
            }`}
          >
            {e.libelle}
            {e.envoye_le ? ` · ${formaterDate(e.envoye_le)}` : ""}
          </span>
        );
      })}
    </div>
  );
}

/** Les trois gestes du gabarit : encaisser, encaisser une partie, monter d'un cran. */
function GestesImpaye({
  orgId,
  bailId,
  echelle,
  rafraichir,
}: {
  orgId: string;
  bailId: string;
  echelle: EchelonRelance[] | null;
  rafraichir: () => void;
}) {
  const [partiel, setPartiel] = useState(false);
  // Le prochain barreau NON franchi : « étape suivante » ne redemande pas une
  // relance déjà envoyée, et disparaît une fois la mise en demeure partie.
  const prochain = (echelle ?? []).find((e) => !e.envoye_le) ?? null;

  const [etatRelance, actionRelance] = useActionState<EtatLoyers, FormData>(
    async (etat, formData) => {
      const r = await ajouterRelance(orgId, bailId, etat, formData);
      if (r.succes) {
        afficherToast(`${prochain?.libelle ?? "Relance"} enregistrée — trace écrite au dossier.`);
        rafraichir();
      }
      return r;
    },
    {}
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPartiel((p) => !p)}
          aria-expanded={partiel}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Règlement partiel
        </button>
        {prochain && (
          <form action={actionRelance}>
            <input type="hidden" name="niveau" value={prochain.niveau} />
            <BoutonEnvoi size="sm" variant="outline" enCoursTexte="Enregistrement…">
              {prochain.rang === 1 ? "Relancer" : prochain.libelle}
            </BoutonEnvoi>
          </form>
        )}
      </div>
      {etatRelance.erreur && (
        <p className="text-xs text-destructive" role="alert">
          {etatRelance.erreur}
        </p>
      )}
      {prochain?.niveau === "mise_en_demeure" && (
        <p className="max-w-xs text-[11.5px] text-muted-foreground">
          La mise en demeure part en recommandé, hors de la plateforme : le
          numéro et la date de première présentation se saisissent depuis le bail.
        </p>
      )}
      {partiel && (
        <FormulairePartiel orgId={orgId} bailId={bailId} rafraichir={rafraichir} />
      )}
    </div>
  );
}

/**
 * Un règlement partiel.
 *
 * RM-3.4.2 : une quittance atteste un terme SOLDÉ. Tant qu'il ne l'est pas,
 * l'argent reçu ne produit qu'un reçu — et l'écran le dit avant le clic, parce
 * que c'est la question que le locataire posera.
 */
function FormulairePartiel({
  orgId,
  bailId,
  rafraichir,
}: {
  orgId: string;
  bailId: string;
  rafraichir: () => void;
}) {
  const [etat, action] = useActionState<EtatLoyers, FormData>(
    async (e, formData) => {
      const r = await ajouterEncaissement(orgId, bailId, e, formData);
      if (r.succes) {
        afficherToast(r.succes);
        rafraichir();
      }
      return r;
    },
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
      <div className="space-y-1">
        <Label htmlFor={`part-${bailId}`} className="text-xs">
          Montant reçu (€)
        </Label>
        <Input
          id={`part-${bailId}`}
          name="montant"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          className="h-9 w-32"
        />
      </div>
      <BoutonEnvoi size="sm" enCoursTexte="Enregistrement…">
        Enregistrer
      </BoutonEnvoi>
      <p className="w-full text-[11.5px] text-muted-foreground">
        Tant que le terme n’est pas soldé, le locataire reçoit un <b>reçu</b>, pas une
        quittance (RM-3.4.2).
      </p>
      {etat.erreur && (
        <p className="w-full text-xs text-destructive" role="alert">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}

/* ── Onglet « Résumé » ────────────────────────────────────────────────── */

function OngletResume({
  orgId,
  fiche,
  allerA,
}: {
  orgId: string;
  fiche: FicheLot;
  allerA: (o: Onglet) => void;
}) {
  const locataire = fiche.portee === "locataire";
  const loyer = Number(fiche.loyer_hc ?? 0) + Number(fiche.charges ?? 0);
  const impaye = Number(fiche.impaye_echu);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tuile
          libelle="Loyer + charges"
          valeur={fiche.bail_id ? eur(loyer) : "—"}
          sous={fiche.jour_echeance ? `le ${fiche.jour_echeance} du mois` : "lot libre"}
        />
        <Tuile
          libelle={locataire ? "Mon solde" : "Solde locataire"}
          valeur={impaye > 0 ? `− ${eur(impaye)}` : eur(0)}
          sous={impaye > 0 ? `${fiche.termes_impayes} terme${fiche.termes_impayes > 1 ? "s" : ""} échu${fiche.termes_impayes > 1 ? "s" : ""}` : "à jour"}
          alerte={impaye > 0}
        />
        <Tuile
          libelle="Dépôt de garantie"
          valeur={fiche.depot_garantie ? eur(fiche.depot_garantie) : "—"}
          sous={fiche.depot_garantie ? "restitué après l’EDL de sortie" : "non renseigné"}
        />
        <Tuile
          libelle="Dans les lieux"
          valeur={fiche.date_debut ? `depuis ${formaterDate(fiche.date_debut).slice(3)}` : "—"}
          sous={fiche.bail_type ? (TYPES_BAIL[fiche.bail_type] ?? fiche.bail_type) : "aucun bail"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Carte
          titre={locataire ? "Mon bail" : "Locataire"}
          badge={fiche.bail_etat && fiche.bail_etat !== "actif" ? (ETATS_BAIL[fiche.bail_etat] ?? fiche.bail_etat) : "occupant"}
          ton={fiche.bail_etat === "preavis" ? "attente" : "ok"}
        >
          {fiche.bail_id ? (
            <>
              {!locataire && (
                <Personne
                  nom={fiche.locataire ?? "Locataire non désigné"}
                  lignes={[fiche.locataire_email, fiche.locataire_telephone]}
                />
              )}
              <Ligne
                libelle="Bail"
                valeur={
                  <Link href={locataire ? `/locataire/${orgId}/bail` : `/agence/${orgId}/baux/${fiche.bail_id}`} className="lien-discret">
                    {TYPES_BAIL[fiche.bail_type ?? ""] ?? fiche.bail_type}
                    {fiche.date_debut ? ` · depuis le ${formaterDate(fiche.date_debut)}` : ""} ›
                  </Link>
                }
              />
              <Ligne libelle="Échéance" valeur={fiche.jour_echeance ? `le ${fiche.jour_echeance} du mois` : null} />
              {!locataire && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {fiche.locataire_email && (
                    <a href={`mailto:${fiche.locataire_email}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Écrire
                    </a>
                  )}
                  {fiche.locataire_telephone && (
                    <a href={`tel:${fiche.locataire_telephone}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Appeler
                    </a>
                  )}
                  <button type="button" onClick={() => allerA("documents")} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Ses documents
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Lot libre — aucun bail en cours ni en préparation.
            </p>
          )}
        </Carte>

        {locataire ? (
          <Carte titre="Mon logement" badge="mon gestionnaire" ton="neutre">
            <Ligne libelle="Immeuble" valeur={fiche.bien_nom} />
            <Ligne libelle="Adresse" valeur={`${fiche.adresse}, ${fiche.code_postal} ${fiche.ville}`} />
            <p className="mt-3 text-sm text-muted-foreground">
              Une question, une panne ? Votre gestionnaire répond depuis{" "}
              <Link href={`/locataire/${orgId}/contact`} className="lien-discret">
                Mon gestionnaire
              </Link>
              .
            </p>
          </Carte>
        ) : (
          <Carte
            titre="Propriétaire"
            badge={fiche.mandat_id ? "sous mandat" : "hors mandat"}
            ton={fiche.mandat_id ? "ok" : "attente"}
            or
          >
            <Personne nom={fiche.mandant ?? fiche.proprietaires ?? "Propriétaire non renseigné"} lignes={[fiche.mandant_email]} or />
            <Ligne libelle="Détention" valeur={fiche.proprietaires} />
            {fiche.mandat_id ? (
              <>
                <Ligne libelle="Honoraires" valeur={fiche.taux_honoraires !== null ? `${Number(fiche.taux_honoraires)} %` : null} />
                <Ligne libelle="Rapport" valeur={fiche.jour_rapport ? `le ${fiche.jour_rapport} du mois` : null} />
                <div className="mt-3">
                  <button type="button" onClick={() => allerA("compta")} className={buttonVariants({ size: "sm" })}>
                    Envoyer le rapport
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Aucun mandat de gestion sur ce lot :{" "}
                  <b className="text-foreground">ni honoraires, ni rapport de gestion</b> pour
                  votre agence. Le suivi reste visible, les mouvements ne passent pas par un
                  compte mandant.
                </p>
                {fiche.proprietaire_id && (
                  <div className="mt-3">
                    <Link
                      href={`/agence/${orgId}/personnes/${fiche.proprietaire_id}#mandats`}
                      className={buttonVariants({ size: "sm" })}
                    >
                      Proposer un mandat
                    </Link>
                  </div>
                )}
              </>
            )}
          </Carte>
        )}
      </div>

      <ActionsRapides orgId={orgId} fiche={fiche} allerA={allerA} />
    </div>
  );
}

function ActionsRapides({
  orgId,
  fiche,
  allerA,
}: {
  orgId: string;
  fiche: FicheLot;
  allerA: (o: Onglet) => void;
}) {
  const locataire = fiche.portee === "locataire";
  const retour = locataire ? `/locataire/${orgId}/logement` : `/agence/${orgId}/parc`;
  return (
    <div>
      <p className="eyebrow mb-2">Actions rapides</p>
      <div className="flex flex-wrap gap-2">
        {locataire ? (
          <>
            <Link href={`/locataire/${orgId}/incident`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Signaler un problème
            </Link>
            <Link href={`/locataire/${orgId}/loyers`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Mes quittances
            </Link>
            <Link href={`/locataire/${orgId}/documents`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Déposer mon assurance
            </Link>
          </>
        ) : (
          <>
            {/* Ces deux-là GÉNÈRENT vraiment leur document : le gabarit les
                dessinait, les modèles existaient déjà. */}
            {fiche.bail_id && (
              <>
                <BoutonGenererDocument
                  orgId={orgId}
                  code="avis_echeance"
                  cibleId={fiche.bail_id}
                  cheminRetour={retour}
                  libelle="Avis d’échéance"
                />
                <BoutonGenererDocument
                  orgId={orgId}
                  code="revision_irl"
                  cibleId={fiche.bail_id}
                  cheminRetour={retour}
                  libelle="Révision IRL"
                />
                <Link
                  href={`/agence/${orgId}/baux/${fiche.bail_id}#edl`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Préparer un état des lieux
                </Link>
              </>
            )}
            <Link
              href={`/agence/${orgId}/incidents?lot=${fiche.lot_id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Signaler un incident
            </Link>
            <button type="button" onClick={() => allerA("historique")} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Voir l’historique
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Briques communes ─────────────────────────────────────────────────── */

function Tuile({
  libelle,
  valeur,
  sous,
  alerte = false,
}: {
  libelle: string;
  valeur: string;
  sous?: string;
  alerte?: boolean;
}) {
  return (
    <div className="bg-muted p-3">
      <p className="eyebrow">{libelle}</p>
      <p className={`montant font-heading text-xl leading-tight font-semibold ${alerte ? "text-destructive" : "text-[var(--encre)]"}`}>
        {valeur}
      </p>
      {sous && <p className="text-[11.5px] text-muted-foreground">{sous}</p>}
    </div>
  );
}

function Carte({
  titre,
  badge,
  ton = "neutre",
  or = false,
  children,
}: {
  titre: string;
  badge?: string;
  ton?: TonStatut;
  or?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 border p-4 ${or ? "border-[var(--or)]/40 bg-[var(--or-clair)]/20" : "border-border"}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-[15px] font-semibold text-[var(--encre)]">{titre}</h4>
        {badge && <BadgeStatut ton={ton}>{badge}</BadgeStatut>}
      </div>
      {children}
    </div>
  );
}

function Personne({
  nom,
  lignes,
  or = false,
}: {
  nom: string;
  lignes: (string | null)[];
  or?: boolean;
}) {
  const initiales = nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="mb-3 flex items-center gap-3">
      <span
        aria-hidden
        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-[var(--sur-encre)] ${
          or ? "bg-[var(--or-texte)]" : "bg-[var(--encre)]"
        }`}
      >
        {initiales || "?"}
      </span>
      <span className="min-w-0">
        <b className="block truncate font-semibold">{nom}</b>
        {lignes.filter(Boolean).map((l) => (
          <span key={l} className="block truncate text-[12.5px] break-words text-muted-foreground">
            {l}
          </span>
        ))}
      </span>
    </div>
  );
}

/** Une ligne de fiche — absente quand elle n'a rien à dire (charte des fiches). */
function Ligne({ libelle, valeur }: { libelle: string; valeur: ReactNode }) {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  return (
    <div className="ligne-info">
      <span className="shrink-0 text-muted-foreground">{libelle}</span>
      <span className="min-w-0 text-right break-words">{valeur}</span>
    </div>
  );
}

/** Le squelette d'un onglet qui va chercher son contenu. */
function EnAttente({ quoi }: { quoi: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner /> {quoi}
    </p>
  );
}

/* ── Onglet « Documents » ─────────────────────────────────────────────── */

function OngletDocuments({ orgId, fiche }: { orgId: string; fiche: FicheLot }) {
  const locataire = fiche.portee === "locataire";
  const [docs, setDocs] = useState<DocumentDuLot[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    chargerDocumentsDuLot(fiche.lot_id).then((r) => {
      if (!vivant) return;
      if (r.erreur) setErreur(r.erreur);
      else setDocs(r.donnees ?? []);
    });
    return () => {
      vivant = false;
    };
  }, [fiche.lot_id]);

  return (
    <div className="space-y-3">
      {erreur && (
        <p className="err mb-0" role="alert">
          {erreur}
        </p>
      )}
      {!docs && !erreur && <EnAttente quoi="Lecture des documents…" />}
      {docs && docs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {locataire
            ? "Aucun document partagé avec vous pour l’instant."
            : "Aucun document sur ce lot, son bail ou son mandat."}
        </p>
      )}
      {docs && docs.length > 0 && (
        <ul className="divide-y divide-border">
          {docs.map((d) => {
            const expire = d.expire_le ? new Date(d.expire_le) < new Date() : false;
            return (
              <li key={d.document_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="min-w-0 flex-1">
                  <Link
                    href={locataire ? `/locataire/${orgId}/documents` : `/agence/${orgId}/documents/${d.document_id}`}
                    className="block truncate text-[13.5px] font-semibold lien-discret"
                  >
                    {d.titre}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {TYPES_DOCUMENT[d.type] ?? d.type} · {d.rattachement} · déposé le{" "}
                    {formaterDate(d.depose_le)}
                  </span>
                </span>
                {d.expire_le && (
                  <BadgeStatut ton={expire ? "retard" : "attente"}>
                    {expire ? "expiré" : "expire"} le {formaterDate(d.expire_le)}
                  </BadgeStatut>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href={locataire ? `/locataire/${orgId}/documents` : `/agence/${orgId}/documents?sel=depot`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        {locataire ? "Déposer mon attestation d’assurance" : "Déposer un document"}
      </Link>
      <p className="text-xs text-muted-foreground">
        Le type d’une pièce pilote ses droits d’accès, ses relances et sa durée de
        conservation.
      </p>
    </div>
  );
}

/* ── Onglet « Comptabilité » (gérant) ─────────────────────────────────── */

function OngletComptabilite({
  orgId,
  fiche,
  rafraichir,
}: {
  orgId: string;
  fiche: FicheLot;
  rafraichir: () => void;
}) {
  const bailId = fiche.bail_id;
  const [donnees, setDonnees] = useState<{
    ecritures: EcritureDuLot[];
    rapport: RapportDuLot | null;
    termes: TermeDuLot[];
  } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tour, setTour] = useState(0);

  useEffect(() => {
    let vivant = true;
    chargerComptabiliteDuLot(fiche.lot_id, bailId).then((r) => {
      if (!vivant) return;
      if (r.erreur) setErreur(r.erreur);
      else setDonnees(r.donnees ?? null);
    });
    return () => {
      vivant = false;
    };
  }, [fiche.lot_id, bailId, tour]);

  const relire = () => {
    setTour((t) => t + 1);
    rafraichir();
  };
  const dus = (donnees?.termes ?? []).filter(
    (t) => Number(t.montant_du) > Number(t.montant_couvert)
  );

  return (
    <div className="space-y-5">
      {erreur && (
        <p className="err mb-0" role="alert">
          {erreur}
        </p>
      )}
      {!donnees && !erreur && <EnAttente quoi="Lecture de la comptabilité…" />}

      {donnees && (
        <>
          {bailId && (
            <div>
              <p className="eyebrow mb-1">Termes de loyer</p>
              {dus.length === 0 ? (
                <p className="text-sm text-success-soft-foreground">
                  Tous les termes appelés sont soldés.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {dus.map((t) => (
                    <LigneTerme key={t.appel_id} orgId={orgId} bailId={bailId} terme={t} relire={relire} />
                  ))}
                </ul>
              )}
            </div>
          )}

          <div>
            <p className="eyebrow mb-1">Journal du lot</p>
            {donnees.ecritures.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune écriture sur ce lot pour l’instant.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {donnees.ecritures.slice(0, 12).map((e) => (
                  <li key={e.ecriture_id} className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm">
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formaterDate(e.date_piece)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {e.libelle || e.categorie}
                      {e.contre_passee && (
                        <span className="ml-2 text-xs text-muted-foreground">annulée</span>
                      )}
                    </span>
                    <span
                      className={`montant shrink-0 tabular-nums ${
                        e.contre_passee
                          ? "text-muted-foreground line-through"
                          : Number(e.montant_signe) < 0
                            ? "text-destructive"
                            : ""
                      }`}
                    >
                      {eur(e.montant_signe)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {donnees.ecritures.length > 12 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Les {donnees.ecritures.length - 12} écritures plus anciennes sont dans la
                fiche complète du lot.
              </p>
            )}
          </div>

          <FormulaireDepense orgId={orgId} lotId={fiche.lot_id} relire={relire} />
          <BlocRapport lotId={fiche.lot_id} rapport={donnees.rapport} />
        </>
      )}
    </div>
  );
}

/**
 * Un terme encore dû, et le geste qui compte : l'encaisser.
 *
 * Le bouton verse le RESTE de ce terme, mais la base l'impute au plus ancien
 * impayé du bail (RM-3.3.2). Le compte rendu vient de l'action, pas d'une
 * promesse de l'écran.
 */
function LigneTerme({
  orgId,
  bailId,
  terme,
  relire,
}: {
  orgId: string;
  bailId: string;
  terme: TermeDuLot;
  relire: () => void;
}) {
  const [etat, action] = useActionState<EtatLoyers, FormData>(async () => {
    const r = await encaisserReste(orgId, bailId, terme.appel_id);
    if (r.succes) {
      afficherToast(r.succes);
      relire();
    }
    return r;
  }, {});
  const reste = Number(terme.montant_du) - Number(terme.montant_couvert);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      <span className="min-w-0 flex-1">
        {moisEnFrancais(String(terme.periode).slice(0, 7))}
        <span className="mono-discret ml-2 normal-case">
          {STATUTS_APPEL_LOYER[terme.statut] ?? terme.statut}
        </span>
      </span>
      <span className="montant shrink-0 tabular-nums">{eur(reste)}</span>
      <form action={action} className="shrink-0">
        <BoutonEnvoi size="sm" enCoursTexte="Encaissement…">
          Encaisser
        </BoutonEnvoi>
      </form>
      {etat.erreur && (
        <p className="w-full text-xs text-destructive" role="alert">
          {etat.erreur}
        </p>
      )}
    </li>
  );
}

/** Saisir une dépense sur ce lot — ce que la page « Loyers & charges » portait. */
function FormulaireDepense({
  orgId,
  lotId,
  relire,
}: {
  orgId: string;
  lotId: string;
  relire: () => void;
}) {
  const [etat, action] = useActionState<EtatCompta, FormData>(async (e, formData) => {
    const r = await ajouterEcriture(orgId, e, formData);
    if (r.succes) {
      afficherToast(r.succes);
      relire();
    }
    return r;
  }, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
      <input type="hidden" name="lot_id" value={lotId} />
      <input type="hidden" name="sens" value="depense" />
      <div className="w-full space-y-1 sm:w-auto">
        <Label htmlFor={`dep-cat-${lotId}`} className="text-xs">
          Dépense sur ce lot
        </Label>
        <Input
          id={`dep-cat-${lotId}`}
          name="categorie"
          placeholder="travaux, charges…"
          defaultValue={etat.valeurs?.categorie}
          className="h-9 w-full sm:w-40"
        />
      </div>
      <div className="w-full space-y-1 sm:w-auto">
        <Label htmlFor={`dep-montant-${lotId}`} className="text-xs">
          Montant (€)
        </Label>
        <Input
          id={`dep-montant-${lotId}`}
          name="montant"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          defaultValue={etat.valeurs?.montant}
          className="h-9 w-full sm:w-28"
        />
      </div>
      <div className="w-full space-y-1 sm:w-auto">
        <Label htmlFor={`dep-libelle-${lotId}`} className="text-xs">
          Libellé (facultatif)
        </Label>
        <Input
          id={`dep-libelle-${lotId}`}
          name="libelle"
          defaultValue={etat.valeurs?.libelle}
          className="h-9 w-full sm:w-40"
        />
      </div>
      <BoutonEnvoi size="sm" variant="outline" enCoursTexte="Enregistrement…">
        Enregistrer
      </BoutonEnvoi>
      {etat.erreur && (
        <p className="w-full text-sm text-destructive" role="alert">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}

/**
 * Envoyer le rapport de gestion au propriétaire, par mail.
 *
 * LE RAPPORT PORTE SUR LE MANDAT. Il couvre tous les lots que le mandant a
 * confiés, pas seulement celui-ci : l'écran le dit AVANT le clic, sinon l'agent
 * croit envoyer le compte d'un lot.
 */
function BlocRapport({ lotId, rapport }: { lotId: string; rapport: RapportDuLot | null }) {
  const [etat, action] = useActionState<EtatEnvoiRapport, FormData>(
    async (e, formData) => {
      const r = await envoyerRapportDuLot(lotId, e, formData);
      if (r.succes) afficherToast(r.succes);
      return r;
    },
    {}
  );
  if (!rapport) {
    return (
      <p className="border-t border-border pt-4 text-sm text-muted-foreground">
        Aucun mandat de gestion en cours : il n’y a pas de propriétaire à qui adresser un
        rapport.
      </p>
    );
  }
  const mois = moisEnFrancais(String(rapport.mois).slice(0, 7));
  return (
    <form action={action} className="space-y-2 border-t border-border pt-4">
      <p className="eyebrow">Rapport de gestion · {mois}</p>
      <p className="text-sm text-muted-foreground">
        Adressé à {rapport.mandant}
        {rapport.mandant_email ? ` (${rapport.mandant_email})` : " — sans adresse e-mail"}.
        {rapport.lots_du_mandat > 1
          ? ` Il couvre les ${rapport.lots_du_mandat} lots de son mandat, pas seulement celui-ci.`
          : ""}
        {rapport.net !== null ? ` Net à reverser : ${eur(rapport.net)}.` : ""}
      </p>
      {rapport.envoye_le ? (
        <p className="text-sm text-success-soft-foreground">
          Déjà envoyé le {formaterDate(rapport.envoye_le)}.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <Label htmlFor={`rap-com-${lotId}`} className="text-xs">
              Mot d’accompagnement (facultatif)
            </Label>
            <Input id={`rap-com-${lotId}`} name="commentaire" className="h-9 w-full" />
          </div>
          <BoutonEnvoi size="sm" disabled={Boolean(etat.succes)} enCoursTexte="Envoi…">
            Envoyer le rapport au propriétaire
          </BoutonEnvoi>
        </>
      )}
      {etat.erreur && (
        <p className="text-sm text-destructive" role="alert">
          {etat.erreur}
        </p>
      )}
      {etat.succes && (
        <p className="text-sm text-success-soft-foreground" role="status">
          {etat.succes}
        </p>
      )}
    </form>
  );
}

/* ── Onglet « Mes loyers » (locataire) ────────────────────────────────── */

function OngletMesLoyers({ orgId }: { orgId: string }) {
  const [termes, setTermes] = useState<TermeLocataire[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    chargerEcheancierLocataire(orgId).then((r) => {
      if (!vivant) return;
      if (r.erreur) setErreur(r.erreur);
      else setTermes(r.donnees ?? []);
    });
    return () => {
      vivant = false;
    };
  }, [orgId]);

  const dus = (termes ?? []).filter((t) => Number(t.montant_du) > Number(t.montant_couvert));
  const derniers = (termes ?? []).slice(-8).reverse();

  return (
    <div className="space-y-3">
      {erreur && (
        <p className="err mb-0" role="alert">
          {erreur}
        </p>
      )}
      {!termes && !erreur && <EnAttente quoi="Lecture de vos loyers…" />}
      {termes && termes.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun terme appelé pour l’instant.</p>
      )}
      {termes && termes.length > 0 && (
        <>
          {dus.length === 0 ? (
            <p className="text-sm text-success-soft-foreground">Vous êtes à jour de vos loyers.</p>
          ) : (
            <p className="text-sm text-warning-soft-foreground">
              {eur(dus.reduce((s, t) => s + (Number(t.montant_du) - Number(t.montant_couvert)), 0))}{" "}
              restent dus sur {dus.length} terme{dus.length > 1 ? "s" : ""}.
            </p>
          )}
          <ul className="divide-y divide-border">
            {derniers.map((t) => {
              const reste = Number(t.montant_du) - Number(t.montant_couvert);
              return (
                <li key={String(t.periode)} className="flex flex-wrap items-center gap-x-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    {moisEnFrancais(String(t.periode).slice(0, 7))}
                  </span>
                  <BadgeStatut ton={reste <= 0 ? "ok" : t.statut === "impaye" ? "retard" : "attente"}>
                    {STATUTS_APPEL_LOYER[t.statut] ?? t.statut}
                  </BadgeStatut>
                  <span className="montant shrink-0 tabular-nums">
                    {reste > 0 ? eur(reste) : eur(t.montant_du)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Link href={`/locataire/${orgId}/loyers`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        Voir tous mes paiements et mes quittances
      </Link>
    </div>
  );
}

/* ── Onglet « Historique » ────────────────────────────────────────────── */

// La couleur de la pastille de la frise dit la nature de l'événement : c'est
// elle qui porte l'information, pas une étiquette « INCIDENT » répétée à
// chaque rang — le titre le dit déjà (constat au navigateur, 12/09).
const COULEURS_NATURE: Record<string, string> = {
  encaissement: "bg-[var(--success)]",
  quittance: "bg-[var(--success)]",
  relance: "bg-[var(--destructive)]",
  incident: "bg-[var(--warning)]",
  appel: "bg-[var(--or)]",
  bail: "bg-[var(--encre)]",
  edl: "bg-[var(--bleu)]",
};

/** Les mots français d'un code métier, pris là où ils vivent déjà. */
function libelleCode(code: string | null): string | null {
  if (!code) return null;
  return CATEGORIES_INCIDENT.find((c) => c.slug === code)?.court ?? code;
}

/**
 * L'historique, ASSEMBLÉ depuis les faits.
 *
 * Il n'existe pas de journal d'événements dans le produit (`audit_log` ne
 * consigne que les consultations d'organisation). En créer un aujourd'hui ne
 * dirait rien du passé : il démarrerait vide sur un lot géré depuis deux ans.
 * La base recompose donc la chronologie à partir de ce qui est déjà enregistré
 * — bail, termes, encaissements, quittances, relances, états des lieux,
 * incidents — et l'historique est complet dès la première ouverture.
 */
function OngletHistorique({ lotId }: { lotId: string }) {
  const [evenements, setEvenements] = useState<EvenementDuLot[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    chargerHistoriqueDuLot(lotId).then((r) => {
      if (!vivant) return;
      if (r.erreur) setErreur(r.erreur);
      else setEvenements(r.donnees ?? []);
    });
    return () => {
      vivant = false;
    };
  }, [lotId]);

  return (
    <div className="space-y-3">
      {erreur && (
        <p className="err mb-0" role="alert">
          {erreur}
        </p>
      )}
      {!evenements && !erreur && <EnAttente quoi="Reconstitution de l’historique…" />}
      {evenements && evenements.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Rien ne s’est encore passé sur ce lot.
        </p>
      )}
      {evenements && evenements.length > 0 && (
        <ol className="border-l border-border pl-4">
          {evenements.map((e, i) => (
            <li key={`${e.survenu_le}-${e.titre}-${i}`} className="relative py-2.5">
              <span
                aria-hidden
                className={`absolute top-4 -left-[21px] size-2 rounded-full ${COULEURS_NATURE[e.nature] ?? "bg-[var(--or)]"}`}
              />
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="mono-discret shrink-0 normal-case">
                  {formaterDate(e.survenu_le)}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {e.titre}
                  {libelleCode(e.code) && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      — {libelleCode(e.code)}
                    </span>
                  )}
                </span>
                {e.montant !== null && (
                  <span className="montant shrink-0 text-sm tabular-nums">
                    {eur(e.montant)}
                  </span>
                )}
              </div>
              {e.detail && (
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">{e.detail}</p>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-muted-foreground">
        Reconstitué depuis les faits enregistrés — bail, termes, encaissements,
        quittances, relances, états des lieux, incidents. Les 40 plus récents.
      </p>
    </div>
  );
}
