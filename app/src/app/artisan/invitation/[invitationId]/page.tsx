import Link from "next/link";
import { notFound } from "next/navigation";
import { seDeconnecter } from "@/app/actions/auth";
import { formaterDate } from "@/lib/ged";
import { estUuid } from "@/lib/identifiants";
import type { InvitationRecue } from "@/lib/invitations-artisan";
import { chargerFicheArtisan } from "../../acces";
import { FormulaireCompteArtisan } from "../../inscription/formulaire-compte";
import { CLASSE_BOUTON_PRINCIPAL, CLASSE_BOUTON_SECONDAIRE, Carte, Erreur, TitreSection } from "../../ui";
import { ReponseInvitationArtisan } from "./reponse";

export const metadata = { title: "Invitation d’un propriétaire" };

/**
 * La page du lien reçu par e-mail : l'invitation d'un propriétaire direct (décision du dirigeant du 15/10/2026).
 *
 *  · SANS SESSION : l'artisan crée son compte (adresse pré-remplie par l'ancre du lien, dans son navigateur seulement)
 *    ou se connecte ; le lien de confirmation et la connexion le ramènent ici. La page ne lit RIEN en base et ne dit
 *    rien de l'invitation (ni qui invite, ni quelle adresse).
 *  · AVEC UNE SESSION dont l'adresse confirmée n'est pas celle de l'invitation : refus clair, sans rien révéler.
 *  · AVEC LA BONNE SESSION : sans fiche d'entreprise, il passe d'abord par l'inscription existante, qui le ramène ici ;
 *    avec une fiche (même validée), il ACCEPTE explicitement, ou refuse. Rien n'est jamais rattaché sans ce geste.
 */
export default async function PageInvitationArtisan(props: PageProps<"/artisan/invitation/[invitationId]">) {
  const { invitationId } = await props.params;
  if (!estUuid(invitationId)) notFound();
  const { supabase, user, fiche } = await chargerFicheArtisan();
  if (!user) return <SansSession invitationId={invitationId} />;

  const { data, error } = await supabase.rpc("mon_invitation_artisan", { p_id: invitationId });
  const invitation = ((data ?? []) as InvitationRecue[])[0];

  return (
    <div className="space-y-6">
      <div className="portail-hero">
        <p className="portail-surtitre">Espace artisan</p>
        <h1 className="mt-0.5">Invitation à rejoindre un carnet d’artisans</h1>
        {invitation && <p className="mt-2 text-base text-[var(--corps)]">Proposée par {invitation.organisation}</p>}
      </div>

      {error ? (
        <Erreur>L’invitation n’a pas pu être chargée. Rechargez la page dans un instant.</Erreur>
      ) : !invitation ? (
        <Carte>
          <TitreSection>Cette invitation n’est pas accessible avec ce compte</TitreSection>
          <p className="break-words text-base text-[var(--corps)]">Vous êtes connecté avec {user.email}.</p>
          <p className="text-base text-[var(--corps)]">
            Une invitation ne s’ouvre qu’avec l’adresse e-mail qui l’a reçue, une fois cette adresse confirmée.
            Déconnectez-vous, puis ouvrez de nouveau le lien reçu par e-mail.
          </p>
          <form data-saisie-libre action={seDeconnecter}>
            <button type="submit" className={CLASSE_BOUTON_SECONDAIRE}>Se déconnecter</button>
          </form>
        </Carte>
      ) : invitation.etat === "en_attente" ? (
        <EnAttente invitation={invitation} />
      ) : invitation.etat === "acceptee" ? (
        <Carte ton="vert">
          <TitreSection>Vous êtes dans le carnet d’artisans de {invitation.organisation}</TitreSection>
          {fiche?.statut_plateforme === "valide" ? (
            <p className="text-base text-[var(--corps)]">
              Votre inscription est validée par Gerimmo : vous pouvez recevoir ses demandes pour les biens situés dans
              votre zone d’intervention. Vérifiez que vos codes postaux sont à jour.
            </p>
          ) : (
            <p className="text-base text-[var(--corps)]">
              Prochaine étape : déposez vos attestations de responsabilité civile professionnelle et de garantie
              décennale. Gerimmo vérifie ensuite votre inscription ; personne ne peut vous solliciter avant.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {fiche?.statut_plateforme === "valide" ? (
              <Link href="/artisan/entreprise" className={CLASSE_BOUTON_PRINCIPAL}>Vérifier ma zone d’intervention</Link>
            ) : (
              <Link href="/artisan/attestations" className={CLASSE_BOUTON_PRINCIPAL}>Déposer mes attestations</Link>
            )}
            <Link href="/artisan" className={CLASSE_BOUTON_SECONDAIRE}>Aller à mon espace</Link>
          </div>
        </Carte>
      ) : (
        <Carte>
          <TitreSection>
            {invitation.etat === "refusee"
              ? "Vous avez refusé cette invitation"
              : invitation.etat === "expiree"
                ? "Cette invitation a expiré"
                : "Cette invitation a été annulée"}
          </TitreSection>
          <p className="text-base text-[var(--corps)]">
            {invitation.etat === "refusee"
              ? "Rien n’a été partagé avec la personne qui vous a invité."
              : invitation.etat === "expiree"
                ? "Elle n’est plus valable. Si vous le souhaitez, demandez-en une nouvelle à la personne qui vous a invité."
                : "La personne qui l’avait envoyée l’a annulée. Elle n’est plus valable."}
          </p>
          <Link href="/artisan" className={CLASSE_BOUTON_SECONDAIRE}>Aller à mon espace</Link>
        </Carte>
      )}
    </div>
  );
}

function EnAttente({ invitation }: { invitation: InvitationRecue }) {
  if (!invitation.a_une_fiche) {
    return (
      <>
        <Carte>
          <TitreSection>1. Inscrire votre entreprise</TitreSection>
          <p className="text-base text-[var(--corps)]">
            Avant d’accepter, inscrivez votre entreprise : SIRET, métiers, mobile et zone d’intervention. Vous
            reviendrez ensuite ici.
          </p>
          <Link href={`/artisan/inscription?invitation=${invitation.id}`} className={CLASSE_BOUTON_PRINCIPAL}>
            Inscrire mon entreprise
          </Link>
        </Carte>
        <Carte>
          <TitreSection>2. Accepter l’invitation</TitreSection>
          <p className="text-base text-[var(--corps)]">
            Valable jusqu’au {formaterDate(invitation.expire_le)}. Vous pouvez aussi la refuser dès maintenant : rien
            ne sera partagé.
          </p>
          <ReponseInvitationArtisan invitationId={invitation.id} accepter={false} />
        </Carte>
      </>
    );
  }
  return (
    <Carte>
      <TitreSection>Votre réponse</TitreSection>
      <p className="text-base text-[var(--corps)]">
        En acceptant, vous entrez dans le carnet d’artisans de {invitation.organisation}. Il verra le nom de votre
        entreprise et votre téléphone, et pourra vous demander des devis pour ses biens situés dans votre zone
        d’intervention, une fois votre inscription validée par Gerimmo. Refuser ne partage rien.
      </p>
      <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">Valable jusqu’au {formaterDate(invitation.expire_le)}.</p>
      <ReponseInvitationArtisan invitationId={invitation.id} accepter />
    </Carte>
  );
}

function SansSession({ invitationId }: { invitationId: string }) {
  return (
    <div className="space-y-6">
      <div className="portail-hero">
        <p className="portail-surtitre">Espace artisan</p>
        <h1 className="mt-0.5">Vous avez reçu une invitation</h1>
        <p className="mt-2 text-base text-[var(--corps)]">
          Un propriétaire qui utilise Gerimmo souhaite vous ajouter à son carnet d’artisans. Pour la voir et y
          répondre, créez votre compte artisan, ou connectez-vous si vous en avez déjà un.
        </p>
      </div>

      <Carte>
        <TitreSection>1. Votre compte</TitreSection>
        <FormulaireCompteArtisan invitationId={invitationId} />
      </Carte>

      <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
        Ensuite : votre entreprise (SIRET, métiers, zone d’intervention), puis votre réponse à l’invitation. Gerimmo
        valide votre inscription avant toute intervention.
      </p>
    </div>
  );
}
