import { CoquilleAuth } from "@/components/coquille-auth";
import { FormulaireReinitialisation } from "./formulaire-reinitialisation";

export const metadata = { title: "Mot de passe oublié — Gerimmo" };

export default function PageMotDePasseOublie() {
  return (
    <CoquilleAuth
      promesse="Vous y serez dans une minute."
      sousPromesse="Un lien de réinitialisation, valable une heure, et vous retrouvez vos baux, vos quittances et vos échéances là où vous les aviez laissés."
      mention="Un seul compte, tous vos espaces"
      titre="Mot de passe oublié"
      chapo="Indiquez votre adresse email : si un compte existe, vous recevrez un lien de réinitialisation valable une heure."
    >
      <FormulaireReinitialisation />
    </CoquilleAuth>
  );
}
