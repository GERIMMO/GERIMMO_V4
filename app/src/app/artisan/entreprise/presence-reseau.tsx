import { CheckCircle2, CircleDashed, Network } from "lucide-react";
import { presenceReseau, type FichePresenceReseau } from "@/lib/reseau";
import { Carte } from "../ui";
import styles from "./entreprise.module.css";

/**
 * « Suis-je proposé dans le réseau Gerimmo ? » (décision du dirigeant du 23/10/2026, migration 20261023180000).
 * Le réseau propose l'artisan aux propriétaires dont le bien est dans SA zone, pour SES métiers, dès que Gerimmo a validé
 * son inscription (SIRET vérifié) et que son profil est public. La validation ne rend pas le profil public : sans cette
 * carte, un artisan validé mais privé restait invisible sans que rien ne le lui dise (relecture du 23/10, M3).
 */
export function PresenceReseau({ fiche }: { fiche: FichePresenceReseau }) {
  const { propose, conditions } = presenceReseau(fiche);
  return (
    <Carte className={styles.bloc}>
      <div className={styles.titreBloc}><span className={styles.icone}><Network size={19} aria-hidden/></span><div><h2>Suis-je proposé dans le réseau ?</h2><p>{propose ? "Oui : les propriétaires de votre zone vous trouvent pour vos métiers." : "Pas encore : voici ce qui manque."}</p></div></div>
      <ul className="space-y-2" aria-label="Conditions pour être proposé dans le réseau Gerimmo">
        {conditions.map((c) => (
          <li key={c.cle} className="flex items-start gap-2 text-[0.9375rem]">
            {c.remplie ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--success)]" aria-hidden/> : <CircleDashed size={18} className="mt-0.5 shrink-0 text-[var(--texte-secondaire)]" aria-hidden/>}
            <span><span className="sr-only">{c.remplie ? "Fait : " : "À faire : "}</span><b className="font-medium">{c.libelle}</b>{!c.remplie && <span className="block text-xs text-[var(--texte-secondaire)]">{c.aide}</span>}</span>
          </li>
        ))}
      </ul>
      <p className={styles.aide}>Vous êtes proposé pour chaque bien situé dans votre zone (le code postal du bien, ou son département si vous avez choisi tout le département), pour chacun de vos métiers. Pour les travaux qui l’exigent, il faut aussi une garantie décennale valide. Un client ou Gerimmo peut vous écarter par une liste noire.</p>
    </Carte>
  );
}
