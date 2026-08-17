import * as vscode from 'vscode';
import { getFoldingRanges, computeFoldingDepths, findSameTagLinesAtSameLevel, findFoldablesAtSameLevel, getDocumentSymbols, flattenSymbols, resolveSemanticInfo } from './foldingManager';
import { MarkerManager } from './markerManager';
import { FoldingTreeDataProvider, MarkerTreeItem } from './foldingTreeView';

export function activate(context: vscode.ExtensionContext) {
    const markerManager = new MarkerManager(context);
    context.subscriptions.push(markerManager);

    const treeDataProvider = new FoldingTreeDataProvider(markerManager);

    // Register TreeView for the sidebar view container
    const sidebarTreeView = vscode.window.createTreeView('turboFolding.foldingManagerView', {
        treeDataProvider,
        showCollapseAll: false
    });

    context.subscriptions.push(sidebarTreeView);

    // Focus on select state
    let focusOnSelect = context.workspaceState.get<boolean>('turboFolding.focusOnSelect', false);
    vscode.commands.executeCommand('setContext', 'turboFolding.focusOnSelectActive', focusOnSelect);

    // Tree View Mode state
    let treeViewMode = context.workspaceState.get<boolean>('turboFolding.treeViewMode', false);
    treeDataProvider.setTreeViewMode(treeViewMode);
    vscode.commands.executeCommand('setContext', 'turboFolding.treeViewActive', treeViewMode);

    const updateViewDescription = () => {
        const parts: string[] = [];
        parts.push(treeViewMode ? 'Tree View' : 'Flat List');
        if (focusOnSelect) {
            parts.push('Focus Mode: ON');
        }
        sidebarTreeView.description = parts.join(' | ');
    };
    updateViewDescription();

    // Toggle Tree View Mode
    const toggleTreeViewCmd = vscode.commands.registerCommand('turboFolding.toggleTreeView', async () => {
        treeViewMode = !treeViewMode;
        await context.workspaceState.update('turboFolding.treeViewMode', treeViewMode);
        await vscode.commands.executeCommand('setContext', 'turboFolding.treeViewActive', treeViewMode);
        treeDataProvider.setTreeViewMode(treeViewMode);
        updateViewDescription();
        vscode.window.showInformationMessage(
            `Turbo Folding: Switched to ${treeViewMode ? 'Tree View' : 'Flat List'}`
        );
    });

    const toggleTreeViewFlatCmd = vscode.commands.registerCommand('turboFolding.toggleTreeViewFlat', async () => {
        await vscode.commands.executeCommand('turboFolding.toggleTreeView');
    });

    // Status bar navigation buttons
    const prevStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 95);
    prevStatusItem.command = 'turboFolding.gotoPrevSameLevel';
    prevStatusItem.text = '$(arrow-up) Prev Level';
    prevStatusItem.tooltip = 'Turbo Folding: Go to previous foldable at same level';
    prevStatusItem.show();
    context.subscriptions.push(prevStatusItem);

    const nextStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 94);
    nextStatusItem.command = 'turboFolding.gotoNextSameLevel';
    nextStatusItem.text = '$(arrow-down) Next Level';
    nextStatusItem.tooltip = 'Turbo Folding: Go to next foldable at same level';
    nextStatusItem.show();
    context.subscriptions.push(nextStatusItem);

    let isAutoModeProcessing = false;

    // Toggle Focus on Select (Checkmark Control)
    const toggleFocusOnSelectCmd = vscode.commands.registerCommand('turboFolding.toggleFocusOnSelect', async () => {
        focusOnSelect = !focusOnSelect;
        await context.workspaceState.update('turboFolding.focusOnSelect', focusOnSelect);
        await vscode.commands.executeCommand('setContext', 'turboFolding.focusOnSelectActive', focusOnSelect);
        updateViewDescription();
        vscode.window.showInformationMessage(
            `Turbo Folding: Focus on Select is now ${focusOnSelect ? 'ENABLED (Select marker to unfold & fold others)' : 'DISABLED'}`
        );
    });

    // Helper to focus a specific marked line: unfolds target and folds all other marked blocks
    async function focusMarkedLine(editor: vscode.TextEditor, targetLine: number) {
        const markedLines = markerManager.getMarkedLines(editor);
        const rawRanges = await getFoldingRanges(editor.document);
        if (rawRanges.length === 0) {
            return;
        }

        // Helper to resolve range for a given line — ONLY returns a range when the
        // line is the EXACT start of a folding range. We never escalate to the parent
        // to avoid accidentally folding the wrong block when a marker is on a child line.
        const resolveRange = (line: number) => {
            const exactMatches = rawRanges.filter(r => r.start === line);
            if (exactMatches.length > 0) {
                return exactMatches[0];
            }
            return null;
        };

        const targetRange = resolveRange(targetLine);
        const linesToFold: number[] = [];

        for (const line of markedLines) {
            if (line === targetLine) {
                continue;
            }
            const range = resolveRange(line);
            if (range && range.start !== targetRange?.start) {
                linesToFold.push(range.start);
            }
        }

        // Unfold target range
        if (targetRange) {
            await vscode.commands.executeCommand('editor.unfold', {
                selectionLines: [targetRange.start]
            });
        }

        // Fold all other marked ranges — levels:1 prevents the upward-escalation bug
        if (linesToFold.length > 0) {
            await vscode.commands.executeCommand('editor.fold', {
                selectionLines: linesToFold,
                levels: 1
            });
        }
    }

    // Select Marker from Tree View
    const selectMarkerFromViewCmd = vscode.commands.registerCommand('turboFolding.selectMarkerFromView', async (uri: vscode.Uri, line: number) => {
        if (!uri || line === undefined) {
            return;
        }

        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false });

        const targetPos = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(targetPos, targetPos);
        editor.revealRange(new vscode.Range(targetPos, targetPos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);

        if (focusOnSelect) {
            await focusMarkedLine(editor, line);
        }
    });

    // Inline action: Focus & Fold Others for a specific tree item
    const focusMarkerItemCmd = vscode.commands.registerCommand('turboFolding.focusMarkerItem', async (item: MarkerTreeItem) => {
        if (item && item.documentUri && item.line !== undefined) {
            const doc = await vscode.workspace.openTextDocument(item.documentUri);
            const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false });

            const targetPos = new vscode.Position(item.line, 0);
            editor.selection = new vscode.Selection(targetPos, targetPos);
            editor.revealRange(new vscode.Range(targetPos, targetPos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);

            await focusMarkedLine(editor, item.line);
        }
    });

    // Inline action: Delete Marker Tree Item
    const deleteMarkerItemCmd = vscode.commands.registerCommand('turboFolding.deleteMarkerItem', (item: MarkerTreeItem) => {
        if (item && item.documentUri && item.line !== undefined) {
            markerManager.deleteMarker(item.documentUri.toString(), item.line);
        }
    });

    // Add markers to foldables at the same indentation level (matches same tag name, function, class, etc. if semantic info is available)
    const addMarkersAtSameLevelCmd = vscode.commands.registerCommand(
        'turboFolding.addMarkersAtSameLevel',
        async (itemOrArgs?: MarkerTreeItem | any) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }

            let referenceLine: number;
            if (itemOrArgs instanceof MarkerTreeItem && itemOrArgs.line !== undefined) {
                referenceLine = itemOrArgs.line;
            } else if (itemOrArgs && typeof itemOrArgs.lineNumber === 'number') {
                referenceLine = itemOrArgs.lineNumber - 1; // gutter context: 1-indexed
            } else if (itemOrArgs && typeof itemOrArgs.line === 'number') {
                referenceLine = itemOrArgs.line;
            } else {
                referenceLine = editor.selection.active.line;
            }

            // Detect semantic description for informative feedback
            const rawSymbols = await getDocumentSymbols(editor.document);
            const symbols = flattenSymbols(rawSymbols);
            const refSemantic = resolveSemanticInfo(editor.document, referenceLine, symbols);

            const matchingLines = await findFoldablesAtSameLevel(editor.document, referenceLine, true);
            let added = 0;
            for (const line of matchingLines) {
                // If item already exists with the same line, do not add it again
                if (!markerManager.hasMarker(editor, line)) {
                    if (markerManager.addMarker(editor, line)) {
                        added++;
                    }
                }
            }

            const alreadyMarked = matchingLines.length - added;
            const typeDesc = refSemantic ? ` [${refSemantic.displayName}]` : '';

            if (added > 0) {
                vscode.window.showInformationMessage(
                    `Turbo Folding: Added ${added} marker${added !== 1 ? 's' : ''}${typeDesc} for ${matchingLines.length} foldable${matchingLines.length !== 1 ? 's' : ''} at same level${alreadyMarked > 0 ? ` (${alreadyMarked} already existed)` : ''}.`
                );
            } else {
                vscode.window.showInformationMessage(
                    `Turbo Folding: All ${matchingLines.length} foldable${matchingLines.length !== 1 ? 's' : ''}${typeDesc} at this level are already marked.`
                );
            }
        }
    );

    // Helper: resolve the reference line from command args
    function resolveReferenceLine(itemOrArgs?: MarkerTreeItem | any): number | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return null; }
        if (itemOrArgs instanceof MarkerTreeItem && itemOrArgs.line !== undefined) {
            return itemOrArgs.line;
        } else if (itemOrArgs && typeof itemOrArgs.lineNumber === 'number') {
            return itemOrArgs.lineNumber - 1;
        } else if (itemOrArgs && typeof itemOrArgs.line === 'number') {
            return itemOrArgs.line;
        }
        return editor.selection.active.line;
    }

    // Helper: fold a list of lines, optionally skipping one
    async function foldLines(lines: number[], skipLine?: number) {
        const toFold = skipLine !== undefined ? lines.filter(l => l !== skipLine) : lines;
        if (toFold.length > 0) {
            await vscode.commands.executeCommand('editor.fold', {
                selectionLines: toFold,
                levels: 1
            });
        }
        return toFold.length;
    }

    // Fold all OTHER foldables at the same level (keep current unfolded)
    const foldOtherAtSameLevelCmd = vscode.commands.registerCommand(
        'turboFolding.foldOtherAtSameLevel',
        async (itemOrArgs?: MarkerTreeItem | any) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }

            const referenceLine = resolveReferenceLine(itemOrArgs);
            if (referenceLine === null) { return; }

            const matchingLines = await findFoldablesAtSameLevel(editor.document, referenceLine);
            const rawRanges = await getFoldingRanges(editor.document);

            // Unfold the target line first
            const targetRange = rawRanges.find(r => r.start === referenceLine) ??
                rawRanges
                    .filter(r => r.start <= referenceLine && r.end >= referenceLine)
                    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
            if (targetRange) {
                await vscode.commands.executeCommand('editor.unfold', {
                    selectionLines: [targetRange.start]
                });
            }

            const count = await foldLines(matchingLines, referenceLine);
            vscode.window.showInformationMessage(
                `Turbo Folding: Folded ${count} sibling foldable${count !== 1 ? 's' : ''} at same level.`
            );
        }
    );

    // Fold ALL foldables at the same level INCLUDING the current one
    const foldAllAtSameLevelCmd = vscode.commands.registerCommand(
        'turboFolding.foldAllAtSameLevel',
        async (itemOrArgs?: MarkerTreeItem | any) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }

            const referenceLine = resolveReferenceLine(itemOrArgs);
            if (referenceLine === null) { return; }

            const matchingLines = await findFoldablesAtSameLevel(editor.document, referenceLine);
            const count = await foldLines(matchingLines);
            vscode.window.showInformationMessage(
                `Turbo Folding: Folded ${count} foldable${count !== 1 ? 's' : ''} at same level (including current).`
            );
        }
    );

    // Unfold current block recursively (expand all children)
    const unfoldRecursivelyCmd = vscode.commands.registerCommand(
        'turboFolding.unfoldRecursively',
        async (itemOrArgs?: any) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }

            const referenceLine = resolveReferenceLine(itemOrArgs);
            if (referenceLine === null) { return; }

            const rawRanges = await getFoldingRanges(editor.document);
            const targetRange = rawRanges.find(r => r.start === referenceLine) ??
                rawRanges
                    .filter(r => r.start <= referenceLine && r.end >= referenceLine)
                    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];

            await vscode.commands.executeCommand('editor.unfoldRecursively', {
                selectionLines: [referenceLine]
            });

            vscode.window.showInformationMessage(
                `Turbo Folding: Unfolded recursively at line ${referenceLine + 1}.`
            );
        }
    );

    // Navigate to previous foldable at the same indentation level
    const gotoPrevSameLevelCmd = vscode.commands.registerCommand(
        'turboFolding.gotoPrevSameLevel',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }
            const cursorLine = editor.selection.active.line;
            const siblings = await findFoldablesAtSameLevel(editor.document, cursorLine);
            const prev = siblings.filter(l => l < cursorLine).pop();
            if (prev === undefined) {
                vscode.window.showInformationMessage('Turbo Folding: No previous sibling at this level.');
                return;
            }
            const pos = new vscode.Position(prev, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        }
    );

    // Navigate to next foldable at the same indentation level
    const gotoNextSameLevelCmd = vscode.commands.registerCommand(
        'turboFolding.gotoNextSameLevel',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }
            const cursorLine = editor.selection.active.line;
            const siblings = await findFoldablesAtSameLevel(editor.document, cursorLine);
            const next = siblings.find(l => l > cursorLine);
            if (next === undefined) {
                vscode.window.showInformationMessage('Turbo Folding: No next sibling at this level.');
                return;
            }
            const pos = new vscode.Position(next, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        }
    );

    // Refresh view
    const refreshMarkersViewCmd = vscode.commands.registerCommand('turboFolding.refreshMarkersView', () => {
        treeDataProvider.refresh();
    });

    // Toggle Auto Mode
    const toggleAutoModeCmd = vscode.commands.registerCommand('turboFolding.toggleAutoMode', async () => {
        const config = vscode.workspace.getConfiguration('turboFolding');
        const currentVal = config.get<boolean>('autoMode.enabled', false);
        await config.update('autoMode.enabled', !currentVal, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Turbo Folding Auto Mode: ${!currentVal ? 'ENABLED' : 'DISABLED'}`);

        if (!currentVal && vscode.window.activeTextEditor) {
            await handleAutoFolding(vscode.window.activeTextEditor);
        }
    });

    // Toggle Marker on line
    const toggleMarkerCmd = vscode.commands.registerCommand('turboFolding.toggleMarker', (args?: any) => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            let lineNumber: number | undefined;
            if (typeof args === 'number') {
                lineNumber = args;
            } else if (args && typeof args.lineNumber === 'number') {
                // VS Code gutter/line number context menu passes 1-indexed lineNumber in args
                lineNumber = args.lineNumber - 1;
            } else if (args && typeof args.line === 'number') {
                lineNumber = args.line;
            }
            markerManager.toggleMarker(editor, lineNumber);
        }
    });

    // Clear all markers
    const clearAllMarkersCmd = vscode.commands.registerCommand('turboFolding.clearAllMarkers', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            markerManager.clearAll(editor);
        }
    });

    // Fold marked regions except current
    const foldMarkedExceptCurrentCmd = vscode.commands.registerCommand('turboFolding.foldMarkedExceptCurrent', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const markedLines = markerManager.getMarkedLines(editor);
        if (markedLines.length === 0) {
            vscode.window.showInformationMessage('Turbo Folding: No markers placed in current document.');
            return;
        }

        const cursorLine = editor.selection.active.line;
        const rawRanges = await getFoldingRanges(editor.document);
        if (rawRanges.length === 0) {
            return;
        }

        const linesToFold: number[] = [];

        for (const markedLine of markedLines) {
            // Only fold ranges that START exactly on the marked line.
            // If the marker is on a child line (no exact fold start), skip it
            // to avoid accidentally folding the parent block.
            const exactMatches = rawRanges.filter(r => r.start === markedLine);
            for (const r of exactMatches) {
                if (cursorLine >= r.start && cursorLine <= r.end) {
                    continue;
                }
                linesToFold.push(r.start);
            }
        }

        if (linesToFold.length > 0) {
            await vscode.commands.executeCommand('editor.fold', {
                selectionLines: linesToFold
            });
        }
    });

    // Auto Mode Logic Handler
    async function handleAutoFolding(editor: vscode.TextEditor) {
        const config = vscode.workspace.getConfiguration('turboFolding');
        const enabled = config.get<boolean>('autoMode.enabled', false);
        if (!enabled || isAutoModeProcessing) {
            return;
        }

        isAutoModeProcessing = true;

        try {
            const prevDepth = config.get<number>('autoMode.previousDepth', 1);
            const nextDepth = config.get<number>('autoMode.nextDepth', 1);

            const cursorLine = editor.selection.active.line;
            const rawRanges = await getFoldingRanges(editor.document);
            if (rawRanges.length === 0) {
                return;
            }

            const rangesInfo = computeFoldingDepths(rawRanges);

            const linesToFold: number[] = [];
            const linesToUnfold: number[] = [];

            for (const info of rangesInfo) {
                const isCurrent = cursorLine >= info.startLine && cursorLine <= info.endLine;

                if (isCurrent) {
                    linesToUnfold.push(info.startLine);
                } else if (info.endLine < cursorLine) {
                    // Previous section
                    if (info.depth >= prevDepth) {
                        linesToFold.push(info.startLine);
                    }
                } else if (info.startLine > cursorLine) {
                    // Next section
                    if (info.depth >= nextDepth) {
                        linesToFold.push(info.startLine);
                    }
                }
            }

            if (linesToUnfold.length > 0) {
                await vscode.commands.executeCommand('editor.unfold', {
                    selectionLines: linesToUnfold
                });
            }

            if (linesToFold.length > 0) {
                await vscode.commands.executeCommand('editor.fold', {
                    selectionLines: linesToFold
                });
            }
        } finally {
            isAutoModeProcessing = false;
        }
    }

    // Update decorations for all visible editors at startup
    // Reanchor markers on initial load for all currently visible editors
    for (const editor of vscode.window.visibleTextEditors) {
        markerManager.reanchorMarkers(editor.document);
        markerManager.updateDecorations(editor, false);
    }

    // Event Listeners
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            markerManager.handleDocumentChange(event);
        }),
        // Re-anchor once when a document is opened from disk (not on every editor switch)
        vscode.workspace.onDidOpenTextDocument(document => {
            const didChange = markerManager.reanchorMarkers(document);
            if (didChange) {
                for (const editor of vscode.window.visibleTextEditors) {
                    if (editor.document === document) {
                        markerManager.updateDecorations(editor, false);
                    }
                }
            }
        }),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                markerManager.updateDecorations(editor, false);
                handleAutoFolding(editor);
            }
        }),
        vscode.window.onDidChangeVisibleTextEditors(editors => {
            for (const editor of editors) {
                markerManager.updateDecorations(editor, false);
            }
        }),
        vscode.window.onDidChangeTextEditorSelection(event => {
            if (event.textEditor === vscode.window.activeTextEditor) {
                handleAutoFolding(event.textEditor);
            }
        }),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('turboFolding.palette') || e.affectsConfiguration('turboFolding.colorAssignment')) {
                for (const editor of vscode.window.visibleTextEditors) {
                    markerManager.updateDecorations(editor, false);
                }
                treeDataProvider.refresh();
            }
        }),
        toggleAutoModeCmd,
        toggleMarkerCmd,
        clearAllMarkersCmd,
        foldMarkedExceptCurrentCmd,
        toggleFocusOnSelectCmd,
        selectMarkerFromViewCmd,
        focusMarkerItemCmd,
        deleteMarkerItemCmd,
        refreshMarkersViewCmd,
        addMarkersAtSameLevelCmd,
        foldOtherAtSameLevelCmd,
        foldAllAtSameLevelCmd,
        unfoldRecursivelyCmd,
        gotoPrevSameLevelCmd,
        gotoNextSameLevelCmd,
        toggleTreeViewCmd,
        toggleTreeViewFlatCmd
    );
}

export function deactivate() {}
