import type { OrgDirectoryPort } from '../../domain/repositories/OrgDirectoryPort'

/** ListMembers: one operation of OrgDirectoryPort, called by the presentation layer's feature hooks. */
export class ListMembersUseCase {
  private readonly repository: Pick<OrgDirectoryPort, 'listMembers'>

  constructor(repository: Pick<OrgDirectoryPort, 'listMembers'>) {
    this.repository = repository
  }

  execute(...args: Parameters<OrgDirectoryPort['listMembers']>): ReturnType<OrgDirectoryPort['listMembers']> {
    return this.repository.listMembers(...args)
  }
}
