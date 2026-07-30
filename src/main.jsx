import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { initializePwa } from "./lib/pwa";
import TelegramMiniAppBridge from "./components/TelegramMiniAppBridge";
import LanguageAutoTranslate from "./components/LanguageAutoTranslate";
import "./styles/global.css";

initializePwa();

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
          <LanguageAutoTranslate />
          <TelegramMiniAppBridge />
          <App />
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
