# Turbo Folding: Extension Lifecycle & Presentation Rules

## 1. Extension Delivery Workflow
When completing any coding task, feature modification, or bugfix in this VS Code extension workspace:

1. **Bump Version**: Increment the version by 0.1 (minor version) for each commit (`npm version minor --no-git-tag-version`).
2. **Compile & Verify**: Ensure all TypeScript files are compiled cleanly without errors (`npm run compile`).
3. **Build VSIX Package**: Package the extension into a `.vsix` bundle using `npx -y @vscode/vsce package --allow-star-activation` (or equivalent packaging command) so the extension artifact is always up to date with the new version.
4. **Commit Changes**: Stage all relevant changes (`git add .`) and create a concise, descriptive git commit (`git commit -m "..."`).
5. **Push to Remote**: Push the committed changes to the upstream branch (`git push`).

## 2. Folding Manager UI & Formatting Guidelines
- **Flat List View**: Display level depth using arrow prefixes: `"-> "` for level 1, adding 2 extra `"-"` at the beginning for each subsequent level up to level 8 (`->`, `--->`, `----->`, `------->`, etc.).
- **Tree View Mode**: Display actual parent-child nesting determined by document folding scopes. Do not use dummy "Level X" group containers.
- **View Status Feedback**: Always keep view state explicit in `sidebarTreeView.description` (`Tree View` / `Flat List`) and sync toolbar toggle button icons accordingly.
