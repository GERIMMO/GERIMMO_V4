// Sous-ensemble de PostgREST utilisé par la recette : colonne ordinaire ou champ JSON textuel.
export function projectionColonne(nom) {
  const m = /^([a-zA-Z_][a-zA-Z0-9_]*)(?:->>([a-zA-Z_][a-zA-Z0-9_]*))?$/.exec(nom);
  if (!m) throw new Error("Projection de colonne non prise en charge.");
  return m[2] ? `"${m[1]}" ->> '${m[2]}' as "${nom}"` : `"${m[1]}"`;
}
