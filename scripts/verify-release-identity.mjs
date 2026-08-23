const FULL_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;

/**
 * Validate the immutable identity of a release checkout.
 *
 * Keep this function free of GitHub-specific event parsing so both the local
 * release verifier and workflow-contract tests can exercise the same rules.
 */
export function getReleaseIdentityErrors({
  isTagBuild,
  expectedTag,
  tagName,
  tagCommit,
  headCommit,
  buildCommit,
  requireOriginMain = false,
  originMainContainsHead,
}) {
  const errors = [];

  if (isTagBuild) {
    if (tagName !== expectedTag) {
      errors.push(
        `release tag ${String(tagName)} does not match package version ${expectedTag}`,
      );
    }

    if (!tagCommit) {
      errors.push(`release tag ${expectedTag} cannot be resolved to a commit`);
    } else if (!headCommit) {
      errors.push("the checked-out HEAD commit cannot be resolved");
    } else if (tagCommit !== headCommit) {
      errors.push(
        `release tag ${expectedTag} points to ${tagCommit}, not checked-out commit ${headCommit}`,
      );
    }

    if (requireOriginMain) {
      if (!headCommit) {
        // The more specific HEAD error above already explains this failure.
      } else if (originMainContainsHead === undefined) {
        errors.push(
          "origin/main cannot be resolved for release ancestry verification",
        );
      } else if (!originMainContainsHead) {
        errors.push(
          `release commit ${headCommit} is not reachable from origin/main`,
        );
      }
    }
  }

  if (buildCommit) {
    if (!FULL_COMMIT_SHA_PATTERN.test(buildCommit)) {
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

  return errors;
}
