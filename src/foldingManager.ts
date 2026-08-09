import * as vscode from 'vscode';

export interface FoldingRangeInfo {
    range: vscode.FoldingRange;
    startLine: number;
    endLine: number;
    depth: number;
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
