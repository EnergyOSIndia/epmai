import { useState, useEffect, useCallback } from "react";
import { fetchOptimization, getOptMethod, onMethodChange, type OptApiResponse, type OptMethod, type HorizonId } from "@/data/optimizationApi";

interface UseOptResult {
  api: OptApiResponse | null;
  loading: boolean;
  error: string | null;
  method: OptMethod;
  refresh: () => void;
}

export function useOptimization(tf: HorizonId | string = "da", locationId?: number): UseOptResult {
  const [api, setApi] = useState<OptApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<OptMethod>(getOptMethod());
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => onMethodChange(() => { setMethod(getOptMethod()); setTick(t => t + 1); }), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetchOptimization((tf || "da") as HorizonId, method, locationId)
      .then(d => { if (!cancelled) { setApi(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e.message || "API failed"); setLoading(false); } });
    return () => { cancelled = true; };
  }, [tf, method, locationId, tick]);

  return { api, loading, error, method, refresh };
}
