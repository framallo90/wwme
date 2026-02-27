import { diffTextBlocks, summarizeDiffOperations } from './diff';
import { countWordsFromHtml } from './metrics';
import { stripHtml } from './text';
import type { ChapterDocument, CollaborationPatch } from '../types/book';

type PatchPreviewMode = 'create' | 'update' | 'unchanged';

export interface CollaborationPatchPreviewItem {
  chapterId: string;
  title: string;
  mode: PatchPreviewMode;
  beforeWords: number;
  afterWords: number;
  deltaWords: number;
  insertedBlocks: number;
  deletedBlocks: number;
}

export interface CollaborationPatchPreview {
  items: CollaborationPatchPreviewItem[];
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
}

interface BuildPreviewInput {
  patch: CollaborationPatch;
  chapters: Record<string, ChapterDocument>;
}

function normalizeChapterId(value: string): string {
  return value.trim();
}

function resolveMode(
  exists: boolean,
  insertedBlocks: number,
  deletedBlocks: number,
  deltaWords: number,
): PatchPreviewMode {
  if (!exists) {
    return 'create';
  }

  if (insertedBlocks === 0 && deletedBlocks === 0 && deltaWords === 0) {
    return 'unchanged';
  }

  return 'update';
}

function sortPreviewItems(items: CollaborationPatchPreviewItem[]): CollaborationPatchPreviewItem[] {
  const modePriority: Record<PatchPreviewMode, number> = {
    update: 0,
    create: 1,
    unchanged: 2,
  };

  return [...items].sort((left, right) => {
    const modeDiff = modePriority[left.mode] - modePriority[right.mode];
    if (modeDiff !== 0) {
      return modeDiff;
    }

    return left.chapterId.localeCompare(right.chapterId);
  });
}

export function buildCollaborationPatchPreview(input: BuildPreviewInput): CollaborationPatchPreview {
  const items: CollaborationPatchPreviewItem[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const patchChapter of input.patch.chapters) {
    const chapterId = normalizeChapterId(patchChapter.chapterId) || '(nuevo)';
    const existing = input.chapters[chapterId];
    const beforeHtml = existing?.content ?? '';
    const afterHtml = patchChapter.content ?? '';
    const beforeWords = countWordsFromHtml(beforeHtml);
    const afterWords = countWordsFromHtml(afterHtml);
    const deltaWords = afterWords - beforeWords;
    const diffSummary = summarizeDiffOperations(diffTextBlocks(stripHtml(beforeHtml), stripHtml(afterHtml)));
    const mode = resolveMode(Boolean(existing), diffSummary.insertCount, diffSummary.deleteCount, deltaWords);

    if (mode === 'create') {
      createdCount += 1;
    } else if (mode === 'update') {
      updatedCount += 1;
    } else {
      unchangedCount += 1;
    }

    items.push({
      chapterId,
      title: patchChapter.title || existing?.title || `Capitulo ${chapterId}`,
      mode,
      beforeWords,
      afterWords,
      deltaWords,
      insertedBlocks: diffSummary.insertCount,
      deletedBlocks: diffSummary.deleteCount,
    });
  }

  return {
    items: sortPreviewItems(items),
    createdCount,
    updatedCount,
    unchangedCount,
  };
}

export function formatCollaborationPatchPreviewMessage(
  patch: CollaborationPatch,
  preview: CollaborationPatchPreview,
  options?: { maxItems?: number },
): string {
  const maxItems = Math.max(1, options?.maxItems ?? 8);
  const lines: string[] = [
    `Patch: ${patch.sourceBookTitle} (${patch.sourceAuthor})`,
    `Capitulos en patch: ${patch.chapters.length}`,
    `Se crearan: ${preview.createdCount} | Se actualizaran: ${preview.updatedCount} | Sin cambios: ${preview.unchangedCount}`,
    '',
    'Preview diff:',
  ];

  for (const item of preview.items.slice(0, maxItems)) {
    const modeLabel =
      item.mode === 'create' ? 'NUEVO' : item.mode === 'update' ? 'UPDATE' : 'IGUAL';
    const deltaLabel = item.deltaWords >= 0 ? `+${item.deltaWords}` : `${item.deltaWords}`;
    lines.push(
      `- [${modeLabel}] ${item.chapterId} ${item.title} | palabras ${item.beforeWords} -> ${item.afterWords} (${deltaLabel}) | bloques +${item.insertedBlocks}/-${item.deletedBlocks}`,
    );
  }

  if (preview.items.length > maxItems) {
    lines.push(`- ... ${preview.items.length - maxItems} capitulo/s mas`);
  }

  lines.push('', 'Si aceptas, se aplicaran sobre tu libro actual.');
  return lines.join('\n');
}
