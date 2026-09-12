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
  envoyerRapportDuLot,
  type FicheLot,
  type DocumentDuLot,
  type EcritureDuLot,
  type TermeDuLot,
  type TermeLocataire,
  type RapportDuLot,
  type EtatEnvoiRapport,
} from "@/app/actions/fiche-lot";
import { ajouterEcriture, type EtatCompta } from "@/app/actions/compta";
import { encaisserReste } from "@/app/actions/quittancement";
import type { EtatLoyers } from "@/app/actions/loyers";
import { Modale } from "@/components/ui/modale";
import { BadgeStatut } from "@/components/badge-statut";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { buttonVariants } from "@/components/ui/button";
import { ETATS_LOT, COULEURS_ETAT_LOT, TYPES_BIEN, formaterSurface } from "@/lib/parc";
import { TYPES_BAIL, ETATS_BAIL, STATUTS_APPEL_LOYER } from "@/lib/baux";
import { TYPES_DOCUMENT, eur, formaterDate, moisEnFrancais } from "@/lib/ged";

// LA FENÊTRE DU LOT (demande de l'humain, 12/09).
//
// « Lorsqu'il clique sur le lot, ça ouvre une fenêtre sur la page pour donner
// directement toutes les infos du lot. » Elle remplace, pour l'agent, deux
// pages entières : « Documents » et « Loyers & charges ». C'est un
// renversement, pas un raccourci — l'agent ne se demande jamais « quels
// documents avons-nous ? », il se demande « qu'est-ce que j'ai sur CE lot ? ».
//
// LA MÊME POUR TOUS CEUX QUI ONT ACCÈS AU LOT (précision du 12/09). Un lot est
// un objet commun : le gérant, le propriétaire direct et le locataire le
// regardent tous. Ils ouvrent donc la MÊME fenêtre — un seul composant, un
// seul appel. Ce qui change n'est pas la forme mais la PORTÉE, et la portée
// vient de la base (`fiche_lot.portee`), jamais d'un test de rôle ici : un
// masquage côté écran se contourne avec la console du navigateur, une colonne
// que la base n'a pas rendue ne se contourne pas.
//
// CE QUI CHARGE, ET QUAND. La fiche part à l'ouverture, seule. Les deux volets
// ne vont chercher leur contenu qu'au déroulé, et une fois pour la durée de la
// fenêtre. Sur un portefeuille de trois cents lots, tout ramener d'un coup se
// paierait trois cents fois par jour.
//
// CE QUI NE DEVAIT PAS SE PERDRE. En retirant « Loyers & charges » à l'agent,
// on lui retirait aussi le seul endroit d'où il encaisse un loyer et saisit une
// dépense — ses deux gestes quotidiens. Ils sont ici, dans le volet
// comptabilité, au contact du lot qui les porte.

// Le nom voyage AVEC l'identifiant. La liste connaît déjà le nom du lot ; la
// fenêtre, elle, doit aller le chercher. Sans lui, elle s'ouvre sur
// « Chargement… » puis se renomme — une demi-seconde pendant laquelle on ne
// sait pas si on a cliqué sur le bon lot. Constat au navigateur, 12/09.
type Ouvrir = (lotId: string, libelle?: string) => void;
const ContexteFenetre = createContext<Ouvrir | null>(null);

/**
 * Le bouton qui ouvre la fenêtre. Il enveloppe le rang rendu côté serveur :
 * la liste reste un composant serveur, seule la poignée est cliente.
 *
 * Hors fournisseur (aucune fenêtre montée sur l'écran), il se comporte comme
 * un lien vers la fiche complète : mieux vaut une page qu'un bouton mort.
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
  // Sans fournisseur, ou sans lot à ouvrir (une lecture d'identifiant qui a
  // échoué), on retombe sur le lien : mieux vaut une page qu'une fenêtre vide.
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

/**
 * Le fournisseur : il tient le lot ouvert et monte la fenêtre au-dessus.
 *
 * `lotInitial` honore les liens profonds (`?sel=lot:…`) que d'autres écrans
 * posent déjà — un « à renseigner » d'un document généré, par exemple.
 */
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
  }, [lotId]);

  // OÙ MÈNE LE PIED DE LA FENÊTRE. Il pointait la fiche du lot dans l'espace
  // AGENCE — une page qu'un locataire ne peut pas ouvrir : le lien lui rendait
  // une porte close. Chacun repart donc chez lui (constat au navigateur, 12/09).
  const locataire = fiche?.portee === "locataire";
  const ficheComplete = !fiche
    ? null
    : locataire
      ? `/locataire/${orgId}/bail`
      : `/agence/${orgId}/parc/${fiche.bien_id}/lots/${fiche.lot_id}`;

  // La suite attendue, quand il n'y en a qu'une. Le panneau que cette fenêtre
  // remplace la portait déjà : un lot complet et disponible appelle un bail, un
  // brouillon appelle qu'on le reprenne. La perdre au passage aurait rallongé
  // le chemin au lieu de le raccourcir. L'ancre #baux déplie la section
  // d'elle-même sur la fiche complète.
  const brouillonDeBail =
    !locataire && fiche?.bail_etat === "brouillon" ? fiche.bail_id : null;
  const pretPourBail =
    Boolean(fiche) &&
    !locataire &&
    fiche?.lot_etat === "disponible" &&
    (fiche?.blocages ?? []).length === 0 &&
    !fiche?.bail_id;

  return (
    <Modale
      large
      surtitre={fiche ? `${fiche.bien_nom} · ${fiche.ville}` : "Lot"}
      titre={fiche?.lot_nom ?? libelle ?? "Chargement…"}
      fermer={fermer}
      pied={
        ficheComplete && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href={ficheComplete}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {locataire ? "Voir mon bail en entier" : "Ouvrir la fiche complète du lot"}
            </Link>
            {pretPourBail && (
              <Link href={`${ficheComplete}#baux`} className="btn-or">
                Créer le bail
              </Link>
            )}
            {brouillonDeBail && (
              <Link href={`/agence/${orgId}/baux/${brouillonDeBail}`} className="btn-or">
                Reprendre le bail en préparation
              </Link>
            )}
          </div>
        )
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
      {fiche && <CorpsFenetre orgId={orgId} fiche={fiche} />}
    </Modale>
  );
}

/**
 * Où mènent les liens de la fenêtre. Le gérant est dans `/agence/…`, le
 * locataire dans `/locataire/…` : le même bloc d'information doit pointer vers
 * l'écran du bon espace, sinon il mène à une porte fermée.
 */
function cheminsDe(portee: string, orgId: string) {
  const locataire = portee === "locataire";
  return {
    locataire,
    bail: (bailId: string) =>
      locataire ? `/locataire/${orgId}/bail` : `/agence/${orgId}/baux/${bailId}`,
    document: (docId: string) =>
      locataire ? `/locataire/${orgId}/documents` : `/agence/${orgId}/documents/${docId}`,
    documents: locataire
      ? `/locataire/${orgId}/documents`
      : `/agence/${orgId}/documents?sel=depot`,
    loyers: locataire ? `/locataire/${orgId}/loyers` : `/agence/${orgId}/comptabilite`,
  };
}

function CorpsFenetre({ orgId, fiche }: { orgId: string; fiche: FicheLot }) {
  const chemins = cheminsDe(fiche.portee, orgId);
  const caracteristiques = [
    fiche.surface_m2 !== null ? formaterSurface(fiche.surface_m2) : null,
    fiche.pieces !== null ? `${fiche.pieces} pièce${fiche.pieces > 1 ? "s" : ""}` : null,
    fiche.etage ? `étage ${fiche.etage}` : null,
    fiche.meuble ? "meublé" : null,
  ].filter(Boolean);

  // Ce qui appelle un geste, dit une fois, en haut — l'ordre est celui de
  // l'urgence, pas celui de la base : l'argent, puis les incidents, puis ce
  // qui bloque une remise en location.
  //
  // ET IL PARLE LA LANGUE DE CELUI QUI LE LIT. « 400 € impayés » est un constat
  // de gestionnaire ; au locataire, c'est SA dette qu'on annonce, et « 12
  // incidents encore ouverts » (vocabulaire d'agence) sont SES signalements.
  const attentions: string[] = [];
  if (Number(fiche.impaye_echu) > 0) {
    const termes = `${fiche.termes_impayes} terme${fiche.termes_impayes > 1 ? "s" : ""} échu${fiche.termes_impayes > 1 ? "s" : ""}`;
    attentions.push(
      chemins.locataire
        ? `Il vous reste ${eur(fiche.impaye_echu)} à régler sur ${termes}.`
        : `${eur(fiche.impaye_echu)} impayés sur ${termes}.`
    );
  }
  if (fiche.incidents_ouverts > 0) {
    const n = fiche.incidents_ouverts;
    attentions.push(
      chemins.locataire
        ? `${n} signalement${n > 1 ? "s" : ""} en cours de traitement.`
        : `${n} incident${n > 1 ? "s" : ""} encore ouvert${n > 1 ? "s" : ""}.`
    );
  }
  for (const b of fiche.blocages ?? []) attentions.push(b);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className={COULEURS_ETAT_LOT[fiche.lot_etat] ?? "puce puce-grise"}>
          {ETATS_LOT[fiche.lot_etat] ?? fiche.lot_etat}
        </span>
        <span className="min-w-0 text-sm text-muted-foreground">
          {TYPES_BIEN[fiche.bien_type] ?? fiche.bien_type} · {fiche.adresse},{" "}
          {fiche.code_postal} {fiche.ville}
          {fiche.copropriete ? " · en copropriété" : ""}
        </span>
      </div>
      {caracteristiques.length > 0 && (
        <p className="-mt-2 text-sm text-muted-foreground">{caracteristiques.join(" · ")}</p>
      )}

      {attentions.length > 0 && (
        <section
          aria-label="Ce qui attend un geste"
          className="border-l-[3px] border-l-warning bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground"
        >
          <ul className="space-y-1">
            {attentions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <Bloc titre={chemins.locataire ? "Mon bail" : "Locataire"}>
          {fiche.bail_id ? (
            <>
              {!chemins.locataire && <Ligne libelle="Occupant" valeur={fiche.locataire} />}
              <Ligne
                libelle="Bail"
                valeur={
                  <Link href={chemins.bail(fiche.bail_id)} className="lien-discret">
                    {TYPES_BAIL[fiche.bail_type ?? ""] ?? fiche.bail_type}
                    {fiche.bail_etat && fiche.bail_etat !== "actif"
                      ? ` · ${ETATS_BAIL[fiche.bail_etat] ?? fiche.bail_etat}`
                      : ""}{" "}
                    ›
                  </Link>
                }
              />
              <Ligne
                libelle="Loyer + charges"
                valeur={eur(Number(fiche.loyer_hc ?? 0) + Number(fiche.charges ?? 0))}
              />
              <Ligne
                libelle="Échéance"
                valeur={fiche.jour_echeance ? `le ${fiche.jour_echeance} du mois` : null}
              />
              <Ligne
                libelle="Depuis le"
                valeur={fiche.date_debut ? formaterDate(fiche.date_debut) : null}
              />
              <Ligne
                libelle="Dépôt de garantie"
                valeur={fiche.depot_garantie ? eur(fiche.depot_garantie) : null}
              />
              {/* Joindre quelqu'un est le geste le plus fréquent d'un agent :
                  l'adresse et le numéro sont cliquables, pas à recopier. */}
              <Ligne
                libelle="E-mail"
                valeur={
                  fiche.locataire_email ? (
                    <a href={`mailto:${fiche.locataire_email}`} className="lien-discret">
                      {fiche.locataire_email}
                    </a>
                  ) : null
                }
              />
              <Ligne
                libelle="Téléphone"
                valeur={
                  fiche.locataire_telephone ? (
                    <a href={`tel:${fiche.locataire_telephone}`} className="lien-discret">
                      {fiche.locataire_telephone}
                    </a>
                  ) : null
                }
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Lot libre — aucun bail en cours ni en préparation.
            </p>
          )}
        </Bloc>

        {/* Le propriétaire, ses honoraires et son mandat sont les affaires du
            gérant. La base ne les rend pas au locataire : le bloc n'a donc
            rien à afficher pour lui, et disparaît plutôt que de montrer une
            colonne de tirets. */}
        {chemins.locataire ? (
          <Bloc titre="Mon logement">
            <Ligne libelle="Immeuble" valeur={fiche.bien_nom} />
            <Ligne
              libelle="Signalements"
              valeur={
                fiche.incidents_ouverts > 0 ? (
                  <Link href={`/locataire/${orgId}/demandes`} className="lien-discret">
                    {fiche.incidents_ouverts} en cours ›
                  </Link>
                ) : null
              }
            />
            <p className="mt-2 text-sm text-muted-foreground">
              Une question, une panne ? Votre gestionnaire répond depuis{" "}
              <Link href={`/locataire/${orgId}/contact`} className="lien-discret">
                Mon gestionnaire
              </Link>
              .
            </p>
          </Bloc>
        ) : (
        <Bloc titre="Propriétaire">
          <Ligne libelle="Détention" valeur={fiche.proprietaires} />
          {fiche.mandat_id ? (
            <>
              <Ligne libelle="Mandant" valeur={fiche.mandant} />
              <Ligne
                libelle="Honoraires"
                valeur={
                  fiche.taux_honoraires !== null ? `${Number(fiche.taux_honoraires)} %` : null
                }
              />
              <Ligne
                libelle="Rapport"
                valeur={fiche.jour_rapport ? `le ${fiche.jour_rapport} du mois` : null}
              />
              <Ligne
                libelle="E-mail"
                valeur={
                  fiche.mandant_email ? (
                    <a href={`mailto:${fiche.mandant_email}`} className="lien-discret">
                      {fiche.mandant_email}
                    </a>
                  ) : null
                }
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucun mandat de gestion en cours sur ce lot : pas de rapport à rendre.
            </p>
          )}
        </Bloc>
        )}
      </div>

      <VoletDocuments lotId={fiche.lot_id} chemins={chemins} />
      {chemins.locataire ? (
        <VoletMesLoyers orgId={orgId} chemins={chemins} />
      ) : (
        <VoletComptabilite orgId={orgId} fiche={fiche} />
      )}
    </>
  );
}

function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow mb-1">{titre}</p>
      {children}
    </div>
  );
}

/** Une ligne de fiche — absente quand elle n'a rien à dire (charte des fiches). */
function Ligne({ libelle, valeur }: { libelle: string; valeur: ReactNode }) {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  return (
    <div className="ligne-info">
      <span className="shrink-0 text-muted-foreground">{libelle}</span>
      {/* `break-words` : une adresse e-mail est un seul mot de quarante
          caractères. Sans lui, elle sortait de la fenêtre à 390 px — constat au
          navigateur, 12/09 — et c'est l'adresse qu'on vient chercher. */}
      <span className="min-w-0 text-right break-words">{valeur}</span>
    </div>
  );
}

/**
 * Le volet qui se déroule. Il ne charge qu'au premier déroulé, et garde son
 * contenu ensuite : replier puis rouvrir ne doit pas refaire l'aller-retour.
 */
function Volet({
  titre,
  resume,
  ouvert,
  basculer,
  children,
}: {
  titre: string;
  resume?: string;
  ouvert: boolean;
  basculer: () => void;
  children: ReactNode;
}) {
  const id = `volet-${titre.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section className="border border-border">
      <button
        type="button"
        onClick={basculer}
        aria-expanded={ouvert}
        aria-controls={id}
        className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <span className="flex-1 text-sm font-medium">{titre}</span>
        {resume && <span className="mono-discret shrink-0">{resume}</span>}
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${ouvert ? "rotate-90" : ""}`}
        >
          <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      {ouvert && (
        <div id={id} className="space-y-3 border-t border-border p-3.5">
          {children}
        </div>
      )}
    </section>
  );
}

function VoletDocuments({
  lotId,
  chemins,
}: {
  lotId: string;
  chemins: ReturnType<typeof cheminsDe>;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [docs, setDocs] = useState<DocumentDuLot[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!ouvert || docs || erreur) return;
    let vivant = true;
    chargerDocumentsDuLot(lotId).then((r) => {
      if (!vivant) return;
      if (r.erreur) setErreur(r.erreur);
      else setDocs(r.donnees ?? []);
    });
    return () => {
      vivant = false;
    };
  }, [ouvert, docs, erreur, lotId]);

  return (
    <Volet
      titre="Documents"
      resume={docs ? `${docs.length}` : undefined}
      ouvert={ouvert}
      basculer={() => setOuvert((o) => !o)}
    >
      {erreur && (
        <p className="err mb-0" role="alert">
          {erreur}
        </p>
      )}
      {!docs && !erreur && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Lecture des documents…
        </p>
      )}
      {docs && docs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {chemins.locataire
            ? "Aucun document partagé avec vous pour l’instant."
            : "Aucun document sur ce lot, son bail ou son mandat."}
        </p>
      )}
      {docs && docs.length > 0 && (
        <ul className="divide-y divide-border">
          {docs.map((d) => (
            <li key={d.document_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
              <Link
                href={chemins.document(d.document_id)}
                className="min-w-0 flex-1 truncate text-sm lien-discret"
              >
                {d.titre}
              </Link>
              <span className="mono-discret shrink-0 normal-case">
                {TYPES_DOCUMENT[d.type] ?? d.type} · {d.rattachement}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formaterDate(d.depose_le)}
              </span>
              {d.expire_le && (
                <BadgeStatut
                  ton={new Date(d.expire_le) < new Date() ? "retard" : "attente"}
                >
                  {new Date(d.expire_le) < new Date() ? "expiré" : "expire"} le{" "}
                  {formaterDate(d.expire_le)}
                </BadgeStatut>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* Le seul détour qui reste : le dépôt passe par le formulaire commun,
          qui sait recevoir un fichier et le rattacher. L'agent n'y va plus
          pour CHERCHER — seulement pour DÉPOSER, et il en revient aussitôt. */}
      <Link
        href={chemins.documents}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        {chemins.locataire ? "Déposer mon attestation d’assurance" : "Déposer un document"}
      </Link>
    </Volet>
  );
}

/**
 * « Mes loyers » — le volet du locataire, à la place de la comptabilité.
 *
 * POURQUOI CE N'EST PAS LE MÊME VOLET. La comptabilité d'un lot est celle de
 * l'agence : honoraires prélevés, travaux avancés, reversements au
 * propriétaire. Elle ne regarde pas l'occupant, et la base ne la lui rend pas.
 * Ce qu'il veut savoir tient en une question — « suis-je à jour ? » — à
 * laquelle son échéancier répond, terme par terme.
 */
function VoletMesLoyers({
  orgId,
  chemins,
}: {
  orgId: string;
  chemins: ReturnType<typeof cheminsDe>;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [termes, setTermes] = useState<TermeLocataire[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!ouvert || termes || erreur) return;
    let vivant = true;
    chargerEcheancierLocataire(orgId).then((r) => {
      if (!vivant) return;
      if (r.erreur) setErreur(r.erreur);
      else setTermes(r.donnees ?? []);
    });
    return () => {
      vivant = false;
    };
  }, [ouvert, termes, erreur, orgId]);

  const dus = (termes ?? []).filter((t) => Number(t.montant_du) > Number(t.montant_couvert));
  const derniers = (termes ?? []).slice(-6).reverse();

  return (
    <Volet
      titre="Mes loyers"
      resume={termes && dus.length === 0 ? "à jour" : undefined}
      ouvert={ouvert}
      basculer={() => setOuvert((o) => !o)}
    >
      {erreur && (
        <p className="err mb-0" role="alert">
          {erreur}
        </p>
      )}
      {!termes && !erreur && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Lecture de vos loyers…
        </p>
      )}
      {termes && termes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucun terme appelé pour l’instant.
        </p>
      )}
      {termes && termes.length > 0 && (
        <>
          {dus.length === 0 ? (
            <p className="text-sm text-success-soft-foreground">
              Vous êtes à jour de vos loyers.
            </p>
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
                <li
                  key={String(t.periode)}
                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-sm"
                >
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
      <Link
        href={chemins.loyers}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Voir tous mes paiements et mes quittances
      </Link>
    </Volet>
  );
}

function VoletComptabilite({ orgId, fiche }: { orgId: string; fiche: FicheLot }) {
  const bailId = fiche.bail_id;
  const [ouvert, setOuvert] = useState(false);
  const [donnees, setDonnees] = useState<{
    ecritures: EcritureDuLot[];
    rapport: RapportDuLot | null;
    termes: TermeDuLot[];
  } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!ouvert || donnees || erreur) return;
    let vivant = true;
    chargerComptabiliteDuLot(fiche.lot_id, bailId).then((r) => {
      if (!vivant) return;
      if (r.erreur) setErreur(r.erreur);
      else setDonnees(r.donnees ?? null);
    });
    return () => {
      vivant = false;
    };
  }, [ouvert, donnees, erreur, fiche.lot_id, bailId]);

  // Les termes qui appellent encore de l'argent, du plus ancien au plus
  // récent : un terme soldé n'a pas de geste, il n'a pas à occuper une ligne.
  const dus = (donnees?.termes ?? []).filter(
    (t) => Number(t.montant_du) > Number(t.montant_couvert)
  );

  return (
    <Volet
      titre="Comptabilité"
      resume={
        Number(fiche.impaye_echu) > 0 ? `${eur(fiche.impaye_echu)} dus` : undefined
      }
      ouvert={ouvert}
      basculer={() => setOuvert((o) => !o)}
    >
      {erreur && (
        <p className="err mb-0" role="alert">
          {erreur}
        </p>
      )}
      {!donnees && !erreur && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Lecture de la comptabilité…
        </p>
      )}

      {donnees && (
        <>
          {bailId && (
            <div>
              <p className="eyebrow mb-1">Loyers</p>
              {dus.length === 0 ? (
                <p className="text-sm text-success-soft-foreground">
                  Tous les termes appelés sont soldés.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {dus.map((t) => (
                    <LigneTerme key={t.appel_id} orgId={orgId} bailId={bailId} terme={t} />
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
                  <li
                    key={e.ecriture_id}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-sm"
                  >
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

          <FormulaireDepense orgId={orgId} lotId={fiche.lot_id} />
          <BlocRapport lotId={fiche.lot_id} rapport={donnees.rapport} />
        </>
      )}
    </Volet>
  );
}

/**
 * Un terme encore dû, et le seul geste qui compte : l'encaisser.
 *
 * Le bouton verse le RESTE de ce terme, mais la base l'impute au plus ancien
 * impayé du bail (RM-3.3.2). Le compte rendu vient de l'action, pas d'une
 * promesse de l'écran.
 */
function LigneTerme({
  orgId,
  bailId,
  terme,
}: {
  orgId: string;
  bailId: string;
  terme: TermeDuLot;
}) {
  const [etat, action] = useActionState<EtatLoyers, FormData>(
    async () => encaisserReste(orgId, bailId, terme.appel_id),
    {}
  );
  const reste = Number(terme.montant_du) - Number(terme.montant_couvert);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
      <span className="min-w-0 flex-1">
        {moisEnFrancais(String(terme.periode).slice(0, 7))}
        <span className="mono-discret ml-2 normal-case">
          {STATUTS_APPEL_LOYER[terme.statut] ?? terme.statut}
        </span>
      </span>
      <span className="montant shrink-0 tabular-nums">{eur(reste)}</span>
      <form action={action} className="shrink-0">
        <BoutonEnvoi size="sm" variant="outline" enCoursTexte="Encaissement…">
          Encaisser
        </BoutonEnvoi>
      </form>
      {(etat.erreur || etat.succes) && (
        <p
          className={`w-full text-xs ${etat.erreur ? "text-destructive" : "text-success-soft-foreground"}`}
          role={etat.erreur ? "alert" : "status"}
        >
          {etat.erreur ?? etat.succes}
        </p>
      )}
    </li>
  );
}

/** Saisir une dépense sur ce lot — ce que la page « Loyers & charges » portait. */
function FormulaireDepense({ orgId, lotId }: { orgId: string; lotId: string }) {
  const [etat, action] = useActionState<EtatCompta, FormData>(
    ajouterEcriture.bind(null, orgId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
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
      {etat.erreur && <p className="w-full text-sm text-destructive" role="alert">{etat.erreur}</p>}
      {etat.succes && (
        <p className="w-full text-sm text-success-soft-foreground" role="status">
          {etat.succes} Rouvrez le volet pour la voir au journal.
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
function BlocRapport({
  lotId,
  rapport,
}: {
  lotId: string;
  rapport: RapportDuLot | null;
}) {
  const [etat, action] = useActionState<EtatEnvoiRapport, FormData>(
    envoyerRapportDuLot.bind(null, lotId),
    {}
  );
  if (!rapport) {
    return (
      <p className="border-t border-border pt-3 text-sm text-muted-foreground">
        Aucun mandat de gestion en cours : il n’y a pas de propriétaire à qui adresser un
        rapport.
      </p>
    );
  }
  const mois = moisEnFrancais(String(rapport.mois).slice(0, 7));
  const deja = Boolean(rapport.envoye_le) || Boolean(etat.succes);
  return (
    <form action={action} className="space-y-2 border-t border-border pt-3">
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
          <BoutonEnvoi size="sm" disabled={deja} enCoursTexte="Envoi…">
            Envoyer le rapport au propriétaire
          </BoutonEnvoi>
        </>
      )}
      {etat.erreur && <p className="text-sm text-destructive" role="alert">{etat.erreur}</p>}
      {etat.succes && (
        <p className="text-sm text-success-soft-foreground" role="status">
          {etat.succes}
        </p>
      )}
    </form>
  );
}
