import type { Metadata } from "next";
import AtlasConcept from "./AtlasConcept";

export const metadata: Metadata = {
  title: "Weyra — Atlas concept réel",
  description: "Prototype fonctionnel de la nouvelle interface Atlas.",
};

export default function AtlasConceptPage() {
  return <AtlasConcept />;
}
