"use client";

import Link from "next/link";
import { DELAI_COPIE_LOCALE_MS, RepriseLocale, StatutCopieLocale, useCopieFichiers } from "@/components/reprise-locale";
import { cleCopieFichiers, type CopieFichiers } from "@/lib/brouillon-fichiers";
import { declarationDuBrouillon, validerBrouillonIncident, type BrouillonIncident } from "@/lib/brouillons-personne-incident";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { declarerMonIncident, type EtatIncidentAction } from "@/app/actions/incidents";
import { compresserChampFichiers } from "@/lib/compresser-image";
import { categorieIncident, CATEGORIES_INCIDENT, PIECES_INCIDENT } from "@/lib/incidents";
import {
  brancherConservationDesPhotos,
  fichiersDuChamp,
} from "@/lib/photos-declaration";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { ChampFichier } from "@/components/champ-fichier";
import { Input } from "@/components/ui/input";
import { LegendeChamps } from "@/components/titre-ecran";
import { Label } from "@/components/ui/label";

const classeSelect =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

// Encart adaptatif « Qui paiera la réparation » (maquette pLocDeclarer +
// apercuImput) : le REPÈRE juridique de la catégorie choisie — une
// information, jamais une décision. Le gérant tranche à la qualification
// (RM-7.2.1) et la mention finale le rappelle.
//
// `plat` (24/09) : sur téléphone, l'encart s'insère DANS la carte du
// formulaire. Une carte dans la carte (filet, ombre, double marge) repoussait
// le champ suivant de 160 px ; il devient un panneau à fond ardoise, et il ne
// paraît qu'une fois la catégorie choisie — avant, une ligne d'aide sous le
// sélecteur suffit.
function EncartQuiPaiera({ slug, plat = false }: { slug: string; plat?: boolean }) {
  const categorie = categorieIncident(slug);

  if (!categorie) {
    if (plat) return null;
    return (
      <div className="loc-carte">
        <h3 className="text-base font-medium">Qui paiera la réparation</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Choisissez une catégorie : nous vous indiquons immédiatement si la
          réparation est plutôt à votre charge ou à celle du propriétaire, et
          sur quel fondement. Aucune surprise à la sortie.
        </p>
      </div>
    );
  }

  const repere = categorie.repere;
  const chargeLocataire = repere?.charge === "locataire";
  // Même liseré de 4 px et mêmes jetons que les autres cartes de la zone
  const bordure = repere
    ? chargeLocataire
      ? "border-l-4 border-l-[var(--warning)]"
      : "border-l-4 border-l-[var(--success)]"
    : "";

  return (
    <div
      className={`${plat ? "rounded-[10px] bg-[var(--ardoise)] p-3.5" : "loc-carte"} ${bordure}`}
    >
      <h3 className={plat ? "text-sm font-medium" : "text-base font-medium"}>
        Qui paiera la réparation
      </h3>
      <div className={`${plat ? "mt-2" : "mt-2.5"} space-y-2.5 text-sm`}>
        {repere ? (
          <>
            <p>
              <span className={chargeLocataire ? "loc-tag ambre" : "loc-tag vert"}>
                {chargeLocataire
                  ? "Plutôt à votre charge"
                  : "Plutôt à la charge du propriétaire"}
              </span>
            </p>
            <p className="text-muted-foreground">{repere.fondement}</p>
            {chargeLocataire ? (
              <p className="text-muted-foreground">
                Le propriétaire peut refuser de prendre en charge financièrement
                l&apos;incident. Votre gestionnaire peut missionner un artisan pour
                vous ; l&apos;intervention vous est alors refacturée après votre
                accord sur le devis.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Vous n&apos;avancez rien : votre gestionnaire missionne
                l&apos;artisan après examen de votre demande.
              </p>
            )}
          </>
        ) : (
          <>
            <p>
              {/* .loc-tag.bleu a le fond ardoise : sur le panneau plat, la
                  pastille se fondrait dans le fond — on la remet sur blanc. */}
              <span className={`loc-tag bleu${plat ? " !bg-[var(--carte)]" : ""}`}>
                À examiner par votre gestionnaire
              </span>
            </p>
            <p className="text-muted-foreground">
              La cause ne se déduit pas de la catégorie : votre gestionnaire tranche
              et vous êtes informé immédiatement.
            </p>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Repère indicatif — la décision finale revient à votre gestionnaire.
        </p>
      </div>
    </div>
  );
}

// La photo est le PREMIER champ, avant la description (RM-19.2.2). La
// catégorie est pilotée : elle alimente l'encart « Qui paiera la réparation »
// (retour de recette 24/08, alignement maquette pLocDeclarer).
export function FormulaireIncidentLocataire({ orgId, compteId }: { orgId: string; compteId: string }) {
  const cle = cleCopieFichiers("incident", compteId, orgId);
  return <RepriseLocale cle={cle} valider={validerBrouillonIncident}>{copie => <SaisieIncident orgId={orgId} cleLocale={cle} copie={copie} />}</RepriseLocale>;
}
function SaisieIncident({ orgId, cleLocale, copie }: { orgId: string; cleLocale: string; copie: CopieFichiers<BrouillonIncident> | null }) {
  const { enregistrer, statut } = useCopieFichiers(cleLocale, copie);
  const [saisie, setSaisie] = useState<BrouillonIncident>(() => copie?.donnees ?? {
    commande: crypto.randomUUID(), categorie: "", piece: "", photos: [], description: "", anciennete: "", urgence: "normale", envoye: false, bilan: {},
  });
  const derniereDeclaration = useRef<BrouillonIncident | null>(copie?.donnees.envoye ? copie.donnees : null);
  const [compression, setCompression] = useState(false);
  const [etat, action, enCours] = useActionState<EtatIncidentAction, FormData>(async precedent => {
    const contenu = derniereDeclaration.current?.envoye ? derniereDeclaration.current : { ...saisie, envoye: true };
    derniereDeclaration.current = contenu;
    setSaisie(contenu);
    await enregistrer(contenu);
    try {
      const resultat = await declarerMonIncident(orgId, precedent, declarationDuBrouillon(contenu));
      const suivant = { ...contenu, envoye: Boolean(resultat.succes), bilan: resultat };
      derniereDeclaration.current = suivant;
      setSaisie(suivant);
      await enregistrer(resultat.succes && !resultat.avertissement ? null : suivant);
      return resultat;
    } catch {
      // Après réponse perdue, conserver la clé ET le contenu exact, même après
      // fermeture de l'onglet. Une modification serait une autre demande.
      const bilan = { ...precedent, erreur: "La réponse n’est pas arrivée. Réessayez : votre signalement ne sera pas créé une deuxième fois." };
      const suivant = { ...contenu, bilan };
      setSaisie(suivant); derniereDeclaration.current = suivant;
      await enregistrer(suivant);
      return bilan;
    }
  }, copie?.donnees.bilan ?? {});
  // Audit du 13/10 (PR178-A-04) : la copie est écrite une fois la frappe terminée, pas à chaque touche (les photos jointes
  // étaient réécrites en entier à chaque caractère) ; les envois écrivent, eux, tout de suite.
  useEffect(() => {
    if (enCours || !(saisie.categorie || saisie.description || saisie.photos.length) || (etat.succes && !etat.avertissement)) return;
    const minuterie = setTimeout(() => { void enregistrer(saisie); }, DELAI_COPIE_LOCALE_MS);
    return () => clearTimeout(minuterie);
  }, [saisie, enCours, etat.succes, etat.avertissement, enregistrer]);
  const { categorie, piece, photos } = saisie;
  const setCategorie = (categorie: string) => setSaisie(s => ({ ...s, categorie }));
  const setPiece = (piece: string) => setSaisie(s => ({ ...s, piece }));
  const setPhotos = (photos: File[]) => setSaisie(s => ({ ...s, photos }));
  const champPhotos = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Les photos survivent au refus (RM-19.2.2 : elles sont souvent la seule
  // saisie du locataire). Le mécanisme — et pourquoi il passe par l'événement
  // « reset » du formulaire — est dans lib/photos-declaration.ts, où il est
  // aussi mis à l'épreuve par les tests.
  useEffect(() => {
    const champ = champPhotos.current;
    if (!champ) return;
    return brancherConservationDesPhotos(champ, photos);
  }, [photos]);

  // Succès : le message reste lisible ~2,5 s puis on rejoint « Mes demandes ».
  // Sauf si le serveur a posé un `avertissement` — la photo, la saisie que
  // RM-19.2.2 tient pour essentielle, n'est pas partie. Relevé du 11/09 : la
  // minuterie emportait cette mauvaise nouvelle avant qu'elle soit lue. Le
  // jumeau agence refuse de rediriger pour la même raison (ouvrirIncident,
  // app/actions/incidents.ts) ; ici c'est au composant client de désarmer.
  useEffect(() => {
    if (!etat.succes || etat.avertissement) return;
    const minuterie = setTimeout(() => {
      router.push(`/locataire/${orgId}/demandes`);
    }, 2500);
    return () => clearTimeout(minuterie);
  }, [etat.succes, etat.avertissement, orgId, router]);

  if (etat.succes) {
    return (
      <div className="loc-carte space-y-3">
        <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
        {etat.avertissement && (
          <p className="text-sm text-warning-soft-foreground" role="alert">
            {etat.avertissement}
          </p>
        )}
        {etat.avertissement && <form data-saisie-libre action={action}>
          <BoutonEnvoi enCoursTexte="Reprise des photos…" className="w-full">Réessayer les photos</BoutonEnvoi>
          <p className="mt-2 text-xs text-muted-foreground">Le signalement reste le même. Les photos déjà jointes sont conservées.</p>
          {etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}
        </form>}
        <p className="text-sm text-muted-foreground">

          {etat.avertissement ? (
            <>Votre signalement, lui, est bien enregistré. </>
          ) : (
            <>Vous allez être redirigé vers vos demandes… </>
          )}
          <Link
            href={`/locataire/${orgId}/demandes`}
            className="lien-discret"
          >
            {etat.avertissement ? "Voir mes demandes" : "Voir mes demandes maintenant"}
          </Link>
        </p>
      </div>
    );
  }

  return (
    // .loc-grille plutôt que .deux-col (24/09) : la colonne latérale fait
    // 300 px comme sur l'accueil et Mon gestionnaire, au lieu de ≈ 400 px.
    // Même seuil d'empilement (860 px) : les bascules min-[861px] /
    // max-[860px] ci-dessous restent justes.
    <div className="loc-grille">
      <div className="loc-carte">
        <StatutCopieLocale statut={statut} />
        <h3 className="text-base font-medium">Votre signalement</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Une ou deux photos prises sur le vif évitent souvent un déplacement
          pour rien.
        </p>
        <form data-protection-saisie="locale"
          action={action}
          // React remet le formulaire à zéro même après un refus. Le reset
          // natif désynchronise les selects contrôlés et le résumé de photo.
          // La confirmation remplace déjà tout ce formulaire en cas de succès :
          // tant qu'il reste affiché, conserver la saisie et les fichiers.
          onReset={(event) => event.preventDefault()}
          className="formulaire-reperes mt-4 space-y-4"
        >
          {saisie.envoye && <p role="status" className="rounded-lg bg-warning-soft p-3 text-sm">La réponse de votre dernier envoi reste à confirmer. Réessayez avec la même saisie pour retrouver le signalement sans doublon.</p>}
          <fieldset disabled={enCours || saisie.envoye} className="min-w-0 space-y-4">
          <LegendeChamps />
          <div className="space-y-1.5">
            <Label htmlFor="photos">Photos (jusqu&apos;à 5)</Label>
            {/* Compressées à la prise (RM-19.1.3) : une photo de téléphone
                pèse 8-15 Mo, le réseau d'un logement rarement autant */}
            {/* Champ fichier en français (25/09, D10) : le natif rendait
                « Choose Files / No file chosen » selon le navigateur. */}
            <ChampFichier
              ref={champPhotos}
              id="photos"
              name="photos"
              accept="image/jpeg,image/png"
              multiple
              libelle="Choisir des photos"
              vide={photos.length ? photos.map(p => p.name).join(", ") : "Aucune photo choisie"}
              onChange={(e) => {
                const champ = e.currentTarget;
                setCompression(true);
                void compresserChampFichiers(champ).then(() => setPhotos(fichiersDuChamp(champ))).finally(() => setCompression(false));
              }}
            />
            {/* Après un refus, dire NOIR SUR BLANC que les photos sont
                toujours là : c'est ce qui évite de les reprendre. */}
            {photos.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {photos.length === 1 ? "1 photo jointe" : `${photos.length} photos jointes`} :{" "}
                {photos.map((p) => p.name).join(", ")}
              </p>
            )}
          </div>

          {/* defaultValue={etat.valeurs?.…} : en erreur, le reset React retombe
              sur la saisie (recette 22/08 — mécanique commune, lib/formulaires.ts).
              La catégorie, pilotée, garde sa valeur d'elle-même. */}
          {/* flex + gap plutôt que space-y : la ligne d'aide, masquée sur
              bureau, ne laisse pas de marge fantôme sous le sélecteur. */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="categorie">De quoi s&apos;agit-il ?</Label>
            <select
              id="categorie"
              name="categorie"
              required
              value={categorie}
              onChange={(e) => setCategorie(e.target.value)}
              className={classeSelect}
            >
              <option value="" disabled>
                Choisissez la catégorie la plus proche…
              </option>
              {CATEGORIES_INCIDENT.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.libelle}
                </option>
              ))}
            </select>
            {!categorieIncident(categorie) && (
              <p className="text-xs text-muted-foreground min-[861px]:hidden">
                Selon la catégorie, nous vous disons tout de suite qui paie.
              </p>
            )}
          </div>

          {/* Sous 861 px (.loc-grille empilée), l'encart de droite passerait
              sous le bouton d'envoi : on le montre ici, juste sous le choix
              qui le pilote — en panneau plat, et seulement une fois la
              catégorie choisie (24/09). */}
          {categorieIncident(categorie) && (
            <div className="min-[861px]:hidden">
              <EncartQuiPaiera slug={categorie} plat />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="piece">Dans quelle pièce ? (facultatif)</Label>
            <select id="piece" name="piece" value={piece} onChange={(e) => setPiece(e.target.value)} className={classeSelect}>
              <option value="">—</option>
              {PIECES_INCIDENT.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            {/* RM-19.2.2 : une photo suffit — la description est facultative
                (le serveur exige au moins l'un des deux) */}
            {/* block (24/09) : le Label commun est en flex, et le texte et la
                parenthèse devenaient deux colonnes côte à côte sur téléphone,
                « mots » orphelin sous « Décrivez en quelques ». */}
            <Label htmlFor="description" className="block leading-snug">
              Décrivez en quelques mots{" "}
              <span className="font-normal text-muted-foreground">
                (facultatif si vous joignez une photo)
              </span>
            </Label>
            <textarea
              id="description"
              name="description"
              required={photos.length === 0}
              rows={3}
              placeholder="Où exactement, est-ce que cela s'aggrave, qu'avez-vous déjà essayé…"
              value={saisie.description} onChange={e => setSaisie(s => ({ ...s, description: e.target.value }))}
              className="w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="anciennete">Depuis quand ? (facultatif)</Label>
            <Input
              id="anciennete"
              name="anciennete"
              placeholder="« Depuis dimanche »"
              value={saisie.anciennete} onChange={e => setSaisie(s => ({ ...s, anciennete: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="urgence">Est-ce urgent ?</Label>
            <select
              id="urgence"
              name="urgence"
              value={saisie.urgence} onChange={e => setSaisie(s => ({ ...s, urgence: e.target.value as "normale" | "urgente" }))}
              className={classeSelect}
            >
              <option value="normale">Non, cela peut attendre quelques jours</option>
              <option value="urgente">Oui, dégât en cours ou logement inutilisable</option>
            </select>
          </div>

          </fieldset>
          {/* Le refus s'affiche AU PIED du formulaire, contre le bouton qui
              vient d'échouer : six champs plus haut, sur un écran de 390 px,
              le locataire ne voyait rien et croyait l'envoi parti.
              role="alert" pour que le lecteur d'écran l'annonce sans avoir à
              remonter. */}
          {etat.erreur && (
            <div className="err" role="alert">
              {etat.erreur}
            </div>
          )}

          <BoutonEnvoi disabled={compression} enCoursTexte="Envoi…" className="w-full">
            Envoyer le signalement
          </BoutonEnvoi>
        </form>
      </div>

      <div className="max-[860px]:hidden">
        <EncartQuiPaiera slug={categorie} />
      </div>
    </div>
  );
}
