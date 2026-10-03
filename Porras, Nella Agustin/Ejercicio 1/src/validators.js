import { validationResult, body, param } from 'express-validator'

export const manejarErrores = (req, res, next) => {
  const errores = validationResult(req)

  if (!errores.isEmpty()) {
    return res.status(400).json({ errores: errores.array() })
  }

  next()
}

export const validarRectangulo = [
  body('ladoA')
    .exists()
    .withMessage('El ladoA es obligatorio')
    .bail()
    .custom((value) => typeof value === 'number')
    .withMessage('El lado A debe ser numerico, no texto')
    .bail()
    .isFloat({ gt: 0 })
    .withMessage('El ladoA debe ser un número mayor a 0')
    .toFloat(),

  body('ladoB')
    .exists()
    .withMessage('El ladoB es obligatorio')
    .bail()
    .custom((value) => typeof value === 'number')
    .withMessage('El lado B debe ser numerico, no texto')
    .bail()
    .isFloat({ gt: 0 })
    .withMessage('El ladoB debe ser un número mayor a 0')
    .toFloat(),

  body('perimetro')
    .not()
    .exists()
    .withMessage('El perimetro lo calcula el servidor'),

  body('superficie')
    .not()
    .exists()
    .withMessage('La superficie la calcula el servidor')
]
export const validarId = [
  param('id')
    .isInt({ gt: 0 })
    .withMessage('El id debe ser un número entero positivo')
    .toInt()
]
