import { CoquilleAuth } from "@/components/coquille-auth";
import { RAISON_ADRESSE_CONFIRMEE } from "@/lib/temoin-inscription";
import { FormulaireReinitialisation } from "./formulaire-reinitialisation";

export const metadata = { title: "Mot de passe oublié — Gerimmo" };

export default async function PageMotDePasseOublie({ searchParams }: { searchParams: Promise<{ raison?: string }> }) {
  // Contre-relecture finale du 15/10/2026 (route /auth/confirm) : une première confirmation faite hors du navigateur de
  // l'inscription (lien d'inscription, ou tout autre lien depuis le 16/10), dont le mot de passe provisoire n'a pas pu
  // être posé par la session, mène ici.
  const apresConfirmation = (await searchParams).raison === RAISON_ADRESSE_CONFIRMEE;
  return (
    <CoquilleAuth
      promesse="Vous y serez dans une minute."
      // 24/09 : la sous-promesse redisait le chapo (lien, durée). Le panneau
      // porte ce que le produit fait ; le délai reste au seul chapo. 30/09 :
      // « une heure » était une promesse que le réglage Auth ne tient pas
      // forcément — on dit « une durée limitée », comme l'e-mail.
      sousPromesse="Vous retrouvez vos baux, vos quittances et vos échéances là où vous les aviez laissés."
      mention="Un seul compte, tous vos espaces"
      titre={apresConfirmation ? "Choisissez votre mot de passe" : "Mot de passe oublié"}
      chapo={
        apresConfirmation
          ? "Votre adresse est confirmée. Par sécurité, un mot de passe choisi avant cette confirmation ne permet plus d'entrer, et le vôtre se choisit par un nouveau lien. Indiquez votre adresse e-mail pour le recevoir ; il est valable pour une durée limitée."
          : "Indiquez votre adresse e-mail : si un compte existe, vous recevrez un lien de réinitialisation valable pour une durée limitée."
      }
    >
      <FormulaireReinitialisation />
    </CoquilleAuth>
  );
}
