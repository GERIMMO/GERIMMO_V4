import Link from "next/link";
import { CLASSE_BOUTON_SECONDAIRE } from "../ui";

export function Contestation() {
  return <div className="space-y-3">
    <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
      Demandez le réexamen de votre évaluation à la supervision Gerimmo.
      Votre demande et les réponses restent privées entre vous et la plateforme.
    </p>
    <Link href="/assistance?type=contestation&ecran=%2Fartisan%2Fnote" className={CLASSE_BOUTON_SECONDAIRE}>
      Déposer une contestation
    </Link>
  </div>;
}
