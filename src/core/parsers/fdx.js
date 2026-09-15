/**
 * Final Draft (.fdx) -> ScreenJSON importer.
 *
 * FDX is XML with no public DTD. Only `<Content>` is guaranteed; everything else
 * varies by Final Draft version and by the many other apps that write the format
 * (Trelby, Fade In, Celtx, WriterDuet, Amazon Storywriter). The parser therefore
 * dispatches on `Paragraph/@Type` — which is explicit and reliable — and treats
 * every other structure as optional.
 *
 * Unlike Fountain there is no heuristic classification to do here: the writer
 * already told us what each paragraph is. That makes FDX the highest-fidelity
 * import path and the one to prefer when a producer has a choice.
 */

import { ScreenJSONBuilder, originFromExtension, splitCue } from '../screenjson/builder.js';
import { parseAuthors } from './fountain.js';
import { parseSlugline } from './slugline.js';

/** FDX paragraph types mapped onto ScreenJSON element types. */
const TYPE_MAP = {
  'Scene Heading': 'heading',
  Action: 'action',
  Character: 'character',
  Parenthetical: 'parenthetical',
  Dialogue: 'dialogue',
  Transition: 'transition',
  Shot: 'shot',
  General: 'general',
  Lyrics: 'general',
  Cast: 'general',
  'New Act': 'general',
  'End of Act': 'general'
};

/**
 * @param {string} source raw .fdx XML
 * @returns {{document: object, notices: string[]}}
 */
export function parseFdx(source) {
  const notices = [];
  const xml = new DOMParser().parseFromString(String(source || ''), 'application/xml');

  const parseError = xml.querySelector('parsererror');
  if (parseError) {
    throw new Error(`This .fdx file is not well-formed XML: ${parseError.textContent.trim().slice(0, 200)}`);
  }

  const content = xml.querySelector('FinalDraft > Content') || xml.querySelector('Content');
  if (!content) {
    throw new Error('No <Content> element found — this does not look like a Final Draft document.');
  }

  const titlePage = readTitlePage(xml);
  const builder = new ScreenJSONBuilder({
    title: titlePage.title || 'Untitled',
    authors: parseAuthors(titlePage.author)
  });
  if (titlePage.extra) builder.setCoverExtra(titlePage.extra);

  let sceneCount = 0;
  let pendingCharacter = null;
  let pendingOrigin = null;
  let pendingDual = false;

  // `<DualDialogue>` wraps a pair of character/dialogue runs. Flattening it and
  // flagging the dialogue keeps document order intact while preserving the
  // side-by-side intent.
  const paragraphs = collectParagraphs(content);

  for (const { node, dual } of paragraphs) {
    const fdxType = node.getAttribute('Type') || 'Action';
    const kind = TYPE_MAP[fdxType] || 'action';
    const text = readParagraphText(node);

    if (kind === 'heading') {
      const heading = parseSlugline(text);
      const number = node.getAttribute('Number');
      if (number) {
        heading.numberLabel = number;
        heading.no = /^\d+$/.test(number) ? parseInt(number, 10) : null;
      }
      builder.startScene(heading);
      sceneCount += 1;
      pendingCharacter = null;
      continue;
    }

    if (!text) continue;

    switch (kind) {
      case 'character': {
        const { character } = builder.pushCue(text);
        const { extension } = splitCue(text);
        pendingCharacter = character.id;
        pendingOrigin = originFromExtension(extension);
        pendingDual = dual;
        break;
      }
      case 'parenthetical':
        builder.pushParenthetical(text);
        break;
      case 'dialogue':
        if (pendingCharacter) {
          builder.pushDialogue(text, {
            characterId: pendingCharacter,
            origin: pendingOrigin,
            dual: pendingDual
          });
        } else {
          // Dialogue with no preceding cue is malformed but common in files
          // written by third-party tools. Keeping it as action loses the
          // attribution but never loses the words.
          builder.pushAction(text);
          notices.push('Dialogue without a preceding character cue was imported as action.');
        }
        break;
      case 'transition':
        builder.pushTransition(text);
        pendingCharacter = null;
        break;
      case 'shot':
        builder.pushShot(text);
        pendingCharacter = null;
        break;
      case 'general':
        builder.pushGeneral(text);
        pendingCharacter = null;
        break;
      case 'action':
      default:
        builder.pushAction(text);
        pendingCharacter = null;
        break;
    }
  }

  if (!sceneCount) {
    notices.push(
      'No scene headings were found. The whole script was placed in a single placeholder scene.'
    );
  }

  return { document: builder.build(), notices: [...new Set(notices)] };
}

/**
 * Walk `<Content>` in document order, flattening `<DualDialogue>` wrappers and
 * tagging their paragraphs so the dual flag survives.
 */
function collectParagraphs(content) {
  const out = [];

  for (const child of Array.from(content.children)) {
    if (child.tagName === 'Paragraph') {
      const nested = child.querySelector(':scope > DualDialogue');
      if (nested) {
        for (const inner of Array.from(nested.querySelectorAll(':scope > Paragraph'))) {
          out.push({ node: inner, dual: true });
        }
      } else {
        out.push({ node: child, dual: false });
      }
    } else if (child.tagName === 'DualDialogue') {
      for (const inner of Array.from(child.querySelectorAll(':scope > Paragraph'))) {
        out.push({ node: inner, dual: true });
      }
    }
  }

  return out;
}

/**
 * Concatenate a paragraph's `<Text>` children.
 *
 * Style attributes (`Bold+Italic+Underline`) are intentionally discarded: tag
 * offsets index plain text, and ScreenJSON has no inline run model to carry the
 * formatting into anyway.
 */
function readParagraphText(paragraph) {
  const runs = Array.from(paragraph.querySelectorAll(':scope > Text'));
  const raw = runs.length
    ? runs.map((t) => t.textContent || '').join('')
    : paragraph.textContent || '';
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Read the FDX title page.
 *
 * Final Draft stores it as free-form paragraphs with no semantic markers, padded
 * with blank lines and centred credits, so this is genuinely heuristic: the
 * first substantial line is the title, and a following `written by`/`by` line
 * introduces the author. Everything is also kept verbatim in `cover.extra` so
 * nothing is lost when the guess is wrong.
 */
function readTitlePage(xml) {
  const titlePage = xml.querySelector('TitlePage');
  if (!titlePage) return { title: '', author: '', extra: '' };

  const lines = Array.from(titlePage.querySelectorAll('Paragraph'))
    .map((p) => readParagraphText(p))
    .filter(Boolean);

  if (!lines.length) return { title: '', author: '', extra: '' };

  const title = lines[0];
  let author = '';

  for (let i = 1; i < lines.length; i += 1) {
    if (/^(written\s+by|by|screenplay\s+by|story\s+by)\b/i.test(lines[i])) {
      author = (lines[i + 1] || '').trim();
      break;
    }
  }

  return { title, author, extra: lines.join('\n') };
}
