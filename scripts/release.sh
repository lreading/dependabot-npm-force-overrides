#!/usr/bin/env bash

usage() {
  echo "Usage: $0 [--dry-run] patch|minor|major"
  echo "       $0 --help"
  echo
  echo "Creates a vMAJOR.MINOR.PATCH tag. The bump argument does not include 'v'."
}

DRY_RUN=false
BUMP=""

for argument in "$@"; do
  case "$argument" in
    --dry-run|-n)
      DRY_RUN=true
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    patch|minor|major)
      if [ -n "$BUMP" ]; then
        echo "Only one version bump is allowed." >&2
        usage >&2
        exit 2
      fi
      BUMP="$argument"
      ;;
    *)
      echo "Unknown argument: $argument" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$BUMP" ]; then
  echo "A version bump is required: patch, minor, or major." >&2
  usage >&2
  exit 2
fi

for command_name in git node npm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
done

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "Run this script from inside the git repository." >&2
  exit 1
fi
cd "$REPO_ROOT" || exit 1

if [ ! -f package.json ] || [ ! -f package-lock.json ]; then
  echo "package.json and package-lock.json must exist at the repository root." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree must be clean before starting a release." >&2
  exit 1
fi

CURRENT_TAG="$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n 1)"
if [ -n "$CURRENT_TAG" ]; then
  BASE_VERSION="${CURRENT_TAG#v}"
else
  BASE_VERSION="$(node -p "require('./package.json').version")"
fi

if [[ ! "$BASE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Cannot determine a valid current version: $BASE_VERSION" >&2
  exit 1
fi

IFS=. read -r MAJOR MINOR PATCH <<< "$BASE_VERSION"
case "$BUMP" in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
esac

VERSION="$MAJOR.$MINOR.$PATCH"
TAG="v$VERSION"

if git rev-parse --quiet --verify "refs/tags/$TAG" >/dev/null; then
  echo "Tag already exists locally: $TAG" >&2
  exit 1
fi

echo "Current release: ${CURRENT_TAG:-package.json@$BASE_VERSION}"
echo "Next release:    $TAG"

if [ "$DRY_RUN" = true ]; then
  echo "Dry run: no files, commits, tags, or remotes will be changed."
  echo "Would run: npm version $VERSION --no-git-tag-version --ignore-scripts"
  echo "Would run: npm run ci"
  echo "Would commit: chore: release $TAG"
  echo "Would push the commit and tag; the tag push would trigger .github/workflows/release.yml."
  exit 0
fi

if ! npm version "$VERSION" --no-git-tag-version --ignore-scripts; then
  echo "Failed to update package.json/package-lock.json." >&2
  exit 1
fi

if ! npm run ci; then
  echo "Release checks failed. Review the working tree before continuing." >&2
  exit 1
fi

if ! git diff --quiet -- dist/index.js; then
  echo "dist/index.js changed during the build; include the generated bundle in the release commit." >&2
fi

git add package.json package-lock.json dist/index.js
if git diff --cached --quiet; then
  echo "No release files changed; aborting." >&2
  exit 1
fi

if ! git commit -m "chore: release $TAG"; then
  echo "Release commit failed." >&2
  exit 1
fi

if ! git tag -a "$TAG" -m "Release $TAG"; then
  echo "Release tag creation failed." >&2
  exit 1
fi

BRANCH="$(git branch --show-current)"
if [ -z "$BRANCH" ]; then
  echo "Cannot push from a detached HEAD." >&2
  exit 1
fi

if ! git push origin "HEAD:$BRANCH"; then
  echo "Commit push failed; tag $TAG remains local." >&2
  exit 1
fi

if ! git push origin "$TAG"; then
  echo "Tag push failed; tag $TAG remains local." >&2
  exit 1
fi

echo "Pushed $TAG. The release workflow will create the GitHub Release and update the README."
