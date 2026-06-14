import React from "react";
import { createRoot } from "react-dom/client";
import { RaporView } from "./RaporView";
import "./rapor.css";

const root = document.getElementById("rapor-root");
if (!root) throw new Error("#rapor-root yok");
createRoot(root).render(
  <React.StrictMode>
    <RaporView />
  </React.StrictMode>,
);
