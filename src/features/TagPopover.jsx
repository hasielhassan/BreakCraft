import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, TextInput } from '../design-system/components';
import { useProject } from '../hooks/useProject.js';
import { DEFAULT_CATEGORY, resolveCategories } from '../core/breakdown/categories.js';
import { visibleCategoriesForMode } from '../core/breakdown/modes.js';
import { addTagInstance, createInstance, findOccurrences, tagKey } from '../core/breakdown/model.js';
import { elementIndex } from '../core/screenjson/query.js';
import './TagPopover.css';

/**
 * The tagging popover.
 *
 * "Apply to all occurrences" is the compounding correction loop in its manual
 * form: confirm a term once, and every other literal occurrence in the script is
 * tagged with it. Matching is whole-word, case-insensitive and otherwise
 * literal — no stemming, no synonyms — so the count shown is exactly what will
 * be created and the user can audit it.
 */
export function TagPopover({ selection, onClose, onNotify }) {
  const { script, breakdown, applyBreakdown, setSelection } = useProject();
  // The mode filter only narrows the *default* picker; a category with
  // existing tags is never hidden from the Elements library or reports
  // because of it, and "Show all categories" bypasses it here too.
  const categories = visibleCategoriesForMode(breakdown, resolveCategories(breakdown));
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [label, setLabel] = useState(selection.text);
  const [applyAll, setApplyAll] = useState(false);
  const ref = useRef(null);
  const [style, setStyle] = useState({ top: selection.anchor.below, left: selection.anchor.left });

  // Flip above the selection when there isn't room below, so the popover
  // always lands fully on screen next to the text it's tagging rather than
  // forcing the page to grow/scroll to reveal it. Measured after the popover
  // has a real height (`useLayoutEffect` runs before the browser paints, so
  // there's no visible jump from the initial "below" guess).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const height = el.offsetHeight;
    const fitsBelow = selection.anchor.viewportBottom + height + 16 <= window.innerHeight;
    setStyle({
      top: fitsBelow ? selection.anchor.below : Math.max(8, selection.anchor.above - height),
      left: selection.anchor.left
    });
  }, [selection]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    const onMouseDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    // Deferred so the mouseup that opened the popover does not immediately close it.
    const timer = setTimeout(() => window.addEventListener('mousedown', onMouseDown), 0);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
      clearTimeout(timer);
    };
  }, [onClose]);

  const occurrences = useMemo(
    () => findOccurrences(script, selection.text),
    [script, selection.text]
  );

  const otherCount = Math.max(0, occurrences.length - 1);

  const commit = () => {
    const trimmed = label.trim();
    if (!trimmed) {
      onNotify('Give the element a name before saving it.', 'error');
      return;
    }
    if (!tagKey(trimmed)) {
      onNotify('That name is too short to store as an element.', 'error');
      return;
    }

    const index = elementIndex(script);

    applyBreakdown((current) => {
      let next = current;

      const primary = index.get(selection.elementId);
      if (primary) {
        next = addTagInstance(next, {
          category,
          label: trimmed,
          instance: createInstance({
            scene: primary.scene,
            element: primary.element,
            start: selection.start,
            end: selection.end,
            text: selection.text
          })
        });
      }

      if (applyAll) {
        for (const hit of occurrences) {
          if (hit.element.id === selection.elementId && hit.start === selection.start) continue;
          next = addTagInstance(next, {
            category,
            label: trimmed,
            instance: createInstance({
              scene: hit.scene,
              element: hit.element,
              start: hit.start,
              end: hit.end,
              text: hit.text
            })
          });
        }
      }

      return next;
    });

    const created = applyAll ? occurrences.length : 1;
    onNotify(
      `Tagged “${trimmed}” in ${created} place${created === 1 ? '' : 's'}.`,
      'primary'
    );

    // Select the tag so the inspector opens on it straight away.
    const existing = breakdown.tags.find(
      (tag) => tag.category === category && tag.key === tagKey(trimmed)
    );
    if (existing) setSelection({ tagId: existing.id });

    window.getSelection()?.removeAllRanges();
    onClose();
  };

  return (
    <div className="tag-popover" ref={ref} style={style}>
      <div className="tag-popover__quote">“{selection.text}”</div>

      <div className="tag-popover__categories">
        {categories.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tag-popover__chip ${category === item.id ? 'is-active' : ''}`}
            style={{ '--chip-color': item.color }}
            onClick={() => setCategory(item.id)}
            title={item.description || item.label}
          >
            {item.icon ? `${item.icon} ` : ''}
            {item.label}
          </button>
        ))}
      </div>

      <TextInput
        label="Element name"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        onEnter={commit}
        autoFocus
      />

      {otherCount > 0 && (
        <label className="tag-popover__checkbox">
          <input
            type="checkbox"
            checked={applyAll}
            onChange={(event) => setApplyAll(event.target.checked)}
          />
          <span>
            Also tag {otherCount} other occurrence{otherCount === 1 ? '' : 's'} of “{selection.text}”
          </span>
        </label>
      )}

      <div className="tag-popover__actions">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={commit}>
          Save element
        </Button>
      </div>
    </div>
  );
}
