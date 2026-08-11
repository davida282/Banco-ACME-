export function setMessage(element, text = '', type = 'error') {
  if (!element) return;
  element.textContent = text;
  element.dataset.type = type;
  element.setAttribute('role', type === 'error' ? 'alert' : 'status');
  element.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
}

export function setBusy(button, busy, busyLabel = 'Procesando…') {
  if (!button) return;
  if (busy) {
    if (button.dataset.busy === 'true') return;
    button.dataset.originalLabel = button.textContent.trim();
    button.dataset.wasDisabled = String(button.disabled);
    button.dataset.busy = 'true';
    button.setAttribute('aria-busy', 'true');
    button.disabled = true;
    button.textContent = busyLabel;
    return;
  }

  if (button.dataset.busy !== 'true') return;
  button.textContent = button.dataset.originalLabel || button.textContent;
  button.disabled = button.dataset.wasDisabled === 'true';
  button.dataset.busy = 'false';
  button.removeAttribute('aria-busy');
  delete button.dataset.originalLabel;
  delete button.dataset.wasDisabled;
}

export function setRegionBusy(element, busy) {
  if (!element) return;
  element.setAttribute('aria-busy', String(Boolean(busy)));
}

export function trapFocus(modal, event) {
  if (event.key !== 'Tab' || !modal || modal.hidden) return;
  const focusable = [...modal.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function prepareImages(root = document) {
  root.querySelectorAll('img').forEach((image) => image.setAttribute('draggable', 'false'));
}

prepareImages();
