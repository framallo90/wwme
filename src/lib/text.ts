export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function joinPath(base: string, ...parts: string[]): string {
  let current = normalizePath(base).replace(/\/$/, '');
  for (const part of parts) {
    current = `${current}/${part.replace(/^\/+/, '')}`;
  }
  return current;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

export function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, '-');
}

export function getNowIso(): string {
  return new Date().toISOString();
}

export function randomId(prefix = 'id'): string {
  const seed = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${seed}`;
}

export function stripHtml(html: string): string {
  const element = document.createElement('div');
  element.innerHTML = html;
  return (element.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function plainTextToHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '<p></p>';
  }

  const blocks = trimmed
    .split(/\n\s*\n/g)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`);

  return blocks.join('');
}

function decodeEntities(value: string): string {
  const textArea = document.createElement('textarea');
  textArea.innerHTML = value;
  return textArea.value;
}

export function htmlToMarkdown(html: string): string {
  let markdown = html;
  markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  markdown = markdown.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
  markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  markdown = markdown.replace(/<[^>]+>/g, '');
  markdown = decodeEntities(markdown);

  return markdown
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

export function normalizeAiOutput(value: string): string {
  return value
    .replace(/^```[a-zA-Z]*\n?/g, '')
    .replace(/```$/g, '')
    .trim();
}

const SUMMARY_HEADING_PATTERN =
  /^\s*[*_#>\-\s]*(?:resumen(?:\s+de)?\s+cambios?|cambios(?:\s+realizados)?|summary)\s*:?\s*[*_]*\s*$/i;
const SUMMARY_LINE_PATTERN =
  /^\s*[*_#>\-\s]*(resumen(?:\s+de)?\s+cambios?|cambios(?:\s+realizados)?|summary)\s*:?\s*(.*?)\s*[*_]*\s*$/i;
const BULLET_LINE_PATTERN = /^\s*(?:[-*\u2022]\s+|\d+[.)]\s+)(.+?)\s*$/;

function extractBullet(line: string): string | null {
  const match = line.match(BULLET_LINE_PATTERN);
  if (!match) {
    return null;
  }

  return match[1].trim().replace(/^[*_]+|[*_]+$/g, '');
}

function formatBullets(lines: string[]): string[] {
  return lines
    .map((line) => extractBullet(line))
    .filter((line): line is string => Boolean(line));
}

function parseSummaryLine(line: string): { isSummary: boolean; inlineText: string } {
  const match = line.match(SUMMARY_LINE_PATTERN);
  if (!match) {
    return { isSummary: false, inlineText: '' };
  }

  return {
    isSummary: true,
    inlineText: match[2]?.trim() ?? '',
  };
}

export interface ParsedAiOutput {
  cleanText: string;
  summaryBullets: string[];
  summaryText: string;
}

export function splitAiOutputAndSummary(value: string): ParsedAiOutput {
  const normalized = normalizeAiOutput(value);
  if (!normalized) {
    return { cleanText: '', summaryBullets: [], summaryText: '' };
  }

  const lines = normalized.replace(/\r\n/g, '\n').split('\n');

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const summaryLine = parseSummaryLine(lines[index]);
    if (!summaryLine.isSummary) {
      continue;
    }

    const before = lines.slice(0, index).join('\n').trim();
    const afterLines = [
      ...(summaryLine.inlineText ? [summaryLine.inlineText] : []),
      ...lines.slice(index + 1).filter((line) => line.trim().length > 0),
    ];
    const bullets = formatBullets(afterLines);

    if (bullets.length > 0 && before) {
      return {
        cleanText: before,
        summaryBullets: bullets,
        summaryText: bullets.map((bullet) => `- ${bullet}`).join('\n'),
      };
    }

    const summaryText = afterLines.join('\n').trim();
    if (summaryText && before) {
      return {
        cleanText: before,
        summaryBullets: [],
        summaryText,
      };
    }

    if (!summaryText && before && SUMMARY_HEADING_PATTERN.test(lines[index])) {
      return {
        cleanText: before,
        summaryBullets: [],
        summaryText: '',
      };
    }
  }

  let endIndex = lines.length - 1;
  while (endIndex >= 0 && lines[endIndex].trim() === '') {
    endIndex -= 1;
  }

  if (endIndex < 0) {
    return { cleanText: normalized, summaryBullets: [], summaryText: '' };
  }

  const trailing: string[] = [];
  let cursor = endIndex;
  while (cursor >= 0) {
    const current = lines[cursor];
    if (!current.trim()) {
      if (trailing.length > 0) {
        break;
      }
      cursor -= 1;
      continue;
    }

    if (!extractBullet(current)) {
      break;
    }

    trailing.push(current);
    cursor -= 1;
  }

  const bullets = formatBullets(trailing.reverse());
  if (bullets.length >= 4 && cursor >= 0) {
    const cleanText = lines.slice(0, cursor + 1).join('\n').trim();
    if (cleanText) {
      return {
        cleanText,
        summaryBullets: bullets,
        summaryText: bullets.map((bullet) => `- ${bullet}`).join('\n'),
      };
    }
  }

  return { cleanText: normalized, summaryBullets: [], summaryText: '' };
}

