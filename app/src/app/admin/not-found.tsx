import { EcranIntrouvable } from "@/components/ecran-introuvable";

// « Introuvable » dans la supervision : la coquille reste, un geste ramène à l'accueil de l'espace.
export default function IntrouvableSupervision() {
  return <EcranIntrouvable enveloppe="main" />;
}
