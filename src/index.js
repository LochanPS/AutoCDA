import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ProProvider } from "./pro/ProContext";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <ProProvider>
    <App />
  </ProProvider>
);
