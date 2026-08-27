import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";
import "./components.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root が見つかりません。index.html を確認してください。");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
