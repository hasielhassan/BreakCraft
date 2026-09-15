import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../hooks/useProject.js';
import { instancesByElement } from '../core/breakdown/model.js';
import { sceneNumber, scenes as sceneListOf } from '../core/screenjson/query.js';
import { resolveCategory } from '../core/breakdown/categories.js';
import { buildSegments, selectionToRange } from '../utils/selection.js';
import { TagPopover } from './TagPopover.jsx';
import './ScriptView.css';

/**
 * The script view renders the pages produced by the pagination pass, so what is
 * on screen is exactly what was measured for page counts and eighths.
 *
 * Text is laid out with `ch` widths in a monospace face rather than by
 * re-implementing the wrap in the DOM: at 12pt Courier one character is one
 * `ch`, so the browser reproduces the same line breaks the paginator computed.
 */
export function ScriptView({ onNotify, showHighlights }) {
  const { script, breakdown, pagination, selection, setSelection } = useProject();
  const [pendingSelection, setPendingSelection] = useState(null);
  const viewRef = useRef(null);
  const scrollRef = useRef(null);
  const pageRefs = useRef(new Map());
  // Set right before a click *inside this view* changes `selection.sceneId`,
  // so the effect below can tell "the user just clicked a scene they can
  // already see" apart from "the scene was selected from somewhere else
  // (Breakdown, Elements, Inspector Previous/Next)" — only the latter should
  // jump-scroll the script. Without this, clicking (or starting a
  // double-click) anywhere in a scene snaps its heading to the top of the
  // view, which both disorients the reader and can shift the very text they
  // were trying to select mid-click.
  const suppressScrollRef = useRef(false);

  const highlights = useMemo(() => instancesByElement(breakdown), [breakdown]);
  const sceneNumbers = useMemo(() => {
    const map = new Map();
    sceneListOf(script).forEach((scene, index) => map.set(scene.id, sceneNumber(scene, index)));
    return map;
  }, [script]);

  // Scroll to a scene when it is selected from another view — but not when
  // the selection just changed because the user clicked that scene here;
  // they can already see it, so jumping would only move the page under them.
  useEffect(() => {
    if (suppressScrollRef.current) {
      suppressScrollRef.current = false;
      return;
    }
    if (!selection.sceneId) return;
    const node = pageRefs.current.get(selection.sceneId);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selection.sceneId]);

  const focusScene = useCallback(
    (sceneId) => {
      suppressScrollRef.current = true;
      setSelection({ sceneId });
    },
    [setSelection]
  );

  const handleMouseUp = useCallback(
    (event) => {
      const container = event.target.closest?.('[data-element-id]');
      if (!container) return;

      const range = selectionToRange(container);
      if (!range) {
        const active = window.getSelection();
        // A selection that spans two elements cannot be anchored to one element's
        // offsets, so tell the user rather than silently doing nothing.
        if (active && !active.isCollapsed && active.toString().trim().length > 1) {
          onNotify('Select text inside a single paragraph to tag it.', 'accent');
        }
        return;
      }

      const rect = container.getBoundingClientRect();
      // The popover is a sibling of the scroll container, positioned relative
      // to `.script-view` (see its `position: relative` in ScriptView.css) —
      // not a child that scrolls with the page content. Anchoring to the
      // view's own rect, rather than the scroll container's rect plus its
      // scrollTop, keeps the math correct regardless of how far the script
      // has been scrolled.
      const viewRect = viewRef.current.getBoundingClientRect();

      setPendingSelection({
        elementId: container.dataset.elementId,
        sceneId: container.dataset.sceneId,
        ...range,
        anchor: {
          // Both candidate positions, relative to `.script-view`; TagPopover
          // picks whichever actually fits once it knows its own height,
          // flipping above the selection instead of spilling off the bottom
          // of the screen and forcing the page to grow/scroll to reveal it.
          below: rect.bottom - viewRect.top + 6,
          above: rect.top - viewRect.top - 6,
          left: Math.max(12, rect.left - viewRect.left),
          viewportBottom: rect.bottom,
          viewportTop: rect.top
        }
      });
    },
    [onNotify]
  );

  const handleHighlightClick = useCallback(
    (event, tagId) => {
      event.stopPropagation();
      setSelection({ tagId });
    },
    [setSelection]
  );

  return (
    <div className="script-view" data-tour="script-view" ref={viewRef}>
      <div className="script-view__hint">
        Select any words in an action line or dialogue to tag them. Click an existing highlight to
        open it in the inspector.
      </div>

      <div className="script-view__scroll" ref={scrollRef} onMouseUp={handleMouseUp}>
        <div className="script-view__pages">
          {pagination.pages.map((page) => (
            <article className="script-page" key={page.number}>
              <div className="script-page__number">{page.number}.</div>
              <div className="script-page__body">
                {page.blocks.map((block, index) => (
                  <Block
                    key={`${block.elementId || block.sceneId}-${index}`}
                    block={block}
                    sceneNumberLabel={sceneNumbers.get(block.sceneId)}
                    instances={showHighlights ? highlights.get(block.elementId) || [] : []}
                    selectedTagId={selection.tagId}
                    getCategoryColor={(categoryId) => resolveCategory(breakdown, categoryId)?.color}
                    registerRef={(node) => {
                      if (block.kind === 'heading' && node) pageRefs.current.set(block.sceneId, node);
                    }}
                    onHighlightClick={handleHighlightClick}
                    onFocusScene={() => focusScene(block.sceneId)}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>

      {pendingSelection && (
        <TagPopover
          selection={pendingSelection}
          onClose={() => setPendingSelection(null)}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}

function Block({
  block,
  sceneNumberLabel,
  instances,
  selectedTagId,
  getCategoryColor,
  registerRef,
  onHighlightClick,
  onFocusScene
}) {
  if (block.kind === 'heading') {
    return (
      <div className="script-block script-block--heading" ref={registerRef} onClick={onFocusScene}>
        <span className="script-block__scene-no">{sceneNumberLabel}</span>
        {block.lines.join(' ')}
      </div>
    );
  }

  const text = block.text || '';
  // Character cues carry no taggable text of their own, and the synthetic
  // (MORE) / "NAME (CONT'D)" markers a page break can insert (see
  // core/paginate/paginate.js) have no underlying element to anchor a tag to.
  const taggable = block.elementType !== 'character' && !block.synthetic && Boolean(block.elementId);

  if (!taggable) {
    return <div className={`script-block script-block--${block.style}`}>{text}</div>;
  }

  const segments = buildSegments(text, instances);

  return (
    <div
      className={`script-block script-block--${block.style}`}
      data-element-id={block.elementId}
      data-scene-id={block.sceneId}
      onMouseDown={onFocusScene}
    >
      {segments.map((segment, index) => {
        if (!segment.tags.length) {
          return <React.Fragment key={index}>{segment.text}</React.Fragment>;
        }

        const top = segment.tags[segment.tags.length - 1];
        const isSelected = segment.tags.some((tag) => tag.tagId === selectedTagId);

        return (
          <mark
            key={index}
            className={`script-mark ${isSelected ? 'script-mark--selected' : ''} ${
              segment.tags.length > 1 ? 'script-mark--multi' : ''
            }`}
            style={{ '--mark-color': getCategoryColor(top.category) }}
            title={segment.tags.map((tag) => tag.label).join(' · ')}
            onClick={(event) => onHighlightClick(event, top.tagId)}
          >
            {segment.text}
          </mark>
        );
      })}
    </div>
  );
}
