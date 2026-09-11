import Link from "next/link";

// Une lecture qui échoue ne doit pas ressembler à un dossier vide.
//
// Relevé du 11/09 : 39 écrans ignoraient le champ `error` de leurs lectures et
// retombaient tous sur `?? []`. Une requête refusée produisait alors un écran
// VIDE ET RASSURANT — un parc sans pièces, une agence sans personnes, un
// incident sans chronologie. L'agent croyait n'avoir rien ; il avait perdu la
// connexion.
//
// Cet encart dit l'inverse d'un état vide : il NOMME ce qui n'a pas pu être lu
// et prévient que l'absence affichée plus bas n'est pas une absence de données.
//
// Zone « incidents / personnes / messages / documents ». Le même encart existe
// à l'identique pour la zone parc ; à la première occasion transverse, les deux
// remontent tels quels dans src/components.
export function EchecLecture({ quoi }: { quoi: string[] }) {
  if (quoi.length === 0) return null;
  return (
    <div className="err" role="alert">
      <p className="font-medium">
        {quoi.length > 1
          ? "Certaines informations n’ont pas pu être lues"
          : "Une information n’a pas pu être lue"}{" "}
        : {quoi.join(", ")}.
      </p>
      <p className="mt-1">
        Ce n’est pas un dossier vide : c’est la lecture qui a échoué. Ce qui
        manque ci-dessous existe peut-être — rechargez la page dans un instant
        avant d’en tirer une conclusion, et n’enregistrez rien sur la foi de cet
        écran.
      </p>
    </div>
  );
}

// La lecture PRINCIPALE d'une fiche a échoué : il n'y a pas de page à rendre.
// Surtout, ne pas répondre `notFound()` — l'agent croirait la fiche supprimée
// et irait la chercher ailleurs, alors que la base n'a pas répondu.
export function PageEchecLecture({
  titre,
  quoi,
  retour,
}: {
  titre: string;
  quoi: string[];
  retour?: { href: string; libelle: string };
}) {
  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-7">
      {retour && (
        <Link
          href={retour.href}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {retour.libelle}
        </Link>
      )}
      <div className="entete-page mb-4">
        <h1>{titre}</h1>
      </div>
      <EchecLecture quoi={quoi} />
    </main>
  );
}

// Variante compacte pour un PANNEAU de vue scindée : le détail n'a pas pu être
// lu, mais la liste à gauche reste valable — pas de page entière, un encart.
export function PanneauEchecLecture({
  quoi,
  lienFermer,
  libelleFermer,
}: {
  quoi: string[];
  lienFermer: string;
  libelleFermer: string;
}) {
  return (
    <div>
      <EchecLecture quoi={quoi} />
      <Link href={lienFermer} className="lien-discret">
        ← {libelleFermer}
      </Link>
    </div>
  );
}
