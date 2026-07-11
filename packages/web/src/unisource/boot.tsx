import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { UnisourceApp } from "./app";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("root element is missing");
}

document.title = "同源 UniSource";
document.body.classList.add("us-body");

createRoot(root).render(
  <StrictMode>
    <UnisourceApp />
  </StrictMode>,
);
