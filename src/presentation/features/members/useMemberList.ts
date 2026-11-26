// The workspace's members, page by page (P-4), for the delegate picker. IDs and status only: names come
// from User Profile (IAM-UX-4). There is no server-side search (IAM-FE-Q5), so the picker filters what is
// loaded and offers "Load more".
import { useMeUseCases } from '../services'
import { useTrackedInfiniteQuery } from '../tracked'
import { useMeKeys } from '../workspace'
import { useMeAccess } from '../access/useMeAccess'

export const MEMBER_PAGE_SIZE = 50

export function useMemberList(enabled = true) {
  const useCases = useMeUseCases()
  const { keys } = useMeKeys()
  const { canReadMembers } = useMeAccess()
  return useTrackedInfiniteQuery({
    resource: 'members',
    queryKey: keys.members({ limit: MEMBER_PAGE_SIZE }),
    enabled: enabled && canReadMembers,
    queryFn: (cursor, signal) => useCases.listMembers.execute({ limit: MEMBER_PAGE_SIZE, ...(cursor ? { cursor: cursor as never } : {}) }, signal),
    nextCursor: (page) => page.nextCursor,
  })
}
