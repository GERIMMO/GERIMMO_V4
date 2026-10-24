/**
 * Relecture transverse 3 du 24/10 (M2, agences hors V1) : en franchise de TVA, le récapitulatif d'une agence n'affiche
 * ni « HT », ni une ligne de TVA à zéro, ni « Total à payer TTC » (plan du 23/10, R55) ; un seul total, la mention de
 * franchise dessous. Une TVA qui s'ajoute garde le détail HT, TVA, TTC.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/racine-espace-contexte", () => ({ useRacineEspace: () => "/agence/org" }));
vi.mock("@/app/actions/abonnement", () => ({}));

import { DetailMontants } from "@/app/agence/[orgId]/abonnement/formulaire-souscription";
import { offreAgence } from "@/lib/tarifs";

const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("récapitulatif d'une agence", () => {
  it("franchise : « Total à payer », sans HT, sans TVA à zéro, sans TTC, avec la mention de franchise", () => {
    const html = texte(renderToStaticMarkup(createElement(DetailMontants, { offre: offreAgence(30), regime: { nature: "franchise" } })));
    expect(html).toContain("Total à payer");
    expect(html).not.toContain("HT");
    expect(html).not.toContain("TTC");
    expect(html).not.toMatch(/TVA 0,00/);
    expect(html).toContain("TVA non applicable, art. 293 B du CGI.");
  });
  it("assujetti : le détail HT, TVA, TTC reste", () => {
    const html = texte(renderToStaticMarkup(createElement(DetailMontants, { offre: offreAgence(30), regime: { nature: "assujetti", tauxPourcent: 20 } })));
    expect(html).toContain("Total HT");
    expect(html).toContain("TVA");
    expect(html).toContain("Total à payer TTC");
  });
});
