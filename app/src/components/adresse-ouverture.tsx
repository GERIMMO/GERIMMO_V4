import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AdresseSaisie = { adresse?: string; code_postal?: string; ville?: string };

export function AdresseOuverture({ prefixe, valeurs }: { prefixe: string; valeurs?: AdresseSaisie }) {
  return <>
    <div className="space-y-2">
      <Label htmlFor={prefixe + "-adresse"}>Adresse postale</Label>
      <Input id={prefixe + "-adresse"} name="adresse" required maxLength={200} autoComplete="street-address" defaultValue={valeurs?.adresse} />
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={prefixe + "-cp"}>Code postal</Label>
        <Input id={prefixe + "-cp"} name="code_postal" required maxLength={10} autoComplete="postal-code" defaultValue={valeurs?.code_postal} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={prefixe + "-ville"}>Ville</Label>
        <Input id={prefixe + "-ville"} name="ville" required maxLength={100} autoComplete="address-level2" defaultValue={valeurs?.ville} />
      </div>
    </div>
  </>;
}
