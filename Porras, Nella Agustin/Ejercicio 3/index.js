import express from 'express'
import { materias } from './src/materias.js'
import { calificaciones } from './src/calificaciones.js'

const app = express()
const PORT = 3000

app.use(express.json())

app.use('/materias', materias)
app.use('/calificaciones', calificaciones)

app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' })
})

const ERRORES_DE_INTEGRIDAD = {
  ER_DUP_ENTRY: { estado: 409, error: 'Ya existe un registro con esos datos' },
  ER_NO_REFERENCED_ROW_2: { estado: 400, error: 'La materia indicada no existe' },
  ER_ROW_IS_REFERENCED_2: {
    estado: 409,
    error: 'No se puede eliminar la materia porque tiene calificaciones registradas'
  }
}

app.use((error, _req, res, _next) => {
  if (error.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'El cuerpo no es un JSON válido' })
    return
  }

  const integridad = ERRORES_DE_INTEGRIDAD[error.code]
  if (integridad) {
    res.status(integridad.estado).json({ error: integridad.error })
    return
  }

  console.error('Error interno:', error)
  res.status(500).json({ error: 'Error interno del servidor' })
})

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`)
})
