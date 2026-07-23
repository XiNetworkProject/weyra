"use client";

import { useState } from "react";
import { IconAlertTriangle, IconBolt, IconChevronDown, IconClock, IconDroplet, IconMapPin, IconWind } from "@/components/atlas/icons";
import type { AlertCategory, AlertLevel, LocalAlert } from "@/lib/alerts";

type LocalAlertsProps = {
  alerts: LocalAlert[];
};

const CATEGORY_ICON: Record<AlertCategory, typeof IconDroplet> = {
  pluie: IconDroplet,
  orage: IconBolt,
  vent: IconWind,
};

const LEVEL_LABEL: Record<AlertLevel, string> = {
  info: "Info",
  attention: "Attention",
  fort: "Fort",
};

const LEVEL_RANK: Record<AlertLevel, number> = { info: 0, attention: 1, fort: 2 };

function formatAlertTime(timestamp: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

export default function LocalAlerts({ alerts }: LocalAlertsProps) {
  const [collapsed, setCollapsed] = useState(true);
  const worstLevel = alerts.reduce<AlertLevel | null>((worst, alert) => (
    !worst || LEVEL_RANK[alert.level] > LEVEL_RANK[worst] ? alert.level : worst
  ), null);

  return (
    <section className={`atlas-alerts ${collapsed ? "" : "is-open"}`} aria-label="Alertes météo locales">
      <button
        type="button"
        className="atlas-alerts__header"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
      >
        <IconAlertTriangle className="atlas-alerts__icon" />
        <span className="atlas-alerts__title">Alertes locales</span>
        {worstLevel && <span className={`atlas-alerts__badge atlas-alerts__badge--${worstLevel}`}>{alerts.length}</span>}
        <IconChevronDown className="atlas-alerts__chevron" />
      </button>
      {!collapsed && (
        alerts.length ? (
          <ul className="atlas-alerts__list">
            {alerts.map((alert) => {
              const Icon = CATEGORY_ICON[alert.category];
              return (
                <li key={alert.id}>
                  <div className={`atlas-alerts__item atlas-alerts__item--${alert.level}`}>
                    <span className="atlas-alerts__item-icon"><Icon /></span>
                    <span className="atlas-alerts__item-body">
                      <strong>{alert.title}</strong>
                      <span className="atlas-alerts__item-meta">
                        <span className="atlas-alerts__meta-item"><IconMapPin />{alert.zone}</span>
                        <span className="atlas-alerts__dot" aria-hidden="true" />
                        <span className="atlas-alerts__meta-item"><IconClock />{formatAlertTime(alert.time)}</span>
                      </span>
                    </span>
                    <span className={`atlas-alerts__level atlas-alerts__level--${alert.level}`}>{LEVEL_LABEL[alert.level]}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="atlas-alerts__empty">Aucune alerte active</p>
        )
      )}
    </section>
  );
}
