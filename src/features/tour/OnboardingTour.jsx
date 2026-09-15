import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Joyride, STATUS, EVENTS } from 'react-joyride';
import { getTourSteps } from './tour-steps.jsx';
import { TourTooltip } from './TourTooltip.jsx';
import { storage } from '../../core/storage.js';

export function OnboardingTour({
  run,
  onCloseTour,
  hasProject,
  firstSceneId,
  onLoadSample,
  setActiveView,
  setActiveModal,
  setSelection,
  setIsSidebarCollapsed
}) {
  const [tourKey, setTourKey] = useState(0);
  const prevRunRef = useRef(false);

  // Keep a stable ref to the latest props so callbacks inside steps never stale.
  const propsRef = useRef({
    hasProject,
    firstSceneId,
    onLoadSample,
    setActiveView,
    setActiveModal,
    setSelection,
    setIsSidebarCollapsed
  });

  useEffect(() => {
    propsRef.current = {
      hasProject,
      firstSceneId,
      onLoadSample,
      setActiveView,
      setActiveModal,
      setSelection,
      setIsSidebarCollapsed
    };
  });

  // Generate steps with stable proxy callbacks so `steps`'s reference never
  // changes during a tour run.
  const steps = useMemo(() => {
    return getTourSteps({
      onLoadSample: (...args) => propsRef.current.onLoadSample?.(...args),
      setActiveView: (...args) => propsRef.current.setActiveView?.(...args),
      setActiveModal: (...args) => propsRef.current.setActiveModal?.(...args),
      setSelection: (...args) => propsRef.current.setSelection?.(...args),
      setIsSidebarCollapsed: (...args) => propsRef.current.setIsSidebarCollapsed?.(...args),
      get hasProject() {
        return propsRef.current.hasProject;
      },
      get firstSceneId() {
        return propsRef.current.firstSceneId;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourKey]);

  // Reset key ONLY when `run` transitions from false to true.
  useEffect(() => {
    if (run && !prevRunRef.current) {
      setTourKey((prev) => prev + 1);
      if (!hasProject && onLoadSample) {
        onLoadSample('three-little-pigs.breakcraft.json');
      }
    }
    prevRunRef.current = run;
  }, [run, hasProject, onLoadSample]);

  const handleJoyrideEvent = useCallback(
    (data) => {
      const { status, type } = data;

      if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status) || type === EVENTS.TOUR_END) {
        storage.setPreferences({ hasCompletedTour: true });
        if (setActiveModal) setActiveModal(null);
        if (onCloseTour) onCloseTour();
      }
    },
    [setActiveModal, onCloseTour]
  );

  if (!run) return null;

  return (
    <Joyride
      key={tourKey}
      steps={steps}
      run={run}
      continuous
      tooltipComponent={TourTooltip}
      onEvent={handleJoyrideEvent}
      options={{
        zIndex: 10050,
        primaryColor: 'hsl(142, 36%, 59%)',
        backgroundColor: 'hsl(210, 12%, 22%)',
        textColor: 'hsl(0, 0%, 93%)',
        overlayColor: 'rgba(10, 15, 20, 0.75)',
        spotlightPadding: 6,
        spotlightRadius: 8,
        blockTargetInteraction: false,
        overlayClickAction: false,
        buttons: ['back', 'close', 'primary', 'skip'],
        beforeTimeout: 8000,
        targetWaitTimeout: 3000
      }}
    />
  );
}

export default OnboardingTour;
