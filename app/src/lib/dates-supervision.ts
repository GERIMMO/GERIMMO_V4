/** Une heure de Paris inexistante ou ambiguë n'est jamais devinée. */
export function instantParis(saisie: string): string | null {
 if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(saisie)) return null;
 const format = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
 const candidats = ['+01:00', '+02:00'].map(offset => new Date(saisie + offset)).filter(d => !Number.isNaN(d.getTime()) && format.format(d).replace(' ', 'T') === saisie);
 return candidats.length === 1 ? candidats[0].toISOString() : null;
}
export function champParis(iso: string): string {
 return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).replace(' ', 'T');
}
