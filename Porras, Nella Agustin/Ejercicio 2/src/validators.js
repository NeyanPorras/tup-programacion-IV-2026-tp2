import {
  validationResult,
  body,
  param,
  query,
  checkExact
} from 'express-validator'
import { pool } from './db.js'

const responderErrores = (estado) => (req, res, next) => {
  if (req.errorInterno) {
    return next(req.errorInterno)
  }

  const errores = validationResult(req)

  if (!errores.isEmpty()) {
    return res.status(estado).json({ errores: errores.array() })
  }

  next()
}

export const manejarErrores = responderErrores(400)
export const manejarConflicto = responderErrores(409)

const reglaNombre = body('nombre')
  .exists()
  .withMessage('El nombre es obligatorio')
  .bail()
  .isString()
  .withMessage('El nombre debe ser texto')
  .bail()
  .trim()
  .customSanitizer((nombre) => nombre.replace(/\s+/g, ' '))
  .notEmpty()
  .withMessage('El nombre no puede estar vacío')
  .bail()
  .isLength({ max: 255 })
  .withMessage('El nombre no puede superar los 255 caracteres')

const esBooleano = (valor) => typeof valor === 'boolean'

export const validarTareaNueva = [
  reglaNombre,
  body('completada')
    .optional()
    .custom(esBooleano)
    .withMessage('El estado completada debe ser true o false')
]

export const validarTareaCompleta = [
  reglaNombre,
  body('completada')
    .exists()
    .withMessage('El estado completada es obligatorio')
    .bail()
    .custom(esBooleano)
    .withMessage('El estado completada debe ser true o false')
]

export const validarNombreUnico = [
  body('nombre').custom(async (nombre, { req }) => {
    let filas

    try {
      ;[filas] = await pool.query('SELECT id FROM tareas WHERE nombre = ?', [
        nombre
      ])
    } catch (error) {
      req.errorInterno = error
      return
    }

    const otraTarea = filas.find((fila) => fila.id !== Number(req.params.id))
    if (otraTarea) {
      throw new Error('Ya existe una tarea con ese nombre')
    }
  })
]

const reglaFiltro = query('completada')
  .optional()
  .not()
  .isArray()
  .withMessage('El filtro completada admite un único valor')
  .bail()
  .isIn(['true', 'false'])
  .withMessage('El filtro completada debe ser true o false')
  .toBoolean()

export const validarFiltro = [
  checkExact([reglaFiltro], {
    message: 'Parámetro de consulta desconocido'
  })
]

export const validarId = [
  param('id')
    .isInt({ gt: 0 })
    .withMessage('El id debe ser un número entero positivo')
    .toInt()
]
