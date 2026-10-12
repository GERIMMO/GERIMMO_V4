"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, Globe2, LockKeyhole, MapPin, Pencil, Wrench } from "lucide-react";
import styles from "./entreprise.module.css";
import {
  definirMaVisibilite,
  mettreAJourMetiersZones,
  type EtatArtisanAction,
} from "@/app/actions/artisan";
import { LISTE_METIERS, METIERS } from "../libelles";
import {
  Carte,
  CLASSE_BOUTON_SECONDAIRE,
  CLASSE_BOUTON_SOBRE,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  Erreur,
  Succes,
} from "../ui";

function BoutonEnregistrer({
  libelleBouton,
  classe = CLASSE_BOUTON_SECONDAIRE,
}: {
  libelleBouton: string;
  classe?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={classe} disabled={pending}>
      {pending ? "Enregistrement…" : libelleBouton}
    </button>
  );
}

/**
 * RM-8.4.2 : LA VISIBILITÉ APPARTIENT À L'ARTISAN, ET À LUI SEUL.
 *
 * Ce n'est pas un réglage parmi d'autres : c'est la seule décision du module 8
 * qu'aucune agence et aucun super admin ne peuvent prendre à sa place — la
 * RPC `definir_ma_visibilite` n'accepte même pas d'artisan en paramètre. Le
 * défaut est « privée » : tant qu'il ne se publie pas, seules les agences
 * auxquelles il est déjà rattaché peuvent le solliciter.
 *
 * Un SIRET non vérifié interdit la publication (RM-A1.9) : on le dit avant,
 * plutôt que de laisser la base refuser après.
 */
export function ReglageVisibilite({
  visibilite,
  siretVerifie,
}: {
  visibilite: "privee" | "publique";
  siretVerifie: boolean;
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    definirMaVisibilite,
    {}
  );
  const publique = visibilite === "publique";

  return (
    <Carte className={styles.bloc}>
      <div className={styles.titreBloc}><span className={styles.icone}><Eye size={19} aria-hidden/></span><div><h2>Qui peut me solliciter</h2><p>Vous choisissez votre visibilité.</p></div></div>
      <span className={styles.visibiliteEtat} data-public={publique}>{publique ? <Globe2 size={15} aria-hidden/> : <LockKeyhole size={15} aria-hidden/>}{publique ? "Profil public" : "Profil privé"}</span>
      <p className={styles.descriptionVisibilite}>
        {publique
          ? "Votre profil est visible des propriétaires et gestionnaires de la plateforme. Ils peuvent vous demander un devis."
          : "Votre profil est privé : seuls les propriétaires et gestionnaires auxquels vous êtes déjà rattaché peuvent vous solliciter."}
      </p>

      {etat.succes && (
        <div className="mt-3">
          <Succes>{etat.succes}</Succes>
        </div>
      )}
      {etat.erreur && (
        <div className="mt-3">
          <Erreur>{etat.erreur}</Erreur>
        </div>
      )}

      {!publique && !siretVerifie ? (
        <p className="mt-3 text-[0.9375rem] text-[var(--texte-secondaire)]">
          La publication s&apos;ouvrira quand votre SIRET aura été vérifié par
          Gerimmo. C&apos;est une vérification, effectuée par Gerimmo.
        </p>
      ) : (
        <form action={action} className="mt-3">
          <input
            type="hidden"
            name="visibilite"
            value={publique ? "privee" : "publique"}
          />
          {/* 25/09 (A9) : un réglage rare, en bouton sobre à sa largeur — pas
              un contour bleu pleine largeur qui se lisait comme l'action de
              la page. */}
          <BoutonEnregistrer
            classe={`${CLASSE_BOUTON_SOBRE} ${styles.visibiliteBouton} sm:w-auto`}
            libelleBouton={
              publique ? "Repasser mon profil en privé" : "Rendre mon profil public"
            }
          />
        </form>
      )}
      <p className={styles.aide}>
        Vous seul décidez de ce réglage : ni vos clients, ni Gerimmo ne peuvent le
        changer.
      </p>
    </Carte>
  );
}

/** Métiers (liste fermée, RM-8.3) et zone d'intervention par codes postaux. */
export function FormulaireMetiersZones({
  metiers,
  codesPostaux,
  complement,
}: {
  metiers: string[];
  codesPostaux: string[];
  /** Ce qui se lit avec les métiers (le lien vers les règles du métier, 25/09). */
  complement?: React.ReactNode;
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    mettreAJourMetiersZones,
    {}
  );
  const [ouvert, setOuvert] = useState(false);
  const [metiersChoisis, setMetiersChoisis] = useState(metiers);
  const [zoneSaisie, setZoneSaisie] = useState(codesPostaux.join(", "));
  const [afficherResultat, setAfficherResultat] = useState(false);
  const idZones = useId();
  const base = useId();

  if (!ouvert) {
    return (
      <Carte className={styles.bloc}>
        {/* 25/09 (A9) : « Modifier » en lien discret dans le titre — en bouton
            contour pleine largeur, il passait pour l'action principale de la
            page. */}
        <div className={styles.titreBloc}>
          <span className={styles.icone}><Wrench size={19} aria-hidden/></span><div><h2>Mes métiers et ma zone</h2><p>Votre activité et votre secteur.</p></div>
          <button
            type="button"
            className={styles.modifier}
            onClick={() => {
              setMetiersChoisis(metiers);
              setZoneSaisie(codesPostaux.join(", "));
              setAfficherResultat(false);
              setOuvert(true);
            }}
          >
            <Pencil size={14} aria-hidden/>Modifier
          </button>
        </div>
        <dl className={styles.reperesMetier}>
          <div><dt><Wrench size={14} aria-hidden/>Métiers déclarés</dt><dd className={styles.puces}>{metiers.length ? metiers.map(m => <span key={m}>{METIERS[m] ?? m}</span>) : "Aucun métier déclaré"}</dd></div>
          <div><dt><MapPin size={14} aria-hidden/>Zone souhaitée</dt><dd className={styles.puces} data-zone>{codesPostaux.length ? codesPostaux.map((cp, i) => <span key={`${cp}-${i}`}>{cp}</span>) : "Aucune zone d’intervention déclarée — vous ne serez proposé nulle part."}</dd></div>
        </dl>
        {etat.succes && (
          <div className="mt-3">
            <Succes>{etat.succes}</Succes>
          </div>
        )}
        <p className={styles.aide}>
          Vous n&apos;êtes proposé que dans vos métiers, et pour les communes de
          votre zone.
        </p>
        {complement}
      </Carte>
    );
  }

  return (
    <Carte className={styles.bloc}>
      <div className={styles.titreBloc}><span className={styles.icone}><Wrench size={19} aria-hidden/></span><div><h2>Mes métiers et ma zone</h2><p>Sélectionnez vos métiers et votre secteur.</p></div></div>
      <form
        action={action}
        onSubmit={() => setAfficherResultat(true)}
        onReset={(event) => event.preventDefault()}
        className="space-y-4"
      >
        <fieldset>
          <legend className={CLASSE_LIBELLE}>Mes métiers</legend>
          <p className="mb-2 text-[0.9375rem] text-[var(--texte-secondaire)]">
            Un artisan n&apos;est proposé que dans son métier.
          </p>
          <div className={styles.metiers}>
            {LISTE_METIERS.map((m) => (
              <label
                key={m}
                htmlFor={`${base}-${m}`}
                className="flex min-h-12 items-center gap-3 text-base text-[var(--corps)]"
              >
                <input
                  id={`${base}-${m}`}
                  type="checkbox"
                  name="metiers"
                  value={m}
                  checked={metiersChoisis.includes(m)}
                  onChange={(event) => setMetiersChoisis((selection) =>
                    event.target.checked ? [...selection, m] : selection.filter((choix) => choix !== m)
                  )}
                  className="size-6 shrink-0 accent-[var(--encre)]"
                />
                {METIERS[m]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor={idZones} className={CLASSE_LIBELLE}>
            Ma zone d&apos;intervention
          </label>
          <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
            Des codes postaux (91300) ou des départements entiers (91, 94, 77),
            séparés par des virgules. Un département couvre tous ses codes postaux.
          </p>
          <input
            id={idZones}
            name="codes_postaux"
            type="text"
            inputMode="text"
            value={zoneSaisie}
            onChange={(event) => setZoneSaisie(event.target.value)}
            className={CLASSE_CHAMP}
          />
        </div>

        {afficherResultat && etat.erreur && <Erreur>{etat.erreur}</Erreur>}
        {afficherResultat && etat.succes && <Succes>{etat.succes}</Succes>}

        <div className={styles.actions}><BoutonEnregistrer libelleBouton="Enregistrer" />
        <button
          type="button"
          className={CLASSE_BOUTON_SECONDAIRE}
          onClick={() => setOuvert(false)}
        >
          Annuler
        </button></div>
      </form>
    </Carte>
  );
}
