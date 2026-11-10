#!/bin/bash
# Build a new sep-buddy.ipa, upload it as a GitHub Release, and add it to source.json so
# SideStore shows "Update available" on your friend's phone.
#
# Only needed for NATIVE changes (new expo-... package, app.json plugins/permissions/icon,
# SDK upgrade). Code-only changes go out with:  npm run publish-update -- "message"
#
# Usage:
#   1. bump "version" in app.json (e.g. 1.0.0 → 1.1.0)
#   2. ./scripts/release-ipa.sh "What's new in this build"
#   (add --no-build to release the dist/sep-buddy.ipa that's already there)
#
# Needs: Xcode, and the GitHub CLI logged in (brew install gh && gh auth login).
set -euo pipefail
cd "$(dirname "$0")/.."

NOTES="${1:-New version}"
BUILD=1
[[ "${2:-}" == "--no-build" || "${1:-}" == "--no-build" ]] && BUILD=0
[[ "${1:-}" == "--no-build" ]] && NOTES="${2:-New version}"

REPO="asytrix99/sep-buddy"
VERSION=$(node -p 'require("./app.json").expo.version')
TAG="v$VERSION"
IPA="dist/sep-buddy.ipa"
DERIVED="${TMPDIR:-/tmp}/rydmap-ipa"
STAGE="${TMPDIR:-/tmp}/ipa-stage"

command -v gh >/dev/null || { echo "✗ GitHub CLI missing: brew install gh && gh auth login"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "✗ Not logged in to GitHub: gh auth login"; exit 1; }
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  echo "✗ $TAG is already released. Bump \"version\" in app.json first."; exit 1
fi

if [[ $BUILD == 1 ]]; then
  echo "→ Regenerating the iOS project..."
  npx expo prebuild --platform ios >/dev/null
  echo "→ Building $TAG (takes a few minutes)..."
  mkdir -p dist
  xcodebuild -workspace ios/rydmap.xcworkspace -scheme rydmap -configuration Release -sdk iphoneos \
    -destination generic/platform=iOS -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO COMPILER_INDEX_STORE_ENABLE=NO build > dist/ipa-build.log 2>&1 \
    || { echo "✗ Build failed — see dist/ipa-build.log"; tail -20 dist/ipa-build.log; exit 1; }
  rm -rf "$STAGE" && mkdir -p "$STAGE/Payload"
  cp -R "$DERIVED/Build/Products/Release-iphoneos/rydmap.app" "$STAGE/Payload/"
  rm -f "$IPA" && (cd "$STAGE" && zip -qry "$OLDPWD/$IPA" Payload)
fi
[[ -f "$IPA" ]] || { echo "✗ $IPA not found"; exit 1; }

BUILT=$(unzip -p "$IPA" Payload/rydmap.app/Info.plist | plutil -extract CFBundleShortVersionString raw -o - - 2>/dev/null || echo "?")
[[ "$BUILT" == "$VERSION" ]] || { echo "✗ $IPA is version $BUILT but app.json says $VERSION — rebuild without --no-build"; exit 1; }
MINOS=$(unzip -p "$IPA" Payload/rydmap.app/Info.plist | plutil -extract MinimumOSVersion raw -o - - 2>/dev/null || echo "16.4")
SIZE=$(stat -f%z "$IPA")

echo "→ Uploading GitHub Release ${TAG}..."
gh release create "$TAG" "$IPA" -R "$REPO" --title "Sep Buddy $VERSION" --notes "$NOTES"
URL="https://github.com/$REPO/releases/download/$TAG/sep-buddy.ipa"

echo "→ Updating source.json..."
VERSION="$VERSION" NOTES="$NOTES" SIZE="$SIZE" URL="$URL" MINOS="$MINOS" node -e '
const fs = require("fs");
const s = JSON.parse(fs.readFileSync("source.json", "utf8"));
const app = s.apps[0];
const date = new Date().toISOString().slice(0, 10);
const v = { version: process.env.VERSION, buildVersion: "1", date, size: +process.env.SIZE,
  downloadURL: process.env.URL, localizedDescription: process.env.NOTES, minOSVersion: process.env.MINOS };
app.versions = [v, ...app.versions.filter((x) => x.version !== v.version)];
// Older SideStore/AltStore versions read these top-level fields instead of versions[].
Object.assign(app, { version: v.version, versionDate: date, versionDescription: v.localizedDescription, downloadURL: v.downloadURL, size: v.size });
fs.writeFileSync("source.json", JSON.stringify(s, null, 2) + "\n");
'

git pull --rebase --autostash -q
git add source.json
git commit -q -m "Release Sep Buddy $TAG"
git push -q
echo "✓ Released $TAG. SideStore picks it up within a few minutes (Sources → pull to refresh)."
