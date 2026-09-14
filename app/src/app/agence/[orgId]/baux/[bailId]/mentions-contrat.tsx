import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { MentionsContrat } from '@/lib/mentions-contrat';
import { formaterDate, eur } from '@/lib/ged';

type Champ = { nom: keyof MentionsContrat; titre: string; type?: 'date' | 'number'; options?: [string, string][]; aide?: string };
const ouiNon: [string, string][] = [['', 'À vérifier'], ['true', 'Oui'], ['false', 'Non']];
const groupes: { titre: string; aide: string; agence?: boolean; champs: Champ[] }[] = [
  { titre: 'Date et conditions du contrat', aide: 'Confirmez les règles applicables à ce logement. La date prévue prépare le modèle ; elle ne vaut pas signature.', champs: [
    { nom: 'date_conclusion_prevue', titre: 'Date prévue de conclusion', type: 'date' },
    { nom: 'encadrement_loyer', titre: 'Loyers de référence imposés par arrêté local', options: ouiNon, aide: 'Une zone tendue n’est pas nécessairement soumise aux loyers de référence.' },
    { nom: 'servitude_residence_principale', titre: 'Servitude de résidence principale', options: ouiNon, aide: 'À vérifier dans les règles d’urbanisme du logement (article L. 151-14-1).' },
    { nom: 'clause_resolutoire_assurance', titre: 'Résiliation pour défaut d’assurance', options: ouiNon.slice(1) },
    { nom: 'clause_resolutoire_troubles', titre: 'Résiliation pour troubles de voisinage jugés', options: ouiNon.slice(1) },
    { nom: 'clause_resolutoire_servitude', titre: 'Résiliation pour non-respect de la servitude', options: ouiNon.slice(1), aide: 'Disponible uniquement si la servitude est confirmée ; le délai de mise en demeure du maire doit être respecté.' },
  ] },
  { titre: 'Dépenses d’énergie du DPE', aide: 'Recopiez la fourchette et les années des prix de l’énergie indiquées dans le diagnostic. La classe DPE vient de la fiche logement.', champs: [
    { nom: 'dpe_depenses_min', titre: 'Estimation annuelle minimale (€)', type: 'number' },
    { nom: 'dpe_depenses_max', titre: 'Estimation annuelle maximale (€)', type: 'number' },
    { nom: 'dpe_annees_reference', titre: 'Année(s) des prix de l’énergie', aide: 'Par exemple : 2021, 2022 et 2023, selon le DPE.' },
  ] },
  { titre: 'Honoraires de l’état des lieux', agence: true, aide: 'Les montants ci-dessous concernent uniquement l’état des lieux d’entrée. Les honoraires de visite, de dossier et de bail restent renseignés séparément.', champs: [
    { nom: 'zone_honoraires', titre: 'Zone applicable aux plafonds d’honoraires', options: [['', 'À vérifier'], ['tres_tendue', 'Zone très tendue'], ['tendue', 'Zone tendue'], ['autre', 'Autre zone']] },
    { nom: 'honoraires_edl_bailleur', titre: 'État des lieux — part du bailleur (€ TTC)', type: 'number' },
    { nom: 'honoraires_edl_locataire', titre: 'État des lieux — part du locataire (€ TTC)', type: 'number' },
  ] },
];

export function MentionsContratFormulaire({ defauts, valeurs, agence, modifiable, onEncadrementChange }: { defauts: MentionsContrat; valeurs?: Record<string, string>; agence: boolean; modifiable: boolean; onEncadrementChange?: (actif: boolean) => void }) {
  return <div className="space-y-3">{groupes.filter(g => !g.agence || agence).map(g => <details key={g.titre} className="rounded-lg border border-border bg-muted/20 p-3">
    <summary className="cursor-pointer text-sm font-semibold">{g.titre}</summary>
    <p className="mt-2 text-sm text-muted-foreground">{g.aide}</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{g.champs.map(c => {
      const actuel = defauts[c.nom];
      const defaut = actuel == null ? (c.nom.startsWith('clause_') ? c.nom === 'clause_resolutoire_servitude' ? 'false' : 'true' : '') : String(actuel);
      const valeur = valeurs?.[c.nom] ?? defaut;
      if (!modifiable) return <div className="ligne-info sm:col-span-2" key={c.nom}><span>{c.titre}</span><span>{actuel == null ? '—' : c.options ? c.options.find(o => o[0] === String(actuel))?.[1] : c.type === 'date' ? formaterDate(String(actuel)) : c.type === 'number' ? eur(Number(actuel)) : String(actuel)}</span></div>;
      const id = `mentions-${c.nom}`;
      return <div key={c.nom} className="space-y-1.5"><Label htmlFor={id}>{c.titre}</Label>
        {c.options ? <select key={`${c.nom}:${valeur}`} id={id} name={c.nom} defaultValue={valeur} onChange={e => { if (c.nom === "encadrement_loyer") onEncadrementChange?.(e.target.value === "true"); }} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">{c.options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>
          : <Input id={id} name={c.nom} type={c.type ?? 'text'} min={c.type === 'number' ? 0 : undefined} step={c.type === 'number' ? '0.01' : undefined} maxLength={100} defaultValue={valeur} />}
        {c.aide && <p className="text-xs text-muted-foreground">{c.aide}</p>}
      </div>;
    })}</div>
  </details>)}</div>;
}
