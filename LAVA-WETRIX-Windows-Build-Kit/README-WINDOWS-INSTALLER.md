# LAVA WETRIX — Windows installer build kit

This kit wraps the original Vite/React LAVA WETRIX game in an Electron desktop window and adds a GitHub Actions workflow to build Windows executables.

## Build using GitHub Actions

1. Create an empty GitHub repository for LAVA WETRIX.
2. Extract this ZIP.
3. Upload **all files and folders inside the extracted folder** directly to the repository's top level. Do not upload the outer folder as a single nested directory. The root should show `package.json`, `src`, `electron`, `electron-builder.yml`, and `.github`.
4. Commit the files. Open the **Actions** tab and select **Build LAVA WETRIX Windows Launcher** if needed.
5. Wait for the workflow to finish successfully. Open its Summary page and download the `LAVA-WETRIX-Windows-Installers` artifact.
6. Extract the artifact ZIP. The `release` outputs include the Windows Setup installer and portable executable.

Node.js is used by GitHub's build runner. Players do not need to install Node.js to run the packaged app.

## Notes

- The workflow uses `npm install` (not `npm ci`) because Electron packaging dependencies were added to `package.json` and the original lockfile does not include them yet.
- The workflow sets `CSC_IDENTITY_AUTO_DISCOVERY=false` because this build is not code-signed.
- The generated Windows executables have not been built or tested by this preparation step; the first GitHub Actions run performs the actual Windows build.
