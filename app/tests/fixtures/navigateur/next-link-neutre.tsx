// `next/link` hors de Next : un simple lien suffit au banc (aucun lien n'est suivi).
import type { AnchorHTMLAttributes } from "react";
export default function Link({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} {...props} />;
}
