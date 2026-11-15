export type DomainErrorCode =
  | 'INVALID_CUSTOMER'
  | 'EMPTY_ORDER'
  | 'TOO_MANY_ITEMS'
  | 'DUPLICATED_ITEM'
  | 'INVALID_QUANTITY'
  | 'INVALID_PRICE'
  | 'INVALID_TRANSITION';

/** Violação de regra de negócio. A camada HTTP traduz para 409/422. */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
