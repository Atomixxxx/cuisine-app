import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { initDefaultData } from "./services/db";
import { useAppStore } from "./stores/appStore";
import { checkAndNotifyExpiringProducts } from "./services/notifications";
import { useBadgeStore } from "./stores/badgeStore";

// Initialise default data, process recurring tasks, check expiry, then render
initDefaultData()
  .then(() => useAppStore.getState().processRecurringTasks())
  .then(() => checkAndNotifyExpiringProducts())
  .then(() => useBadgeStore.getState().refreshBadges())
  .catch(() => {
    // db initialisation may fail silently on first load
  })
  .finally(() => {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>,
    );
  });
