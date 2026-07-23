"use client";

import { useState } from "react";
import { IconActivity, IconChevronDown, IconClock } from "@/components/atlas/icons";
import type { Nowcast, NowcastSource } from "@/lib/nowcast";

type NowcastPanelProps = {
  nowcast: Nowcast;
};

const SOURCE_LABEL: Record<NowcastSource, string> = {
  weather: "météo",
  observations: "observations",
  radar: "radar",
};

function formatUpdatedAt(timestamp: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

export default function NowcastPanel({ nowcast }: NowcastPanelProps) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <section className={`atlas-nowcast ${collapsed ? "" : "is-open"}`} aria-label="NowCast Weyra — résumé local expérimental">
      <button
        type="button"
        className="atlas-nowcast__header"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
      >
        <span className="atlas-nowcast__icon"><IconActivity /></span>
        <span className="atlas-nowcast__body">
          <span className="atlas-nowcast__label">NowCast Weyra</span>
          <span className="atlas-nowcast__sentence">{nowcast.text}</span>
        </span>
        <span className="atlas-nowcast__time"><IconClock />{formatUpdatedAt(nowcast.updatedAt)}</span>
        <IconChevronDown className="atlas-nowcast__chevron" />
      </button>
      {!collapsed && (
        <div className="atlas-nowcast__detail">
          <p className="atlas-nowcast__disclaimer">
            Résumé local expérimental généré automatiquement à partir des données de l’app — ce n’est pas une prévision officielle.
          </p>
          <p className="atlas-nowcast__sources">Sources : {nowcast.sources.map((source) => SOURCE_LABEL[source]).join(", ")}</p>
        </div>
      )}
    </section>
  );
}
