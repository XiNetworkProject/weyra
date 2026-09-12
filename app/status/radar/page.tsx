import "@/app/legacy.css";
import "@/app/product.css";
import "@/app/community.css";
import "@/app/weyra-theme.css";
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
