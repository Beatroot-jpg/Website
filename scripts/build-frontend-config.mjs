import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_API_BASE_URL = "http://localhost:3000/api";
const outputDirectory = path.join(process.cwd(), "Frontend", "assets", "js");
const outputFile = path.join(outputDirectory, "runtime-config.js");

function normalizeApiBaseUrl(value) {
  const trimmedValue = typeof value === "string" ? value.trim() : "";

  if (!trimmedValue) {
    return DEFAULT_API_BASE_URL;
  }

  const withoutTrailingSlash = trimmedValue.replace(/\/+$/, "");
  return withoutTrailingSlash.endsWith("/api") ? withoutTrailingSlash : `${withoutTrailingSlash}/api`;
}

const configuredApiBaseUrl = normalizeApiBaseUrl(
  process.env.NETLIFY_API_BASE_URL || process.env.API_BASE_URL
);

const fileContents = `window.APP_CONFIG = {
  ...(window.APP_CONFIG || {}),
  API_BASE_URL: ${JSON.stringify(configuredApiBaseUrl)}
};
`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, fileContents, "utf8");

console.log(`Generated frontend runtime config at ${outputFile}`);
console.log(`Resolved API base URL: ${configuredApiBaseUrl}`);
