import { type ClassValue, clsx } from "clsx";
import mime from "mime";
import type { BundledLanguage } from "shiki";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get MIME type for a filename using the mime package
 * Falls back to application/octet-stream for unknown types
 */
export function getMimeType(filename: string): string {
  return mime.getType(filename) ?? "application/octet-stream";
}

export function formatBytes(
  bytes: number,
  opts: {
    decimals?: number;
    sizeType?: "accurate" | "normal";
  } = {}
) {
  const { decimals = 0, sizeType = "normal" } = opts;

  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const accurateSizes = ["Bytes", "KiB", "MiB", "GiB", "TiB"];
  if (bytes === 0) return "0 Byte";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(decimals)} ${
    sizeType === "accurate"
      ? (accurateSizes[i] ?? "Bytes")
      : (sizes[i] ?? "Bytes")
  }`;
}

export function getLanguageFromFilename(filename: string): BundledLanguage {
  const extension = filename.split(".").pop()?.toLowerCase() || "";

  const languageMap: Record<string, BundledLanguage> = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascript",
    ts: "typescript",
    mts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "fish",
    ps1: "powershell",
    r: "r",
    lua: "lua",
    perl: "perl",
    pl: "perl",
    sql: "sql",
    html: "html",
    htm: "html",
    xml: "xml",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    json: "json",
    jsonc: "jsonc",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    ini: "ini",
    md: "markdown",
    markdown: "markdown",
    tex: "latex",
    vue: "vue",
    svelte: "svelte",
    astro: "astro",
    graphql: "graphql",
    gql: "graphql",
    dockerfile: "dockerfile",
    makefile: "makefile",
    proto: "proto",
  };

  const filenameUpper = filename.toUpperCase();
  if (filenameUpper === "DOCKERFILE") return "dockerfile";
  if (filenameUpper === "MAKEFILE") return "makefile";

  return languageMap[extension] || "text";
}
