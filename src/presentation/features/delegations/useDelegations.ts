// G3's data and writes (DLG-1 to DLG-6). The list is my active delegations as delegator; the policy bounds
// the date pickers. A write refreshes the list, and a create or a reassign also my availability and profile:
// Delegation sets the availability pointer first ("availability-first", LLD §7.5), so G2 and my chip may change.
import type { Delegation, DelegationCreate, DelegationExtend, DelegationExtended, DelegationReassign } from '../../../domain/entities/delegation'
import { instantFromMillis, type Instant } from '../../../domain/value-objects/Instant'
import type { DelegationContext } from '../../../domain/rules/me-rules'
import { useSessionContext } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useQueryClient } from '@tanstack/react-query'
import { useMeServices, useMeUseCases } from '../services'
import { useSelf } from '../self/useSelf'
import { useTrackedMutation, useTrackedQuery } from '../tracked'
import { useMeKeys } from '../workspace'

export function useDelegationList() {
  const useCases = useMeUseCases()
  const { keys } = useMeKeys()
  return useTrackedQuery({ resource: 'delegations', queryKey: keys.delegations(), queryFn: (signal) => useCases.listDelegations.execute(signal) })
}

export function useDelegationPolicy() {
  const useCases = useMeUseCases()
  const { keys } = useMeKeys()
  return useTrackedQuery({ resource: 'delegation_policy', queryKey: keys.delegationPolicy(), queryFn: (signal) => useCases.getDelegationPolicy.execute(signal) })
}

/** What the planning rules need besides the draft: who I am, the policy, my departments, and now (read at call time). */
export function useDelegationContext(): { context: () => DelegationContext | undefined; now: () => Instant } {
  const { userId } = useSelf()
  const policy = useDelegationPolicy().data
  const departments = useSessionContext()?.departments ?? []
  const { clock } = useMeServices()
  const now = () => instantFromMillis(clock.now().getTime())
  return { now, context: () => (userId && policy ? { me: userId, policy, myDepartments: departments.map((d) => d.id), now: now() } : undefined) }
}

function useDelegationInvalidation() {
  const { userId } = useSelf()
  return (alsoMine: boolean) => (keys: ReturnType<typeof useMeKeys>['keys']) => [keys.delegations(), ...(alsoMine && userId ? [keys.availability(userId), keys.profile(userId)] : [])]
}

export function useCreateDelegation() {
  const useCases = useMeUseCases()
  const invalidate = useDelegationInvalidation()
  return useTrackedMutation<{ request: DelegationCreate; key: string }, Delegation>({
    action: 'create_delegation',
    mutationFn: ({ request, key }) => useCases.createDelegation.execute(request, key),
    invalidate: invalidate(true),
  })
}

export function useExtendDelegation() {
  const useCases = useMeUseCases()
  const invalidate = useDelegationInvalidation()
  return useTrackedMutation<{ id: string; request: DelegationExtend }, DelegationExtended>({
    action: 'extend_delegation',
    mutationFn: ({ id, request }) => useCases.extendDelegation.execute(id, request),
    invalidate: invalidate(false),
  })
}

export function useReassignDelegation() {
  const useCases = useMeUseCases()
  const invalidate = useDelegationInvalidation()
  return useTrackedMutation<{ id: string; request: DelegationReassign }, Delegation>({
    action: 'reassign_delegation',
    mutationFn: ({ id, request }) => useCases.reassignDelegation.execute(id, request),
    invalidate: invalidate(true),
  })
}

export function useCancelDelegation() {
  const useCases = useMeUseCases()
  const invalidate = useDelegationInvalidation()
  return useTrackedMutation<{ id: string; recordVersion: Delegation['recordVersion'] }, void>({
    action: 'cancel_delegation',
    mutationFn: ({ id, recordVersion }) => useCases.cancelDelegation.execute(id, recordVersion),
    invalidate: invalidate(true),
  })
}

/** Asks for the delegation list again (after "still saving", or a failed reassign that may already have ended one). */
export function useRefreshDelegations(): () => void {
  const queryClient = useQueryClient()
  const { keys } = useMeKeys()
  return () => void queryClient.invalidateQueries({ queryKey: keys.delegations() })
}
