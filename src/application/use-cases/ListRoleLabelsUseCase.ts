import type { OrgDirectoryPort } from '../../domain/repositories/OrgDirectoryPort'

/** ListRoleLabels: one operation of OrgDirectoryPort, called by the presentation layer's feature hooks. */
export class ListRoleLabelsUseCase {
  private readonly repository: Pick<OrgDirectoryPort, 'listRoleLabels'>

  constructor(repository: Pick<OrgDirectoryPort, 'listRoleLabels'>) {
    this.repository = repository
  }

  execute(...args: Parameters<OrgDirectoryPort['listRoleLabels']>): ReturnType<OrgDirectoryPort['listRoleLabels']> {
    return this.repository.listRoleLabels(...args)
  }
}
