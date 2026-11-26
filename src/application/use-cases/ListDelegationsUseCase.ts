import type { DelegationPort } from '../../domain/repositories/DelegationPort'

/** ListDelegations: one operation of DelegationPort, called by the presentation layer's feature hooks. */
export class ListDelegationsUseCase {
  private readonly repository: Pick<DelegationPort, 'list'>

  constructor(repository: Pick<DelegationPort, 'list'>) {
    this.repository = repository
  }

  execute(...args: Parameters<DelegationPort['list']>): ReturnType<DelegationPort['list']> {
    return this.repository.list(...args)
  }
}
