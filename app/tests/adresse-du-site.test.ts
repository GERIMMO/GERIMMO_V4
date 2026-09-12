/**
 * L'adresse publique du produit — une source, deux priorités opposées.
 *
 * CE QUE CES TESTS PROTÈGENT, ET POURQUOI LES DEUX SENS SONT JUSTES.
 *
 * `adresseDuSite()` sert un e-mail parti d'une tâche planifiée : il n'y a
 * AUCUNE requête, donc rien d'autre à lire que la configuration.
 *
 * `origineDeRetour()` sert le retour d'un paiement Stripe : la requête existe,
 * et elle sait d'où vient la personne. Lire la configuration d'abord ramènerait
 * en PRODUCTION quelqu'un qui payait depuis une préproduction — exactement ce
 * que le commentaire de `origineDeLaRequete` promettait d'éviter depuis le
 * début, pendant que le code faisait le contraire (relevé du 12/09).
 *
 * Le piège est discret : il ne se déclenche que si `NEXT_PUBLIC_SITE_URL` est
 * posée sur TOUS les environnements Vercel, ce que personne ne pense à éviter.
 */
import { afterEach, describe, expect, it } from "vitest";
import { adresseDuSite, domaineDuSite, origineDeRetour } from "../src/lib/site";

const site = process.env.NEXT_PUBLIC_SITE_URL;
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;

afterEach(() => {
  if (site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = site;
  if (vercel === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  else process.env.VERCEL_PROJECT_PRODUCTION_URL = vercel;
});

function sansConfiguration() {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
}

describe("adresseDuSite — pour ce qui part sans requête", () => {
  it("la valeur choisie prime, sans barre oblique finale", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://gerimmo.app/";
    expect(adresseDuSite()).toBe("https://gerimmo.app");
  });

  it("à défaut, l'adresse que Vercel se donne — juste, mais laide", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "gerimmo-v4.vercel.app";
    expect(adresseDuSite()).toBe("https://gerimmo-v4.vercel.app");
  });

  it("sans rien, null — l'appelant décide, et il vaut mieux pas de lien", () => {
    sansConfiguration();
    expect(adresseDuSite()).toBeNull();
  });
});

describe("domaineDuSite — pour ce qui s'IMPRIME", () => {
  it("rend le domaine nu : « https:// » est du bruit au pied d'un bail", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://gerimmo.app";
    expect(domaineDuSite()).toBe("gerimmo.app");
  });

  it("un sous-domaine suit sans qu'on y repense", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.gerimmo.app";
    expect(domaineDuSite()).toBe("app.gerimmo.app");
  });

  it("sans configuration, la marque — un bail doit dire d'où il vient", () => {
    sansConfiguration();
    expect(domaineDuSite()).toBe("gerimmo.app");
  });
});

describe("origineDeRetour — l'en-tête prime, et c'est l'inverse", () => {
  it("renvoie là d'où l'on vient, MÊME si la configuration dit autre chose", () => {
    // Le cas qui coûte de l'argent : une préproduction, et la variable posée
    // sur tous les environnements.
    process.env.NEXT_PUBLIC_SITE_URL = "https://gerimmo.app";
    expect(origineDeRetour("gerimmo-v4-git-recette.vercel.app", "https")).toBe(
      "https://gerimmo-v4-git-recette.vercel.app"
    );
  });

  it("en production, les deux disent la même chose", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://gerimmo.app";
    expect(origineDeRetour("gerimmo.app", "https")).toBe("https://gerimmo.app");
  });

  it("en local, http — sinon le navigateur refuse le retour", () => {
    expect(origineDeRetour("localhost:3000", null)).toBe("http://localhost:3000");
  });

  it("hors localhost et sans protocole annoncé, https", () => {
    expect(origineDeRetour("gerimmo.app", null)).toBe("https://gerimmo.app");
  });

  it("sans en-tête d'hôte, la configuration sert de filet", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://gerimmo.app";
    expect(origineDeRetour(null, null)).toBe("https://gerimmo.app");
  });

  it("sans en-tête NI configuration, null — l'action le dit à l'écran", () => {
    sansConfiguration();
    expect(origineDeRetour(null, null)).toBeNull();
  });
});
