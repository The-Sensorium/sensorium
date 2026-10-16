import { describe, expect, it } from 'vitest'
import { buildExpoMessage, chatBurstTag, type PushRow } from './message'

// Device presentation mapping for send-push. Run explicitly:
//   npx vitest run --config vitest.functions.config.ts
// (separate config so the web unit-test glob and coverage gate stay clean).

function row(overrides: Partial<PushRow> = {}): PushRow {
  return {
    expo_push_token: 'ExponentPushToken[test]',
    title: 'A sent a message',
    body: 'hello',
    data: { v: 1, kind: 'message', clusterId: 'c1' },
    channel: 'messages',
    ...overrides,
  }
}

describe('chatBurstTag', () => {
  it('tags plain chat pushes per cluster', () => {
    expect(chatBurstTag({ kind: 'message', clusterId: 'c1' })).toBe('cluster-c1')
  })

  it('leaves other push types untagged', () => {
    expect(chatBurstTag({ kind: 'mention', clusterId: 'c1' })).toBeNull()
    expect(chatBurstTag({ kind: 'vote_started', clusterId: 'c1' })).toBeNull()
  })

  it('leaves tag off when the cluster id is missing', () => {
    expect(chatBurstTag({ kind: 'message' })).toBeNull()
    expect(chatBurstTag({ kind: 'message', clusterId: '' })).toBeNull()
  })
})

describe('buildExpoMessage', () => {
  it('attaches tag fields and sound for loud chat pushes', () => {
    expect(buildExpoMessage(row())).toMatchObject({
      to: 'ExponentPushToken[test]',
      channelId: 'messages',
      sound: 'default',
      tag: 'cluster-c1',
      collapseId: 'cluster-c1',
      threadId: 'cluster-c1',
    })
  })

  it('omits sound but keeps the tag for quiet follow-ups', () => {
    const msg = buildExpoMessage(row({ channel: 'messages-quiet' }))
    expect(msg).toMatchObject({ channelId: 'messages-quiet', tag: 'cluster-c1' })
    expect(msg).not.toHaveProperty('sound')
  })

  it('sends non-chat pushes untagged with sound', () => {
    const msg = buildExpoMessage(
      row({ channel: 'mentions', data: { v: 1, kind: 'mention', clusterId: 'c1' } }),
    )
    expect(msg).toMatchObject({ channelId: 'mentions', sound: 'default' })
    expect(msg).not.toHaveProperty('tag')
  })
})
