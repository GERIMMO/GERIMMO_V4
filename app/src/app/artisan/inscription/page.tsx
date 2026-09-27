import { redirect } from "next/navigation";
import { chargerFicheArtisan } from "../acces";
import { Carte, TitreSection } from "../ui";
import { FormulaireInscription } from "./formulaire-inscription";
import { FormulaireCompteArtisan } from "./formulaire-compte";

export const metadata = { title: "Inscrire mon entreprise — Gerimmo" };

/**
 * La porte d'entrée de l'artisan qui n'a pas encore de fiche.
 *
 * Elle appelle `chargerFicheArtisan` et NON `verifierAccesArtisan` : cette
 * dernière redirige justement ici quand la fiche manque, et la garde
 * s'appellerait elle-même en boucle.
 *
 * Deux chemins mènent ici, et le même écran les sert :
 *  · l'artisan qui s'inscrit de lui-même (pivot du 2026-09-04) ;
 *  · celui qu'une agence a créé puis invité : en saisissant son SIRET, il
 *    RÉCLAME la fiche existante au lieu d'en créer une seconde — à condition
 *    d'être connecté avec l'adresse que l'agence a enregistrée (audit du
 *    27/09 : le SIRET seul, public, ne prouve rien).
 *
 * SANS COMPTE (audit du 27/09) : la page était derrière la session, et le
 * lien « Inscrire mon entreprise » de /connexion ramenait sur /connexion.
 * Elle est désormais publique (proxy) et commence par créer le compte ;
 * la fiche se remplit ensuite, ici même.
 */
export default async function PageInscriptionArtisan() {
  const { user, fiche } = await chargerFicheArtisan();
  if (!user) return <PremiereMarche />;
  if (fiche) redirect("/artisan");

  return (
    <div className="space-y-6">
      <div className="portail-hero">
        <p className="portail-surtitre">Espace artisan</p>
        <h1 className="mt-0.5">
          Inscrire mon entreprise
        </h1>
        <p className="mt-2 text-base text-[var(--corps)]">
          Une seule inscription vous ouvre les demandes de toutes les agences de
          la plateforme.
        </p>
      </div>

      <Carte>
        <TitreSection>Ce qui vient ensuite</TitreSection>
        <ol className="space-y-2 text-[0.9375rem] text-[var(--corps)]">
          <li>
            <b className="font-medium">1.</b> Vous déposez vos attestations —
            décennale et responsabilité civile professionnelle d&apos;abord.
          </li>
          <li>
            <b className="font-medium">2.</b> Gerimmo vérifie votre SIRET et
            valide votre inscription. Aucune agence ne peut vous solliciter
            avant.
          </li>
          <li>
            <b className="font-medium">3.</b> Vous décidez seul de votre
            visibilité : privée par défaut, publique si vous le voulez.
          </li>
        </ol>
      </Carte>

      <FormulaireInscription />

      <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
        Sans document déposé dans les six mois, votre inscription est supprimée.
      </p>
    </div>
  );
}

function PremiereMarche() {
  return (
    <div className="space-y-6">
      <div className="portail-hero">
        <p className="portail-surtitre">Espace artisan</p>
        <h1 className="mt-0.5">Inscrire mon entreprise</h1>
        <p className="mt-2 text-base text-[var(--corps)]">
          Une seule inscription vous ouvre les demandes de toutes les agences de
          la plateforme. Commencez par votre compte ; votre entreprise vient
          juste après.
        </p>
      </div>

      <Carte>
        <TitreSection>1. Votre compte</TitreSection>
        <FormulaireCompteArtisan />
      </Carte>

      <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
        Ensuite : votre SIRET, vos métiers et votre mobile, puis vos
        attestations. Gerimmo valide votre inscription avant qu&apos;une agence
        puisse vous solliciter.
      </p>
    </div>
  );
}
