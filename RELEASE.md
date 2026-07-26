# Release

1. `git checkout main && git pull`
2. Preview the next release. The argument is `patch`, `minor`, or `major`—do not include `v` or a version number:
   `./scripts/release.sh --dry-run minor`
3. Run the release:
   `./scripts/release.sh minor`
4. Wait for the release workflow to finish. It creates the GitHub Release and updates the README.

