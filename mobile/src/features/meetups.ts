import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requireSupabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'

export type Meetup = Database['public']['Tables']['meetups']['Row']
export type MeetupSlot = Database['public']['Tables']['meetup_slots']['Row']
export type MeetupFeedback = Database['public']['Tables']['meetup_feedback']['Row']

export interface MeetupSlotWithCount {
  id: string
  starts_at: string
  ends_at: string
  vote_count: number
}

export interface MeetupVoter {
  slot_id: string
  user_id: string
}

export interface MeetupState {
  meetup: Meetup
  slots: MeetupSlotWithCount[]
  my_slot_id: string | null
  my_rsvp?: 'going' | 'maybe' | 'declined' | null
  votes_cast: number
  going_count: number
  going_user_ids?: string[] | null
  checked_in_count: number
  my_feedback: MeetupFeedback | null
  voters: MeetupVoter[]
  quorum: number
}

function invalidateMeetup(queryClient: ReturnType<typeof useQueryClient>, clusterId: string, meetupId?: string) {
  void queryClient.invalidateQueries({ queryKey: ['cluster-meetups', clusterId] })
  if (meetupId) void queryClient.invalidateQueries({ queryKey: ['meetup-state', meetupId] })
}

/** Current plus most recent past meetup for a cluster. */
export function useClusterMeetups(clusterId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['cluster-meetups', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_cluster_meetups', { p_cluster_id: clusterId })
      if (error) throw error
      return (data ?? []) as Meetup[]
    },
  })
}

/** Full shaped state for one meetup (slots with counts, caller vote, RSVP aggregates). */
export function useMeetupState(meetupId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['meetup-state', meetupId ?? 'none'],
    enabled: enabled && meetupId !== null,
    queryFn: async () => {
      if (!meetupId) throw new Error('No meetup')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_meetup_state', { p_meetup_id: meetupId })
      if (error) throw error
      return data as unknown as MeetupState
    },
  })
}

export function useCreateMeetup(clusterId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      slots,
      votingClosesAt,
      weekLabel,
    }: {
      slots: Array<{ starts_at: string; ends_at: string }>
      votingClosesAt: string
      weekLabel?: string
    }) => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('create_meetup', {
        p_cluster_id: clusterId,
        p_slots: slots,
        p_voting_closes_at: votingClosesAt,
        p_week_label: weekLabel ?? undefined,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      if (clusterId) invalidateMeetup(queryClient, clusterId)
    },
  })
}

export function useVoteMeetupSlot(clusterId: string | null, meetupId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (slotId: string) => {
      if (!meetupId) throw new Error('No meetup')
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('vote_meetup_slot', { p_meetup_id: meetupId, p_slot_id: slotId })
      if (error) throw error
    },
    onSuccess: () => {
      if (clusterId) invalidateMeetup(queryClient, clusterId, meetupId ?? undefined)
    },
  })
}

export function useCancelMeetup(clusterId: string | null, meetupId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!meetupId) throw new Error('No meetup')
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('cancel_meetup', { p_meetup_id: meetupId })
      if (error) throw error
    },
    onSuccess: () => {
      if (clusterId) invalidateMeetup(queryClient, clusterId, meetupId ?? undefined)
    },
  })
}

export function useRsvpMeetup(clusterId: string | null, meetupId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (status: 'going' | 'maybe' | 'declined') => {
      if (!meetupId) throw new Error('No meetup')
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('rsvp_meetup', { p_meetup_id: meetupId, p_status: status })
      if (error) throw error
    },
    onSuccess: () => {
      if (clusterId) invalidateMeetup(queryClient, clusterId, meetupId ?? undefined)
    },
  })
}

export function useCheckInMeetup(clusterId: string | null, meetupId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!meetupId) throw new Error('No meetup')
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('check_in_meetup', { p_meetup_id: meetupId })
      if (error) throw error
    },
    onSuccess: () => {
      if (clusterId) invalidateMeetup(queryClient, clusterId, meetupId ?? undefined)
    },
  })
}

