---
description: A published GitHub release starts the release: its tag sets the version, CI stages it on npm through trusted publishing for a maintainer to approve with 2FA, and the generated release notes are the only changelog.
status: accepted
---

# ADR-0007: Release from a GitHub release's tag

## Context

The package is a dev dependency, installed and configured mostly by coding agents, which read the README and the docs at the installed version rather than a changelog. It has one package and one maintainer, and changes reach `main` through pull requests that pass `verify`.

The common setup for a single package is a local tool such as `bumpp` that commits the new version, tags it and pushes both, and a workflow on the tag that publishes. That release commit has to go straight to `main`, or through a pull request of its own. Multi-package tools such as changesets add a file to every pull request and a release pull request on top.

## Decision

A maintainer publishes a GitHub release from `main`, and its tag (`v1.2.3`) is the version. The `release` workflow checks that the tag is a plain `vX.Y.Z` on a commit in `main`, sets that version in `package.json` without committing it, runs `verify`, and stages the package with `pnpm stage publish` through npm's trusted publishing. A maintainer approves the staged version with 2FA to put it live; the trusted publisher allows staging only. `package.json` stays at `0.0.0` in the repository. There is no `CHANGELOG.md`: the release notes GitHub generates from the merged pull requests are the record of what changed.

## Rationale

**Two steps, nothing to commit.** Creating the release and approving the staged version are the only manual steps, so there is no release commit to get onto `main` and no version for a pull request to conflict on.

**A person approves every version.** The checker runs from agent hooks after every edit, on users' machines and inside sessions that hold their credentials, so a malicious version would do harm quickly. Agents on the maintainer's machine can create GitHub releases, and so could a leaked GitHub token. Staging means neither can put a version live without the maintainer's 2FA.

**No stored secret.** npm trusts the workflow's identity to stage, so there is no npm token to leak or rotate, and every version carries provenance that links it to the commit and workflow that built it.

**No changelog to write.** Pull request titles already follow Conventional Commits, and the generated notes list them. A curated changelog would cost work on every change for readers this package mostly doesn't have.

## Consequences

- The repository's `package.json` doesn't show the published version; npm and the releases page do.
- npm only accepts trusted publishing for a package that already exists, so the package was created once by hand, with a staged upload that left only npm's `0.0.0-stage` placeholder, and the workflow stages every real version.
- Provenance is attached only when the repository is public, so the first workflow release comes after the repository goes public.
- There are no prereleases: the workflow publishes only plain `vX.Y.Z` tags, all as `latest`.
