# Ejercicio 1 — API de rectángulos

API desarrollada con ExpressJS para administrar rectángulos, persistiendo la
información en una base de datos MySQL. Para cada rectángulo se almacenan sus
dos lados, su perímetro y su superficie. La API recibe únicamente los lados; el
perímetro y la superficie se calculan en el servidor antes de persistirlos.

## Decisiones de diseño

### 1. Modelo de datos: se persisten los valores derivados

La tabla `rectangulos` almacena cuatro valores: los dos lados, el perímetro y la
superficie.

```sql
CREATE TABLE rectangulos (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  lado_a     DECIMAL(10, 2) NOT NULL,
  lado_b     DECIMAL(10, 2) NOT NULL,
  perimetro  DECIMAL(10, 2) NOT NULL,
  superficie DECIMAL(12, 4) NOT NULL
);
```

El perímetro y la superficie son datos derivados de los lados, y aun así se
guardan. Es una decisión impuesta por el enunciado, y conviene explicitar el
intercambio que implica.

**Lo que se gana:** las consultas devuelven los cuatro valores con un `SELECT`
directo, sin recalcular nada en cada lectura. En un sistema con muchas más
lecturas que escrituras, ese cálculo se paga una vez al escribir en lugar de
repetirse en cada consulta.

**Lo que cuesta:** el estado almacenado puede quedar inconsistente. Si una
operación modifica un lado y no recalcula los derivados, la fila queda con
valores que no corresponden a sus propios lados, y la base ya guardó el número
equivocado. Por eso **toda escritura recalcula**: tanto la creación como la
modificación derivan el perímetro y la superficie a partir de los lados
recibidos, y nunca los toman del cliente.

La alternativa —almacenar solo los lados y calcular al responder— hace imposible
la inconsistencia, porque no hay nada que pueda desactualizarse. No se adoptó
porque el enunciado pide persistir los cuatro valores.

### 2. El cliente no puede enviar perímetro ni superficie

Las validaciones rechazan explícitamente esos campos en el cuerpo de la
solicitud:

```js
body('perimetro').not().exists()
body('superficie').not().exists()
```

No alcanza con ignorarlos: rechazarlos de forma explícita deja constancia de que
el cálculo es responsabilidad del servidor y le informa al cliente que su
intento de fijar esos valores fue deliberadamente desestimado, en lugar de
descartarlo en silencio.

### 3. Tipos de columna: `DECIMAL` y no `FLOAT`

`FLOAT` y `DOUBLE` almacenan en punto flotante binario y arrastran error de
redondeo —el mismo motivo por el que `0.1 + 0.2` no da exactamente `0.3`—.
`DECIMAL` es exacto, y tratándose de medidas y cálculos derivados de ellas, la
exactitud es preferible al rango.

Los lados y el perímetro usan `DECIMAL(10, 2)`: hasta diez dígitos con dos
decimales. La superficie usa `DECIMAL(12, 4)`, porque el producto de dos valores
con dos decimales tiene cuatro, y se conserva esa precisión en lugar de
truncarla al guardar.

### 4. Nombres: `snake_case` en la base, `camelCase` en la API

Las columnas se llaman `lado_a` y `lado_b`, siguiendo la convención habitual de
SQL. Los campos del JSON se llaman `ladoA` y `ladoB`, siguiendo la convención de
JavaScript.

La traducción entre ambos ocurre en un único punto —al leer y al escribir en la
base— de modo que ninguna de las dos convenciones contamina a la otra.

### 5. Organización del código

```
Ejercicio 1/
├── src/
│   ├── db.js          Pool de conexiones a MySQL
│   └── validators.js  Cadenas de validación y manejo de errores
├── index.js           Configuración del servidor y rutas
├── database.sql       Esquema de la base de datos
├── der.md             Diagrama entidad-relación
├── rectangulos.http   Pruebas de los endpoints
└── .env.example       Variables de entorno requeridas
```

La separación responde a tres responsabilidades distintas: la conexión a la base
de datos, las reglas de validación y la exposición de los endpoints. Cada una
cambia por motivos independientes.

### 6. Conexión: un pool, no una conexión única

`src/db.js` exporta un *pool* de `mysql2/promise` en lugar de una conexión
simple.

Una conexión única es un recurso frágil: si el servidor la cierra por
inactividad o se interrumpe la red, toda la API queda inutilizable hasta
reiniciar el proceso. Un pool mantiene un conjunto de conexiones reutilizables,
las repone cuando se caen y encola los pedidos cuando todas están ocupadas.

Se usa la interfaz `mysql2/promise` y no la de callbacks, para poder escribir las
consultas con `async`/`await` y mantener los handlers legibles.

### 7. Configuración por variables de entorno

Los datos de conexión se leen de `process.env` y se definen en un archivo `.env`
que **no se versiona**. El repositorio incluye `.env.example` con los nombres de
las variables y sin valores reales.

Las credenciales no pertenecen al código: cambian según el entorno y no deben
quedar registradas en el historial de Git.

Se usa la opción nativa `--env-file` de Node en lugar de una dependencia
externa, porque la versión de Node empleada ya lee el archivo sin ayuda.

### 8. La validación ocurre antes del handler

Las validaciones se implementan con `express-validator` como middlewares que se
ejecutan antes de cada handler. Las cadenas registran los errores encontrados y
un middleware propio, `manejarErrores`, los traduce a una respuesta `400`:

```js
export const manejarErrores = (req, res, next) => {
  const errores = validationResult(req)

  if (!errores.isEmpty()) {
    return res.status(400).json({ errores: errores.array() })
  }

  next()
}
```

Cuando un handler se ejecuta, los datos ya son válidos. Esto concentra las
reglas en un solo archivo, evita repetir la misma verificación en cada endpoint
y deja a los handlers con una sola responsabilidad: hacer el trabajo.

Los errores se devuelven como un arreglo y no de a uno, de modo que el cliente
reciba todos los problemas del pedido en una sola respuesta en lugar de
descubrirlos uno por vez.

### 9. Validación estricta de tipos

Los lados se validan con una comprobación propia además de la de rango:

```js
.custom((value) => typeof value === 'number')
```

`express-validator` fue diseñado pensando en formularios HTML, donde todos los
valores llegan como texto, y por eso sus validadores numéricos aceptan cadenas:
`isFloat` considera válido el string `"10"`.

Dado que esta API recibe JSON —un formato que distingue números de cadenas— se
adopta el criterio estricto: `{ "ladoA": "10" }` se rechaza. La alternativa
sería aceptar la cadena y convertirla, lo cual también es defendible, pero
resulta más predecible rechazar lo que no respeta el contrato declarado que
intentar interpretar la intención del cliente.

Las reglas se aplican con `.bail()` entre cada etapa, para que un campo
inválido informe un único error —el primero que corresponde— en lugar de
acumular varios mensajes sobre el mismo problema.

### 10. Conversión posterior a la validación

Las cadenas terminan con `.toFloat()` y `.toInt()`, que convierten el valor una
vez validado y lo reemplazan en el request.

De este modo la conversión ocurre en un solo lugar, en el borde de entrada, y
los handlers reciben números sin tener que convertir ni verificar nada.

## Cómo ejecutar

Crear la base de datos y la tabla:

```bash
npm run db
```

Copiar `.env.example` a `.env` y completar las credenciales. Luego:

```bash
npm install
npm run dev
```

El servidor queda disponible en `http://localhost:3000`.
