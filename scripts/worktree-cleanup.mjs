// Removes a merged task branch: its worktree, its git branch locally and on origin, and its Neon branch.
// Run from the main checkout: pnpm worktree:cleanup <git branch>
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const NEON_PROJECT_ID = "round-term-82774312";
const branch = process.argv[2];

const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const git = (...args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
  } catch (error) {
    return fail(`git ${args.join(" ")} failed with exit code ${error.status}.`);
  }
};
// The Neon CLI's JSON output stays in memory: only branch names are printed.
const neon = (...args) =>
  spawnSync("pnpm", ["exec", "neon", "--no-analytics", ...args, "--project-id", NEON_PROJECT_ID, "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    shell: process.platform === "win32",
  });
const neonBranchExists = (name) => {
  const result = neon("branches", "list");
  if (result.status !== 0) fail(`Listing Neon branches failed with exit code ${result.status}.`);
  return JSON.parse(result.stdout).some((entry) => entry.name === name);
};

if (!branch) fail("Usage: pnpm worktree:cleanup <git branch>");
if (branch === "master") fail("Refusing to clean up master.");

const worktree = git("worktree", "list", "--porcelain")
  .split(/\r?\n\r?\n/)
  .map((block) => Object.fromEntries(block.split(/\r?\n/).map((line) => line.split(/ (.*)/, 2))))
  .find((entry) => entry.branch === `refs/heads/${branch}`);
if (!worktree) fail(`No worktree is checked out on branch ${branch}.`);
if (path.resolve(worktree.worktree) === process.cwd()) fail("Run this from the main checkout, not from the worktree.");
if (git("-C", worktree.worktree, "status", "--porcelain")) fail(`Worktree ${worktree.worktree} has uncommitted changes.`);
if (spawnSync("git", ["merge-base", "--is-ancestor", branch, "master"]).status !== 0) {
  fail(`Branch ${branch} is not merged into master.`);
}

console.log(`Removing worktree ${worktree.worktree}`);
// git worktree remove hits "Filename too long" on Windows; rmSync finishes the job.
spawnSync("git", ["worktree", "remove", "--force", worktree.worktree], { stdio: "ignore" });
git("worktree", "prune");
fs.rmSync(worktree.worktree, { recursive: true, force: true, maxRetries: 5 });

console.log(`Deleting branch ${branch} locally`);
git("branch", "-D", branch);
if (git("ls-remote", "--heads", "origin", branch)) {
  console.log(`Deleting branch ${branch} on origin`);
  git("push", "origin", "--delete", branch);
} else {
  console.log(`Branch ${branch} is already gone from origin`);
}

const neonBranch = `wt/${branch}`;
for (let attempt = 1; neonBranchExists(neonBranch); attempt += 1) {
  if (attempt > 2) fail(`Neon branch ${neonBranch} still exists after two delete attempts.`);
  console.log(`Deleting Neon branch ${neonBranch} (attempt ${attempt})`);
  neon("branches", "delete", neonBranch);
}
console.log(`Neon branch ${neonBranch} is gone. Cleanup of ${branch} complete.`);
