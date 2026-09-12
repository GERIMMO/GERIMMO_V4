/**
 * Aperçus du produit pour la vitrine.
 *
 * Ce ne sont pas des captures d'écran : ce sont des maquettes construites avec
 * les VRAIES classes de l'application (.kpi, .rang-alerte, .puce, .tableau) et
 * les vrais jetons de la charte. Deux conséquences voulues :
 *   — elles ne peuvent pas mentir sur l'allure du produit, puisqu'elles en
 *     partagent la feuille de style ;
 *   — elles suivent la marque blanche : une agence qui change ses couleurs
 *     change aussi ses aperçus.
 * Les chiffres montrés sont des EXEMPLES et le disent (aria-label + légende) ;
 * aucun n'est présenté comme une statistique de Gerimmo.
 */

export function ApercuTableauDeBord() {
  return (
    <div
      className="rounded-[3px] border border-[var(--filet)] bg-[var(--ivoire)] p-3 shadow-[var(--ombre-flottante)]"
      role="img"
      aria-label="Aperçu du tableau de bord : trois indicateurs, puis la liste des échéances du jour."
    >
      {/* Barre de fenêtre : trois pastilles, comme une application posée */}
      <div className="mb-3 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-[var(--filet)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--filet)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--filet)]" />
        <span className="mono-discret ml-2 !text-[9px]">Tableau de bord</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="kpi vert !p-2.5">
          <span className="libelle-champ">Encaissé</span>
          <div className="chiffre montant !text-[22px]">4 180 €</div>
          <span className="mono-discret !text-[9px] sans-majuscules">sur 4 780 € appelés</span>
        </div>
        <div className="kpi or !p-2.5">
          <span className="libelle-champ">Occupation</span>
          <div className="chiffre !text-[22px]">6/7</div>
          <span className="mono-discret !text-[9px] sans-majuscules">un lot disponible</span>
        </div>
        <div className="kpi rouge !p-2.5">
          <span className="libelle-champ">À traiter</span>
          <div className="chiffre !text-[22px]">3</div>
          <span className="mono-discret !text-[9px] sans-majuscules">dont 1 critique</span>
        </div>
      </div>

      <div className="mt-3 border border-[var(--filet)] bg-[var(--ivoire)]">
        <div className="tete-liste !py-2">
          <span className="libelle-champ">À faire aujourd&apos;hui</span>
          <span className="mono-discret !text-[9px]">3</span>
        </div>
        <div className="rang-alerte critique !py-2">
          {/* L'aperçu montre le produit QUI EXISTE : étiquette AU-DESSUS du
              titre, comme sur le plan du jour et l'écran Alertes. Côte à côte,
              la rangée en flex renvoyait le titre à droite — un dessin qu'on
              ne trouve nulle part dans l'application. */}
          <div className="min-w-0 flex-1">
            <span className="etiquette-alerte">Critique</span>
            <div className="mt-1 text-[12px] font-semibold text-[var(--corps)]">
              Assurance expirée — 12 rue des Lilas, lot B
            </div>
          </div>
        </div>
        <div className="rang-alerte normale !py-2">
          {/* L'aperçu montre le produit QUI EXISTE : étiquette AU-DESSUS du
              titre, comme sur le plan du jour et l'écran Alertes. Côte à côte,
              la rangée en flex renvoyait le titre à droite — un dessin qu'on
              ne trouve nulle part dans l'application. */}
          <div className="min-w-0 flex-1">
            <span className="etiquette-alerte">À faire</span>
            <div className="mt-1 text-[12px] font-semibold text-[var(--corps)]">
              Incident à qualifier — fuite sous évier
            </div>
          </div>
        </div>
        <div className="rang-alerte !py-2">
          {/* L'aperçu montre le produit QUI EXISTE : étiquette AU-DESSUS du
              titre, comme sur le plan du jour et l'écran Alertes. Côte à côte,
              la rangée en flex renvoyait le titre à droite — un dessin qu'on
              ne trouve nulle part dans l'application. */}
          <div className="min-w-0 flex-1">
            <span className="etiquette-alerte">À faire</span>
            <div className="mt-1 text-[12px] font-semibold text-[var(--corps)]">
              État des lieux de sortie à planifier
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] text-[var(--libelle)]">
        Exemple d&apos;affichage — données fictives
      </p>
    </div>
  );
}

export function ApercuQuittance() {
  return (
    <div
      className="rounded-[3px] border border-[var(--filet)] bg-[var(--ivoire)] p-4 shadow-[var(--ombre-portee)]"
      role="img"
      aria-label="Aperçu d'une quittance de loyer : période, détail loyer et charges, total acquitté."
    >
      <div className="flex items-baseline justify-between border-b border-[var(--filet)] pb-2">
        <span className="font-heading text-[15px] text-[var(--encre)]">Quittance de loyer</span>
        <span className="mono-discret !text-[9px]">Mars 2026</span>
      </div>
      <div className="tableau-defilant mt-2">
        <table className="tableau !text-[12px]">
          <tbody>
            <tr>
              <td>Loyer hors charges</td>
              <td className="nombre montant">720,00 €</td>
            </tr>
            <tr>
              <td>Provision pour charges</td>
              <td className="nombre montant">60,00 €</td>
            </tr>
            <tr className="total">
              <td>Total acquitté</td>
              <td className="nombre montant">780,00 €</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--texte-secondaire)]">
        Émise automatiquement à l&apos;encaissement. Un paiement partiel produit un
        reçu, promu en quittance une fois le mois soldé.
      </p>
      <p className="mt-2 text-[10px] text-[var(--libelle)]">Exemple — données fictives</p>
    </div>
  );
}

export function ApercuMobileIncident() {
  return (
    <div
      className="mx-auto w-[210px] rounded-[20px] border-[6px] border-[var(--encre)] bg-[var(--creme)] p-2.5 shadow-[var(--ombre-flottante)]"
      role="img"
      aria-label="Aperçu de l'espace locataire sur téléphone : signalement d'un incident avec photo."
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="mono-discret !text-[8px]">Mon logement</span>
        <span className="puce puce-prep !text-[8px]">En cours</span>
      </div>
      <div className="border border-[var(--filet)] bg-[var(--ivoire)] p-2.5">
        <span className="libelle-champ">Signaler un incident</span>
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--corps)]">
          Fuite sous l&apos;évier de la cuisine
        </p>
        <div className="mt-2 grid grid-cols-3 gap-1">
          <div className="aspect-square bg-[var(--filet-leger)]" />
          <div className="aspect-square bg-[var(--filet-leger)]" />
          <div className="flex aspect-square items-center justify-center border border-dashed border-[var(--filet)] text-[14px] text-[var(--libelle)]">
            +
          </div>
        </div>
        <div className="btn-or mt-2.5 w-full justify-center !py-1.5 !text-[11px]">Envoyer</div>
      </div>
      <p className="mt-2 text-center text-[9px] leading-snug text-[var(--texte-secondaire)]">
        Photo à l&apos;appui, compressée à la prise
      </p>
    </div>
  );
}
