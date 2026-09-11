import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Accessibilité — BARRAGE, plus seulement rapport.
//
// La version précédente lisait matrice-ecrans.json et visitait des gabarits
// (« /agence/ORG ») : aucune de ces adresses n'existe, la requête partait sur
// une organisation nommée « ORG ». Elle n'affirmait par ailleurs rien — le
// rapport pouvait se remplir sans que la suite rougisse. Résultat : au 11/09,
// vingt-neuf contrôles sans nom accessible et douze défauts de contraste
// vivaient dans l'application sans que rien ne le dise.
//
// Ici, on part de la porte d'entrée de chaque espace et on SUIT LES LIENS :
// les identifiants se résolvent d'eux-mêmes, et la couverture suit
// l'application au lieu d'une liste écrite à la main.

const SORTIE = process.env.E2E_AUDIT_DIR ?? path.join(__dirname, ".audit");
const PLAFOND = Number(process.env.E2E_A11Y_PAGES ?? 14);

// Routes qui rendent un FICHIER (PDF, CSV) : rien à auditer, et le
// téléchargement interrompt la navigation.
const FICHIERS = /\/(quittance-pdf|document|export|telecharger|api)(\/|\?)|\/fichier(\?|$)/;

const ESPACES = [
  { persona: "admin" as const, depart: "/espaces" },
  { persona: "locataire" as const, depart: "/espaces" },
  { persona: "superadmin" as const, depart: "/admin" },
  { persona: null, depart: "/" },
];

type Sans = { chemin: string; persona: string; quoi: string; ou: string };
type Violation = { chemin: string; persona: string; regle: string; impact: string; ou: string; nb: number };

const sansNom: Sans[] = [];
const violations: Violation[] = [];
const visitees: string[] = [];

/**
 * Nom accessible d'un contrôle (algorithme accname, réduit à ce qui sert aux
 * formulaires). Le placeholder est le dernier recours de la spécification :
 * on le distingue, parce qu'il DISPARAÎT à la première frappe — ce n'est pas
 * un libellé, c'est un exemple.
 */
const RELEVE = () => {
  const txt = (n: Element | null) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();
  const nomAccessible = (el: Element) => {
    const lb = el.getAttribute("aria-labelledby");
    if (lb) {
      const t = lb.split(/\s+/).map((id) => txt(document.getElementById(id))).filter(Boolean).join(" ");
      if (t) return { nom: t, via: "aria-labelledby" };
    }
    const al = el.getAttribute("aria-label");
    if (al?.trim()) return { nom: al.trim(), via: "aria-label" };
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (txt(l)) return { nom: txt(l), via: "label[for]" };
    }
    const anc = el.closest("label");
    if (anc && txt(anc)) return { nom: txt(anc), via: "label ancêtre" };
    const ti = el.getAttribute("title");
    if (ti?.trim()) return { nom: ti.trim(), via: "title" };
    const ph = el.getAttribute("placeholder");
    if (ph?.trim()) return { nom: ph.trim(), via: "placeholder" };
    return { nom: "", via: "aucun" };
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden";
  };
  const chemin = (el: Element) => {
    const p: string[] = [];
    for (let n: Element | null = el; n && p.length < 4; n = n.parentElement) {
      const c = typeof n.className === "string" ? n.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      p.unshift(n.tagName.toLowerCase() + (c ? "." + c : ""));
    }
    return p.join(" > ");
  };

  const manques: { quoi: string; ou: string }[] = [];
  for (const el of document.querySelectorAll("input, select, textarea")) {
    const t = (el as HTMLInputElement).type;
    if (t === "hidden" || el.closest("[aria-hidden='true']") || el.getAttribute("aria-hidden") === "true") continue;
    if (!visible(el)) continue;
    const { nom, via } = nomAccessible(el);
    const nomChamp = (el as HTMLInputElement).name || "(sans name)";
    if (!nom) manques.push({ quoi: `${el.tagName.toLowerCase()} « ${nomChamp} » n'a aucun nom accessible`, ou: chemin(el) });
    else if (via === "placeholder")
      manques.push({ quoi: `${el.tagName.toLowerCase()} « ${nomChamp} » n'est nommé que par son placeholder (« ${nom} »)`, ou: chemin(el) });
  }
  const liens = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
  return { manques, liens };
};

async function parcourir(browser: Browser, persona: string | null, depart: string) {
  const context = await browser.newContext({
    storageState: persona ? path.join(__dirname, ".auth", `${persona}.json`) : undefined,
  });
  // La synthèse d'alertes s'ouvre à la première page de chaque session et
  // recouvrirait les contrôles : on la marque « déjà vue », par son propre
  // mécanisme.
  await context.addInitScript(() => {
    try { sessionStorage.setItem("gerimmo-synthese-alertes-vue", "1"); } catch {}
  });
  const page: Page = await context.newPage();
  const vus = new Set<string>();
  const file = [depart];
  const qui = persona ?? "public";

  while (file.length && vus.size < PLAFOND) {
    const chemin = file.shift()!;
    if (vus.has(chemin) || FICHIERS.test(chemin)) continue;
    vus.add(chemin);
    const rep = await page.goto(chemin, { waitUntil: "domcontentloaded", timeout: 25_000 }).catch(() => null);
    if (!rep || rep.status() >= 400) continue;
    // Mesurer avant le rendu ferait dire n'importe quoi à la sonde : on attend
    // le réseau au repos, puis le premier titre.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForSelector("h1, [role='heading']", { timeout: 5_000 }).catch(() => {});
    const url = new URL(page.url());
    const reel = url.pathname + url.search;
    vus.add(reel);
    visitees.push(`${qui} ${reel}`);

    const { manques, liens } = await page.evaluate(RELEVE);
    for (const m of manques) sansNom.push({ chemin: reel, persona: qui, ...m });

    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of axe.violations) {
      if (!["serious", "critical"].includes(v.impact ?? "")) continue;
      violations.push({
        chemin: reel, persona: qui, regle: v.id, impact: v.impact ?? "",
        ou: v.nodes[0]?.target.join(" ") ?? "", nb: v.nodes.length,
      });
    }
    for (const l of liens) {
      if (!l?.startsWith("/") || l.startsWith("//")) continue;
      const p = l.split("#")[0];
      if (p && !vus.has(p) && !FICHIERS.test(p)) file.push(p);
    }
  }
  await context.close();
}

test.describe.serial("accessibilité", () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(60_000 + ESPACES.length * PLAFOND * 12_000);
    for (const { persona, depart } of ESPACES) await parcourir(browser, persona, depart);
    fs.mkdirSync(SORTIE, { recursive: true });
    fs.writeFileSync(
      path.join(SORTIE, "rapport-a11y.json"),
      JSON.stringify({ visitees, sansNom, violations }, null, 2)
    );
  });

  test("le parcours a bien vu des pages (sinon les assertions ne prouvent rien)", () => {
    expect(visitees.length).toBeGreaterThanOrEqual(12);
  });

  test("aucun contrôle sans nom accessible, ni nommé par son seul placeholder", () => {
    expect(sansNom.map((s) => `${s.persona} ${s.chemin} — ${s.quoi} [${s.ou}]`)).toEqual([]);
  });

  test("axe-core : aucune violation sérieuse ou critique (WCAG 2.0/2.1 A et AA)", () => {
    expect(violations.map((v) => `${v.persona} ${v.chemin} — ${v.regle} (${v.impact}, ${v.nb}) [${v.ou}]`)).toEqual([]);
  });
});
