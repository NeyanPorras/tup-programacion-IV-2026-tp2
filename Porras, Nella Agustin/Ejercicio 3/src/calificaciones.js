import { Router } from 'express'
import { matchedData } from 'express-validator'
import { pool } from './db.js'
import {
  manejarErrores,
  manejarConflicto,
  validarId,
  validarFiltros,
  validarCalificacion,
  validarMateriaExiste,
  validarCombinacionUnica
} from './validators.js'

export const calificaciones = Router()

const SELECCION = `
  SELECT c.id, c.alumno, c.nota1, c.nota2, c.nota3,
         m.id AS materia_id, m.nombre AS materia_nombre
  FROM calificaciones c
  JOIN materias m ON m.id = c.materia_id`

const aCalificacion = (fila) => ({
  id: fila.id,
  alumno: fila.alumno,
  materia: { id: fila.materia_id, nombre: fila.materia_nombre },
  notas: [Number(fila.nota1), Number(fila.nota2), Number(fila.nota3)]
})

const buscarPorId = async (id) => {
  const [filas] = await pool.query(`${SELECCION} WHERE c.id = ?`, [id])

  return filas[0]
}

calificaciones.get('/', validarFiltros, manejarErrores, async (req, res) => {
  const { materiaId, alumno } = matchedData(req)

  const condiciones = []
  const valores = []

  if (materiaId !== undefined) {
    condiciones.push('c.materia_id = ?')
    valores.push(materiaId)
  }

  if (alumno !== undefined) {
    condiciones.push('c.alumno = ?')
    valores.push(alumno)
  }

  const filtro = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''

  const [filas] = await pool.query(
    `${SELECCION} ${filtro} ORDER BY c.id`,
    valores
  )

  res.json(filas.map(aCalificacion))
})

calificaciones.get('/:id', validarId, manejarErrores, async (req, res) => {
  const { id } = matchedData(req)

  const fila = await buscarPorId(id)

  if (!fila) {
    res.status(404).json({ error: 'Calificación no encontrada' })
    return
  }

  res.json(aCalificacion(fila))
})

calificaciones.post(
  '/',
  validarCalificacion,
  manejarErrores,
  validarMateriaExiste,
  manejarErrores,
  validarCombinacionUnica,
  manejarConflicto,
  async (req, res) => {
    const { alumno, materiaId, notas } = matchedData(req)

    const [resultado] = await pool.query(
      'INSERT INTO calificaciones (alumno, materia_id, nota1, nota2, nota3) VALUES (?, ?, ?, ?, ?)',
      [alumno, materiaId, ...notas]
    )

    res.status(201).json(aCalificacion(await buscarPorId(resultado.insertId)))
  }
)

calificaciones.put(
  '/:id',
  validarId,
  validarCalificacion,
  manejarErrores,
  validarMateriaExiste,
  manejarErrores,
  validarCombinacionUnica,
  manejarConflicto,
  async (req, res) => {
    const { id, alumno, materiaId, notas } = matchedData(req)

    const [resultado] = await pool.query(
      'UPDATE calificaciones SET alumno = ?, materia_id = ?, nota1 = ?, nota2 = ?, nota3 = ? WHERE id = ?',
      [alumno, materiaId, ...notas, id]
    )

    if (resultado.affectedRows === 0) {
      res.status(404).json({ error: 'Calificación no encontrada' })
      return
    }

    res.json(aCalificacion(await buscarPorId(id)))
  }
)

calificaciones.delete('/:id', validarId, manejarErrores, async (req, res) => {
  const { id } = matchedData(req)

  const [resultado] = await pool.query(
    'DELETE FROM calificaciones WHERE id = ?',
    [id]
  )

  if (resultado.affectedRows === 0) {
    res.status(404).json({ error: 'Calificación no encontrada' })
    return
  }

  res.json({ message: 'Calificación eliminada' })
})
