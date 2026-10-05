import { BadRequestException } from '@nestjs/common';
import {
  EnrollmentQueryError,
  parseEnrollmentListQuery,
  type EnrollmentListQuery,
} from './enrollment-list-filters';

export function enrollmentQuery(query: EnrollmentListQuery) {
  try {
    return parseEnrollmentListQuery(query);
  } catch (error) {
    if (error instanceof EnrollmentQueryError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}
