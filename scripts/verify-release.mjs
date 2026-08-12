import { readFile } from "node:fs/promises";

const rootUrl = new URL("../", import.meta.url);

async function readJson(relativePath) {
  const contents = await readFile(new URL(relativePath, rootUrl), "utf8");
  return JSON.parse(contents);
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
}

if (errors.length > 0) {
  console.error("Release metadata verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const tagMessage = isTagBuild ? ` and tag v${packageVersion}` : "";
  console.log(`Release metadata is consistent at v${packageVersion}${tagMessage}.`);
}
