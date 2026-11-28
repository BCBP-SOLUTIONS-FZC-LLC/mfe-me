// "My access" (read-only): my tenant roles and my departments at their levels, from the session context
// (P-35), with department names from P-3 and the tenant's level labels from P-12. Nothing here is editable
// ("Ask an administrator to change this"); it is shown because no other screen tells a member their level
// (LLD §7.2). Role names are data from the domain vocabulary, never compared in a check.
import { useSessionContext, useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useId } from 'react'
import { DEPARTMENT_LEVELS, IMPLICIT_ROLE, TENANT_ROLES, TENANT_ROLE_KEYS, type DepartmentLevel } from '../../../domain/vocabulary'
import { APP_ID } from '../../../shared/constants/app'
import DepartmentLabel from '../../components/identity/DepartmentLabel'
import { card, cardHeader, cardTitle } from '../../components/styles'
import { useDepartmentDirectory } from '../../features/identity/useDepartmentDirectory'

export default function MyAccessCard() {
  const t = useT(APP_ID)
  const id = useId()
  const context = useSessionContext()
  const directory = useDepartmentDirectory()
  const roles = (context?.roles ?? []).flatMap((r) => {
    const known = TENANT_ROLES.find((x) => x === r)
    return known ? [{ code: r, key: TENANT_ROLE_KEYS[known] }] : r === IMPLICIT_ROLE ? [{ code: r, key: 'access.role.member' }] : []
  })
  const departments = (context?.departments ?? []).flatMap((d) => {
    const level = DEPARTMENT_LEVELS.find((l): l is DepartmentLevel => l === d.level)
    return level ? [{ id: d.id, level }] : []
  })
  return (
    <section aria-labelledby={`${id}-title`} className={`${card} overflow-hidden`}>
      <div className={cardHeader}>
        <h2 id={`${id}-title`} className={cardTitle}>
        {t('access.title')}
        </h2>
      </div>
      <div className="flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-aura-muted">{t('access.roles')}</h3>
        <ul className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <li key={r.code} className="badge badge-outline">
              {t(r.key)}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-aura-muted">{t('access.departments')}</h3>
        {departments.length === 0 ? (
          <p className="text-sm">{t('access.noDepartments')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {departments.map((d) => (
              <li key={d.id}>
                <DepartmentLabel departmentId={d.id} level={d.level} directory={directory} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-aura-muted">{t('access.askAdmin')}</p>
      </div>
    </section>
  )
}
