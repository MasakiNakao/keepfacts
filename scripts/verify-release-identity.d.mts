export interface ReleaseIdentityInput {
  isTagBuild: boolean;
  expectedTag: string;
  tagName?: string;
  tagCommit?: string;
  headCommit?: string;
  buildCommit?: string;
  requireOriginMain?: boolean;
  originMainContainsHead?: boolean;
}

export function getReleaseIdentityErrors(
  input: ReleaseIdentityInput,
): string[];
