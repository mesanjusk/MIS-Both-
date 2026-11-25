const MAX_TEXT_BYTES = 256 * 1024;
const MAX_DRIVE_LINKS = 40;
const DRIVE_ID = /^[a-zA-Z0-9_-]{10,200}$/;
const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

function decodeMarkup(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, code) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()];
    const point = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}

function driveReference(href) {
  let url;
  try {
    url = new URL(decodeMarkup(href));
    if (['www.google.com', 'google.com'].includes(url.hostname) && url.pathname === '/url') {
      url = new URL(url.searchParams.get('q') || url.searchParams.get('url'));
    }
  } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;

  let id;
  if (url.hostname === 'drive.google.com') {
    id = url.pathname.match(/^\/file\/(?:u\/\d+\/)?d\/([^/]+)/)?.[1];
    if (url.pathname === '/open' || url.pathname === '/uc') id = url.searchParams.get('id');
  } else if (url.hostname === 'docs.google.com') {
    id = url.pathname.match(/^\/(?:document|spreadsheets|presentation|drawings|forms)\/(?:u\/\d+\/)?d\/([^/]+)/)?.[1];
  }
  if (!id || !DRIVE_ID.test(id)) return null;
  const resourceKey = url.searchParams.get('resourcekey');
  return { id, resourceKey: resourceKey && /^[\w-]{1,200}$/.test(resourceKey) ? resourceKey : '' };
}

function fileLabel(text) {
  const label = text.replace(/\s+/g, ' ').trim().slice(0, 500);
  if (/^(?:https?:|google drive(?: file| link| attachment)?$|(?:view|open|download)(?: file| attachment| on google drive)?$|click here$|drive link$)/i.test(label)) return '';
  return label;
}

function addLink(links, href, label) {
  const ref = driveReference(href);
  if (!ref || (links.size >= MAX_DRIVE_LINKS && !links.has(ref.id))) return;
  const old = links.get(ref.id);
  links.set(ref.id, { id: ref.id, resourceKey: old?.resourceKey || ref.resourceKey, name: old?.name || fileLabel(label) });
}

function readHtml(links, text) {
  const original = text.split(/<blockquote\b|<div\b[^>]*class\s*=\s*["'][^"']*\bgmail_quote\b/i, 1)[0];
  for (const anchor of original.matchAll(/<a\b((?:"[^"]*"|'[^']*'|[^'"<>])*)>([\s\S]*?)<\/a\s*>/gi)) {
    const attrs = new Map([...anchor[1].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+))/g)]
      .map(([, key, double, single, bare]) => [key.toLowerCase(), double ?? single ?? bare]));
    const href = attrs.get('href');
    if (!href) continue;
    const title = attrs.get('data-filename') || attrs.get('title') || '';
    const label = fileLabel(decodeMarkup(anchor[2].replace(/<[^>]*>/g, ' '))) || decodeMarkup(title);
    addLink(links, href, label);
  }
}

function readPlain(links, text) {
  let previous = '';
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(?:On .+ wrote:|-{2,}\s*Forwarded message)/i.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    for (const token of line.matchAll(/https:\/\/[^\s<>"')\]]+/gi)) {
      const preceding = line.slice(0, token.index).trim();
      const inline = preceding.match(/^\[([^\]]+)\]\($/)?.[1] || preceding.replace(/[:<\s-]+$/, '');
      const candidate = (inline || previous).replace(/^\[(?:image:\s*)?(.+)\]$/i, '$1');
      const name = /\.[\p{L}\d]{1,12}$/u.test(candidate) ? candidate : '';
      addLink(links, token[0].replace(/[.,;]+$/, ''), name);
    }
    previous = line.trim();
  }
}

async function findPrintDriveLinks(gmail, messageId, parts, requestOptions) {
  const bodies = [];
  for (const part of parts) {
    if (part.filename || !['text/html', 'text/plain'].includes(part.mimeType) || part.body?.size > MAX_TEXT_BYTES) continue;
    let encoded = part.body?.data;
    if (!encoded && part.body?.attachmentId && part.body.size > 0) {
      try {
        const { data } = await gmail.users.messages.attachments.get({
          userId: 'me', messageId, id: part.body.attachmentId, fields: 'data',
        }, requestOptions);
        encoded = data?.data;
      } catch (error) {
        if (Number(error.response?.status || error.code) !== 404) throw error;
      }
    }
    if (encoded && encoded.length <= Math.ceil(MAX_TEXT_BYTES * 4 / 3) + 4) {
      bodies.push({ type: part.mimeType, text: Buffer.from(encoded, 'base64url').toString('utf8') });
    }
  }

  const links = new Map();
  for (const { type, text } of bodies) if (type === 'text/html') readHtml(links, text);
  for (const { type, text } of bodies) if (type === 'text/plain') readPlain(links, text);
  return [...links.values()];
}

module.exports = { findPrintDriveLinks };
