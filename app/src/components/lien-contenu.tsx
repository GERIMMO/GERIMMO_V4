"use client";

/** Évite de parcourir tout le menu à chaque changement de page au clavier. */
export function LienContenu() {
  return (
    <a
      href="#contenu-espace"
      className="lien-contenu"
      onClick={(event) => {
        const contenu = document.querySelector<HTMLElement>(".coquille-corps main");
        if (!contenu) return;
        event.preventDefault();
        const ancienTabIndex = contenu.getAttribute("tabindex");
        contenu.setAttribute("tabindex", "-1");
        contenu.focus();
        contenu.addEventListener("blur", () => {
          if (ancienTabIndex === null) contenu.removeAttribute("tabindex");
          else contenu.setAttribute("tabindex", ancienTabIndex);
        }, { once: true });
      }}
    >
      Aller au contenu
    </a>
  );
}
