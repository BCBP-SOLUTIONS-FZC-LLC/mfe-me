// The writes of G1: edit my profile, and go back to the directory's value (IAM-UX-11). A success writes the
// answer into the cache under the profile key **and** under the `users:batch` key for my ID, so my own chip
// shows the new name at once (the mfe-admin 0.1.17 fix); other remotes see it within the service cache
// (about 60 s, spec §8).
import { useQueryClient } from '@tanstack/react-query'
import type { ProfileState } from '../../../domain/entities/directory'
import type { MyProfile, ProfilePatch } from '../../../domain/entities/profile'
import type { MeAction } from '../../../domain/events/me-events'
import { useSelf } from '../self/useSelf'
import { useMeUseCases } from '../services'
import { useTrackedMutation } from '../tracked'
import { useMeKeys } from '../workspace'

function useProfileWrite(action: MeAction) {
  const { userId } = useSelf()
  const useCases = useMeUseCases()
  const { keys } = useMeKeys()
  const queryClient = useQueryClient()
  return useTrackedMutation<ProfilePatch, MyProfile>({
    action,
    mutationFn: async (patch) => {
      const saved = await useCases.updateUserProfile.execute(userId!, patch)
      queryClient.setQueryData(keys.profile(userId!), saved)
      queryClient.setQueryData(keys.user(userId!), {
        state: 'found',
        user: {
          userId: saved.userId,
          displayName: saved.displayName,
          email: saved.email,
          ...(saved.jobTitle ? { jobTitle: saved.jobTitle } : {}),
          status: saved.status,
          ...(saved.availability ? { availability: saved.availability.status } : {}),
          provisional: saved.provisional,
          recordVersion: saved.recordVersion,
        },
      } satisfies ProfileState)
      return saved
    },
  })
}

/** `PATCH /users/<me>` with the fields the rule planned. */
export const useUpdateProfile = () => useProfileWrite('update_profile')

/** The same call, counted as a revert (the body is only the flag turned off). */
export const useRevertDirectoryValue = () => useProfileWrite('revert_directory_value')
