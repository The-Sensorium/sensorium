import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../app/auth-context'
import type { Database } from '../lib/database.types'
import { requireSupabase } from '../lib/supabase'

type Cluster = Database['public']['Tables']['clusters']['Row']

export type EligibleComember =
  Database['public']['Functions']['get_eligible_comembers']['Returns'][number]
export type CreatedPendingInvite =
  Database['public']['Functions']['get_created_pending_invites']['Returns'][number]
export type CreatedInviteDetail =
  Database['public']['Functions']['get_created_invite_detail']['Returns'][number]

/** Created clusters keep status='active'; Pending is derived from size. */
export function isCreatedCluster(cluster: Pick<Cluster, 'origin'>): boolean {
  return cluster.origin === 'created'
}

/** Pending while fewer than 3 confirmed members (creator + accepts). */
export function isPendingCreated(
  cluster: Pick<Cluster, 'origin'>,
  memberCount: number,
): boolean {
  return isCreatedCluster(cluster) && memberCount < 3
}

/** People the caller has shared any cluster with (current or ex members). */
export function useEligibleComembers(enabled = true) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: ['eligible-comembers', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    staleTime: 60_000,
    queryFn: async () => {
      if (!userId) throw new Error('Not signed in')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_eligible_comembers')
      if (error) throw error
      return (data ?? []) as EligibleComember[]
    },
  })
}

/** Pending invitees on a created cluster (creator and members can read). */
export function useCreatedPendingInvites(clusterId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['created-pending-invites', clusterId ?? 'none'],
    enabled: enabled && clusterId !== null,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_created_pending_invites', {
        p_cluster_id: clusterId,
      })
      if (error) throw error
      return (data ?? []) as CreatedPendingInvite[]
    },
  })
}

/** Invite detail for the invitee (name, creator, roster, counts). */
export function useCreatedInviteDetail(invitationId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['created-invite-detail', invitationId ?? 'none'],
    enabled: enabled && invitationId !== null,
    queryFn: async () => {
      if (!invitationId) throw new Error('No invitation')
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_created_invite_detail', {
        p_invitation_id: invitationId,
      })
      if (error) throw error
      return (data?.[0] as CreatedInviteDetail | undefined) ?? null
    },
  })
}

export function useCreateCluster() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, inviteeIds }: { name: string; inviteeIds: string[] }) => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('create_created_cluster', {
        p_name: name,
        p_invitee_ids: inviteeIds,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: ['my-clusters', userId] })
      }
      void queryClient.invalidateQueries({ queryKey: ['my-invitations'] })
    },
  })
}

export function useInviteToCreatedCluster(clusterId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (inviteeId: string) => {
      if (!clusterId) throw new Error('No cluster')
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('invite_to_created_cluster', {
        p_cluster_id: clusterId,
        p_invitee_id: inviteeId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['created-pending-invites', clusterId] })
        void queryClient.invalidateQueries({ queryKey: ['cluster-members', clusterId] })
      }
      void queryClient.invalidateQueries({ queryKey: ['my-invitations'] })
    },
  })
}

export function useCancelCreatedInvitation(clusterId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('cancel_created_invitation', {
        p_invitation_id: invitationId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: ['created-pending-invites', clusterId] })
      }
      void queryClient.invalidateQueries({ queryKey: ['my-invitations'] })
    },
  })
}
