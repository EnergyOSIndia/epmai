import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchMarketRange } from "@/store/slice/marketApiSlice";

/** Week / Month ahead data: every market and exchange for from..to, from the market slice
 *  (cached in IndexedDB). `sync` (Sync) re-calls the API and reports whether anything changed. */
export function useMarketRange(from: string, to: string) {
  const dispatch = useAppDispatch();
  const { range, rangeLoading, rangeError } = useAppSelector((state) => state.market);

  useEffect(() => { dispatch(fetchMarketRange({ from_date: from, to_date: to })); }, [dispatch, from, to]);

  const sync = useCallback(async () => {
    const r = await dispatch(fetchMarketRange({ from_date: from, to_date: to, sync: true })).unwrap();
    return r.changed;
  }, [dispatch, from, to]);

  const ready = range?.from === from && range?.to === to && !rangeLoading;
  return { days: ready ? range.days : null, loading: !ready, error: rangeError, sync };
}
