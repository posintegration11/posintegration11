import "dotenv/config";
import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Loads your hosted Next.js site inside a native Android WebView (sideload APK).
 * Set CAPACITOR_SERVER_URL to production HTTPS (no trailing slash), e.g. https://pos.example.com
 * For emulator hitting local Next: http://10.0.2.2:3000
 * Physical device on LAN: http://192.168.x.x:3000 (same WiFi as PC; enable cleartext only for http).
 */
const raw = process.env.CAPACITOR_SERVER_URL?.trim();
const url = (raw?.replace(/\/$/, "") || "http://10.0.2.2:3000").trim();

const config: CapacitorConfig = {
  appId: "com.posintegration.pos",
  appName: "Restaurant POS",
  webDir: "www",
  android: {
    allowMixedContent: true,
    captureInput: true,
  },
  server: {
    url,
    cleartext: url.startsWith("http://"),
  },
};

export default config;
