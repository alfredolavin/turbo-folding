import * as vscode from 'vscode';
import { getFoldingRanges, computeFoldingDepths, findSameTagLinesAtSameLevel } from './foldingManager';
import { MarkerManager } from './markerManager';
import { FoldingTreeDataProvider, MarkerTreeItem } from './foldingTreeView';

export function activate(context: vscode.ExtensionContext) {
    const markerManager = new MarkerManager(context);
    context.subscriptions.push(markerManager);

    const treeDataProvider = new FoldingTreeDataProvider(markerManager);

    // Register TreeViews for both the sidebar view container and the explorer
    const sidebarTreeView = vscode.window.createTreeView('turboFolding.foldingManagerView', {
        treeDataProvider,
        showCollapseAll: false
    });
    const explorerTreeView = vscode.window.createTreeView('turboFolding.foldingManagerExplorerView', {
        treeDataProvider,
        showCollapseAll: false
    });

    context.subscriptions.push(sidebarTreeView, explorerTreeView);

    // Focus on select state
    let focusOnSelect = context.workspaceState.get<boolean>('turboFolding.focusOnSelect', false);
    vscode.commands.executeCommand('setContext', 'turboFolding.focusOnSelectActive', focusOnSelect);

    const updateViewDescription = () => {
        const desc = focusOnSelect ? 'Focus Mode: ON' : '';
        sidebarTreeView.description = desc;
        explorerTreeView.description = desc;
    };
    updateViewDescription();

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

        // Helper to resolve range for a given line
        const resolveRange = (line: number) => {
            const exactMatches = rawRanges.filter(r => r.start === line);
            if (exactMatches.length > 0) {
                return exactMatches[0];
            }
            const enclosing = rawRanges.filter(r => r.start <= line && r.end >= line);
            if (enclosing.length > 0) {
                enclosing.sort((a, b) => (a.end - a.start) - (b.end - b.start));
                return enclosing[0];
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

    // Add marker to this line and all same tags at the same indentation level
    const addMarkerToSameTagsCmd = vscode.commands.registerCommand(
        'turboFolding.addMarkerToSameTags',
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

            const matchingLines = findSameTagLinesAtSameLevel(editor.document, referenceLine);
            const markedLines = new Set(markerManager.getMarkedLines(editor));
            let added = 0;
            for (const line of matchingLines) {
                if (!markedLines.has(line)) {
                    markerManager.toggleMarker(editor, line);
                    added++;
                }
            }
            vscode.window.showInformationMessage(
                `Turbo Folding: Added ${added} marker${added !== 1 ? 's' : ''} for ${matchingLines.length} same-tag line${matchingLines.length !== 1 ? 's' : ''} at same level.`
            );
        }
    );

    // Fold all other same-tag ranges at the same indentation level
    const foldOtherSameTagsCmd = vscode.commands.registerCommand(
        'turboFolding.foldOtherSameTags',
        async (itemOrArgs?: MarkerTreeItem | any) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }

            let referenceLine: number;
            if (itemOrArgs instanceof MarkerTreeItem && itemOrArgs.line !== undefined) {
                referenceLine = itemOrArgs.line;
            } else if (itemOrArgs && typeof itemOrArgs.lineNumber === 'number') {
                referenceLine = itemOrArgs.lineNumber - 1;
            } else if (itemOrArgs && typeof itemOrArgs.line === 'number') {
                referenceLine = itemOrArgs.line;
            } else {
                referenceLine = editor.selection.active.line;
            }

            const matchingLines = findSameTagLinesAtSameLevel(editor.document, referenceLine);
            const rawRanges = await getFoldingRanges(editor.document);

            const linesToFold: number[] = [];
            for (const line of matchingLines) {
                if (line === referenceLine) { continue; }
                // Find the folding range that starts at or encloses this line
                const exact = rawRanges.find(r => r.start === line);
                if (exact) {
                    linesToFold.push(exact.start);
                } else {
                    const enclosing = rawRanges
                        .filter(r => r.start <= line && r.end >= line)
                        .sort((a, b) => (a.end - a.start) - (b.end - b.start));
                    if (enclosing.length > 0) {
                        linesToFold.push(enclosing[0].start);
                    }
                }
            }

            // Unfold the target
            const targetRange = rawRanges.find(r => r.start === referenceLine) ||
                rawRanges
                    .filter(r => r.start <= referenceLine && r.end >= referenceLine)
                    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
            if (targetRange) {
                await vscode.commands.executeCommand('editor.unfold', {
                    selectionLines: [targetRange.start]
                });
            }

            if (linesToFold.length > 0) {
                await vscode.commands.executeCommand('editor.fold', {
                    selectionLines: linesToFold,
                    levels: 1
                });
            }

            vscode.window.showInformationMessage(
                `Turbo Folding: Folded ${linesToFold.length} sibling tag${linesToFold.length !== 1 ? 's' : ''}.`
            );
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
            // Find exact match starting on markedLine first
            const exactMatches = rawRanges.filter(r => r.start === markedLine);
            if (exactMatches.length > 0) {
                for (const r of exactMatches) {
                    if (cursorLine >= r.start && cursorLine <= r.end) {
                        continue;
                    }
                    linesToFold.push(r.start);
                }
            } else {
                // If no exact start match, find the innermost enclosing folding range
                const enclosing = rawRanges.filter(r => r.start <= markedLine && r.end >= markedLine);
                if (enclosing.length > 0) {
                    enclosing.sort((a, b) => (a.end - a.start) - (b.end - b.start));
                    const innermost = enclosing[0];
                    if (!(cursorLine >= innermost.start && cursorLine <= innermost.end)) {
                        linesToFold.push(innermost.start);
                    }
                }
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
        addMarkerToSameTagsCmd,
        foldOtherSameTagsCmd
    );
}

export function deactivate() {}
