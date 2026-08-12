import packageMetadata from "../package.json";

export const APP_VERSION = packageMetadata.version;

const commitSha = import.meta.env.VITE_COMMIT_SHA?.trim();

export const APP_COMMIT_SHA = commitSha || "local";
