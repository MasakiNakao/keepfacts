import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getReleaseIdentityErrors } from "../scripts/verify-release-identity.mjs";

const GOOD_SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER_SHA = "89abcdef0123456789abcdef0123456789abcdef";

test("accepts only a tag, checkout, build, and main ancestor with one identity", () => {
  assert.deepEqual(
    getReleaseIdentityErrors({
      isTagBuild: true,
      expectedTag: "v0.5.0",
      tagName: "v0.5.0",
      tagCommit: GOOD_SHA,
      headCommit: GOOD_SHA,
      buildCommit: GOOD_SHA,
      requireOriginMain: true,
      originMainContainsHead: true,
    }),
    [],
  );
});

test("rejects every mutable or untrusted release identity mismatch", () => {
  const errors = getReleaseIdentityErrors({
    isTagBuild: true,
    expectedTag: "v0.5.0",
    tagName: "v0.5.1",
    tagCommit: OTHER_SHA,
    headCommit: GOOD_SHA,
    buildCommit: OTHER_SHA,
    requireOriginMain: true,
    originMainContainsHead: false,
  });

  assert.deepEqual(errors, [
    "release tag v0.5.1 does not match package version v0.5.0",
    `release tag v0.5.0 points to ${OTHER_SHA}, not checked-out commit ${GOOD_SHA}`,
    `release commit ${GOOD_SHA} is not reachable from origin/main`,
    `VITE_COMMIT_SHA ${OTHER_SHA} does not match checked-out commit ${GOOD_SHA}`,
  ]);
});

test("fails closed when release ancestry cannot be verified", () => {
  assert.deepEqual(
    getReleaseIdentityErrors({
      isTagBuild: true,
      expectedTag: "v0.5.0",
      tagName: "v0.5.0",
      tagCommit: GOOD_SHA,
      headCommit: GOOD_SHA,
      buildCommit: GOOD_SHA,
      requireOriginMain: true,
      originMainContainsHead: undefined,
    }),
    ["origin/main cannot be resolved for release ancestry verification"],
  );
});

test("keeps Pages deployment on main while binding its build to successful tag CI", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/deploy-pages.yml", import.meta.url),
    "utf8",
  );
  const ci = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /^  workflow_run:\n    workflows: \[CI\]/mu);
  assert.doesNotMatch(workflow, /^  push:\n    tags:/mu);
  assert.match(
    workflow,
    /github\.event\.workflow_run\.conclusion == 'success'/u,
  );
  assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/u);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(
    workflow,
    /github\.event\.workflow_run\.head_sha \|\| format\('refs\/tags\/\{0\}', inputs\.release_tag\)/u,
  );
  assert.match(
    workflow,
    /if \[\[ "\$verified_sha" != "\$checked_out_sha" \]\]; then/u,
  );
  assert.match(
    workflow,
    /git merge-base --is-ancestor "\$checked_out_sha" refs\/remotes\/origin\/main/u,
  );
  assert.match(workflow, /^    environment:\n      name: github-pages/mu);
  assert.match(workflow, /timeout-minutes: 30/u);
  assert.match(workflow, /timeout-minutes: 15/u);
  assert.match(workflow, /^    permissions:\n      pages: write\n      id-token: write/mu);
  assert.match(
    workflow,
    /steps:\n      - name: Configure Pages\n        uses: actions\/configure-pages@[0-9a-f]{40}/u,
  );
  assert.match(
    workflow,
    /format\('pages-skipped-\{0\}', github\.run_id\)/u,
  );

  assert.match(ci, /fetch-depth: 0/u);
  assert.match(
    ci,
    /KEEPFACTS_REQUIRE_ORIGIN_MAIN: \$\{\{ github\.ref_type == 'tag' \}\}/u,
  );
});
