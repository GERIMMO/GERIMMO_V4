import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({usePathname:()=>"/admin/brief",useSearchParams:()=>new URLSearchParams()}));
import { NavAdmin } from "@/app/admin/nav-admin";
describe("navigation : compteur inconnu distinct du zéro", () => {
  it("signale les deux sources indisponibles sans afficher 0", () => {
    const html=renderToStaticMarkup(createElement(NavAdmin,{artisansEnAttente:null,decisions:null}));
    expect(html.match(/À vérifier/g)).toHaveLength(2);
    expect(html).not.toMatch(/>0<|0 sujet|0 artisan/);
  });
  it("conserve les vrais nombres et ne transforme pas un zéro connu en panne", () => {
    const html=renderToStaticMarkup(createElement(NavAdmin,{artisansEnAttente:3,decisions:0}));
    expect(html).toContain("3 artisans à valider");expect(html).not.toContain("À vérifier");
  });
});
