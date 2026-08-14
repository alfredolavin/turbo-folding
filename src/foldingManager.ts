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
    isClosingTag: boolean;
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
        return { tagName: null, indent: 0, isClosingTag: false };
    }

    const lineText = document.lineAt(line).text;
    // Indentation = number of leading spaces/tabs
    const indent = lineText.length - lineText.trimStart().length;
    const trimmed = lineText.trimStart();

    // HTML/XML closing tag: </tagName  — must be checked BEFORE the general html match
    const closingMatch = trimmed.match(/^<\/([A-Za-z][A-Za-z0-9._:-]*)/);
    if (closingMatch) {
        return { tagName: closingMatch[1].toLowerCase(), indent, isClosingTag: true };
    }

    // HTML/XML opening or self-closing tag: <tagName
    const htmlMatch = trimmed.match(/^<([A-Za-z][A-Za-z0-9._:-]*)/);
    if (htmlMatch) {
        return { tagName: htmlMatch[1].toLowerCase(), indent, isClosingTag: false };
    }

    // Generic: first word token (handles function names, class names, etc.)
    const wordMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$-]*)/);
    if (wordMatch) {
        return { tagName: wordMatch[1], indent, isClosingTag: false };
    }

    return { tagName: null, indent, isClosingTag: false };
}

/**
 * Scans the document and returns all line numbers where the same tag name
 * appears at the same indentation depth as the reference line.
 */
export function findSameTagLinesAtSameLevel(
    document: vscode.TextDocument,
    referenceLine: number
): number[] {
    const refInfo = getTagNameAndIndentAt(document, referenceLine);
    const { tagName, indent } = refInfo;
    if (tagName === null) {
        return [referenceLine];
    }

    const matches: number[] = [];
    for (let i = 0; i < document.lineCount; i++) {
        const info = getTagNameAndIndentAt(document, i);
        // Only include opening tags (or generic tokens) — never closing tags
        if (info.tagName === tagName && info.indent === indent && !info.isClosingTag) {
            matches.push(i);
        }
    }
    return matches;
}

/**
 * Returns all line numbers that start a foldable block at the same
 * indentation level as the reference line.
 * Language-agnostic: uses only indentation + folding ranges,
 * works for TypeScript, Python, Markdown, JSON, HTML, etc.
 */
export async function findFoldablesAtSameLevel(
    document: vscode.TextDocument,
    referenceLine: number
): Promise<number[]> {
    const refLineText = document.lineAt(referenceLine).text;
    const refIndent = refLineText.length - refLineText.trimStart().length;

    const ranges = await getFoldingRanges(document);
    if (ranges.length === 0) {
        return [referenceLine];
    }

    const rangeInfo = computeFoldingDepths(ranges);
    const refRangeInfo = rangeInfo.find(r => r.startLine === referenceLine)
        ?? rangeInfo
            .filter(r => r.startLine <= referenceLine && r.endLine >= referenceLine)
            .sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0];

    const refDepth = refRangeInfo ? refRangeInfo.depth : 1;

    // Collect all folding-range starts that share depth AND indentation
    const matches: number[] = [];
    for (const info of rangeInfo) {
        if (info.depth !== refDepth) { continue; }
        const lineText = document.lineAt(info.startLine).text;
        const lineIndent = lineText.length - lineText.trimStart().length;
        if (lineIndent === refIndent) {
            matches.push(info.startLine);
        }
    }

    // Always include the reference line even if it has no own fold range
    if (!matches.includes(referenceLine)) {
        matches.push(referenceLine);
        matches.sort((a, b) => a - b);
    }

    return matches;
}
