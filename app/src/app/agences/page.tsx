import { Check } from "lucide-react";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";
import { FormulaireListeAttenteAgences } from "./formulaire-liste-attente-agences";

export function generateMetadata() {
  return metadonneesPubliques({
    titre: "Agences de gestion — Gerimmo",
    description:
      "L’offre Gerimmo pour les agences de gestion locative est en préparation. Laissez les coordonnées de votre agence : nous vous préviendrons à son ouverture.",
    chemin: "/agences",
  });
}

// La page des agences (20/10) : depuis le 13/10, la V1 publique n'a plus d'offre agence (code et espace /agence
// conservés, hors site). Une agence qui arrive ici trouve une explication courte et un formulaire pour être prévenue.
// Aucun prix, aucune date : le dirigeant ne les a pas fixés, la page le dit telle quelle (tests/vitrine-agences.test.ts
// le garde). Les points « en préparation » décrivent ce qui EXISTE dans le code de l'espace /agence/<id> : mandats et
// versements (mandats/), rapports de gestion et écritures (comptabilite/, rapports-mensuels.ts), équipe à plusieurs
// comptes avec rôles (administration/, ROLES_GERANTS), espace locataire, carnet d'artisans (artisans/) et alertes.
// Même structure que /tarifs (en-tête `public-page-intro`), puis le bandeau à deux colonnes du contact de l'accueil.
export default function PageAgences() {
  return (
    <div className="site-public flex min-h-full flex-1 flex-col">
      <EnTetePublic />
      <main className="flex-1">
        <header className="public-page-intro"><div className="public-conteneur">
          <p className="eyebrow">Agences de gestion</p>
          <h1>Gerimmo pour les agences arrive.</h1>
          <p>La V1 de Gerimmo s’adresse aux propriétaires bailleurs et aux SCI. L’offre pour les agences de gestion locative est en préparation : laissez vos coordonnées, nous vous préviendrons à son ouverture.</p>
        </div></header>
        <section aria-labelledby="agences-titre" className="public-conteneur public-section public-contact">
          <div className="public-contact-interieur">
            <div>
              <p className="eyebrow">Ce que l’offre prépare</p>
              <h2 id="agences-titre">Votre gestion de mandats,<br />au même endroit.</h2>
              <p>Ce que les propriétaires bailleurs utilisent déjà, étendu au travail d’une agence pour ses mandants :</p>
              <ul className="public-liste">
                <li><Check aria-hidden /> Un portefeuille de mandants et de lots, avec les mandats et les versements aux mandants (en préparation).</li>
                <li><Check aria-hidden /> Les rapports de gestion et les écritures qui les accompagnent (en préparation).</li>
                <li><Check aria-hidden /> Une équipe à plusieurs comptes, avec des rôles distincts pour l’administrateur et les agents (en préparation).</li>
                <li><Check aria-hidden /> L’espace locataire, le carnet d’artisans et les alertes, tels qu’ils existent déjà pour les propriétaires.</li>
              </ul>
              <p>Date d’ouverture et tarifs ne sont pas encore fixés : les agences inscrites en sont informées en premier.</p>
            </div>
            <FormulaireListeAttenteAgences />
          </div>
        </section>
      </main>
      <PiedPublic courant="/agences" />
    </div>
  );
}
