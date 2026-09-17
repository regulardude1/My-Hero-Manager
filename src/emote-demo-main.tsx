// Entry point for emote-demo.html (vite multi-page; dev only).
// Renders the same EmoteSkeleton + EmoteControls the app's right-side
// viewer uses, but loads fixture .psk/.md5anim files straight from /fixtures
// so the animation pipeline can be tested without Tauri.
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import EmoteDemo from "./EmoteDemo";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <EmoteDemo />
  </StrictMode>
);
