// Department names and the tenant's own level labels, for every row that shows a department: names from
// the tenant's department list (P-3, which carries the catalogue's name), level labels from P-12. If either
// fails the row stays: "Department" and the level's plain name. (The part the shared identity package replaces.)
import { useMemo } from 'react'
import type { RoleLabel, TenantDepartment } from '../../../domain/entities/directory'
import type { DepartmentLevel } from '../../../domain/vocabulary'
import { useMeUseCases } from '../services'
import { useTrackedQuery } from '../tracked'
import { useMeKeys } from '../workspace'

export interface DepartmentDirectory {
  /** The department's name, or undefined when unknown or not loaded (show "Department"). */
  readonly nameOf: (departmentId: string) => string | undefined
  /** The tenant's label for a level, or undefined (show the level's own name). */
  readonly levelLabel: (level: DepartmentLevel) => string | undefined
  readonly departments: readonly TenantDepartment[]
  readonly loading: boolean
  readonly failed: boolean
  readonly reload: () => void
}

export function useDepartmentDirectory(): DepartmentDirectory {
  const useCases = useMeUseCases()
  const { keys } = useMeKeys()
  const departments = useTrackedQuery({ resource: 'departments', queryKey: keys.departments(), queryFn: (signal) => useCases.listDepartments.execute(signal) })
  const labels = useTrackedQuery({ resource: 'role_labels', queryKey: keys.roleLabels(), queryFn: (signal) => useCases.listRoleLabels.execute(signal) })

  const departmentData = departments.data
  const labelData = labels.data
  const { isPending: departmentsPending, isError: departmentsFailed, refetch: refetchDepartments } = departments
  const { isPending: labelsPending, refetch: refetchLabels } = labels
  return useMemo(() => {
    const names = new Map<string, string>((departmentData ?? []).map((d: TenantDepartment) => [d.departmentId, d.name]))
    const levels = new Map<DepartmentLevel, string>((labelData ?? []).map((l: RoleLabel) => [l.roleCode, l.displayName]))
    return {
      nameOf: (id) => names.get(id),
      levelLabel: (level) => levels.get(level),
      departments: departmentData ?? [],
      loading: departmentsPending || labelsPending,
      failed: departmentsFailed,
      reload: () => {
        void refetchDepartments()
        void refetchLabels()
      },
    }
  }, [departmentData, labelData, departmentsPending, departmentsFailed, refetchDepartments, labelsPending, refetchLabels])
}
