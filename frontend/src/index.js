import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "@/index.css";
import App from "@/App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5 minutes — data stays fresh
      gcTime: Infinity,               // NEVER garbage-collect during the session
      retry: 1,                       // one retry on network error
      refetchOnWindowFocus: false,    // don't refetch when switching browser tabs
      refetchOnReconnect: "always",   // do refetch if network was lost
      refetchOnMount: false,          // KEY: return cached data instantly on remount
    },
  },
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection in WebView:", event.reason);
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
