let nextId = 1
const listeners = new Set()

export function onToast(fn) { listeners.add(fn); return () => listeners.delete(fn) }

export function showToast(message, kind = 'info', duration = 4000) {
  const toast = { id: nextId++, message, kind, duration }
  for (const l of listeners) l(toast)
  return toast.id
}
