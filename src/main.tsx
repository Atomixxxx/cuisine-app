import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { initDefaultData } from "./services/db";
import { useAppStore } from "./stores/appStore";
import { checkAndNotifyExpiringProducts } from "./services/notifications";
import { useBadgeStore } from "./stores/badgeStore";
import { runWeeklyAutoBackup } from "./services/backup";
import { showError, showSuccess } from "./stores/toastStore";
import { logger } from "./services/logger";
import { migrateLegacyPinIfNeeded } from "./services/pin";
import { runTextRepairMigration } from "./services/textRepairMigration";
import { runPriceRepairMigration } from "./services/priceRepairMigration";

async function requestPersistentStorage(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch (error) {
    logger.warn("navigator.storage.persist failed", { error });
  }
}

async function bootstrapApp(): Promise<void> {
  try {
    await migrateLegacyPinIfNeeded();
  } catch (error) {
    logger.warn("migrateLegacyPinIfNeeded failed", { error });
  }

  try {
    await initDefaultData();
  } catch (error) {
    logger.error("initDefaultData failed", { error });
    showError("Initialisation de la base locale impossible");
  }

  await requestPersistentStorage();

  try {
    const status = await runTextRepairMigration();
    if (status === "done") {
      logger.info("text repair migration completed");
    }
  } catch (error) {
    logger.warn("runTextRepairMigration failed", { error });
  }

  try {
    const status = await runPriceRepairMigration();
    if (status === "done") {
      logger.info("price repair migration completed");
    }
  } catch (error) {
    logger.warn("runPriceRepairMigration failed", { error });
  }

  try {
    await useAppStore.getState().processRecurringTasks();
  } catch (error) {
    logger.error("processRecurringTasks failed", { error });
    showError("Traitement des taches recurrentes indisponible");
  }

  try {
    await checkAndNotifyExpiringProducts();
  } catch (error) {
    logger.error("checkAndNotifyExpiringProducts failed", { error });
    showError("Verification des produits expirants indisponible");
  }

  try {
    const status = await runWeeklyAutoBackup();
    if (status === "done") showSuccess("Backup auto hebdomadaire effectue");
  } catch (error) {
    logger.error("runWeeklyAutoBackup failed", { error });
    showError("Backup automatique indisponible");
  }

  try {
    await useBadgeStore.getState().refreshBadges();
  } catch (error) {
    logger.error("refreshBadges failed", { error });
    showError("Mise a jour des badges indisponible");
  }
}

bootstrapApp().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
});
