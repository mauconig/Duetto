export interface PerfilPareja {
  nombrePropio: string
  nombrePareja: string
  fechaAniversario: string
  proximoHito: 'cumplemes' | 'aniversario'
}

export function perfilCompleto(metadata: unknown): metadata is PerfilPareja {
  if (!metadata || typeof metadata !== 'object') return false
  const m = metadata as Record<string, unknown>
  return (
    typeof m.nombrePropio === 'string' &&
    m.nombrePropio.trim() !== '' &&
    typeof m.nombrePareja === 'string' &&
    m.nombrePareja.trim() !== '' &&
    typeof m.fechaAniversario === 'string' &&
    m.fechaAniversario.trim() !== '' &&
    (m.proximoHito === 'cumplemes' || m.proximoHito === 'aniversario')
  )
}
