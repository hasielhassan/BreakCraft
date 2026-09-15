/**
 * Mapping between a DOM text selection and element text offsets.
 *
 * The script view renders each element as a container whose children are
 * highlight spans and bare text nodes. Concatenating those text nodes reproduces
 * the element's plain text exactly, so a selection can be converted to an offset
 * by walking the nodes and accumulating lengths.
 *
 * The result is converted from UTF-16 code units to Unicode codepoints before it
 * leaves this module, because tag instances are stored in codepoint space to
 * match ScreenJSON's `note.highlight` convention.
 */

import { unitToCodePoint } from './text.js';

/**
 * Resolve the current window selection against a rendered element container.
 *
 * @param {HTMLElement} container the element whose `data-element-id` was hit
 * @returns {{start: number, end: number, text: string}|null}
 */
export function selectionToRange(container) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);

  // A selection that starts or ends outside this element cannot be mapped to a
  // single element's offsets. Dragging across two paragraphs is a legitimate
  // thing for a user to do, so this returns null rather than throwing and the
  // caller shows a hint.
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null;
  }

  const startUnit = offsetWithin(container, range.startContainer, range.startOffset);
  const endUnit = offsetWithin(container, range.endContainer, range.endOffset);
  if (startUnit === null || endUnit === null || startUnit === endUnit) return null;

  const full = container.textContent || '';
  const lowUnit = Math.min(startUnit, endUnit);
  const highUnit = Math.max(startUnit, endUnit);

  // Trim whitespace that a double-click or a drag past the end commonly picks up;
  // a tag whose highlight includes a trailing space looks like a bug.
  let low = lowUnit;
  let high = highUnit;
  while (low < high && /\s/.test(full[low])) low += 1;
  while (high > low && /\s/.test(full[high - 1])) high -= 1;
  if (low >= high) return null;

  return {
    start: unitToCodePoint(full, low),
    end: unitToCodePoint(full, high),
    text: full.slice(low, high)
  };
}

/**
 * Distance in UTF-16 code units from the start of `container` to a
 * `(node, offset)` position inside it.
 */
function offsetWithin(container, node, offset) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;

  // A selection boundary can land on an element node, in which case `offset` is
  // a child index rather than a character index.
  if (node.nodeType === Node.ELEMENT_NODE) {
    const child = node.childNodes[offset];
    if (!child) return (container.textContent || '').length;
    return offsetWithin(container, child, 0);
  }

  let current = walker.nextNode();
  while (current) {
    if (current === node) return total + offset;
    total += current.nodeValue.length;
    current = walker.nextNode();
  }

  return null;
}

/**
 * Split an element's text into render segments given its tag instances.
 *
 * Overlapping tags are handled by splitting at every boundary, so a stretch of
 * text covered by two tags becomes its own segment carrying both. The segment
 * takes the colour of the last tag applied and is marked `multi` so the UI can
 * indicate the overlap rather than silently hiding one of them.
 *
 * @param {string} text plain element text
 * @param {Array<{start:number,end:number,tagId:string,category:string,label:string}>} instances
 * @returns {Array<{text: string, start: number, end: number, tags: Array}>}
 */
export function buildSegments(text, instances) {
  const chars = Array.from(text);
  if (!instances?.length) {
    return chars.length ? [{ text, start: 0, end: chars.length, tags: [] }] : [];
  }

  const boundaries = new Set([0, chars.length]);
  for (const instance of instances) {
    boundaries.add(Math.max(0, Math.min(chars.length, instance.start)));
    boundaries.add(Math.max(0, Math.min(chars.length, instance.end)));
  }

  const points = Array.from(boundaries).sort((a, b) => a - b);
  const segments = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (start === end) continue;

    const tags = instances.filter((instance) => instance.start <= start && instance.end >= end);

    segments.push({
      text: chars.slice(start, end).join(''),
      start,
      end,
      tags
    });
  }

  return segments;
}
