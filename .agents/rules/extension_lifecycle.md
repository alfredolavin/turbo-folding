# Extension Lifecycle & Delivery Rule

When completing any coding task, feature modification, or bugfix in this VS Code extension workspace:

1. **Compile & Verify**: Ensure all TypeScript files are compiled cleanly without errors (`npm run compile`).
2. **Build VSIX Package**: Package the extension into a `.vsix` bundle using `npx -y @vscode/vsce package` (or equivalent packaging command) so the extension artifact is always up to date.
3. **Commit Changes**: Stage all relevant changes (`git add .`) and create a concise, descriptive git commit (`git commit -m "..."`).
4. **Push to Remote**: Push the committed changes to the upstream branch (`git push`).
