import { EcranIntrouvable } from "@/components/ecran-introuvable";

// « Introuvable » dans l'espace de gestion et l'espace propriétaire : la coquille reste, un geste ramène à l'accueil de l'espace.
export default function IntrouvableAgence() {
  return <EcranIntrouvable enveloppe="main" />;
}
