import express from 'express'
import { pool } from './src/db.js'
import {
  manejarErrores,
  validarRectangulo,
  validarId
} from './src/validators.js'
import { matchedData } from 'express-validator'

const app = express()
const PORT = 3000

app.use(express.json())

const aRectangulo = (fila) => ({
  id: fila.id,
  ladoA: Number(fila.lado_a),
  ladoB: Number(fila.lado_b),
  perimetro: Number(fila.perimetro),
  superficie: Number(fila.superficie)
})

app.get('/rectangulos', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM rectangulos')

    res.json(rows.map((fila) => aRectangulo(fila)))
  } catch (error) {
    console.error('Error al obtener los rectángulos:', error)
    res.status(500).json({ error: 'Error al obtener los rectángulos' })
  }
})

app.get('/rectangulos/:id', validarId, manejarErrores, async (req, res) => {
  const { id } = matchedData(req)

  try {
    const [filas] = await pool.query('SELECT * FROM rectangulos WHERE id = ?', [
      id
    ])
    if (filas.length === 0) {
      res.status(404).json({ error: 'Rectángulo no encontrado' })
    } else {
      res.json(aRectangulo(filas[0]))
    }
  } catch (error) {
    console.error('Error al obtener el rectángulo:', error)
    res.status(500).json({ error: 'Error al obtener el rectángulo' })
  }
})

app.post(
  '/rectangulos',
  validarRectangulo,
  manejarErrores,
  async (req, res) => {
    const { ladoA, ladoB } = matchedData(req)

    const perimetro = 2 * (ladoA + ladoB)
    const superficie = ladoA * ladoB

    try {
      const [result] = await pool.query(
        'INSERT INTO rectangulos (lado_a, lado_b, perimetro, superficie) VALUES (?, ?, ?, ?)',
        [ladoA, ladoB, perimetro, superficie]
      )
      const nuevoRectangulo = aRectangulo({
        id: result.insertId,
        lado_a: ladoA,
        lado_b: ladoB,
        perimetro,
        superficie
      })
      res.status(201).json(nuevoRectangulo)
    } catch (error) {
      console.error('Error al insertar el rectángulo:', error)
      res.status(500).json({ error: 'Error al insertar el rectángulo' })
    }
  }
)

app.put(
  '/rectangulos/:id',
  validarRectangulo,
  validarId,
  manejarErrores,
  async (req, res) => {
    const { id, ladoA, ladoB } = matchedData(req)

    const perimetro = 2 * (ladoA + ladoB)
    const superficie = ladoA * ladoB

    try {
      const [result] = await pool.query(
        'UPDATE rectangulos SET lado_a = ?, lado_b = ?, perimetro = ?, superficie = ? WHERE id = ?',
        [ladoA, ladoB, perimetro, superficie, id]
      )

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Rectángulo no encontrado' })
      }
      const nuevoRectangulo = aRectangulo({
        id,
        lado_a: ladoA,
        lado_b: ladoB,
        perimetro,
        superficie
      })
      res.status(200).json(nuevoRectangulo)
    } catch (error) {
      console.error('Error al actualizar el rectángulo:', error)
      res.status(500).json({ error: 'Error al actualizar el rectángulo' })
    }
  }
)

app.delete('/rectangulos/:id', validarId, manejarErrores, async (req, res) => {
  const { id } = matchedData(req)

  try {
    const [resultado] = await pool.query(
      'DELETE FROM rectangulos WHERE id = ?',
      [id]
    )
    if (resultado.affectedRows === 0) {
      res.status(404).json({ error: 'Rectángulo no encontrado' })
    } else {
      res.status(200).json({ message: 'Rectángulo eliminado' })
    }
  } catch (error) {
    console.error('Error al obtener el rectángulo:', error)
    res.status(500).json({ error: 'Error al obtener el rectángulo' })
  }
})

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`)
})
