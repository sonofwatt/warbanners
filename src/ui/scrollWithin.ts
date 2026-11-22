// Brings an element into view by scrolling only its nearest scrolling box (a card or a sheet). scrollIntoView
// would also scroll every box around it, the app's own frame included, even one set to overflow: hidden, and
// that pushes the top bar off a small screen.
export function scrollWithin(el: HTMLElement, block: 'start' | 'center', smooth = false): void {
  let box = el.parentElement;
  while (box !== null) {
    const y = getComputedStyle(box).overflowY;
    if ((y === 'auto' || y === 'scroll') && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  if (box === null) return;
  const at = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
  const top = block === 'start' ? at : at - (box.clientHeight - el.offsetHeight) / 2;
  box.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
}
