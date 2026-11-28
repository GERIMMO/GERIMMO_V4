import Link from "next/link";
import type { ReglagesEnvoi } from "@/lib/envois-automatiques";
import type { EnvoisProposes } from "@/lib/envois-suspendus";

export function CanauxAccueilAgence({ base, reglages, envois, peutRegler }: {
  base: string;
  reglages: ReglagesEnvoi | null;
  envois: EnvoisProposes;
  peutRegler: boolean;
}) {
  const quittances = reglages?.quittances_envoi_auto;
  const automatique = (actif: boolean | null | undefined) =>
    actif == null ? "Réglage de l’envoi automatique à vérifier." :
      actif ? "Envoi automatique par courriel activé." : "Envoi automatique par courriel désactivé.";

  return <section aria-label="Canaux d’envoi des loyers" className="grid gap-3 border-b p-4 text-sm lg:grid-cols-3">
    <div>
      <h3 className="font-semibold">Quittances</h3>
      <p>{automatique(quittances)} Après règlement intégral du loyer, la quittance est disponible en PDF.</p>
      {peutRegler && <p>Envoi manuel groupé depuis <Link href={`${base}/loyers`} className="lien-discret">Loyers</Link>.</p>}
      {peutRegler ? <Link href={`${base}/profil#quittances`} className="lien-discret">Régler l’envoi des quittances</Link> :
        <p>Réglage réservé au responsable de l’agence.</p>}
    </div>
    <div>
      <h3 className="font-semibold">Avis d’échéance</h3>
      <p>{envois.avis_echeance ? automatique(reglages?.appels_envoi_auto) : "Envoi par courriel indisponible."}</p>
    </div>
    <div>
      <h3 className="font-semibold">Relances d’impayé</h3>
      <p>Préparation en PDF depuis les impayés. {envois.relance_loyer ? automatique(reglages?.relances_envoi_auto) : "Envoi par courriel indisponible."}</p>
      <Link href={`${base}/loyers`} className="lien-discret">Consulter les impayés</Link>
    </div>
  </section>;
}
