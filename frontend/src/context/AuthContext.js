import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

const AuthContext = createContext(null);

// Fire background prefetches so first navigation to critical pages is instant.
// Keep this list SMALL — each item is a Supabase round-trip.
// Heavy/less-visited pages (inventory history, assets, templates) load on demand.
function _prefetchCommonData(queryClient) {
  const token = localStorage.getItem("solarix_token");
  if (!token) return;

  const runPrefetch = () => {
    const prefetchList = [
      {
        key: queryKeys.clients.list(),
        fn: () => api.get("/clients").then((r) => r.data || []),
        stale: 5 * 60 * 1000,
      },
      {
        key: queryKeys.clients.stats(),
        fn: () => api.get("/clients/stats").then((r) => r.data),
        stale: 5 * 60 * 1000,
      },
      {
        key: queryKeys.projects.list(),
        fn: () => api.get("/projects").then((r) => r.data || []),
        stale: 5 * 60 * 1000,
      },
      {
        key: queryKeys.team.list(),
        fn: () => api.get("/employees").then((r) => r.data || []),
        stale: 10 * 60 * 1000,
      },
      {
        key: queryKeys.company.detail(),
        fn: () => api.get("/company").then((r) => r.data),
        stale: 10 * 60 * 1000,
      },
      {
        key: queryKeys.materialRequests.list(),
        fn: () => api.get("/material-requests").then((r) => r.data || []),
        stale: 5 * 60 * 1000,
      },
    ];

    prefetchList.forEach(({ key, fn, stale }) => {
      // Skip if already cached and fresh — don't fire unnecessary network requests
      const existing = queryClient.getQueryData(key);
      if (existing !== undefined) return;

      queryClient.prefetchQuery({
        queryKey: key,
        queryFn: fn,
        staleTime: stale,
      }).catch(() => { /* Background prefetch failed — non-critical, data will load on demand */ });
    });
  };

  // Schedule prefetch after initial frame paint to avoid blocking First Contentful Paint
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(runPrefetch, { timeout: 1000 });
  } else {
    setTimeout(runPrefetch, 300);
  }
}

export const AuthProvider = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  // Prevent React StrictMode double-mount from firing two /auth/me fetches
  const fetchingRef = useRef(false);

  const fetchMe = useCallback(async () => {
    if (fetchingRef.current) return;
    const token = localStorage.getItem("solarix_token");
    if (!token) {
      setUser(false);
      setCompany(null);
      setLoading(false);
      return;
    }
    fetchingRef.current = true;
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setCompany(data.company);
      // Prefetch commonly used data so first navigation is instant
      _prefetchCommonData(queryClient);
    } catch {
      setUser(false);
      setCompany(null);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [queryClient]);

  useEffect(() => { fetchMe(); }, [fetchMe]);


  // Allow any component to ask AuthContext to re-fetch /auth/me
  // by dispatching window event `solarix:auth-refresh`.
  useEffect(() => {
    const handler = () => { fetchMe(); };
    window.addEventListener("solarix:auth-refresh", handler);
    return () => window.removeEventListener("solarix:auth-refresh", handler);
  }, [fetchMe]);

  const login = async (identifier, password) => {
    const { data } = await api.post("/auth/login", { identifier, password });
    if (data.token) localStorage.setItem("solarix_token", data.token);
    if (data.refresh_token) localStorage.setItem("solarix_refresh_token", data.refresh_token);
    setUser(data.user);
    setCompany(data.company);
    // Prefetch after login so navigating to clients/inventory/projects is instant
    _prefetchCommonData(queryClient);
    return data;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    if (data.token) localStorage.setItem("solarix_token", data.token);
    if (data.refresh_token) localStorage.setItem("solarix_refresh_token", data.refresh_token);
    setUser(data.user);
    setCompany(data.company);
    return data;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("solarix_token");
    localStorage.removeItem("solarix_refresh_token");
    setUser(false);
    setCompany(null);
    // Clear all cached data on logout
    queryClient.clear();
  };

  const refreshCompany = async () => {
    const { data } = await api.get("/company");
    setCompany(data);
  };

  return (
    <AuthContext.Provider value={{ user, company, loading, login, register, logout, refreshCompany, setCompany }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
