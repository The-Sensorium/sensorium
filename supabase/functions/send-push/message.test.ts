import { describe, expect, it } from 'vitest'
import { buildExpoMessage, chatBurstTag, collapseSuperseded, type PushRow } from './message'

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

describe('collapseSuperseded', () => {
  type Claimed = PushRow & { id: string }
  function claimed(id: string, overrides: Partial<PushRow> = {}): Claimed {
    return { ...row(overrides), id }
  }

  it('sends only the newest row per device and cluster', () => {
    const { send, skip } = collapseSuperseded([
      claimed('old', { body: 'first' }),
      claimed('new', { body: 'second' }),
    ])
    expect(send.map((r) => r.id)).toEqual(['new'])
    expect(skip.map((r) => r.id)).toEqual(['old'])
  })

  it('sends each device its own newest row', () => {
    const { send, skip } = collapseSuperseded([
      claimed('a-old', { expo_push_token: 'ExponentPushToken[a]' }),
      claimed('b-old', { expo_push_token: 'ExponentPushToken[b]' }),
      claimed('a-new', { expo_push_token: 'ExponentPushToken[a]' }),
    ])
    expect(send.map((r) => r.id).sort()).toEqual(['a-new', 'b-old'])
    expect(skip.map((r) => r.id)).toEqual(['a-old'])
  })

  it('keeps clusters and non-chat pushes separate', () => {
    const { send, skip } = collapseSuperseded([
      claimed('c1', { data: { kind: 'message', clusterId: 'c1' } }),
      claimed('c2', { data: { kind: 'message', clusterId: 'c2' } }),
      claimed('mention', { data: { kind: 'mention', clusterId: 'c1' } }),
      claimed('untagged', { data: { kind: 'message' } }),
    ])
    expect(skip).toHaveLength(0)
    expect(send.map((r) => r.id).sort()).toEqual(['c1', 'c2', 'mention', 'untagged'])
  })
})
