"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { RadarHealthReport } from "@/lib/radar-health";
import styles from "./radar-status.module.css";

const PARIS_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  dateStyle: "medium",
  timeStyle: "medium",
});

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Indisponible";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes} min ${remainingSeconds} s`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

function formatMilliseconds(milliseconds: number | null) {
  return milliseconds === null ? "Indisponible" : formatDuration(Math.round(milliseconds / 1_000));
}

function formatTimestamp(timestamp: string | null) {
  if (!timestamp) return "Indisponible";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "Indisponible" : PARIS_FORMATTER.format(date);
}

function statusLabel(level: RadarHealthReport["level"]) {
  if (level === "healthy") return "Operationnel";
  if (level === "degraded") return "Degrade";
  return "Incident";
}

function formatCoverage(coverage: RadarHealthReport["latestScan"]["coverage"]) {
  if (!coverage) return "Indisponible";
  return `${coverage.west.toFixed(2)}, ${coverage.south.toFixed(2)} / ${coverage.east.toFixed(2)}, ${coverage.north.toFixed(2)}`;
}

export default function RadarStatusClient() {
  const [report, setReport] = useState<RadarHealthReport | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/health/radar", { cache: "no-store" });
      const payload = (await response.json()) as RadarHealthReport;
      setReport(payload);
      setRequestError(null);
    } catch {
      setRequestError("Le statut radar ne repond pas.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [refresh]);

  return (
    <main className={styles.shell}>
      <div className={styles.header}>
        <div>
          <Link className={styles.brand} href="/">
            weyra
          </Link>
          <p className={styles.eyebrow}>OPERATIONS / RADAR OFFICIEL</p>
          <h1>Sante du radar</h1>
        </div>
        <button className={styles.refresh} type="button" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? "Verification..." : "Actualiser"}
        </button>
      </div>

      {requestError ? <p className={styles.requestError}>{requestError}</p> : null}

      {!report ? (
        <section className={styles.loading}>Lecture du pipeline...</section>
      ) : (
        <>
          <section className={styles.overview}>
            <div className={`${styles.statusMark} ${styles[report.level]}`} aria-hidden="true" />
            <div className={styles.statusCopy}>
              <span className={styles.statusLabel}>{statusLabel(report.level)}</span>
              <strong>{report.latestScan.timestamp ?? "Aucun scan publie"}</strong>
              <span>Controle {formatTimestamp(report.checkedAt)}</span>
            </div>
          </section>

          <section className={styles.metrics} aria-label="Metriques principales">
            <article>
              <span>Age du scan</span>
              <strong>{formatDuration(report.latestScan.ageSeconds)}</strong>
              <small>{report.latestScan.provider ?? "Source inconnue"}</small>
            </article>
            <article>
              <span>Retard source</span>
              <strong>{formatDuration(report.source.lagToPublishedScanSeconds)}</strong>
              <small>Source {report.source.latestTimestamp ?? "inconnue"}</small>
            </article>
            <article>
              <span>Generation moyenne</span>
              <strong>{formatMilliseconds(report.generation.averagePackBuildDurationMs)}</strong>
              <small>Derniere {formatMilliseconds(report.generation.lastPackBuildDurationMs)}</small>
            </article>
            <article>
              <span>Worker</span>
              <strong>{report.worker.state}</strong>
              <small>Signal il y a {formatDuration(report.worker.heartbeatAgeSeconds)}</small>
            </article>
          </section>

          <section className={styles.details}>
            <div>
              <h2>Pipeline</h2>
              <dl>
                <dt>Phase</dt>
                <dd>{report.generation.phase}</dd>
                <dt>En cours</dt>
                <dd>{report.generation.running ? "Oui" : "Non"}</dd>
                <dt>Cycle worker</dt>
                <dd>{formatMilliseconds(report.worker.lastCycleDurationMs)}</dd>
                <dt>Dernier succes</dt>
                <dd>{formatTimestamp(report.generation.lastSuccessfulPackAt)}</dd>
                <dt>Source active</dt>
                <dd>{report.latestScan.provider ?? "Indisponible"}</dd>
                <dt>Resolution native</dt>
                <dd>
                  {report.latestScan.nativeResolutionMeters
                    ? `${report.latestScan.nativeResolutionMeters} m`
                    : "Indisponible"}
                </dd>
                <dt>Emprise WGS84</dt>
                <dd>{formatCoverage(report.latestScan.coverage)}</dd>
                <dt>Attribution</dt>
                <dd>{report.latestScan.attribution ?? "Indisponible"}</dd>
              </dl>
            </div>
            <div>
              <h2>Diagnostic</h2>
              {report.reasons.length > 0 ? (
                <ul>
                  {report.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.clear}>Aucune anomalie detectee.</p>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
