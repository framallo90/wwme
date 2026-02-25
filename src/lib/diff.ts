export type DiffOperationType = 'equal' | 'insert' | 'delete';

export interface DiffOperation {
  type: DiffOperationType;
  value: string;
}

export interface DiffSummary {
  equalCount: number;
  insertCount: number;
  deleteCount: number;
}

const MAX_DIFF_COMPLEXITY = 1_000_000;

function normalizeBlock(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function splitBlocks(value: string): string[] {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n{2,}/)
    .map((chunk) => normalizeBlock(chunk))
    .filter((chunk) => chunk.length > 0);
}

function buildLcsTable(left: string[], right: string[]): number[][] {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      if (left[row - 1] === right[col - 1]) {
        table[row][col] = table[row - 1][col - 1] + 1;
      } else {
        table[row][col] = Math.max(table[row - 1][col], table[row][col - 1]);
      }
    }
  }

  return table;
}

function collapseOperations(operations: DiffOperation[]): DiffOperation[] {
  if (operations.length === 0) {
    return operations;
  }

  const collapsed: DiffOperation[] = [];
  for (const operation of operations) {
    const previous = collapsed[collapsed.length - 1];
    if (previous && previous.type === operation.type) {
      previous.value = `${previous.value}\n\n${operation.value}`;
      continue;
    }

    collapsed.push({ ...operation });
  }

  return collapsed;
}

export function diffTextBlocks(before: string, after: string): DiffOperation[] {
  const left = splitBlocks(before);
  const right = splitBlocks(after);

  if (left.length === 0 && right.length === 0) {
    return [];
  }

  if (left.length * right.length > MAX_DIFF_COMPLEXITY) {
    if (left.join('\n\n') === right.join('\n\n')) {
      return [{ type: 'equal', value: left.join('\n\n') }];
    }

    return [
      ...left.map((value): DiffOperation => ({ type: 'delete', value })),
      ...right.map((value): DiffOperation => ({ type: 'insert', value })),
    ];
  }

  const table = buildLcsTable(left, right);
  const operations: DiffOperation[] = [];
  let row = left.length;
  let col = right.length;

  while (row > 0 || col > 0) {
    if (row > 0 && col > 0 && left[row - 1] === right[col - 1]) {
      operations.push({ type: 'equal', value: left[row - 1] });
      row -= 1;
      col -= 1;
      continue;
    }

    if (col > 0 && (row === 0 || table[row][col - 1] >= table[row - 1][col])) {
      operations.push({ type: 'insert', value: right[col - 1] });
      col -= 1;
      continue;
    }

    operations.push({ type: 'delete', value: left[row - 1] });
    row -= 1;
  }

  return collapseOperations(operations.reverse());
}

export function summarizeDiffOperations(operations: DiffOperation[]): DiffSummary {
  const summary: DiffSummary = {
    equalCount: 0,
    insertCount: 0,
    deleteCount: 0,
  };

  for (const operation of operations) {
    if (operation.type === 'equal') {
      summary.equalCount += 1;
      continue;
    }

    if (operation.type === 'insert') {
      summary.insertCount += 1;
      continue;
    }

    summary.deleteCount += 1;
  }

  return summary;
}
