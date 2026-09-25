"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarreBasse } from "@/components/barre-laterale";
import { LienAssistance } from "@/components/bouton-assistance";
import type { NavigationEspace } from "@/lib/navigation-espace";
import { cn } from "@/lib/utils";

// Barre latérale de l'espace locataire (maquette v10 du 05/09) : le locataire
// est chez lui — menu vertical, entrée active en bleu, badges sur ce qui
// l'attend. Sur tablette, la barre devient un rail d'icônes ; sur téléphone,
// une barre basse de quatre entrées + « Menu », la même que celle de l'agence
// (24/09 : la barre horizontale qui défilait coupait les entrées et empilait
// deux bandeaux au-dessus du contenu).

const IC: Record<string, string> = {
  maison: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9v11h13V9"/>',
  cle: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17 12v3M20.5 12v2"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
  carte: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
  outil: '<path d="M14.5 6.5a4 4 0 0 0-5.6 4.9L4 16.3V20h3.7l4.9-4.9a4 4 0 0 0 4.9-5.6L15 12l-3-3z"/>',
  bulle: '<path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/>',
  quest: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.8.3-.9 1-.9 1.7M12 17h.01"/>',
  aide: '<path d="M21 11.5a8 8 0 0 1-8 8H5l-2 2v-10a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/><path d="M12 8v4M12 15h.01"/>',
};

function Icone({ nom }: { nom: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: IC[nom] ?? "" }}
    />
  );
}

export function SidebarLocataire({
  orgId,
  badgeDocuments = 0,
  badgeDemandes = 0,
  badgeMessages = 0,
}: {
  orgId: string;
  // Une pièce à déposer ou à renouveler (assurance…) attend dans Documents
  badgeDocuments?: number;
  // Signalements en cours
  badgeDemandes?: number;
  // Réponses du gestionnaire pas encore lues
  badgeMessages?: number;
}) {
  const pathname = usePathname();
  const base = `/locataire/${orgId}`;
  // La section présente d'abord le suivi, avec un accès explicite au nouveau
  // signalement. Le badge décrit les dossiers en cours, pas le formulaire.
  const entrees = [
    { href: base, libelle: "Accueil", icone: "maison", exact: true },
    { href: `${base}/logement`, libelle: "Mon logement", icone: "cle" },
    { href: `${base}/documents`, libelle: "Mes documents", icone: "doc", badge: badgeDocuments },
    { href: `${base}/loyers`, libelle: "Mes paiements", icone: "carte" },
    {
      href: `${base}/demandes`,
      libelle: "Mes demandes",
      icone: "outil",
      aussi: `${base}/incident`,
      badge: badgeDemandes,
    },
    { href: `${base}/contact`, libelle: "Mon gestionnaire", icone: "bulle", badge: badgeMessages },
    { href: `/veille?public=locataire&retour=${encodeURIComponent(base)}`, libelle: "Les règles à connaître", icone: "doc" },
    { href: `${base}/faq`, libelle: "Questions fréquentes", icone: "quest" },
  ];

  // Le téléphone : les quatre gestes les plus fréquents d'un locataire, le
  // reste dans le tiroir « Menu » — dans l'ORDRE du menu latéral (24/09 :
  // Paiements passait devant Documents, à l'inverse du bureau).
  const courts = ["Accueil", "Logement", "Documents", "Paiements", "Demandes", "Gestionnaire", "Règles", "Aide"];
  const principales = entrees.map((e, i) => ({
    href: e.href,
    libelle: e.libelle,
    icone: e.icone,
    exact: e.exact,
    court: courts[i],
    badge: e.badge,
  }));
  const navigation: NavigationEspace = {
    principales,
    secondaires: [],
    barreBasse: [principales[0], principales[2], principales[3], principales[4]],
  };

  return (
    <>
    <BarreBasse espace="Mon espace" navigation={navigation} />
    <nav className="loc-menu" aria-label="Mon espace">
      {entrees.map((e) => {
        const active = e.exact
          ? pathname === e.href
          : (pathname === e.href.split("?")[0] || pathname.startsWith(`${e.href.split("?")[0]}/`)) || (e.aussi ? pathname.startsWith(e.aussi) : false);
        const nb = e.badge ?? 0;
        return (
          <Link
            key={e.href}
            href={e.href}
            className={cn(active && "actif")}
              aria-current={active ? "page" : undefined}
            title={e.libelle}
            // Accessibilité (audit 09/09) : le lien s'annonce en entier, le
            // badge est décoratif — sinon les lecteurs d'écran ne lisent
            // que le nombre
            aria-label={nb > 0 ? `${e.libelle}, ${nb} élément${nb > 1 ? "s" : ""} à traiter` : undefined}
          >
            <Icone nom={e.icone} />
            <span className="lib">{e.libelle}</span>
            {nb > 0 && (
              <span className="loc-badge" aria-hidden="true">
                {nb > 99 ? "99+" : nb}
              </span>
            )}
          </Link>
        );
      })}
      {/* L'aide, en dernier et à part (25/09, D40) : le rond flottant
          recouvrait le contenu sur bureau ; comme dans l'espace agence, elle
          vit dans la barre. Sur téléphone, le tiroir « Menu » la porte déjà. */}
      <div className="mt-auto border-t border-[var(--filet)] pt-1">
        <LienAssistance title="Aide et retours">
          <Icone nom="aide" />
          <span className="lib">Aide et retours</span>
        </LienAssistance>
      </div>
    </nav>
    </>
  );
}
