import type { OrgDirectoryPort } from '../../domain/repositories/OrgDirectoryPort'

/** ListDepartments: one operation of OrgDirectoryPort, called by the presentation layer's feature hooks. */
export class ListDepartmentsUseCase {
  private readonly repository: Pick<OrgDirectoryPort, 'listDepartments'>

  constructor(repository: Pick<OrgDirectoryPort, 'listDepartments'>) {
    this.repository = repository
  }

  execute(...args: Parameters<OrgDirectoryPort['listDepartments']>): ReturnType<OrgDirectoryPort['listDepartments']> {
    return this.repository.listDepartments(...args)
  }
}
