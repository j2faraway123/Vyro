import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Desktop app: suppress the browser's default context menu except in text fields.
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest("input, textarea, [contenteditable], .select-text")) e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
