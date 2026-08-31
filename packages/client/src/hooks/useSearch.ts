import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchRequestInput, SearchResponse } from "@flighthunter/shared";
import { api, ApiError } from "../api";

export interface SearchState {
  status: "idle" | "loading" | "success" | "error";
  data: SearchResponse | null;
  error: string | null;
  /** The request that produced `data`, needed for export and alert creation. */
  request: SearchRequestInput | null;
}

/**
 * Runs searches with strict race protection.
 *
 * The previous version had no cancellation, so double-clicking Search could let
 * a slow first response land *after* a fast second one and overwrite it. Here
 * every new search aborts the one in flight, and a sequence number guarantees
 * only the newest response is ever applied.
 *
 * Results also stay on screen while a new search runs, instead of being torn
 * down and replaced by a spinner.
 */
export function useSearch() {
  const [state, setState] = useState<SearchState>({
    status: "idle",
    data: null,
    error: null,
    request: null,
  });

  const controllerRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    // Must be re-armed on every mount. StrictMode mounts, unmounts and
    // remounts in development; without this the cleanup leaves the ref false
    // forever and every response is silently discarded as "unmounted".
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const run = useCallback(async (request: SearchRequestInput): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const seq = ++seqRef.current;
    setState((s) => ({ ...s, status: "loading", error: null }));

    try {
      const data = await api.search(request, controller.signal);
      // A superseded response must never win, even if it arrives last.
      if (seq !== seqRef.current || !mountedRef.current) return;
      setState({ status: "success", data, error: null, request });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (seq !== seqRef.current || !mountedRef.current) return;

      setState((s) => ({
        ...s,
        status: "error",
        error: err instanceof ApiError ? err.message : "Search failed",
      }));
    }
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    // Bump the sequence so any in-flight response is treated as stale.
    seqRef.current++;
    setState((s) => (s.status === "loading" ? { ...s, status: s.data ? "success" : "idle" } : s));
  }, []);

  return { state, run, cancel };
}
