import Link from "next/link";
import { LIEN_CANAUX_DE_DIFFUSION, RAISON_DIFFUSION_MASQUEE, type EtatPageFacebook } from "@/lib/diffusion-facebook";

/**
 * Le court texte qui remplace la diffusion Facebook masquée (décision du 25/11/2026) : pourquoi elle n'est pas
 * proposée, et où vérifier la Page. Rien quand la Page est reliée et lue.
 */
export function DiffusionFacebookMasquee({ etat, className = "" }: { etat: EtatPageFacebook; className?: string }) {
  if (etat === "relie") return null;
  return (
    <p data-diffusion-facebook="masquee" className={className}>
      {RAISON_DIFFUSION_MASQUEE[etat]} {etat === "a_verifier" ? "Vérifiez la Page dans" : "Son état se lit dans"}{" "}
      <Link href={LIEN_CANAUX_DE_DIFFUSION} className="lien-texte">
        Vos canaux de diffusion
      </Link>
      .
    </p>
  );
}
