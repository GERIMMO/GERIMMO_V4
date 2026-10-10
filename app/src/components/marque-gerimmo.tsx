import Image from "next/image";
import { CHARTE_GERIMMO } from "@/lib/charte-gerimmo";

/** Le fichier officiel est conservé entier, sans redessin ni déformation. */
export function MarqueGerimmo({
  className = "",
  surEncre = false,
}: {
  className?: string;
  surEncre?: boolean;
}) {
  return (
    <span className={`marque-gerimmo ${surEncre ? "marque-gerimmo-sur-encre" : ""} ${className}`}>
      <Image
        src={CHARTE_GERIMMO.logo}
        alt="Gerimmo — L’immobilier en confiance"
        width={CHARTE_GERIMMO.logoLargeur}
        height={CHARTE_GERIMMO.logoHauteur}
        sizes="(max-width: 640px) 72px, 180px"
      />
    </span>
  );
}
