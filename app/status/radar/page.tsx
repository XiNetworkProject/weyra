import type { Metadata } from "next";
import RadarStatusClient from "./RadarStatusClient";

export const metadata: Metadata = {
  title: "Radar status | Weyra",
  description: "Operational status of the Weyra OPERA radar pipeline.",
};

export const dynamic = "force-dynamic";

export default function RadarStatusPage() {
  return <RadarStatusClient />;
}
