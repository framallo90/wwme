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
