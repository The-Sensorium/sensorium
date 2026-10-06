import { useEffect, useMemo, useRef } from 'react'
import { PanResponder, Text, View } from 'react-native'
import { lightHaptic } from '../lib/haptics'
import { useTheme } from '../lib/use-theme'

export const AGE_MIN = 18
export const AGE_MAX = 99

/** Half the visual thumb diameter. The track sits inset by this on both
 * sides so thumbs never clip at the rail ends. */
const EDGE_INSET = 14

function clamp(v: number): number {
  return Math.min(AGE_MAX, Math.max(AGE_MIN, Math.round(v)))
}

type Grant =
  | { thumb: 'min' | 'max'; startMin: number; startMax: number; trackPageX: number; trackWidth: number }
  | null

/** Dual-thumb age slider on a single track. Per range-slider best practice
 * (NNGroup, APG multi-thumb): one bounded scale, two named thumbs, no
 * crossing, live value above the rail (never below where the finger covers
 * it), 48px touch targets, edge insets, tap-to-jump, screen-reader
 * adjustable thumbs, and haptic confirmation on release.
 *
 * Implementation notes: both responders are created once and never rebuilt
 * (recreating a PanResponder mid-gesture drops its state and snaps the
 * thumb). They read latest values from a mirror ref and position from the
 * absolute touch (moveX vs measured track), so no dx accumulation can drift.
 * Termination requests are refused so a parent never steals the drag. */
export function AgeRangeSlider({
  min,
  max,
  onChange,
}: {
  min: number
  max: number
  onChange: (nextMin: number, nextMax: number) => void
}) {
  const t = useTheme()
  const trackRef = useRef<View>(null)
  const grant = useRef<Grant>(null)

  // Mirror touched only from effects and gesture handlers, never render.
  const latest = useRef({ min, max, onChange })
  useEffect(() => {
    latest.current = { min, max, onChange }
  })

  const span = AGE_MAX - AGE_MIN
  const loPct = ((min - AGE_MIN) / span) * 100
  const hiPct = ((max - AGE_MIN) / span) * 100

  function valueAt(trackPageX: number, trackWidth: number, moveX: number): number {
    if (trackWidth <= 0) return AGE_MIN
    return clamp(AGE_MIN + ((moveX - trackPageX) / trackWidth) * span)
  }

  function measureTrack(cb: (trackPageX: number, trackWidth: number) => void) {
    trackRef.current?.measure((_x, _y, w, _h, pageX) => cb(pageX, w))
  }

  const handlers = useMemo(() => {
    function beginDrag(thumb: 'min' | 'max', trackPageX: number, trackWidth: number) {
      const { min: sMin, max: sMax } = latest.current
      grant.current = { thumb, startMin: sMin, startMax: sMax, trackPageX, trackWidth }
    }

    function dragTo(moveX: number) {
      const g = grant.current
      if (!g) return
      const { startMin, startMax } = g
      const v = valueAt(g.trackPageX, g.trackWidth, moveX)
      if (g.thumb === 'min') latest.current.onChange(Math.min(v, startMax), startMax)
      else latest.current.onChange(startMin, Math.max(v, startMin))
    }

    function endDrag() {
      grant.current = null
      lightHaptic()
    }

    const noSteal = () => false

    const minHandlers = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: noSteal,
      onPanResponderGrant: () =>
        measureTrack((pageX, w) => beginDrag('min', pageX, w)),
      onPanResponderMove: (_, gesture) => dragTo(gesture.moveX),
      onPanResponderRelease: endDrag,
      onPanResponderTerminate: endDrag,
    }).panHandlers

    const maxHandlers = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: noSteal,
      onPanResponderGrant: () =>
        measureTrack((pageX, w) => beginDrag('max', pageX, w)),
      onPanResponderMove: (_, gesture) => dragTo(gesture.moveX),
      onPanResponderRelease: endDrag,
      onPanResponderTerminate: endDrag,
    }).panHandlers

    // Tapping the rail jumps the nearer thumb there, then keeps dragging it.
    const trackHandlers = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: noSteal,
      onPanResponderGrant: (e) => {
        const { min: sMin, max: sMax, onChange: fire } = latest.current
        const { pageX } = e.nativeEvent
        measureTrack((trackPageX, trackWidth) => {
          const v = valueAt(trackPageX, trackWidth, pageX)
          if (Math.abs(v - sMin) <= Math.abs(v - sMax)) {
            grant.current = { thumb: 'min', startMin: sMin, startMax: sMax, trackPageX, trackWidth }
            fire(Math.min(v, sMax), sMax)
          } else {
            grant.current = { thumb: 'max', startMin: sMin, startMax: sMax, trackPageX, trackWidth }
            fire(sMin, Math.max(v, sMin))
          }
        })
      },
      onPanResponderMove: (_, gesture) => dragTo(gesture.moveX),
      onPanResponderRelease: endDrag,
      onPanResponderTerminate: endDrag,
    }).panHandlers

    return { minHandlers, maxHandlers, trackHandlers }
    // Stable for life: everything live comes from latest/track refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function step(thumb: 'min' | 'max', dir: 1 | -1) {
    if (thumb === 'min') onChange(clamp(Math.min(min + dir, max)), max)
    else onChange(min, clamp(Math.max(max + dir, min)))
  }

  const thumbTouch = {
    position: 'absolute' as const,
    top: 0,
    width: 48,
    height: 48,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  }

  return (
    <View style={{ paddingHorizontal: EDGE_INSET }}>
      <View style={{ marginTop: 28, marginBottom: 8, height: 48, justifyContent: 'center' }}>
        <View {...handlers.trackHandlers} style={{ height: 48, justifyContent: 'center' }}>
          <View
            ref={trackRef}
            collapsable={false}
            style={{ height: 8, borderRadius: 4, backgroundColor: t.surfaceHighest }}
          >
            <View
              style={{
                position: 'absolute',
                left: `${loPct}%`,
                width: `${Math.max(hiPct - loPct, 0)}%`,
                top: 0,
                bottom: 0,
                borderRadius: 4,
                backgroundColor: t.primary,
              }}
            />
          </View>
        </View>
        {/* Thumb overlay matches the inset track exactly (box-none lets rail
            taps fall through to the track handler). */}
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: EDGE_INSET, right: EDGE_INSET, top: 0, bottom: 0 }}
        >
          <View
            {...handlers.minHandlers}
            testID="age-min-thumb"
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Minimum age"
            accessibilityValue={{ min: AGE_MIN, max, now: min, text: `${min} years` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => step('min', e.nativeEvent.actionName === 'increment' ? 1 : -1)}
            style={[thumbTouch, { left: `${loPct}%`, marginLeft: -24 }]}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: t.surfaceLowest,
                borderWidth: 2,
                borderColor: t.primary,
              }}
            />
          </View>
          <View
            {...handlers.maxHandlers}
            testID="age-max-thumb"
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Maximum age"
            accessibilityValue={{ min, max: AGE_MAX, now: max, text: `${max} years` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => step('max', e.nativeEvent.actionName === 'increment' ? 1 : -1)}
            style={[thumbTouch, { left: `${hiPct}%`, marginLeft: -24 }]}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: t.surfaceLowest,
                borderWidth: 2,
                borderColor: t.primary,
              }}
            />
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>{AGE_MIN}</Text>
        <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>{AGE_MAX}</Text>
      </View>
    </View>
  )
}
