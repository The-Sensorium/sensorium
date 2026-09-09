import type { Href } from 'expo-router'
import { notificationTarget, type MyNotification } from '../features/notifications'

export type PushData = {
  v?: number
  kind?: string
  clusterId?: string
  postId?: string
  signalId?: string
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
  if (data.postId) return { pathname: '/posts/[postId]', params: { postId: data.postId } }
  if (data.clusterId && data.signalId) {
    return {
      pathname: '/cluster/[clusterId]/signals/[signalId]',
      params: { clusterId: data.clusterId, signalId: data.signalId },
    }
  }
  if (data.clusterId && data.kind && data.kind.startsWith('vote')) {
    return { pathname: '/cluster/[clusterId]/votes', params: { clusterId: data.clusterId } }
  }
  if (data.clusterId && data.kind === 'replacement') {
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
  if (data.clusterId) return { pathname: '/cluster/[clusterId]/room', params: { clusterId: data.clusterId } }
  return '/(app)/home'
}

export function appPathToHref(to: string): Href | null {
  if (to.startsWith('/posts/')) {
    return { pathname: '/posts/[postId]', params: { postId: to.slice('/posts/'.length) } }
  }
  if (to.startsWith('/cluster/')) {
    const rest = to.slice('/cluster/'.length)
    const [clusterId, ...tail] = rest.split('/')
    if (tail[0] === 'signals' && tail[1]) {
      return { pathname: '/cluster/[clusterId]/signals/[signalId]', params: { clusterId, signalId: tail[1] } }
    }
    if (tail[0] === 'signals') {
      return { pathname: '/cluster/[clusterId]/signals', params: { clusterId } }
    }
    if (tail[0] === 'votes') {
      return { pathname: '/cluster/[clusterId]/votes', params: { clusterId } }
    }
    if (tail[0] === 'introductions') {
      return { pathname: '/cluster/[clusterId]/introductions', params: { clusterId } }
    }
    if (tail[0] === 'members') {
      return { pathname: '/cluster/[clusterId]/members', params: { clusterId } }
    }
    return { pathname: '/cluster/[clusterId]/room', params: { clusterId } }
  }
  if (to === '/home') return '/(app)/home'
  if (to === '/clusters') return '/(app)/clusters'
  if (to === '/cluster-created') return '/cluster-created'
  return null
}
