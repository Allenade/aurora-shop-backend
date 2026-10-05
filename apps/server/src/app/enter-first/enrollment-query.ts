import { BadRequestException } from '@nestjs/common';
import {
  EnrollmentFilterError,
  parseEnrollmentFilters,
  type EnrollmentFilterQuery,
} from './enrollment-filters';

export function enrollmentQuery(query: EnrollmentFilterQuery) {
  try {
    return parseEnrollmentFilters(query);
  } catch (error) {
    if (error instanceof EnrollmentFilterError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}
