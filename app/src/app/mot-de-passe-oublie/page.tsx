import { CoquilleAuth } from "@/components/coquille-auth";
import { FormulaireReinitialisation } from "./formulaire-reinitialisation";

export const metadata = { title: "Mot de passe oublié — Gerimmo" };

export default function PageMotDePasseOublie() {
  return (
    <CoquilleAuth
      promesse="Vous y serez dans une minute."
      // 24/09 : la sous-promesse redisait le chapo (lien, une heure). Le
      // panneau porte ce que le produit fait ; le délai reste au seul chapo.
      sousPromesse="Vous retrouvez vos baux, vos quittances et vos échéances là où vous les aviez laissés."
      mention="Un seul compte, tous vos espaces"
      titre="Mot de passe oublié"
      chapo="Indiquez votre adresse e-mail : si un compte existe, vous recevrez un lien de réinitialisation valable une heure."
    >
      <FormulaireReinitialisation />
    </CoquilleAuth>
  );
}
