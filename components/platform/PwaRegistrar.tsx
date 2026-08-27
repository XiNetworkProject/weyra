"use client";

import { useEffect } from "react";

type NavigatorConnection = EventTarget & {
  effectiveType?: string;
  saveData?: boolean;
};

function currentNetworkMode() {
  const connection = (navigator as Navigator & { connection?: NavigatorConnection }).connection;
  const lowBandwidth = Boolean(
    connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g",
  );
  return { connection, lowBandwidth };
}

export default function PwaRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    const publishNetworkMode = () => {
      const { lowBandwidth } = currentNetworkMode();
      document.documentElement.dataset.networkMode = navigator.onLine ? (lowBandwidth ? "low" : "online") : "offline";
      const worker = registration?.active ?? registration?.waiting ?? registration?.installing;
      worker?.postMessage({ type: "NETWORK_MODE", lowBandwidth });
      window.dispatchEvent(
        new CustomEvent("weyra-network-mode", {
          detail: { online: navigator.onLine, lowBandwidth },
        }),
      );
    };

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        await registration.update();
        publishNetworkMode();
      } catch {
        document.documentElement.dataset.networkMode = navigator.onLine ? "online" : "offline";
      }
    };

    const { connection } = currentNetworkMode();
    window.addEventListener("online", publishNetworkMode);
    window.addEventListener("offline", publishNetworkMode);
    connection?.addEventListener("change", publishNetworkMode);
    void register();

    return () => {
      window.removeEventListener("online", publishNetworkMode);
      window.removeEventListener("offline", publishNetworkMode);
      connection?.removeEventListener("change", publishNetworkMode);
    };
  }, []);

  return null;
}
