/** A single published price. `date` is a calendar day, "YYYY-MM-DD". */
export interface Quote {
  readonly date: string;
  readonly price: number;
}

/**
 * A crop's price history in one region, ascending by date and containing only
 * days the source actually published. Gaps (weekends, holidays) are expected.
 */
export type Series = readonly Quote[];

export interface CropMeta {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly colorHex: string;
}
