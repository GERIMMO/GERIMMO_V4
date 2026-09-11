"use client";

import Link from "next/link";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const classeSelect =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

// Encart adaptatif « Qui paiera la réparation » (maquette pLocDeclarer +
// apercuImput) : le REPÈRE juridique de la catégorie choisie — une
// information, jamais une décision. Le gérant tranche à la qualification
// (RM-7.2.1) et la mention finale le rappelle.
function EncartQuiPaiera({ slug }: { slug: string }) {
  const categorie = categorieIncident(slug);

  if (!categorie) {
    return (
      <div className="loc-carte">
        <h3 className="text-base font-medium">Qui paiera la réparation</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Choisissez une catégorie : Gerimmo vous dit immédiatement si la
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
    <div className={`loc-carte ${bordure}`}>
      <h3 className="text-base font-medium">Qui paiera la réparation</h3>
      <div className="mt-2.5 space-y-2.5 text-sm">
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
                l&apos;incident. L&apos;agence peut missionner un artisan pour
                vous ; l&apos;intervention vous est alors refacturée après votre
                accord sur le devis.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Vous n&apos;avancez rien : l&apos;agence missionne l&apos;artisan
                après qualification.
              </p>
            )}
          </>
        ) : (
          <>
            <p>
              <span className="loc-tag bleu">À qualifier par votre gestionnaire</span>
            </p>
            <p className="text-muted-foreground">
              La cause ne se déduit pas de la catégorie : votre gestionnaire tranche
              et vous êtes informé immédiatement.
            </p>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Repère indicatif — la décision (opposable) revient à votre gestionnaire à la
          qualification.
        </p>
      </div>
    </div>
  );
}

// La photo est le PREMIER champ, avant la description (RM-19.2.2). La
// catégorie est pilotée : elle alimente l'encart « Qui paiera la réparation »
// (retour de recette 24/08, alignement maquette pLocDeclarer).
export function FormulaireIncidentLocataire({ orgId }: { orgId: string }) {
  const actionLiee = declarerMonIncident.bind(null, orgId);
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});
  const [categorie, setCategorie] = useState(etat.valeurs?.categorie ?? "");
  const [photos, setPhotos] = useState<File[]>([]);
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
        <p className="text-sm text-muted-foreground">
          {/* Aucune promesse de rattrapage ici : le locataire n'a aucun
              dépôt de photo sur un incident déjà ouvert — joindrePhotoIncident
              (app/actions/incidents.ts) passe par verifierGerant. */}
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
    <div className="deux-col">
      <div className="loc-carte">
        <h3 className="text-base font-medium">Votre signalement</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Une ou deux photos prises sur le vif évitent souvent un déplacement
          pour rien.
        </p>
        <form action={action} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="photos">Photos (jusqu&apos;à 5)</Label>
            {/* Compressées à la prise (RM-19.1.3) : une photo de téléphone
                pèse 8-15 Mo, le réseau d'un logement rarement autant */}
            <Input
              ref={champPhotos}
              id="photos"
              name="photos"
              type="file"
              accept="image/jpeg,image/png"
              multiple
              onChange={(e) => {
                const champ = e.currentTarget;
                void compresserChampFichiers(champ).then(() =>
                  setPhotos(fichiersDuChamp(champ))
                );
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
          <div className="space-y-1.5">
            <Label htmlFor="categorie">De quoi s&apos;agit-il ? *</Label>
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
          </div>

          {/* Sous 861 px (.deux-col empilée), l'encart de droite passerait
              sous le bouton d'envoi : on le montre ici, juste sous le choix
              qui le pilote. */}
          <div className="min-[861px]:hidden">
            <EncartQuiPaiera slug={categorie} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="piece">Dans quelle pièce ?</Label>
            <select id="piece" name="piece" defaultValue={etat.valeurs?.piece ?? ""} className={classeSelect}>
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
            <Label htmlFor="description">
              Décrivez en quelques mots{" "}
              <span className="font-normal text-muted-foreground">
                (facultatif si vous joignez une photo)
              </span>
            </Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Depuis quand, où exactement, est-ce que cela s'aggrave…"
              defaultValue={etat.valeurs?.description}
              className="w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="anciennete">Depuis quand ?</Label>
            <Input
              id="anciennete"
              name="anciennete"
              placeholder="« Depuis dimanche »"
              defaultValue={etat.valeurs?.anciennete}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="urgence">Est-ce urgent ?</Label>
            <select
              id="urgence"
              name="urgence"
              defaultValue={etat.valeurs?.urgence ?? "normale"}
              className={classeSelect}
            >
              <option value="normale">Non, cela peut attendre quelques jours</option>
              <option value="urgente">Oui, dégât en cours ou logement inutilisable</option>
            </select>
          </div>

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

          <BoutonEnvoi enCoursTexte="Envoi…" className="w-full">
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
