import type { SagaTimelineEvent } from '../types/book';

export interface TimelineOverviewMarker {
  eventId: string;
  label: string;
  title: string;
  positionPct: number;
  axisValue: number;
}

export interface TimelineOverviewGap {
  fromEventId: string;
  toEventId: string;
  fromLabel: string;
  toLabel: string;
  distance: number;
  positionStartPct: number;
  positionEndPct: number;
}

export interface TimelineOverviewModel {
  axisMode: 'order' | 'years';
  totalAxisValue: number;
  markers: TimelineOverviewMarker[];
  topGaps: TimelineOverviewGap[];
}

function sortTimelineEvents(events: SagaTimelineEvent[]): SagaTimelineEvent[] {
  return [...events].sort((left, right) => {
    if (left.startOrder !== right.startOrder) {
      return left.startOrder - right.startOrder;
    }

    return left.title.localeCompare(right.title);
  });
}

export function buildTimelineOverviewModel(events: SagaTimelineEvent[]): TimelineOverviewModel {
  const orderedEvents = sortTimelineEvents(events);
  if (orderedEvents.length === 0) {
    return {
      axisMode: 'order',
      totalAxisValue: 0,
      markers: [],
      topGaps: [],
    };
  }

  const hasElapsedYears = orderedEvents.some((event) => event.category === 'timeskip' && (event.timeJumpYears ?? 0) > 0);
  const axisMode: TimelineOverviewModel['axisMode'] = hasElapsedYears ? 'years' : 'order';

  let accumulatedYears = 0;
  const rawAxisValues = orderedEvents.map((event) => {
    if (event.category === 'timeskip' && (event.timeJumpYears ?? 0) > 0) {
      accumulatedYears += event.timeJumpYears ?? 0;
    }

    return axisMode === 'years' ? accumulatedYears : event.startOrder;
  });

  const minAxisValue = rawAxisValues[0] ?? 0;
  const maxAxisValue = rawAxisValues[rawAxisValues.length - 1] ?? minAxisValue;
  const totalAxisValue = Math.max(0, maxAxisValue - minAxisValue);
  const span = totalAxisValue || 1;

  const markers = orderedEvents.map((event, index) => ({
    eventId: event.id,
    label: event.displayLabel || `T${event.startOrder}`,
    title: event.title || 'Evento sin titulo',
    axisValue: rawAxisValues[index] ?? 0,
    positionPct: totalAxisValue === 0 ? 0 : ((rawAxisValues[index] - minAxisValue) / span) * 100,
  }));

  const topGaps = markers
    .slice(1)
    .map((marker, index) => {
      const previous = markers[index];
      const distance = Math.max(0, marker.axisValue - previous.axisValue);
      return {
        fromEventId: previous.eventId,
        toEventId: marker.eventId,
        fromLabel: previous.label,
        toLabel: marker.label,
        distance,
        positionStartPct: previous.positionPct,
        positionEndPct: marker.positionPct,
      };
    })
    .filter((entry) => entry.distance > 0)
    .sort((left, right) => right.distance - left.distance || left.positionStartPct - right.positionStartPct)
    .slice(0, 4);

  return {
    axisMode,
    totalAxisValue,
    markers,
    topGaps,
  };
}
