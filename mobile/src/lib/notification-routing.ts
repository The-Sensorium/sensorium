import type { Href } from 'expo-router'
import { notificationTarget, type MyNotification } from '../features/notifications'

export type PushData = {
  v?: number
  kind?: string
  clusterId?: string
  postId?: string
  commentId?: string
  messageId?: string
  signalId?: string
  newMemberId?: string
  meetupId?: string
}

export function mobileTarget(n: MyNotification): Href | null {
  const target = notificationTarget(n)
  if (!target) return null
  return appPathToHref(target.to)
}

export function pushDataToHref(data: PushData | null | undefined): Href | null {
  if (!data) return null
  if (data.kind === 'invitation_received') return '/(app)/home'
  if (data.kind === 'queue_update') return '/(app)/clusters'
  if (data.postId) {
    return {
      pathname: '/posts/[postId]',
      params: { postId: data.postId, ...(data.commentId ? { comment: data.commentId } : {}) },
    }
  }
  if (data.clusterId && data.signalId) {
    return {
      pathname: '/cluster/[clusterId]/signals/[signalId]',
      params: { clusterId: data.clusterId, signalId: data.signalId },
    }
  }
  if (data.clusterId && data.kind && data.kind.startsWith('vote')) {
    return { pathname: '/cluster/[clusterId]/votes', params: { clusterId: data.clusterId } }
  }
  if (data.clusterId && data.kind && data.kind.startsWith('meetup')) {
    return { pathname: '/cluster/[clusterId]/meetups', params: { clusterId: data.clusterId } }
  }
  if (data.clusterId && data.kind === 'replacement') {
    if (data.newMemberId) {
      return { pathname: '/profile/[userId]', params: { userId: data.newMemberId, cluster: data.clusterId } }
    }
    return { pathname: '/cluster/[clusterId]/votes', params: { clusterId: data.clusterId } }
  }
  if (data.clusterId && data.kind === 'cluster_formed') {
    return {
      pathname: '/cluster/[clusterId]/introductions',
      params: { clusterId: data.clusterId },
    }
  }
  if (data.clusterId && data.kind === 'signal_new') {
    return { pathname: '/cluster/[clusterId]/signals', params: { clusterId: data.clusterId } }
  }
  if (data.clusterId) {
    return {
      pathname: '/cluster/[clusterId]/room',
      params: { clusterId: data.clusterId, ...(data.messageId ? { message: data.messageId } : {}) },
    }
  }
  return '/(app)/home'
}

export function appPathToHref(to: string): Href | null {
  if (to.startsWith('/posts/')) {
    const [postPart, query] = to.slice('/posts/'.length).split('?')
    const comment = new URLSearchParams(query ?? '').get('comment') ?? undefined
    return { pathname: '/posts/[postId]', params: { postId: postPart, ...(comment ? { comment } : {}) } }
  }
  if (to.startsWith('/profile/')) {
    const [userId, query] = to.slice('/profile/'.length).split('?')
    const cluster = new URLSearchParams(query ?? '').get('cluster') ?? undefined
    return { pathname: '/profile/[userId]', params: { userId, ...(cluster ? { cluster } : {}) } }
  }
  if (to.startsWith('/cluster/')) {
    const rest = to.slice('/cluster/'.length)
    const [clusterPart, query] = rest.split('?')
    const message = new URLSearchParams(query ?? '').get('message') ?? undefined
    const [clusterId, ...tail] = clusterPart.split('/')
    if (tail[0] === 'signals' && tail[1]) {
      return { pathname: '/cluster/[clusterId]/signals/[signalId]', params: { clusterId, signalId: tail[1] } }
    }
    if (tail[0] === 'signals') {
      return { pathname: '/cluster/[clusterId]/signals', params: { clusterId } }
    }
    if (tail[0] === 'votes') {
      return { pathname: '/cluster/[clusterId]/votes', params: { clusterId } }
    }
    if (tail[0] === 'meetups') {
      return { pathname: '/cluster/[clusterId]/meetups', params: { clusterId } }
    }
    if (tail[0] === 'introductions') {
      return { pathname: '/cluster/[clusterId]/introductions', params: { clusterId } }
    }
    if (tail[0] === 'members') {
      return { pathname: '/cluster/[clusterId]/members', params: { clusterId } }
    }
    return { pathname: '/cluster/[clusterId]/room', params: { clusterId, ...(message ? { message } : {}) } }
  }
  if (to === '/home') return '/(app)/home'
  if (to === '/clusters') return '/(app)/clusters'
  if (to === '/cluster-created') return '/cluster-created'
  return null
}
