import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";

const rootUrl = new URL("../", import.meta.url);

async function readJson(relativePath) {
  const contents = await readFile(new URL(relativePath, rootUrl), "utf8");
  return JSON.parse(contents);
}

function readGitRevision(revision) {
  try {
    return execFileSync("git", ["rev-parse", revision], {
      cwd: rootUrl,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

const [packageJson, packageLock, changelog] = await Promise.all([
  readJson("package.json"),
  readJson("package-lock.json"),
  readFile(new URL("CHANGELOG.md", rootUrl), "utf8"),
]);

const errors = [];
const packageVersion = packageJson.version;
const lockVersion = packageLock.version;
const lockRootVersion = packageLock.packages?.[""]?.version;
const semanticVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (
  typeof packageVersion !== "string" ||
  !semanticVersionPattern.test(packageVersion)
) {
  errors.push(`package.json has an invalid version: ${String(packageVersion)}`);
}

if (lockVersion !== packageVersion) {
  errors.push(
    `package-lock.json version ${String(lockVersion)} does not match package.json ${String(packageVersion)}`,
  );
}

if (lockRootVersion !== packageVersion) {
  errors.push(
    `package-lock.json root package version ${String(lockRootVersion)} does not match package.json ${String(packageVersion)}`,
  );
}

const changelogVersionMatch = changelog.match(
  /^## \[([^\]]+)\](?:\s+-\s+\d{4}-\d{2}-\d{2})?\s*$/m,
);
const changelogVersion = changelogVersionMatch?.[1];

if (!changelogVersion) {
  errors.push("CHANGELOG.md does not contain a version heading");
} else if (changelogVersion !== packageVersion) {
  errors.push(
    `CHANGELOG.md latest version ${changelogVersion} does not match package.json ${String(packageVersion)}`,
  );
}

const isTagBuild =
  process.env.GITHUB_REF_TYPE === "tag" ||
  process.env.GITHUB_REF?.startsWith("refs/tags/");

if (isTagBuild) {
  const tagName =
    process.env.GITHUB_REF_NAME ?? process.env.GITHUB_REF?.slice("refs/tags/".length);
  const expectedTag = `v${packageVersion}`;

  if (tagName !== expectedTag) {
    errors.push(
      `release tag ${String(tagName)} does not match package version ${expectedTag}`,
    );
  }

  const tagCommit = readGitRevision(`${expectedTag}^{commit}`);
  const headCommit = readGitRevision("HEAD");
  if (!tagCommit) {
    errors.push(`release tag ${expectedTag} cannot be resolved to a commit`);
  } else if (!headCommit) {
    errors.push("the checked-out HEAD commit cannot be resolved");
  } else if (tagCommit !== headCommit) {
    errors.push(
      `release tag ${expectedTag} points to ${tagCommit}, not checked-out commit ${headCommit}`,
    );
  }
}

const buildCommit = process.env.VITE_COMMIT_SHA?.trim();
if (buildCommit) {
  const fullCommitPattern = /^[0-9a-f]{40}$/u;
  const headCommit = readGitRevision("HEAD");

  if (!fullCommitPattern.test(buildCommit)) {
    errors.push(
      `VITE_COMMIT_SHA must be a full lowercase 40-character Git SHA, received ${buildCommit}`,
    );
  } else if (!headCommit) {
    errors.push("the checked-out HEAD commit cannot be resolved");
  } else if (buildCommit !== headCommit) {
    errors.push(
      `VITE_COMMIT_SHA ${buildCommit} does not match checked-out commit ${headCommit}`,
    );
  }
}

const [indexHtml, shareCardRenderer] = await Promise.all([
  readFile(new URL("index.html", rootUrl), "utf8"),
  readFile(new URL("scripts/render-share-card.mjs", rootUrl), "utf8"),
]);
const evergreenShareImage = "keepfacts-share.jpg";
const patchVersionPattern = /KeepFacts\s+v\d+\.\d+\.\d+/u;

if (!indexHtml.includes(evergreenShareImage)) {
  errors.push(`index.html does not reference ${evergreenShareImage}`);
}
if (patchVersionPattern.test(indexHtml)) {
  errors.push("index.html social metadata must not hard-code a patch version");
}
if (!shareCardRenderer.includes(evergreenShareImage)) {
  errors.push(`share-card renderer does not output ${evergreenShareImage}`);
}
if (patchVersionPattern.test(shareCardRenderer)) {
  errors.push("share-card renderer must not hard-code a patch version");
}
try {
  await access(new URL(`public/${evergreenShareImage}`, rootUrl));
} catch {
  errors.push(`public/${evergreenShareImage} is missing`);
}

if (errors.length > 0) {
  console.error("Release metadata verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const tagMessage = isTagBuild ? ` and tag v${packageVersion}` : "";
  console.log(`Release metadata is consistent at v${packageVersion}${tagMessage}.`);
}
