// FOUC önle — React render'dan önce dark class'ı uygula (CSP inline script yasak)
import "./tema-init";

import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import "maplibre-gl/dist/maplibre-gl.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root yok");
createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary etiket="Cadastrum">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
