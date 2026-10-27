/** État éphémère uniquement : aucune valeur de ces formulaires n'est écrite sur disque. */
type Champ = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Empreinte = Map<Champ, string>;
type Suivi = { initial: Empreinte };
const suivis = new Map<HTMLFormElement, Suivi>();
type Envoi = { formulaire: HTMLFormElement; valeurs: Empreinte };
const soumissions = new WeakMap<FormData, Envoi>();
const aRelier = new Map<string, Envoi>();
const CLE_CLIENT = "__gerimmo_saisie_client";
/** FormDataEvent expose une autre instance que new FormData(form). Le repère
 * éphémère circule dans leur liste commune puis est retiré AVANT l'action. */
export function relierSoumission(donnees: FormData) {
  const cle = donnees.get(CLE_CLIENT);
  if (typeof cle === "string") {
    const envoi = aRelier.get(cle);
    if (envoi) soumissions.set(donnees, envoi);
    aRelier.delete(cle);
    donnees.delete(CLE_CLIENT);
  }
}
const identitesFichiers = new WeakMap<File, number>();
let numeroFichier = 0;
/** Aussi dit par le garde de la copie locale (lib/garde-copie-locale.ts) : un seul texte pour « quitter cette page ». */
export const MESSAGE_QUITTER = "Des modifications ne sont pas encore enregistrées. Quitter cette page et les abandonner ?";
/** Le même avertissement lorsqu'un clic sur le voile refermerait une fenêtre et sa saisie (lib/use-fenetre-modale.ts). */
export const MESSAGE_FERMER_FENETRE = "Des modifications ne sont pas encore enregistrées. Fermer cette fenêtre et les abandonner ?";

export type ClicSurLien = Pick<MouseEvent, "defaultPrevented" | "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;
export type LienClique = { href: string; target: string; download: boolean };
/**
 * Ce clic sur ce lien quitte-t-il la page ? Clic simple, même onglet, hors téléchargement, schéma web, et hors simple
 * changement de fragment sur la même page. `page` est l'adresse courante (`location.href`). Pur : les gardes de départ
 * (formulaires suivis ici, copie locale dans lib/garde-copie-locale.ts) s'accordent ainsi sur ce qu'est « quitter ».
 */
export function clicQuitteLaPage(clic: ClicSurLien, lien: LienClique, page: string): boolean {
  if (clic.defaultPrevented || clic.button || clic.metaKey || clic.ctrlKey || clic.shiftKey || clic.altKey
    || lien.download || (lien.target && lien.target !== "_self")) return false;
  const cible = new URL(lien.href, page), courante = new URL(page);
  if (!["http:", "https:"].includes(cible.protocol)) return false;
  return !(cible.origin === courante.origin && cible.pathname === courante.pathname && cible.search === courante.search && cible.hash);
}
/** `clicQuitteLaPage` pour un événement du document : le clic part-il d'un lien qui quitte la page ? */
export function lienQuittantLaPage(event: MouseEvent): boolean {
  if (!(event.target instanceof Element)) return false;
  const lien = event.target.closest<HTMLAnchorElement>("a[href]");
  return !!lien && clicQuitteLaPage(event, { href: lien.href, target: lien.target, download: lien.hasAttribute("download") }, location.href);
}

function estChamp(element: EventTarget | null): element is Champ {
  return element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement;
}
function champs(formulaire: HTMLFormElement): Champ[] {
  return Array.from(formulaire.elements).filter((e): e is Champ => estChamp(e) && Boolean(e.name)
    && !["hidden", "submit", "button", "reset", "password", "search"].includes(e.type));
}
function valeur(champ: Champ): string {
  if (champ instanceof HTMLInputElement) {
    if (champ.type === "file") return JSON.stringify(Array.from(champ.files ?? []).map(f => {
      if (!identitesFichiers.has(f)) identitesFichiers.set(f, ++numeroFichier);
      return [identitesFichiers.get(f), f.name, f.size, f.lastModified, f.type];
    }));
    if (["checkbox", "radio"].includes(champ.type)) return String(champ.checked);
  }
  if (champ instanceof HTMLSelectElement) return JSON.stringify(Array.from(champ.selectedOptions).map(o => o.value));
  return champ.value;
}
function empreinte(formulaire: HTMLFormElement): Empreinte {
  return new Map(champs(formulaire).map(c => [c, valeur(c)]));
}
/**
 * Quels formulaires sont suivis. Chaque `<form` du code dit lequel il est (tests/protection-saisie-formulaires.test.ts) :
 *   - `data-saisie-confirmee` : saisie à protéger. Le formulaire confirme ses envois (useActionFormulaire,
 *     useActionStateProtegee) ; il n'avertit plus une fois la saisie enregistrée.
 *   - `data-saisie-libre` : volontairement jamais suivi. Déconnexion, code à usage unique, mot de passe, bouton seul
 *     sans champ, formulaire d'une page publique, formulaire qui ne peut pas se confirmer. L'attribut l'emporte sur
 *     `data-saisie-confirmee`.
 *   - un filtre (`method="get"`, `role="search"`) n'est jamais suivi non plus.
 */
export function eligible(formulaire: HTMLFormElement): boolean {
  // Décision D27 : « espace » est l'adresse des écrans du propriétaire direct (/espace/<id>/…). Sans lui, sa saisie
  // cessait d'être protégée dès que ses écrans ont quitté /agence (relevé par protection-saisie.spec.ts).
  return /^\/(agence|espace|artisan|locataire|admin|assistance|compte)(\/|$)/.test(location.pathname)
    // Audit du 13/10 (PR178-A-02, PR178-B-05) : seuls les formulaires qui déclarent pouvoir confirmer un envoi
    // sont suivis. Un filtre ou une recherche sans attribut method ne se « confirme » jamais : il restait
    // « modifié » et la boîte « Quitter le site ? » s'ouvrait à chaque validation, « Rester » bloquant le filtre.
    // Audit du 13/10 (VER-PR178-01) : cette liste blanche avait désarmé une trentaine de vrais formulaires de saisie ;
    // les filtres sont maintenant marqués `data-saisie-libre`, et un test refuse tout `<form` sans marqueur.
    && formulaire.hasAttribute("data-saisie-confirmee")
    && !formulaire.hasAttribute("data-saisie-libre")
    && formulaire.getAttribute("method")?.toLowerCase() !== "get"
    && formulaire.getAttribute("role") !== "search"
    && !formulaire.closest('[data-protection-saisie="locale"]');
}
function suivre(formulaire: HTMLFormElement) {
  if (eligible(formulaire) && !suivis.has(formulaire)) suivis.set(formulaire, { initial: empreinte(formulaire) });
}
function modifie(formulaire: HTMLFormElement, suivi: Suivi): boolean {
  // Une étape masquée reste montée : son contenu ne doit pas être oublié.
  return [...empreinte(formulaire)].some(([c, v]) => suivi.initial.has(c) && suivi.initial.get(c) !== v);
}
export function saisiesModifiees(): HTMLFormElement[] {
  const resultat: HTMLFormElement[] = [];
  for (const [formulaire, suivi] of suivis) {
    if (!formulaire.isConnected) suivis.delete(formulaire);
    else if (modifie(formulaire, suivi)) resultat.push(formulaire);
  }
  return resultat;
}
/** Reliée à la FormData effectivement envoyée, jamais à « tous les formulaires ». */
export function preparerSoumission(formulaire: HTMLFormElement, donnees: FormData) {
  suivre(formulaire);
  relierSoumission(donnees);
  soumissions.set(donnees, { formulaire, valeurs: new Map([...empreinte(formulaire)].filter(([c]) => !c.matches(":disabled"))) });
}
export function confirmerSoumission(donnees: FormData) {
  relierSoumission(donnees);
  const envoi = soumissions.get(donnees);
  const suivi = envoi && suivis.get(envoi.formulaire);
  if (!envoi) return false;
  if (!suivi) return true;
  // Une réponse tardive ne valide ni une autre étape ni une saisie plus récente.
  for (const [champ, valeur] of envoi.valeurs) suivi.initial.set(champ, valeur);
  soumissions.delete(donnees);
  return !modifie(envoi.formulaire, suivi);
}
export function retourConfirme(retour: unknown): boolean {
  return !!retour && typeof retour === "object" && "succes" in retour && !!retour.succes
    && !("erreur" in retour && retour.erreur);
}

export function installerProtectionSaisie(): () => void {
  let departAutorise = false;
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const enSoumission = new WeakSet<HTMLFormElement>();
  const submit = (event: Event) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    const formulaire = event.target;
    enSoumission.add(formulaire);
    setTimeout(() => enSoumission.delete(formulaire), 0);
  };
  const resetsExplicites = new WeakSet<HTMLFormElement>();
  const preparer = (event: Event) => {
    const cible = event.target;
    if (estChamp(cible) && cible.form) suivre(cible.form);
  };
  const changer = (event: Event) => {
    const cible = event.target;
    if (!estChamp(cible) || !cible.form || !eligible(cible.form)) return;
    // focus/pointer/keydown capturent la valeur avant le premier geste. Un champ
    // ajouté dynamiquement est suivi dès sa première interaction.
    const dejaSuivi = suivis.has(cible.form);
    suivre(cible.form);
    const suivi = suivis.get(cible.form)!;
    if (!dejaSuivi || !suivi.initial.has(cible)) suivi.initial.set(cible, cible instanceof HTMLSelectElement
      ? JSON.stringify(Array.from(cible.options).filter(o => o.defaultSelected).map(o => o.value))
      : cible instanceof HTMLInputElement && ["checkbox", "radio"].includes(cible.type)
        ? String(cible.defaultChecked) : cible instanceof HTMLInputElement && cible.type === "file" ? "[]" : cible.defaultValue);
  };
  const formdata = (event: Event) => {
    if (!(event instanceof FormDataEvent) || !(event.target instanceof HTMLFormElement) || !eligible(event.target)
      || !event.target.hasAttribute("data-saisie-confirmee") || !enSoumission.has(event.target)) return;
    preparerSoumission(event.target, event.formData);
    const envoi = soumissions.get(event.formData)!;
    const cle = crypto.randomUUID();
    // Borné au navigateur courant ; nettoyé à chaque action ou démontage.
    if (aRelier.size >= 100) aRelier.delete(aRelier.keys().next().value!);
    aRelier.set(cle, envoi);
    event.formData.set(CLE_CLIENT, cle);
  };
  const avantSortie = (event: BeforeUnloadEvent) => {
    if (!departAutorise && saisiesModifiees().length) { event.preventDefault(); event.returnValue = ""; }
  };
  const autoriser = () => {
    departAutorise = true;
    clearTimeout(minuterie);
    minuterie = setTimeout(() => { departAutorise = false; }, 1500);
  };
  const clic = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const reset = event.target.closest<HTMLButtonElement | HTMLInputElement>('button[type="reset"],input[type="reset"]');
    if (reset?.form) { resetsExplicites.add(reset.form); return; }
    if (!lienQuittantLaPage(event) || !saisiesModifiees().length) return;
    if (!window.confirm(MESSAGE_QUITTER)) { event.preventDefault(); event.stopPropagation(); }
    else autoriser();
  };
  const reset = (event: Event) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    const formulaire = event.target, suivi = suivis.get(formulaire);
    if (!suivi) return;
    if (modifie(formulaire, suivi)) {
      // React réinitialise aussi après un retour métier en erreur. Garder la
      // saisie tant que l'action n'a pas confirmé cette version du formulaire.
      const explicite = resetsExplicites.has(formulaire);
      resetsExplicites.delete(formulaire);
      if (!explicite || !window.confirm(MESSAGE_QUITTER)) { event.preventDefault(); return; }
    }
    setTimeout(() => { if (!event.defaultPrevented && formulaire.isConnected) suivi.initial = empreinte(formulaire); }, 0);
  };
  // Les navigateurs prenant en charge Navigation permettent d'annuler Retour
  // avant de démonter la page. Pas de faux ajout dans l'historique en repli.
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  const naviguer = (event: Event) => {
    const e = event as Event & { navigationType?: string; canIntercept?: boolean; hashChange?: boolean };
    if (e.navigationType === "traverse" && e.canIntercept && !e.hashChange && saisiesModifiees().length) {
      if (!window.confirm(MESSAGE_QUITTER)) e.preventDefault(); else autoriser();
    }
  };
  for (const nom of ["focusin", "pointerdown", "keydown"]) document.addEventListener(nom, preparer, true);
  for (const nom of ["input", "change"]) document.addEventListener(nom, changer, true);
  document.addEventListener("submit", submit, true);
  document.addEventListener("formdata", formdata, true);
  document.addEventListener("click", clic, true);
  document.addEventListener("reset", reset, true);
  window.addEventListener("beforeunload", avantSortie);
  navigation?.addEventListener("navigate", naviguer);
  return () => {
    for (const nom of ["focusin", "pointerdown", "keydown"]) document.removeEventListener(nom, preparer, true);
    for (const nom of ["input", "change"]) document.removeEventListener(nom, changer, true);
    document.removeEventListener("submit", submit, true);
    document.removeEventListener("formdata", formdata, true);
    document.removeEventListener("click", clic, true);
    document.removeEventListener("reset", reset, true);
    window.removeEventListener("beforeunload", avantSortie);
    navigation?.removeEventListener("navigate", naviguer);
    clearTimeout(minuterie); suivis.clear(); aRelier.clear();
  };
}
