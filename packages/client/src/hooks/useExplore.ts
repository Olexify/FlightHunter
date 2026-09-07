import { useCallback, useEffect, useRef, useState } from "react";
import type { ExploreRequestInput, ExploreResponse } from "@flighthunter/shared";
import { api, ApiError } from "../api";

export interface ExploreState {
  status: "idle" | "loading" | "success" | "error";
  data: ExploreResponse | null;
  error: string | null;
}

/**
 * Same race discipline as useSearch: a new request aborts the one in flight and
 * a sequence guard ensures only the newest response is applied, so a slow first
 * query can never overwrite a fast second one.
 */
export function useExplore() {
  const [state, setState] = useState<ExploreState>({
    status: "idle",
    data: null,
    error: null,
  });

  const controllerRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    // Re-armed on every mount: StrictMode's simulated unmount would otherwise
    // leave this false forever and silently discard every response.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const run = useCallback(async (request: ExploreRequestInput): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const seq = ++seqRef.current;
    setState((s) => ({ ...s, status: "loading", error: null }));

    try {
      const data = await api.explore(request, controller.signal);
      if (seq !== seqRef.current || !mountedRef.current) return;
      setState({ status: "success", data, error: null });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (seq !== seqRef.current || !mountedRef.current) return;

      setState((s) => ({
        ...s,
        status: "error",
        error: err instanceof ApiError ? err.message : "Explore failed",
      }));
    }
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    seqRef.current++;
    setState((s) => (s.status === "loading" ? { ...s, status: s.data ? "success" : "idle" } : s));
  }, []);

  return { state, run, cancel };
}
