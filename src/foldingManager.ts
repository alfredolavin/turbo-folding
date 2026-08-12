import * as vscode from 'vscode';

export interface FoldingRangeInfo {
    range: vscode.FoldingRange;
    startLine: number;
    endLine: number;
    depth: number;
}

export interface TagInfo {
    tagName: string | null;
    indent: number;
}

export async function getFoldingRanges(document: vscode.TextDocument): Promise<vscode.FoldingRange[]> {
    try {
        const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
            'vscode.executeFoldingRangeProvider',
            document.uri
        );
        return ranges || [];
    } catch {
        return [];
    }
}

export function computeFoldingDepths(ranges: vscode.FoldingRange[]): FoldingRangeInfo[] {
    const sorted = [...ranges].sort((a, b) => {
        if (a.start !== b.start) {
            return a.start - b.start;
        }
        return b.end - a.end;
    });

    const result: FoldingRangeInfo[] = [];
    const stack: { endLine: number; depth: number }[] = [];

    for (const r of sorted) {
        while (stack.length > 0 && stack[stack.length - 1].endLine < r.start) {
            stack.pop();
        }
        const depth = stack.length + 1;
        result.push({
            range: r,
            startLine: r.start,
            endLine: r.end,
            depth
        });
        stack.push({ endLine: r.end, depth });
    }

    return result;
}

/**
 * Returns the tag name (or first identifier) and indentation column of a given line.
 * Works for HTML/XML tags (<tagName), TypeScript/JS function/class declarations,
 * and falls back to the first word on the line.
 */
export function getTagNameAndIndentAt(document: vscode.TextDocument, line: number): TagInfo {
    if (line < 0 || line >= document.lineCount) {
        return { tagName: null, indent: 0 };
    }

    const lineText = document.lineAt(line).text;
    // Indentation = number of leading spaces/tabs
    const indent = lineText.length - lineText.trimStart().length;
    const trimmed = lineText.trimStart();

    // HTML/XML opening tag: <tagName or </tagName
    const htmlMatch = trimmed.match(/^<\/?([A-Za-z][A-Za-z0-9._:-]*)/);
    if (htmlMatch) {
        return { tagName: htmlMatch[1].toLowerCase(), indent };
    }

    // Generic: first word token (handles function names, class names, etc.)
    const wordMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$-]*)/);
    if (wordMatch) {
        return { tagName: wordMatch[1], indent };
    }

    return { tagName: null, indent };
}

/**
 * Scans the document and returns all line numbers where the same tag name
 * appears at the same indentation depth as the reference line.
 */
export function findSameTagLinesAtSameLevel(
    document: vscode.TextDocument,
    referenceLine: number
): number[] {
    const { tagName, indent } = getTagNameAndIndentAt(document, referenceLine);
    if (tagName === null) {
        return [referenceLine];
    }

    const matches: number[] = [];
    for (let i = 0; i < document.lineCount; i++) {
        const info = getTagNameAndIndentAt(document, i);
        if (info.tagName === tagName && info.indent === indent) {
            matches.push(i);
        }
    }
    return matches;
}
