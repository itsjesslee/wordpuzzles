import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const base =
  process.env.BASE_PATH && process.env.BASE_PATH !== "/"
    ? process.env.BASE_PATH
    : "/";

// https://vitejs.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
});
