interface AvatarProps {
  /** Where the photo lives, or null for someone who hasn't got one. */
  url: string | null
  inicial: string
  className?: string
}

/** One person's face, falling back to their initial. Photos are hosted by
 * Clerk — from Google on sign-in, or uploaded from Perfil — so this is the
 * one place in the app that renders an image it doesn't store itself.
 *
 * `referrerPolicy` keeps the app's own URL out of the request: a profile
 * photo has no business telling anyone which page it was shown on. */
export function Avatar({ url, inicial, className }: AvatarProps) {
  const clase = `avatar${className ? ` ${className}` : ''}`
  if (!url) return <div className={clase}>{inicial}</div>
  return (
    <img
      className={clase}
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      // A dead avatar URL — Clerk rotates them, Google links expire — should
      // leave the initial behind rather than a broken-image icon.
      onError={(e) => {
        const img = e.currentTarget
        const reemplazo = document.createElement('div')
        reemplazo.className = clase
        reemplazo.textContent = inicial
        img.replaceWith(reemplazo)
      }}
    />
  )
}
