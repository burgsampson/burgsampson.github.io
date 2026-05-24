const iframe = document.getElementById('gameFrame');

// Request pointer lock when the user clicks/taps the iframe (desktop primary interaction)
function requestPointerLock() {
  try {
    // Prefer the iframe element itself for pointer lock so the mouse is captured by the iframe area
    if (iframe.requestPointerLock) {
      iframe.requestPointerLock();
    } else if (iframe.contentWindow && iframe.contentWindow.document && iframe.contentWindow.document.body.requestPointerLock) {
      // fallback attempt inside the iframe document (best-effort)
      iframe.contentWindow.document.body.requestPointerLock();
    }
  } catch (e) {
    // ignore failures (cross-origin or unsupported)
  }
}

// Toggle locked class on the iframe when pointer lock changes
function onPointerLockChange() {
  const plElement = document.pointerLockElement;
  if (plElement === iframe || (plElement && plElement.tagName === 'IFRAME' && plElement === iframe)) {
    iframe.classList.add('locked');
  } else {
    iframe.classList.remove('locked');
  }
}

// Bind events
iframe.addEventListener('click', (e) => {
  // Only request on primary button
  if (e.button === 0) requestPointerLock();
});

// Support keyboard-initiated lock for accessibility (Enter/Space while focused)
iframe.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    requestPointerLock();
    e.preventDefault();
  }
});

// Clean pointerlockchange listener
document.addEventListener('pointerlockchange', onPointerLockChange);
document.addEventListener('webkitpointerlockchange', onPointerLockChange);
document.addEventListener('mozpointerlockchange', onPointerLockChange);

// Keep listeners light to preserve performance
document.addEventListener('visibilitychange', () => {
  // Pause audio in the iframe if the document is hidden (best-effort)
  try {
    iframe.contentWindow.postMessage({ type: 'visibility', hidden: document.hidden }, '*');
  } catch (e) { /* ignore */ }
});