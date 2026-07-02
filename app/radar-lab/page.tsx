"use client";

import { useMemo, useState } from "react";

type DataLink = {
  href: string;
  rel?: string;
  title?: string;
  type?: string;
  format?: string;
  fileType: "ODIM HDF5" | "GeoTIFF" | "Unknown";
  timestamp?: string;
  isLatest?: boolean;
};

type OperaResult = {
  ok: boolean;
  provider: "EUMETNET OPERA";
  product: "DBZH";
  method: "comp";
  latestTimestamp: string | null;
  format: string | null;
  dataLinks: DataLink[];
  rateLimitRemaining: string | null;
  sourceStatus: {
    status: number | null;
    statusText: string | null;
    contentType: string | null;
    date: string | null;
    locationId: string;
    windowStart: string;
    windowEnd: string;
  };
  error: string | null;
};

type RenderMetadata = {
  source: "EUMETNET OPERA";
  timestamp: string | null;
  quantity: string;
  gain: number;
  offset: number;
  nodata: number | null;
  undetect: number | null;
  width: number;
  height: number;
  projection: string | null;
  bbox: { west: number; south: number; east: number; north: number } | null;
  hasGeoreferencing: boolean;
  renderedAt: string;
  warning: string | null;
  hdf5DataPath?: string;
};

type RenderResult = {
  ok: boolean;
  provider: "EUMETNET OPERA";
  product: "DBZH";
  timestamp?: string | null;
  image?: {
    contentType: "image/webp";
    route: string;
  };
  metadata?: RenderMetadata;
  error?: string;
};

function formatDate(value: string | null | undefined, timeZone: "UTC" | "Europe/Paris") {
  if (!value) return "Non trouvé";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(date);
}

function preferredDataLink(links: DataLink[]) {
  return (
    links.find((link) => link.isLatest && link.fileType === "ODIM HDF5") ??
    links.find((link) => link.isLatest && link.fileType === "GeoTIFF") ??
    links.find((link) => link.fileType === "ODIM HDF5") ??
    links.find((link) => link.fileType === "GeoTIFF") ??
    links[0] ??
    null
  );
}

export default function RadarLabPage() {
  const [result, setResult] = useState<OperaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [renderLoading, setRenderLoading] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  const dataLink = useMemo(() => preferredDataLink(result?.dataLinks ?? []), [result]);
  const metadata = renderResult?.metadata;

  async function testOperaRadar() {
    setLoading(true);
    setClientError(null);

    try {
      const response = await fetch("/api/radar/opera/latest", { cache: "no-store" });
      const payload = await response.json() as OperaResult;
      setResult(payload);
    } catch {
      setClientError("Impossible d'interroger la route locale /api/radar/opera/latest.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function renderLatestFrame() {
    setRenderLoading(true);
    setRenderError(null);
    setImageSrc(null);

    try {
      const response = await fetch("/api/radar/opera/render/latest/meta", { cache: "no-store" });
      const payload = await response.json() as RenderResult;

      if (!response.ok || !payload.ok || !payload.metadata) {
        throw new Error(payload.error ?? "Le rendu OPERA a échoué.");
      }

      setRenderResult(payload);
      setImageSrc(`/api/radar/opera/render/latest?weyra=${Date.now()}`);
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : "Impossible de rendre la trame OPERA.");
      setRenderResult(null);
    } finally {
      setRenderLoading(false);
    }
  }

  return (
    <main className="radar-lab">
      <section className="radar-lab__shell">
        <div className="radar-lab__header">
          <p>Radar Lab</p>
          <h1>Weyra Radar Lab</h1>
          <span>Test du composite OPERA DBZH</span>
        </div>

        <div className="radar-lab__actions">
          <button className="radar-lab__button" type="button" onClick={testOperaRadar} disabled={loading}>
            {loading ? "Test en cours..." : "Tester le radar OPERA"}
          </button>
          <button className="radar-lab__button radar-lab__button--secondary" type="button" onClick={renderLatestFrame} disabled={renderLoading}>
            {renderLoading ? "Rendu en cours..." : "Rendre la dernière trame"}
          </button>
        </div>

        <p className="radar-lab__note">Donnée réelle OPERA DBZH — rendu Weyra expérimental</p>

        <section className="radar-lab__card" aria-live="polite">
          <div className="radar-lab__status-row">
            <span className={`radar-lab__dot${result?.ok ? " is-ok" : ""}`} />
            <b>{loading ? "Chargement" : result ? (result.ok ? "Composite trouvé" : "Vérification échouée") : "Test OPERA en attente"}</b>
          </div>

          <dl className="radar-lab__grid">
            <div>
              <dt>Statut source</dt>
              <dd>{result?.sourceStatus.status ?? "Non testé"}</dd>
            </div>
            <div>
              <dt>Dernier scan UTC</dt>
              <dd>{formatDate(result?.latestTimestamp, "UTC")}</dd>
            </div>
            <div>
              <dt>Dernier scan Paris</dt>
              <dd>{formatDate(result?.latestTimestamp, "Europe/Paris")}</dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>{result?.format ?? "Non trouvé"}</dd>
            </div>
            <div>
              <dt>Liens de données</dt>
              <dd>{result?.dataLinks.length ?? 0}</dd>
            </div>
            <div>
              <dt>Quota restant</dt>
              <dd>{result?.rateLimitRemaining ?? "Non fourni"}</dd>
            </div>
            <div>
              <dt>Fichier détecté</dt>
              <dd>{dataLink ? dataLink.fileType : "Aucun lien exploitable"}</dd>
            </div>
            <div>
              <dt>Fenêtre UTC</dt>
              <dd>{result ? `${result.sourceStatus.windowStart} / ${result.sourceStatus.windowEnd}` : "Non testée"}</dd>
            </div>
          </dl>

          {(result?.error || clientError) && (
            <p className="radar-lab__error">{result?.error ?? clientError}</p>
          )}

          {dataLink && (
            <div className="radar-lab__link">
              <span>Lien {dataLink.fileType}</span>
              <a href={dataLink.href} target="_blank" rel="noreferrer">{dataLink.href}</a>
            </div>
          )}
        </section>

        <section className="radar-lab__card radar-lab__render" aria-live="polite">
          <div className="radar-lab__status-row">
            <span className={`radar-lab__dot${metadata ? " is-ok" : ""}`} />
            <b>{renderLoading ? "Rendu local en cours" : metadata ? "Trame rendue" : "Rendu local en attente"}</b>
          </div>

          {renderError && <p className="radar-lab__error">{renderError}</p>}

          {imageSrc && metadata && (
            <div className="radar-lab__preview">
              <img src={imageSrc} alt="Rendu expérimental du composite OPERA DBZH" />
            </div>
          )}

          <dl className="radar-lab__grid">
            <div>
              <dt>Heure UTC</dt>
              <dd>{formatDate(metadata?.timestamp, "UTC")}</dd>
            </div>
            <div>
              <dt>Heure Paris</dt>
              <dd>{formatDate(metadata?.timestamp, "Europe/Paris")}</dd>
            </div>
            <div>
              <dt>Dimensions</dt>
              <dd>{metadata ? `${metadata.width} x ${metadata.height}` : "Non rendu"}</dd>
            </div>
            <div>
              <dt>Projection</dt>
              <dd>{metadata?.projection ?? "Non trouvée"}</dd>
            </div>
            <div>
              <dt>Géoréférencement</dt>
              <dd>{metadata ? (metadata.hasGeoreferencing ? "Trouvé" : "Incomplet") : "Non testé"}</dd>
            </div>
            <div>
              <dt>Chemin HDF5</dt>
              <dd>{metadata?.hdf5DataPath ?? "Non rendu"}</dd>
            </div>
          </dl>

          <p className="radar-lab__caption">
            Cette image est un rendu technique local. Elle n'est pas encore calée sur la carte Atlas.
          </p>
        </section>

        <details className="radar-lab__json">
          <summary>Voir la réponse JSON OPERA</summary>
          <pre>{JSON.stringify(result ?? { ok: false, error: clientError ?? "Aucun test lancé" }, null, 2)}</pre>
        </details>

        <details className="radar-lab__json">
          <summary>Voir la metadata du rendu</summary>
          <pre>{JSON.stringify(renderResult ?? { ok: false, error: renderError ?? "Aucun rendu lancé" }, null, 2)}</pre>
        </details>
      </section>

      <style>{`
        .radar-lab {
          min-height: 100vh;
          padding: 48px 20px;
          color: #e8f0f8;
          background: linear-gradient(145deg, #06111e 0%, #081622 46%, #04101a 100%);
        }

        .radar-lab__shell {
          width: min(980px, 100%);
          margin: 0 auto;
        }

        .radar-lab__header {
          margin-bottom: 24px;
        }

        .radar-lab__header p {
          margin: 0 0 10px;
          color: #77d9ff;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .radar-lab__header h1 {
          margin: 0;
          color: #ffffff;
          font-size: 42px;
          line-height: 1.05;
          letter-spacing: 0;
        }

        .radar-lab__header span {
          display: block;
          margin-top: 12px;
          color: #9fb2c7;
          font-size: 17px;
        }

        .radar-lab__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 14px;
        }

        .radar-lab__button {
          min-height: 46px;
          padding: 0 18px;
          color: #06111e;
          background: #7ce3ff;
          border: 0;
          border-radius: 8px;
          box-shadow: 0 14px 28px rgba(30, 191, 255, 0.18);
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
        }

        .radar-lab__button--secondary {
          color: #e8f7ff;
          background: #214b68;
          box-shadow: none;
        }

        .radar-lab__button:disabled {
          cursor: progress;
          opacity: 0.68;
        }

        .radar-lab__note {
          margin: 0 0 22px;
          color: #b8cadb;
          font-size: 13px;
          font-weight: 800;
        }

        .radar-lab__card,
        .radar-lab__json {
          margin-top: 22px;
          border: 1px solid rgba(147, 176, 204, 0.22);
          border-radius: 8px;
          background: rgba(5, 15, 27, 0.82);
          box-shadow: 0 18px 46px rgba(0, 0, 0, 0.28);
          backdrop-filter: blur(16px);
        }

        .radar-lab__card {
          padding: 22px;
        }

        .radar-lab__status-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
        }

        .radar-lab__status-row b {
          font-size: 16px;
        }

        .radar-lab__dot {
          width: 11px;
          height: 11px;
          border-radius: 99px;
          background: #ff9e64;
          box-shadow: 0 0 0 5px rgba(255, 158, 100, 0.13);
        }

        .radar-lab__dot.is-ok {
          background: #6dffae;
          box-shadow: 0 0 0 5px rgba(109, 255, 174, 0.13);
        }

        .radar-lab__grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin: 0;
        }

        .radar-lab__grid div {
          min-width: 0;
          padding: 14px;
          border: 1px solid rgba(147, 176, 204, 0.15);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.035);
        }

        .radar-lab__grid dt {
          margin-bottom: 7px;
          color: #8aa0b6;
          font-size: 12px;
          font-weight: 800;
        }

        .radar-lab__grid dd {
          margin: 0;
          overflow-wrap: anywhere;
          color: #f4f8fb;
          font-size: 14px;
          font-weight: 800;
        }

        .radar-lab__error {
          margin: 18px 0 0;
          padding: 13px 14px;
          color: #ffd8cf;
          border: 1px solid rgba(255, 127, 102, 0.28);
          border-radius: 8px;
          background: rgba(151, 48, 40, 0.18);
          font-size: 13px;
          font-weight: 700;
        }

        .radar-lab__link {
          margin-top: 18px;
          padding: 14px;
          border: 1px solid rgba(124, 227, 255, 0.28);
          border-radius: 8px;
          background: rgba(124, 227, 255, 0.08);
        }

        .radar-lab__link span {
          display: block;
          margin-bottom: 8px;
          color: #9cecff;
          font-size: 12px;
          font-weight: 900;
        }

        .radar-lab__link a {
          color: #e8faff;
          overflow-wrap: anywhere;
          font-size: 13px;
          font-weight: 700;
        }

        .radar-lab__preview {
          display: flex;
          justify-content: center;
          margin: 0 0 18px;
          padding: 16px;
          border: 1px solid rgba(147, 176, 204, 0.18);
          border-radius: 8px;
          background-color: #07101a;
          background-image:
            linear-gradient(45deg, rgba(255,255,255,0.045) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(255,255,255,0.045) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.045) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.045) 75%);
          background-position: 0 0, 0 10px, 10px -10px, -10px 0;
          background-size: 20px 20px;
        }

        .radar-lab__preview img {
          display: block;
          width: min(100%, 760px);
          height: auto;
          image-rendering: pixelated;
        }

        .radar-lab__caption {
          margin: 16px 0 0;
          color: #9fb2c7;
          font-size: 13px;
          font-weight: 700;
        }

        .radar-lab__json {
          overflow: hidden;
        }

        .radar-lab__json summary {
          padding: 15px 18px;
          color: #c8d6e5;
          cursor: pointer;
          font-weight: 800;
        }

        .radar-lab__json pre {
          max-height: 420px;
          margin: 0;
          padding: 18px;
          overflow: auto;
          border-top: 1px solid rgba(147, 176, 204, 0.15);
          color: #d7e8f8;
          background: rgba(0, 0, 0, 0.26);
          font-size: 12px;
          line-height: 1.6;
        }

        @media (max-width: 680px) {
          .radar-lab {
            padding: 32px 14px;
          }

          .radar-lab__header h1 {
            font-size: 34px;
          }

          .radar-lab__grid {
            grid-template-columns: 1fr;
          }

          .radar-lab__button {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
