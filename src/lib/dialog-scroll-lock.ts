type Lock = { users: Set<symbol>; restore: () => void }
const locks = new WeakMap<HTMLElement, Lock>()

/** Each dialog releases only its own lock, including when several unmount together. */
export function lockDialogScroll(viewport = document.documentElement) {
  let lock = locks.get(viewport)
  if (!lock) {
    const style = viewport.style
    const properties = ['overflow-x', 'overflow-y', 'scrollbar-gutter']
    const original = properties.map(name => [name, style.getPropertyValue(name), style.getPropertyPriority(name)])
    lock = {
      users: new Set(),
      restore: () => {
        style.removeProperty('overflow')
        for (const [name, value, priority] of original) {
          if (value) style.setProperty(name, value, priority)
          else style.removeProperty(name)
        }
      },
    }
    locks.set(viewport, lock)
    const window = viewport.ownerDocument.defaultView
    if (window && viewport.clientWidth < window.innerWidth) style.setProperty('scrollbar-gutter', 'stable')
    style.setProperty('overflow', 'hidden')
  }
  const token = Symbol()
  lock.users.add(token)
  return () => {
    if (!lock.users.delete(token) || lock.users.size) return
    lock.restore()
    locks.delete(viewport)
  }
}
