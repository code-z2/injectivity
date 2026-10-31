import stylex from "@stylexjs/unplugin";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const rootDir = new URL(".", import.meta.url).pathname;

export default defineConfig({
  plugins: [
    stylex.vite({
      unstable_moduleResolution: {
        type: "experimental_crossFileParsing",
        rootDir,
      },
    }),
    vue(),
  ],
  server: { port: 5173 },
});
