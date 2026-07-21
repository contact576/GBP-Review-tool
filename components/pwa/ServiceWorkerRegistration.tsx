"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/staff/" }).catch(() => {
      // The capture queue still works without a service worker; installability
      // is enhanced, never allowed to break the primary workflow.
    });
  }, []);
  return null;
}
