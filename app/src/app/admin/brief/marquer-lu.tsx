"use client";

import { useEffect } from "react";
import { marquerPointLu } from "./actions";

/** Ouvrir le détail d'un point suffit à le marquer « lu » (25/09) : aucun clic de plus. */
export function MarquerLu({ id }: { id: string }) {
  useEffect(() => { void marquerPointLu(id); }, [id]);
  return null;
}
