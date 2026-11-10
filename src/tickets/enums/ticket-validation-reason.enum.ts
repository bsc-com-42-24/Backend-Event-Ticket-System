export enum TicketValidationReason {
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_USED = 'ALREADY_USED',
  CANCELLED = 'CANCELLED',
  WRONG_EVENT = 'WRONG_EVENT',
  EVENT_CANCELLED = 'EVENT_CANCELLED',
  /** The check-in staff member is not assigned to this ticket's event. */
  NOT_ASSIGNED = 'NOT_ASSIGNED',
}
