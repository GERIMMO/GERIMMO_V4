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
const MESSAGE = "Des modifications ne sont pas encore enregistrées. Quitter cette page et les abandonner ?";

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
function eligible(formulaire: HTMLFormElement): boolean {
  return /^\/(agence|artisan|locataire|admin|assistance|compte)(\/|$)/.test(location.pathname)
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
    const lien = event.target.closest<HTMLAnchorElement>("a[href]");
    if (!lien || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || lien.hasAttribute("download") || (lien.target && lien.target !== "_self")) return;
    const cible = new URL(lien.href, location.href);
    if (!["http:", "https:"].includes(cible.protocol)) return;
    if (cible.origin === location.origin && cible.pathname === location.pathname && cible.search === location.search && cible.hash) return;
    if (!saisiesModifiees().length) return;
    if (!window.confirm(MESSAGE)) { event.preventDefault(); event.stopPropagation(); }
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
      if (!explicite || !window.confirm(MESSAGE)) { event.preventDefault(); return; }
    }
    setTimeout(() => { if (!event.defaultPrevented && formulaire.isConnected) suivi.initial = empreinte(formulaire); }, 0);
  };
  // Les navigateurs prenant en charge Navigation permettent d'annuler Retour
  // avant de démonter la page. Pas de faux ajout dans l'historique en repli.
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  const naviguer = (event: Event) => {
    const e = event as Event & { navigationType?: string; canIntercept?: boolean; hashChange?: boolean };
    if (e.navigationType === "traverse" && e.canIntercept && !e.hashChange && saisiesModifiees().length) {
      if (!window.confirm(MESSAGE)) e.preventDefault(); else autoriser();
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
