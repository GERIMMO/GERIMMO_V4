import Link from "next/link";

// Une lecture qui échoue ne doit pas ressembler à un dossier vide.
//
// Relevé du 11/09 : 39 écrans ignoraient le champ `error` de leurs lectures et
// retombaient tous sur `?? []`. Une requête refusée produisait alors un écran
// VIDE ET RASSURANT — un parc sans biens, un bail sans échéancier. L'agent
// croyait n'avoir rien ; il avait perdu la connexion.
//
// Cet encart dit l'inverse d'un état vide : il NOMME ce qui n'a pas pu être lu
// et prévient que l'absence affichée plus bas n'est pas une absence de données.
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
// Surtout, ne pas répondre `notFound()` — l'agent croirait le dossier supprimé
// et irait le chercher ailleurs, alors que la base n'a pas répondu.
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
