import { assertPermittedDiff } from "../contracts/index.js";

export function validateRawDiff(raw: string, allowedPaths: string[]) {
  const fields = raw.split("\0");
  if (fields.pop() !== "") throw new Error("Diff must be NUL terminated.");
  if (fields.length % 2) throw new Error("Malformed raw diff.");
  const paths: string[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const header = /^:(\d{6}) (\d{6}) ([a-f0-9]{40}) ([a-f0-9]{40}) ([AMDT])$/.exec(fields[index]);
    if (!header) throw new Error("Unexpected raw diff status; renames must be expanded.");
    const [, before, after] = header;
    if (!["000000", "100644"].includes(before) || !["000000", "100644"].includes(after)) throw new Error("Candidate changes cannot introduce or modify symlinks, executable files or submodules.");
    paths.push(fields[index + 1]);
  }
  assertPermittedDiff(paths, allowedPaths);
  return paths;
}
