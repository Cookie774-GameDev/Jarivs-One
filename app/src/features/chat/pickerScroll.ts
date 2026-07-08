/** Scroll a picker list only when the highlighted row is outside the viewport. */
export function scrollPickerItemIntoView(container: HTMLElement, selector: string): void {
  const selected = container.querySelector(selector);
  if (!(selected instanceof HTMLElement)) return;
  const top = selected.offsetTop;
  const bottom = top + selected.offsetHeight;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;
  if (top >= viewTop && bottom <= viewBottom) return;
  selected.scrollIntoView({ block: 'nearest', behavior: 'auto' });
}
