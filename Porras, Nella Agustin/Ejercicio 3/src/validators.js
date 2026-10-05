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

const normalizarEspacios = (texto) => texto.replace(/\s+/g, ' ')

const consultar = async (req, consulta, valores) => {
  try {
    const [filas] = await pool.query(consulta, valores)
    return filas
  } catch (error) {
    req.errorInterno = error
    return null
  }
}

export const validarId = [
  param('id')
    .isInt({ gt: 0 })
    .withMessage('El id debe ser un número entero positivo')
    .toInt()
]

export const validarMateria = [
  body('nombre')
    .exists()
    .withMessage('El nombre de la materia es obligatorio')
    .bail()
    .isString()
    .withMessage('El nombre de la materia debe ser texto')
    .bail()
    .trim()
    .customSanitizer(normalizarEspacios)
    .notEmpty()
    .withMessage('El nombre de la materia no puede estar vacío')
    .bail()
    .isLength({ max: 100 })
    .withMessage('El nombre de la materia no puede superar los 100 caracteres')
]

export const validarMateriaUnica = [
  body('nombre').custom(async (nombre, { req }) => {
    const filas = await consultar(
      req,
      'SELECT id FROM materias WHERE nombre = ?',
      [nombre]
    )
    if (!filas) return

    const otraMateria = filas.find((fila) => fila.id !== Number(req.params.id))
    if (otraMateria) {
      throw new Error('Ya existe una materia con ese nombre')
    }
  })
]

const NOMBRE_DE_PERSONA = /^\p{L}[\p{L} .'-]*$/u
const esNumero = (valor) => typeof valor === 'number' && Number.isFinite(valor)

export const validarCalificacion = [
  body('alumno')
    .exists()
    .withMessage('El nombre del alumno es obligatorio')
    .bail()
    .isString()
    .withMessage('El nombre del alumno debe ser texto')
    .bail()
    .trim()
    .customSanitizer(normalizarEspacios)
    .notEmpty()
    .withMessage('El nombre del alumno no puede estar vacío')
    .bail()
    .isLength({ max: 100 })
    .withMessage('El nombre del alumno no puede superar los 100 caracteres')
    .bail()
    .matches(NOMBRE_DE_PERSONA)
    .withMessage(
      'El nombre del alumno solo admite letras, espacios, puntos, apóstrofos y guiones'
    ),

  body('materiaId')
    .exists()
    .withMessage('La materia es obligatoria')
    .bail()
    .custom((materiaId) => Number.isInteger(materiaId) && materiaId > 0)
    .withMessage('El materiaId debe ser un número entero positivo'),

  body('notas')
    .exists()
    .withMessage('Las notas son obligatorias')
    .bail()
    .isArray({ min: 3, max: 3 })
    .withMessage('Se deben informar exactamente tres notas')
    .bail()
    .custom((notas) => notas.every(esNumero))
    .withMessage('Las notas deben ser numéricas')
    .bail()
    .custom((notas) => notas.every((nota) => nota >= 0 && nota <= 10))
    .withMessage('Las notas deben estar entre 0 y 10')
    .bail()
    .custom((notas) =>
      notas.every((nota) => Math.round(nota * 100) / 100 === nota)
    )
    .withMessage('Las notas admiten hasta dos decimales')
]

export const validarMateriaExiste = [
  body('materiaId').custom(async (materiaId, { req }) => {
    const filas = await consultar(
      req,
      'SELECT id FROM materias WHERE id = ?',
      [materiaId]
    )
    if (!filas) return

    if (filas.length === 0) {
      throw new Error('La materia indicada no existe')
    }
  })
]

export const validarCombinacionUnica = [
  body('alumno').custom(async (alumno, { req }) => {
    const filas = await consultar(
      req,
      'SELECT id FROM calificaciones WHERE alumno = ? AND materia_id = ?',
      [alumno, req.body.materiaId]
    )
    if (!filas) return

    const otroRegistro = filas.find((fila) => fila.id !== Number(req.params.id))
    if (otroRegistro) {
      throw new Error('El alumno ya tiene un registro en esa materia')
    }
  })
]

const filtroMateria = query('materiaId')
  .optional()
  .not()
  .isArray()
  .withMessage('El filtro materiaId admite un único valor')
  .bail()
  .isInt({ gt: 0 })
  .withMessage('El filtro materiaId debe ser un número entero positivo')
  .toInt()

const filtroAlumno = query('alumno')
  .optional()
  .not()
  .isArray()
  .withMessage('El filtro alumno admite un único valor')
  .bail()
  .trim()
  .customSanitizer(normalizarEspacios)
  .notEmpty()
  .withMessage('El filtro alumno no puede estar vacío')

export const validarFiltros = [
  checkExact([filtroMateria, filtroAlumno], {
    message: 'Parámetro de consulta desconocido'
  })
]
