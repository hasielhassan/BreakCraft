/**
 * Script export back to writer formats.
 *
 * The commercial ScreenJSON CLI owns these conversions; this is an independent
 * implementation so the app stays free and fully client-side. Both serializers
 * are intentionally plain — a screenplay is a small, regular structure and
 * neither format needs a library.
 */

import { escapeXml } from '../../utils/text.js';
import { ELEMENT_TYPES } from '../screenjson/constants.js';
import {
  charactersById,
  cueDisplay,
  elementText,
  readText,
  scenes as sceneList
} from '../screenjson/query.js';

/**
 * ScreenJSON -> Fountain.
 *
 * Scene numbers are emitted in `#...#` form. Dual dialogue gets the `^` marker
 * on the second cue of a pair. Forced markers (`.`, `@`, `>`) are added only
 * where a line would otherwise be misread on re-import — for example a setting
 * that does not begin with INT/EXT.
 */
export function serializeFountain(doc) {
  const lang = doc.lang || 'en';
  const byId = charactersById(doc);
  const out = [];

  const title = readText(doc.title, lang);
  if (title) {
    out.push(`Title: ${title}`);
    const authors = (doc.authors || [])
      .map((a) => [a.given, a.family].filter((p) => p && p !== '-').join(' '))
      .filter(Boolean);
    if (authors.length) {
      out.push('Credit: Written by');
      out.push(`Author: ${authors.join(', ')}`);
    }
    out.push('');
  }

  for (const scene of sceneList(doc)) {
    const heading = formatHeading(scene.heading);
    const needsForce = !/^(INT|EXT|EST|I\/E|INT\/EXT|EXT\/INT|POV)[.\s]/.test(heading);
    const number = scene.heading.meta?.['scene.number'] || scene.heading.no;

    out.push('');
    out.push(`${needsForce ? '.' : ''}${heading}${number ? ` #${number}#` : ''}`);
    out.push('');

    let previousWasDual = false;

    for (const element of scene.body || []) {
      switch (element.type) {
        case ELEMENT_TYPES.CHARACTER: {
          const display = cueDisplay(element, byId);
          // The `^` belongs on the second half of a dual pair; it is applied
          // when the following dialogue is flagged, handled below via lookahead.
          out.push(display + (isDualCue(scene, element) ? ' ^' : ''));
          previousWasDual = false;
          break;
        }
        case ELEMENT_TYPES.PARENTHETICAL:
          out.push(elementText(element, lang));
          break;
        case ELEMENT_TYPES.DIALOGUE:
          out.push(elementText(element, lang));
          out.push('');
          previousWasDual = Boolean(element.dual);
          break;
        case ELEMENT_TYPES.TRANSITION: {
          const text = elementText(element, lang);
          out.push(/TO:$/.test(text) ? text : `> ${text}`);
          out.push('');
          break;
        }
        case ELEMENT_TYPES.GENERAL:
          out.push(`> ${elementText(element, lang)} <`);
          out.push('');
          break;
        case ELEMENT_TYPES.SHOT:
        case ELEMENT_TYPES.ACTION:
        default: {
          const text = elementText(element, lang);
          // An all-caps action line would be re-read as a character cue.
          const force = text === text.toUpperCase() && /^[A-Z]/.test(text);
          out.push(`${force ? '!' : ''}${text}`);
          out.push('');
          break;
        }
      }
    }

    void previousWasDual;
  }

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

/**
 * ScreenJSON -> Final Draft (.fdx).
 *
 * Produces the minimal document Final Draft, Movie Magic and Storyboard Pro all
 * accept: a `<FinalDraft>` root, an optional `<TitlePage>`, and `<Content>` full
 * of typed `<Paragraph>` elements.
 */
export function serializeFdx(doc) {
  const lang = doc.lang || 'en';
  const byId = charactersById(doc);
  const lines = [];

  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  lines.push('<FinalDraft DocumentType="Script" Template="No" Version="5">');

  const title = readText(doc.title, lang);
  if (title) {
    lines.push('  <TitlePage>');
    lines.push('    <Content>');
    lines.push(paragraph('General', title, 4, { alignment: 'Center' }));
    const authors = (doc.authors || [])
      .map((a) => [a.given, a.family].filter((p) => p && p !== '-').join(' '))
      .filter(Boolean);
    if (authors.length) {
      lines.push(paragraph('General', 'Written by', 4, { alignment: 'Center' }));
      lines.push(paragraph('General', authors.join(', '), 4, { alignment: 'Center' }));
    }
    lines.push('    </Content>');
    lines.push('  </TitlePage>');
  }

  lines.push('  <Content>');

  for (const scene of sceneList(doc)) {
    const number = scene.heading.meta?.['scene.number'] || scene.heading.no;
    lines.push(
      paragraph('Scene Heading', formatHeading(scene.heading), 4, {
        number: number ? String(number) : null
      })
    );

    for (const element of scene.body || []) {
      switch (element.type) {
        case ELEMENT_TYPES.CHARACTER:
          lines.push(paragraph('Character', cueDisplay(element, byId), 4));
          break;
        case ELEMENT_TYPES.DIALOGUE:
          lines.push(paragraph('Dialogue', elementText(element, lang), 4));
          break;
        case ELEMENT_TYPES.PARENTHETICAL:
          lines.push(paragraph('Parenthetical', elementText(element, lang), 4));
          break;
        case ELEMENT_TYPES.TRANSITION:
          lines.push(paragraph('Transition', elementText(element, lang), 4));
          break;
        case ELEMENT_TYPES.SHOT:
          lines.push(paragraph('Shot', elementText(element, lang), 4));
          break;
        case ELEMENT_TYPES.GENERAL:
          lines.push(paragraph('General', elementText(element, lang), 4));
          break;
        default:
          lines.push(paragraph('Action', elementText(element, lang), 4));
          break;
      }
    }
  }

  lines.push('  </Content>');
  lines.push('</FinalDraft>');

  return lines.join('\n');
}

function paragraph(type, text, indent, { alignment = null, number = null } = {}) {
  const pad = ' '.repeat(indent);
  const attrs = [`Type="${type}"`];
  if (alignment) attrs.push(`Alignment="${alignment}"`);
  if (number) attrs.push(`Number="${escapeXml(number)}"`);
  return `${pad}<Paragraph ${attrs.join(' ')}>\n${pad}  <Text>${escapeXml(text)}</Text>\n${pad}</Paragraph>`;
}

function formatHeading(heading) {
  const mods = heading.mods?.length ? ` - ${heading.mods.join(' - ')}` : '';
  return `${heading.context}. ${heading.setting}${mods} - ${heading.time}`;
}

/**
 * A cue is the second half of a dual pair when its dialogue is flagged `dual`
 * and the preceding cue's dialogue is too.
 */
function isDualCue(scene, cueElement) {
  const body = scene.body || [];
  const index = body.indexOf(cueElement);
  const next = body[index + 1];
  if (!next || next.type !== ELEMENT_TYPES.DIALOGUE || !next.dual) return false;

  for (let i = index - 1; i >= 0; i -= 1) {
    if (body[i].type === ELEMENT_TYPES.DIALOGUE) return Boolean(body[i].dual);
  }
  return false;
}
