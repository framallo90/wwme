export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function stripUtf8Bom(value: string): string {
  return value.replace(/^\uFEFF/, '');
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

function parseHtmlToText(html: string): string {
  const sanitized = html
    .replace(
      /<\s*(script|style|iframe|object|embed|link|meta|base|frame|frameset)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      '',
    )
    .replace(
      /<\s*(script|style|iframe|object|embed|link|meta|base|frame|frameset)\b[^>]*\/?\s*>/gi,
      '',
    );
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<body>${sanitized}</body>`, 'text/html');
  return parsed.body?.textContent ?? '';
}

export function stripHtml(html: string): string {
  return parseHtmlToText(html).replace(/\n{3,}/g, '\n\n').trim();
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

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (entityMatch, entityValue: string) => {
    if (entityValue.startsWith('#')) {
      const raw = entityValue.slice(1);
      const isHex = raw.startsWith('x') || raw.startsWith('X');
      const numericValue = Number.parseInt(isHex ? raw.slice(1) : raw, isHex ? 16 : 10);
      if (Number.isFinite(numericValue) && numericValue > 0 && numericValue <= 0x10ffff) {
        try {
          return String.fromCodePoint(numericValue);
        } catch {
          return entityMatch;
        }
      }
      return entityMatch;
    }

    return NAMED_HTML_ENTITIES[entityValue.toLowerCase()] ?? entityMatch;
  });
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

export function sanitizeHtmlForPreview(html: string): string {
  if (!html) {
    return '';
  }

  let sanitized = html;

  sanitized = sanitized.replace(
    /<\s*(script|style|iframe|object|embed|link|meta|base|frame|frameset)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
    '',
  );
  sanitized = sanitized.replace(
    /<\s*(script|style|iframe|object|embed|link|meta|base|frame|frameset)\b[^>]*\/?\s*>/gi,
    '',
  );
  sanitized = sanitized.replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  sanitized = sanitized.replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  sanitized = sanitized.replace(
    /\s(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (match, attribute: string, rawValue: string, doubleQuoted?: string, singleQuoted?: string, bareValue?: string) => {
      const value = (doubleQuoted ?? singleQuoted ?? bareValue ?? '').trim();
      const normalized = value
        .split('')
        .filter((char) => {
          const code = char.charCodeAt(0);
          return code > 31 && code !== 127 && !/\s/.test(char);
        })
        .join('')
        .toLowerCase();
      if (
        normalized.startsWith('javascript:') ||
        normalized.startsWith('vbscript:') ||
        normalized.startsWith('data:text/html')
      ) {
        const quote = rawValue.startsWith("'") ? "'" : '"';
        return ` ${attribute}=${quote}#${quote}`;
      }

      return match;
    },
  );

  return sanitized;
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
const AI_CONTROL_LINE_PATTERN = /^\s*[*_#>\-\s]*(ESTADO|RESUMEN|RAZON|TEXTO)\s*[*_]*\s*:\s*(.*?)\s*[*_]*\s*$/i;

function parseLeadingAiControlLines(lines: string[]): { remainingLines: string[]; summaryHints: string[] } {
  let cursor = 0;
  const summaryHints: string[] = [];

  while (cursor < lines.length) {
    const current = lines[cursor].trim();
    if (!current) {
      cursor += 1;
      continue;
    }

    const match = current.match(AI_CONTROL_LINE_PATTERN);
    if (!match) {
      break;
    }

    const label = (match[1] ?? '').toUpperCase();
    const inline = (match[2] ?? '').trim();
    if ((label === 'RESUMEN' || label === 'RAZON') && inline) {
      summaryHints.push(inline);
    }

    if (label === 'TEXTO' && inline) {
      lines[cursor] = inline;
      break;
    }

    cursor += 1;
  }

  return {
    remainingLines: lines.slice(cursor),
    summaryHints,
  };
}

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

function parseInlineTrailingBullets(value: string): ParsedAiOutput | null {
  const firstBulletIndex = value.indexOf('•');
  if (firstBulletIndex <= 0) {
    return null;
  }

  const bulletBlock = value.slice(firstBulletIndex).trim();
  const bulletItems = bulletBlock
    .split('•')
    .map((item) => item.trim())
    .filter(Boolean);

  if (bulletItems.length < 4) {
    return null;
  }

  if (bulletItems.some((item) => item.length > 220 || /\b(ESTADO|TEXTO|RAZON)\s*:/i.test(item))) {
    return null;
  }

  const cleanText = value.slice(0, firstBulletIndex).trim();
  if (!cleanText) {
    return null;
  }

  return {
    cleanText,
    summaryBullets: bulletItems,
    summaryText: bulletItems.map((bullet) => `- ${bullet}`).join('\n'),
  };
}

export function splitAiOutputAndSummary(value: string): ParsedAiOutput {
  const normalized = normalizeAiOutput(value);
  if (!normalized) {
    return { cleanText: '', summaryBullets: [], summaryText: '' };
  }

  const baseLines = normalized.replace(/\r\n/g, '\n').split('\n');
  const controlParse = parseLeadingAiControlLines(baseLines);
  const lines = controlParse.remainingLines;
  const leadingSummaryText = controlParse.summaryHints.join('\n').trim();

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
        summaryText: bullets.map((bullet) => `- ${bullet}`).join('\n') || leadingSummaryText,
      };
    }

    const summaryText = afterLines.join('\n').trim();
    if (summaryText && before) {
      return {
        cleanText: before,
        summaryBullets: [],
        summaryText: summaryText || leadingSummaryText,
      };
    }

    if (!summaryText && before && SUMMARY_HEADING_PATTERN.test(lines[index])) {
      return {
        cleanText: before,
        summaryBullets: [],
        summaryText: leadingSummaryText,
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
        summaryText: bullets.map((bullet) => `- ${bullet}`).join('\n') || leadingSummaryText,
      };
    }
  }

  const sanitizedText = lines.join('\n').trim() || normalized;
  const inlineBullets = parseInlineTrailingBullets(sanitizedText);
  if (inlineBullets) {
    return {
      ...inlineBullets,
      summaryText: inlineBullets.summaryText || leadingSummaryText,
    };
  }

  return { cleanText: sanitizedText, summaryBullets: [], summaryText: leadingSummaryText };
}

