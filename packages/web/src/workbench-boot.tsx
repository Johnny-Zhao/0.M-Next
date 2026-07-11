import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import { registerInstalledPlugins } from "./plugins";
import "./styles.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("root element is missing");
}

registerInstalledPlugins();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
