interface ProfileProps {
  nombres: string
  inicial1: string
  inicial2: string
  fechaInicioTexto: string
  diasJuntos: number
  numAlbumes: number
  numIdeas: number
}

export function Profile({ nombres, inicial1, inicial2, fechaInicioTexto, diasJuntos, numAlbumes, numIdeas }: ProfileProps) {
  return (
    <div className="screen">
      <h2>Perfil</h2>

      <div className="profile-card">
        <div className="profile-card__avatars">
          <div className="profile-card__avatar profile-card__avatar--a">{inicial1}</div>
          <div className="profile-card__avatar profile-card__avatar--b">{inicial2}</div>
        </div>
        <div className="profile-card__name">{nombres}</div>
        <div className="profile-card__since">Juntos desde el {fechaInicioTexto}</div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__num">{diasJuntos}</div>
          <div className="stat-card__label">días juntos</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__num">{numAlbumes}</div>
          <div className="stat-card__label">recuerdos</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__num">{numIdeas}</div>
          <div className="stat-card__label">ideas de cita</div>
        </div>
      </div>

      <div className="settings-panel">
        <div className="settings-row">
          <div className="settings-row__icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#a32f42" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="4" />
              <path d="M16 2v4" />
              <path d="M8 2v4" />
              <path d="M3 10h18" />
            </svg>
          </div>
          <span className="settings-row__label">Fecha de aniversario</span>
          <span className="settings-row__value">{fechaInicioTexto}</span>
        </div>
        <div className="settings-row">
          <div className="settings-row__icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#a32f42" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </div>
          <span className="settings-row__label">Notificaciones</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d3adaf" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
        <div className="settings-row">
          <div className="settings-row__icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#a32f42" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <span className="settings-row__label">Invitar a tu pareja</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d3adaf" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
        <div className="settings-row settings-row--danger">
          <div className="settings-row__icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#a32f42" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
          <span className="settings-row__label settings-row__label--bold">Cerrar sesión</span>
        </div>
      </div>
    </div>
  )
}
