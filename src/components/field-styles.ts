/**
 * Shared chrome for the form controls in both arms.
 *
 * The 16px text below `sm` is not a style choice. iOS Safari zooms the viewport
 * whenever a focused control's text is smaller than 16px, and it never zooms
 * back out — the user is left on a horizontally scrolled page after picking a
 * praça. So the controls render at 16px on touch and drop to the design's
 * 13.5px from `sm` up, where no such behaviour exists.
 *
 * The vertical padding follows the same split: 2.5 keeps the hit area near
 * 44px on a phone, 2 restores the compact desktop control.
 */
export const FIELD_CLASS =
  "rounded-[9px] border border-line-input bg-surface px-[11px] py-2.5 text-[16px] font-medium text-ink sm:py-2 sm:text-[13.5px]";

/**
 * A `<select>` that navigates on change. Full width on mobile so it is easy to
 * hit and fills the header row; sized to its content from `sm` up.
 */
export const SELECT_CLASS = `${FIELD_CLASS} w-full cursor-pointer disabled:opacity-60 sm:w-auto`;
