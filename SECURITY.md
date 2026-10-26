# Security

## Supported versions

Only the latest published version of `oxlint-plugin-complexity-hints` gets security fixes.

## Reporting a vulnerability

Report it privately through GitHub: on the repository's **Security** tab, choose **Report a vulnerability**. Please don't open a public issue, discussion or pull request for it.

Include what's affected, how to reproduce it, and the impact you see. You'll get a reply within a week. Once a fix is published, the advisory is made public, with credit to you unless you'd rather not be named.

## Scope

The package runs inside Oxlint on the code it lints, and its `complexity-hints` command runs `git` and the project's own Oxlint in the user's repository. Reports about either are in scope: for example, code it lints or a repository it checks that makes it run something it shouldn't, or read or write files outside the project.
