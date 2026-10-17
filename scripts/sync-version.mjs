// apps/web/package.json holds the one ProofBox version; Changesets bumps it.
// This copies it into every Python app's pyproject.toml, or with --check fails on drift.
import { readFileSync, writeFileSync } from "node:fs";

const check = process.argv.includes("--check");
const { version } = JSON.parse(readFileSync("apps/web/package.json", "utf8"));
const projectVersion = /^(\[project\][^[]*?^version = )"([^"]+)"/ms;

for (const pyprojectPath of [
  "apps/api/pyproject.toml",
  "apps/printer/pyproject.toml",
  "apps/vision/pyproject.toml",
]) {
  const pyproject = readFileSync(pyprojectPath, "utf8");
  const found = pyproject.match(projectVersion)?.[2];
  if (!found) throw new Error(`${pyprojectPath} has no [project] version`);

  if (found !== version) {
    if (check) {
      console.error(`${pyprojectPath}: version ${found}, apps/web/package.json says ${version}`);
      process.exitCode = 1;
    } else {
      writeFileSync(pyprojectPath, pyproject.replace(projectVersion, `$1"${version}"`));
    }
  }
}
