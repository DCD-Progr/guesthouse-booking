import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {window.self !== window.top ? (
      <main className="auth">
        <section>
          <h1>Open Guesthouse directly</h1>
          <p>
            For your security, booking actions are unavailable inside another
            page.
          </p>
          <a
            href={window.location.origin + window.location.pathname}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the application
          </a>
        </section>
      </main>
    ) : (
      <App />
    )}
  </StrictMode>,
);
