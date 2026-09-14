/**
 * Dataset types — versioned collections of approved records.
 * @gharibo/shared
 */

/** A versioned, frozen dataset snapshot. */
export interface Dataset {
  id: string;
  name: string;
  version: string;
  recordCount: number;
  createdAt: string;
}

/** Dataset with its full records (used in GET /datasets/:id). */
export interface DatasetWithRecords extends Dataset {
  records: Array<{
    recordId: string;
  }>;
}
