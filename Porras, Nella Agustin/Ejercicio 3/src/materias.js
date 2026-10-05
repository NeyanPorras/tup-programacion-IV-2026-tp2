import { Router } from 'express'
import { matchedData } from 'express-validator'
import { pool } from './db.js'
import {
  manejarErrores,
  manejarConflicto,
  validarId,
  validarMateria,
  validarMateriaUnica
} from './validators.js'

export const materias = Router()

materias.get('/', async (_req, res) => {
  const [filas] = await pool.query('SELECT id, nombre FROM materias ORDER BY id')

  res.json(filas)
})

materias.get('/:id', validarId, manejarErrores, async (req, res) => {
  const { id } = matchedData(req)

  const [filas] = await pool.query(
    'SELECT id, nombre FROM materias WHERE id = ?',
    [id]
  )

  if (filas.length === 0) {
    res.status(404).json({ error: 'Materia no encontrada' })
    return
  }

  res.json(filas[0])
})

materias.post(
  '/',
  validarMateria,
  manejarErrores,
  validarMateriaUnica,
  manejarConflicto,
  async (req, res) => {
    const { nombre } = matchedData(req)

    const [resultado] = await pool.query(
      'INSERT INTO materias (nombre) VALUES (?)',
      [nombre]
    )

    res.status(201).json({ id: resultado.insertId, nombre })
  }
)

materias.put(
  '/:id',
  validarId,
  validarMateria,
  manejarErrores,
  validarMateriaUnica,
  manejarConflicto,
  async (req, res) => {
    const { id, nombre } = matchedData(req)

    const [resultado] = await pool.query(
      'UPDATE materias SET nombre = ? WHERE id = ?',
      [nombre, id]
    )

    if (resultado.affectedRows === 0) {
      res.status(404).json({ error: 'Materia no encontrada' })
      return
    }

    res.json({ id, nombre })
  }
)

materias.delete('/:id', validarId, manejarErrores, async (req, res) => {
  const { id } = matchedData(req)

  const [resultado] = await pool.query('DELETE FROM materias WHERE id = ?', [
    id
  ])

  if (resultado.affectedRows === 0) {
    res.status(404).json({ error: 'Materia no encontrada' })
    return
  }

  res.json({ message: 'Materia eliminada' })
})
