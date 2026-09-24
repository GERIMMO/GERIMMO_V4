"use client";

import type { ReactNode } from "react";
import { MarqueOrganisation } from "@/components/marque-organisation";
import { couleurValide, logoAffichable, styleMarque } from "@/lib/marque-organisation";
import { useActionState } from "react";
import {
  modifierProfilOrganisation,
  type EtatProfilOrganisation,
} from "@/app/actions/organisation";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Organisation = {
  name: string;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  telephone: string | null;
  email_contact: string | null;
  siret: string | null;
  carte_pro: string | null;
  garantie_financiere: string | null;
  iban: string | null;
  tva_intracom: string | null;
  tva_franchise: boolean;
  quittances_envoi_auto: boolean;
  appels_envoi_auto: boolean;
  relances_envoi_auto: boolean;
  relance_1_jours: number;
  relance_2_jours: number;
  logo_url: string | null;
  couleur_primaire: string | null;
  couleur_secondaire: string | null;
  domaine_personnalise: string | null;
  domaine_personnalise_verifie_le: string | null;
  email_expediteur_verifie_le: string | null;
  email_expediteur: string | null;
  nom_portail: string | null;
};

// Couleurs de la charte Gerimmo, reprises tant que l'organisation n'a pas
// choisi les siennes.
const COULEUR_PRINCIPALE = "#2457f5";
const COULEUR_FONCEE = "#0f2352";

// 24/09 : même accent sur toutes les cases du profil — deux couleurs
// (marque, encre) ne distinguaient rien.
const CASE = "size-5 shrink-0 accent-[var(--marque)]";

export function FormulaireProfilOrganisation({
  orgId,
  organisation,
  lectureSeule,
  estProprietaire,
}: {
  orgId: string;
  organisation: Organisation;
  lectureSeule: boolean;
  estProprietaire: boolean;
}) {
  // 24/09 : en lecture seule, une fiche à lire plutôt qu'un formulaire
  // désactivé — champs estompés à 50 %, sélecteur de fichier et couleurs
  // inutilisables, et des exemples qu'on prenait pour des valeurs.
  if (lectureSeule) {
    return <FicheProfil organisation={organisation} estProprietaire={estProprietaire} />;
  }
  return <Formulaire orgId={orgId} organisation={organisation} estProprietaire={estProprietaire} />;
}

// 24/09 : les quatre sous-blocs du formulaire sont des sous-sections sans
// cadre — un filet au-dessus, un sur-titre — et non plus des cadres emboîtés
// dans la carte, légende à cheval sur la bordure, qu'aucune autre page
// n'employait. Le filet est porté par le conteneur : posé sur le <fieldset>,
// il serait de nouveau interrompu par la légende.
function SousSection({ titre, id, children }: { titre: string; id?: string; children: ReactNode }) {
  return (
    <div id={id} className="sous-section">
      <fieldset className="space-y-3">
        <legend className="eyebrow">{titre}</legend>
        {children}
      </fieldset>
    </div>
  );
}

function Formulaire({
  orgId,
  organisation,
  estProprietaire,
}: {
  orgId: string;
  organisation: Organisation;
  estProprietaire: boolean;
}) {
  const [etat, action] = useActionState<EtatProfilOrganisation, FormData>(
    modifierProfilOrganisation.bind(null, orgId),
    {}
  );
  // En erreur, la saisie est reposée via etat.valeurs (convention React 19)
  const valeur = (
    nom: Exclude<
      keyof Organisation,
      | "quittances_envoi_auto"
      | "appels_envoi_auto"
      | "relances_envoi_auto"
      | "relance_1_jours"
      | "relance_2_jours"
      | "tva_franchise"
    >
  ) =>
    etat.valeurs?.[nom] ?? organisation[nom] ?? "";

  // 24/09 : un exemple se dit exemple (« ex. … ») — « 12 rue des Lilas » ou
  // « Galian, 120 000 € » seuls passaient pour des valeurs déjà saisies.
  // Un seul marquage des champs obligatoires, l'astérisque, et sa légende.
  return (
    <form action={action} className="space-y-4">
      <p className="text-xs text-muted-foreground">* champ obligatoire</p>
      <div className="space-y-2">
        <Label htmlFor="pr-nom">{estProprietaire ? "Nom du parc *" : "Nom de l'agence *"}</Label>
        <Input id="pr-nom" name="name" required defaultValue={valeur("name")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pr-adresse">Adresse *</Label>
        <Input
          id="pr-adresse"
          name="address_line1"
          required
          defaultValue={valeur("address_line1")}
          placeholder="ex. 12 rue des Lilas"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pr-cp">Code postal *</Label>
          <Input
            id="pr-cp"
            name="postal_code"
            required
            inputMode="numeric"
            autoComplete="postal-code"
            defaultValue={valeur("postal_code")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pr-ville">Ville *</Label>
          <Input id="pr-ville" name="city" required defaultValue={valeur("city")} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pr-tel">Téléphone</Label>
          {/* Au doigt, `tel` ouvre le pavé numérique plutôt que le clavier
              complet — acquis mobile du 10/09, les contrôles restent à 16 px */}
          <Input
            id="pr-tel"
            name="telephone"
            type="tel"
            autoComplete="tel"
            defaultValue={valeur("telephone")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pr-email">Email de contact *</Label>
          <Input
            id="pr-email"
            name="email_contact"
            type="email"
            required
            defaultValue={valeur("email_contact")}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pr-siret">SIRET{estProprietaire ? "" : " *"}</Label>
        <Input id="pr-siret" name="siret" required={!estProprietaire} defaultValue={valeur("siret")} />
      </div>
      {!estProprietaire && (
        <>
          <div className="space-y-2">
            <Label htmlFor="pr-carte-pro">Carte professionnelle (n° et CCI) *</Label>
            {/* La CCI passe dans l'aide (24/09) : au téléphone, l'exemple
                complet était coupé dans le champ (« … CCI de P »). */}
            <Input
              id="pr-carte-pro"
              name="carte_pro"
              required
              defaultValue={valeur("carte_pro")}
              placeholder="ex. CPI 7501 2026 000 000 000"
            />
            <p className="text-xs text-muted-foreground">
              Numéro suivi de la CCI de délivrance, par exemple « CCI de
              Paris ». Reportée sur le bail et le mandat de gestion.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pr-garantie">Garantie financière (organisme, montant) *</Label>
            <Input
              id="pr-garantie"
              name="garantie_financiere"
              required
              defaultValue={valeur("garantie_financiere")}
              placeholder="ex. Galian, 120 000 €"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pr-tva">N&deg; de TVA intracommunautaire</Label>
            <Input
              id="pr-tva"
              name="tva_intracom"
              defaultValue={valeur("tva_intracom")}
              placeholder="ex. FR 12 345678901"
            />
            <p className="text-xs text-muted-foreground">
              Mention obligatoire des factures d&apos;honoraires. Sans elle,
              l&apos;émission est refusée.
            </p>
          </div>
          <label
            htmlFor="pr-tva-franchise"
            className="flex min-h-12 items-center gap-3 text-sm"
          >
            <input
              id="pr-tva-franchise"
              type="checkbox"
              name="tva_franchise"
              defaultChecked={organisation.tva_franchise}
              className={CASE}
            />
            Franchise en base de TVA (article 293 B du CGI)
          </label>
          <p className="text-xs text-muted-foreground">
            Cochée, les factures d&apos;honoraires ne portent aucune TVA et
            affichent la mention de franchise à la place.
          </p>
        </>
      )}
      <div className="space-y-2">
        <Label htmlFor="pr-iban">IBAN (modalités de paiement des documents)</Label>
        <Input
          id="pr-iban"
          name="iban"
          defaultValue={valeur("iban")}
          placeholder="ex. FR76 …"
        />
        <p className="text-xs text-muted-foreground">
          Reporté sur les avis d&apos;échéance.
        </p>
      </div>
      {/* La marque suit l'identité légale (24/09) : sans cadre, placée entre
          SIRET et carte professionnelle, elle semblait englober ces champs. */}
      {!estProprietaire && (
        <SousSection titre="Votre marque sur Gerimmo">
          <p className="text-xs text-muted-foreground">Ces réglages habillent l’espace agence et le portail locataire avec votre identité.</p>
          <div className="space-y-2">
            <Label htmlFor="pr-nom-portail">Nom affiché</Label>
            <Input id="pr-nom-portail" name="nom_portail" defaultValue={valeur("nom_portail")} maxLength={100} />
            <p className="text-xs text-muted-foreground">Facultatif. Laissé vide, « {organisation.name} » est affiché.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pr-logo">Votre logo</Label>
            <Input id="pr-logo" name="logo_fichier" type="file" accept="image/png,image/jpeg,image/webp" />
            <p className="text-xs text-muted-foreground">PNG, JPEG ou WebP, 200 Ko maximum. Le logo sera repris dans le portail, les documents et les e-mails.</p>
            {organisation.logo_url && (
              <label className="flex min-h-12 items-center gap-3 text-sm">
                <input type="checkbox" name="retirer_logo" className={CASE} />
                Retirer le logo actuel
              </label>
            )}
          </div>
          <div className="rounded-lg border bg-white p-4" style={styleMarque(organisation)}><p className="mb-3 text-xs text-muted-foreground">Identité actuellement enregistrée</p><div className="max-w-[180px]"><MarqueOrganisation marque={organisation} /></div><div className="mt-3 rounded-lg bg-[var(--marque)] px-4 py-2 text-sm text-white">Votre espace de gestion</div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="pr-couleur-1">Couleur principale</Label><Input id="pr-couleur-1" name="couleur_primaire" type="color" defaultValue={valeur("couleur_primaire") || COULEUR_PRINCIPALE} className="h-12" /></div>
            <div className="space-y-2"><Label htmlFor="pr-couleur-2">Couleur foncée</Label><Input id="pr-couleur-2" name="couleur_secondaire" type="color" defaultValue={valeur("couleur_secondaire") || COULEUR_FONCEE} className="h-12" /></div>
          </div>
          <p className="text-xs text-muted-foreground">Les couleurs trop claires sont légèrement foncées à l’affichage pour conserver des textes lisibles.</p>
          <div className="space-y-2"><Label htmlFor="pr-domaine">Adresse personnalisée</Label><Input id="pr-domaine" name="domaine_personnalise" defaultValue={valeur("domaine_personnalise")} placeholder="ex. espace.votre-agence.fr" /><p className="text-xs text-muted-foreground">{organisation.domaine_personnalise_verifie_le ? "Adresse vérifiée. Toute modification demandera une nouvelle vérification." : organisation.domaine_personnalise ? "Enregistrée, à connecter : votre espace reste accessible sur gerimmo.app." : "Facultatif. Votre adresse sera vérifiée avant sa mise en service."}</p></div>
          <div className="space-y-2"><Label htmlFor="pr-expediteur">Adresse d’envoi des emails</Label><Input id="pr-expediteur" name="email_expediteur" type="email" defaultValue={valeur("email_expediteur")} placeholder="ex. gestion@votre-agence.fr" /><p className="text-xs text-muted-foreground">{organisation.email_expediteur_verifie_le ? "Expéditeur vérifié et utilisable. Toute modification demandera une nouvelle vérification." : organisation.email_expediteur ? "Enregistrée, à vérifier : les messages partent encore de Gerimmo avec votre identité et votre adresse de réponse." : "Facultatif. Les messages portent déjà votre nom ; l’adresse d’envoi personnalisée nécessite une vérification."}</p></div>
        </SousSection>
      )}
      <SousSection titre="Avis d'échéance">
        <label
          htmlFor="pr-avis-auto"
          className="flex min-h-12 items-center gap-3 text-sm"
        >
          <input
            id="pr-avis-auto"
            type="checkbox"
            name="appels_envoi_auto"
            defaultChecked={organisation.appels_envoi_auto}
            className={CASE}
          />
          Annoncer chaque échéance au locataire par e-mail
        </label>
        <p className="text-xs text-muted-foreground">
          À la création de l&apos;appel, le locataire reçoit le détail de son
          terme et sa date d&apos;échéance, avec son solde antérieur s&apos;il en
          a un. Un terme déjà réglé n&apos;est jamais réclamé, et cocher la case
          n&apos;envoie pas l&apos;historique : seuls les appels de moins de 45
          jours partent. Vérifiez les adresses de vos locataires avant de
          cocher.
        </p>
      </SousSection>
      <SousSection titre="Envoi des quittances">
        <label
          htmlFor="pr-envoi-auto"
          className="flex min-h-12 items-center gap-3 text-sm"
        >
          <input
            id="pr-envoi-auto"
            type="checkbox"
            name="quittances_envoi_auto"
            defaultChecked={organisation.quittances_envoi_auto}
            className={CASE}
          />
          Envoyer automatiquement les quittances et reçus aux locataires
        </label>
        <p className="text-xs text-muted-foreground">
          Une fois par jour, les quittances émises depuis moins de 45 jours et
          jamais envoyées partent au locataire, sans qu&apos;il y ait à cliquer.
          Cocher cette case vaut validation permanente de leur envoi. Décochée,
          rien ne part sans votre geste — l&apos;envoi groupé reste disponible
          depuis « Loyers &amp; charges ».
        </p>
      </SousSection>
      <SousSection titre="Relances d'impayé" id="relances">
        <label
          htmlFor="pr-relances-auto"
          className="flex min-h-12 items-center gap-3 text-sm"
        >
          <input
            id="pr-relances-auto"
            type="checkbox"
            name="relances_envoi_auto"
            defaultChecked={organisation.relances_envoi_auto}
            className={CASE}
          />
          Relancer automatiquement les loyers impayés par e-mail
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor="pr-relance-1" className="text-sm">
            <span className="block text-xs text-muted-foreground">Première relance, jours après l&apos;échéance</span>
            <Input
              id="pr-relance-1"
              type="number"
              name="relance_1_jours"
              min={1}
              max={60}
              defaultValue={organisation.relance_1_jours}
              className="mt-1"
            />
          </label>
          <label htmlFor="pr-relance-2" className="text-sm">
            <span className="block text-xs text-muted-foreground">Seconde relance, jours après l&apos;échéance</span>
            <Input
              id="pr-relance-2"
              type="number"
              name="relance_2_jours"
              min={2}
              max={90}
              defaultValue={organisation.relance_2_jours}
              className="mt-1"
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Chaque matin, le terme impayé le plus ancien de chaque bail reçoit sa
          première relance passé le premier délai, puis la seconde passé le
          second — jamais deux courriers le même jour, et une relance que vous
          avez saisie vous-même compte. La mise en demeure reste votre geste :
          c&apos;est un recommandé. Chaque relance envoyée s&apos;inscrit sur
          le bail, comme si vous l&apos;aviez saisie.
        </p>
      </SousSection>
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
      {etat.succes && (
        <p role="status" className="text-sm text-success-soft-foreground">
          {etat.succes}
        </p>
      )}
      <BoutonEnvoi enCoursTexte="Enregistrement…">Enregistrer</BoutonEnvoi>
    </form>
  );
}

// --- Lecture seule --------------------------------------------------------

/** Une rangée libellé → valeur ; « — » quand rien n'est renseigné. */
function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="ligne-info">
      <dt className="shrink-0 text-muted-foreground">{libelle}</dt>
      <dd className="min-w-0 text-right [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function texte(v: string | null) {
  return v?.trim() ? v : <span className="text-muted-foreground">—</span>;
}

function Pastille({ couleur, parDefaut }: { couleur: string | null; parDefaut: string }) {
  const choisie = couleurValide(couleur);
  const affichee = choisie ? couleur : parDefaut;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block size-4 shrink-0 rounded-full border"
        style={{ backgroundColor: affichee }}
      />
      <span className="montant">{affichee.toUpperCase()}</span>
      {!choisie && <span className="text-muted-foreground">(par défaut)</span>}
    </span>
  );
}

/** Un état en appui, sous la valeur (vérifiée, à connecter…). */
function Precision({ children }: { children: ReactNode }) {
  return <span className="block text-xs text-muted-foreground">{children}</span>;
}

function FicheProfil({
  organisation: o,
  estProprietaire,
}: {
  organisation: Organisation;
  estProprietaire: boolean;
}) {
  return (
    <div className="space-y-5">
      <dl>
        <Ligne libelle={estProprietaire ? "Nom du parc" : "Nom de l'agence"}>{texte(o.name)}</Ligne>
        <Ligne libelle="Adresse">{texte(o.address_line1)}</Ligne>
        <Ligne libelle="Code postal">{texte(o.postal_code)}</Ligne>
        <Ligne libelle="Ville">{texte(o.city)}</Ligne>
        <Ligne libelle="Téléphone">{texte(o.telephone)}</Ligne>
        <Ligne libelle="Email de contact">{texte(o.email_contact)}</Ligne>
        <Ligne libelle="SIRET">{texte(o.siret)}</Ligne>
        {!estProprietaire && (
          <>
            <Ligne libelle="Carte professionnelle">{texte(o.carte_pro)}</Ligne>
            <Ligne libelle="Garantie financière">{texte(o.garantie_financiere)}</Ligne>
            <Ligne libelle="N° de TVA intracommunautaire">{texte(o.tva_intracom)}</Ligne>
            <Ligne libelle="Franchise en base de TVA">{o.tva_franchise ? "Oui" : "Non"}</Ligne>
          </>
        )}
        <Ligne libelle="IBAN">{texte(o.iban)}</Ligne>
      </dl>

      {!estProprietaire && (
        <div>
          <h4 className="eyebrow">Votre marque sur Gerimmo</h4>
          <dl>
            <Ligne libelle="Nom affiché">{texte(o.nom_portail)}</Ligne>
            <Ligne libelle="Logo">
              {logoAffichable(o.logo_url) ? (
                <span className="inline-block max-w-[180px]">
                  <MarqueOrganisation marque={o} />
                </span>
              ) : (
                <span className="text-muted-foreground">Aucun logo enregistré</span>
              )}
            </Ligne>
            <Ligne libelle="Couleur principale">
              <Pastille couleur={o.couleur_primaire} parDefaut={COULEUR_PRINCIPALE} />
            </Ligne>
            <Ligne libelle="Couleur foncée">
              <Pastille couleur={o.couleur_secondaire} parDefaut={COULEUR_FONCEE} />
            </Ligne>
            <Ligne libelle="Adresse personnalisée">
              {texte(o.domaine_personnalise)}
              {o.domaine_personnalise && (
                <Precision>{o.domaine_personnalise_verifie_le ? "vérifiée" : "à connecter"}</Precision>
              )}
            </Ligne>
            <Ligne libelle="Adresse d’envoi des emails">
              {texte(o.email_expediteur)}
              {o.email_expediteur && (
                <Precision>{o.email_expediteur_verifie_le ? "vérifiée" : "à vérifier"}</Precision>
              )}
            </Ligne>
          </dl>
        </div>
      )}

      <div id="relances">
        <h4 className="eyebrow">Envois automatiques</h4>
        <dl>
          <Ligne libelle="Avis d'échéance par e-mail">
            {o.appels_envoi_auto ? "Activés" : "Désactivés"}
          </Ligne>
          <Ligne libelle="Envoi des quittances">
            {o.quittances_envoi_auto ? "Automatique" : "Manuel"}
          </Ligne>
          <Ligne libelle="Relances d'impayé par e-mail">
            {o.relances_envoi_auto ? "Activées" : "Désactivées"}
            {o.relances_envoi_auto && (
              <Precision>
                à {o.relance_1_jours} puis {o.relance_2_jours} jours après
                l&apos;échéance
              </Precision>
            )}
          </Ligne>
        </dl>
      </div>
    </div>
  );
}
