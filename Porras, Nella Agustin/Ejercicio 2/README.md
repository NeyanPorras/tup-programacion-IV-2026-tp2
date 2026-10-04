# Ejercicio 2 — API de tareas

API desarrollada con ExpressJS para administrar una lista de tareas,
persistiendo la información en una base de datos MySQL. Cada tarea tiene un
nombre y un estado que indica si está completada. No pueden existir dos tareas
con el mismo nombre, y las tareas pueden consultarse según su estado.

## Decisiones de diseño

### 1. Modelo de datos

```sql
CREATE TABLE tareas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_es_0900_ai_ci NOT NULL,
  completada BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uk_tareas_nombre (nombre)
);
```

Una tarea queda descripta por dos datos: su nombre y si está completada. El
estado se modela como un booleano y no como un texto (`"pendiente"`,
`"completada"`), porque el enunciado define exactamente dos estados y un
booleano hace imposible almacenar un tercero.

El valor por defecto `FALSE` refleja que una tarea nace pendiente.

### 2. Criterio de comparación de nombres

Dos nombres se consideran iguales cuando coinciden después de aplicar estas
reglas:

| Regla                                              | Ejemplo de nombres iguales               |
| -------------------------------------------------- | ---------------------------------------- |
| Se ignoran los espacios al inicio y al final       | `"Comprar pan"` y `"  Comprar pan  "`    |
| Los espacios repetidos equivalen a uno solo        | `"Comprar pan"` y `"Comprar    pan"`     |
| No se distinguen mayúsculas de minúsculas          | `"Comprar pan"` y `"COMPRAR PAN"`        |
| No se distinguen vocales con tilde y sin tilde     | `"Estudiar programación"` y `"Estudiar programacion"` |

La `ñ`, en cambio, es una letra distinta de la `n`: `"Año nuevo"` y
`"Ano nuevo"` son dos tareas diferentes.

El criterio busca que dos nombres que una persona leería como la misma tarea no
puedan coexistir. Las diferencias de espaciado, de mayúsculas y de tildes son
variaciones habituales al escribir el mismo texto; la `ñ` no es una variación de
la `n`, sino otra letra del alfabeto español que cambia la palabra.

El criterio se aplica en dos lugares, cada uno con una responsabilidad:

- **Los espacios se normalizan en el servidor**, antes de validar y de guardar
  (`trim` y reemplazo de espacios repetidos). El nombre se almacena ya
  normalizado, por lo que todo lo que lee la base puede confiar en esa forma.
- **Mayúsculas, tildes y `ñ` los resuelve la colación de la columna**,
  `utf8mb4_es_0900_ai_ci`: insensible a mayúsculas (`ci`) y a acentos (`ai`),
  con las reglas del español, que mantienen a la `ñ` como letra independiente.

La colación se declara de forma explícita en la columna en lugar de depender de
la configuración por defecto del servidor. Con la colación general
(`utf8mb4_0900_ai_ci`) la `ñ` y la `n` se consideran iguales, de modo que el
criterio cambiaría según dónde se instale la base.

Se conserva la capitalización y las tildes que escribió el usuario: se ignoran
al comparar, pero son parte legítima del nombre al mostrarlo.

### 3. La unicidad se garantiza en dos niveles

**En la validación**, una regla de `express-validator` consulta si ya existe
otra tarea con ese nombre y responde `409` con un mensaje claro:

```js
body('nombre').custom(async (nombre, { req }) => {
  // SELECT id FROM tareas WHERE nombre = ?
  const otraTarea = filas.find((fila) => fila.id !== Number(req.params.id))
  if (otraTarea) {
    throw new Error('Ya existe una tarea con ese nombre')
  }
})
```

**En la base de datos**, la restricción `UNIQUE` sobre `nombre` impide el
duplicado aunque la validación no lo detecte. Dos solicitudes simultáneas pueden
consultar antes de que cualquiera de las dos inserte, y ambas verían que el
nombre está libre; la restricción resuelve ese caso, y el error resultante
(`ER_DUP_ENTRY`) también se traduce a `409`.

Ambos niveles usan el mismo criterio por construcción: la consulta de la
validación y el índice único comparan con la colación de la misma columna. Si la
comparación se hiciera en JavaScript con reglas propias, bastaría una diferencia
entre esas reglas y las del índice para que un duplicado pasara la validación y
fallara en la base con un error inesperado.

Al modificar, la tarea se excluye de su propia verificación
(`fila.id !== Number(req.params.id)`): un duplicado es **otra** tarea con el
mismo nombre. Sin esa condición no se podría cambiar el estado de una tarea
conservando su nombre. Al crear no hay `id` en la ruta, la comparación nunca
coincide y la misma regla sirve para ambos casos.

### 4. El estado es un booleano estricto

En el cuerpo de la solicitud, `completada` debe ser un booleano de JSON:

```js
body('completada').custom((valor) => typeof valor === 'boolean')
```

Se rechazan `"true"`, `1` y cualquier otro valor que no sea `true` o `false`.
JSON distingue booleanos de textos y números, y la API exige el tipo declarado
en lugar de interpretar la intención del cliente.

En MySQL, `BOOLEAN` es un alias de `TINYINT(1)` y las consultas devuelven `1` o
`0`. La función `aTarea` traduce cada fila a la forma que expone la API, de
modo que las respuestas siempre contienen `true` o `false`:

```js
const aTarea = (fila) => ({
  id: fila.id,
  nombre: fila.nombre,
  completada: Boolean(fila.completada)
})
```

Al crear, `completada` es opcional y vale `false` si no se envía. Al modificar
es obligatorio, porque `PUT` reemplaza el recurso completo.

### 5. Consulta por estado

Las tareas se filtran con un parámetro de consulta sobre la colección:

```
GET /tareas?completada=true     tareas completadas
GET /tareas?completada=false    tareas pendientes
GET /tareas                     todas
```

Se usa un parámetro de consulta y no rutas separadas (`/tareas/completadas`),
porque la ruta identifica el recurso y la consulta expresa qué subconjunto se
quiere. En ambos casos el recurso es el mismo: tareas.

**Estados admitidos:** únicamente los textos `true` y `false`. No se aceptan
`1`, `0` ni otras variantes, para que cada estado tenga una sola forma de
expresarse. Cualquier otro valor responde `400`.

También responden `400`:

- El parámetro repetido (`?completada=true&completada=false`), que llegaría al
  servidor como una lista y no como un valor.
- Un parámetro desconocido (`?completado=true`). Si se ignorara, un error de
  tipeo en el nombre del filtro devolvería todas las tareas y el cliente creería
  haber filtrado. Se controla con `checkExact`.

El filtro se aplica en la consulta SQL (`WHERE completada = ?`) y no sobre el
resultado en memoria, para que la base devuelva solo las filas pedidas.

### 6. Orden de las validaciones

Cada solicitud de escritura atraviesa tres etapas:

1. **Forma de la solicitud** (`400`): id, nombre y estado con el tipo y el
   formato correctos.
2. **Unicidad del nombre** (`409`): solo si la forma es válida.
3. **Escritura** en la base de datos.

La unicidad se verifica en una etapa separada y posterior por dos motivos. No
tiene sentido consultar la base por un nombre vacío o por una solicitud con un
id inválido. Y permite distinguir los códigos: una solicitud mal formada es un
`400`; una solicitud correcta que choca con el estado actual es un `409`.

Las dos etapas de validación usan `express-validator`; lo único que cambia es el
código con el que se responde cuando una regla falla.

### 7. Manejo centralizado de errores

Los handlers no incluyen `try`/`catch`. Express 5 reenvía automáticamente los
errores de las funciones asíncronas a un middleware de errores, definido una
sola vez al final de `index.js`:

| Situación                                   | Respuesta |
| ------------------------------------------- | --------- |
| El cuerpo no es un JSON válido              | `400`     |
| La base rechaza un nombre duplicado         | `409`     |
| Cualquier otra falla (base inaccesible, etc.) | `500`   |

Así el tratamiento de las fallas existe en un solo lugar y es idéntico para
todos los endpoints. El detalle del error se registra en el servidor y no se
envía al cliente, que no puede corregir una falla interna y no debe recibir
información del esquema.

Las rutas inexistentes también responden en JSON (`404`), de modo que la API
nunca devuelve HTML.

### 8. Organización del código

```
Ejercicio 2/
├── src/
│   ├── db.js          Pool de conexiones a MySQL
│   └── validators.js  Reglas de validación y respuestas de error
├── index.js           Configuración del servidor y rutas
├── database.sql       Esquema de la base de datos
├── der.md             Diagrama entidad-relación
├── tareas.http        Pruebas de los endpoints
└── .env.example       Variables de entorno requeridas
```

La conexión usa un pool de `mysql2/promise` y los datos de acceso se leen de
variables de entorno definidas en un archivo `.env` que no se versiona. Todas
las consultas usan parámetros (`?`) y nunca concatenan valores recibidos del
cliente.

## Endpoints

| Método   | Ruta                       | Descripción                         | Éxito |
| -------- | -------------------------- | ----------------------------------- | ----- |
| `POST`   | `/tareas`                  | Crea una tarea                      | `201` |
| `GET`    | `/tareas`                  | Lista todas las tareas              | `200` |
| `GET`    | `/tareas?completada=true`  | Lista las tareas completadas        | `200` |
| `GET`    | `/tareas?completada=false` | Lista las tareas pendientes         | `200` |
| `GET`    | `/tareas/:id`              | Obtiene una tarea por id            | `200` |
| `PUT`    | `/tareas/:id`              | Reemplaza el nombre y el estado     | `200` |
| `DELETE` | `/tareas/:id`              | Elimina una tarea                   | `200` |

Una tarea se representa como:

```json
{ "id": 1, "nombre": "Comprar pan", "completada": false }
```

Los errores de validación tienen la forma `{ "errores": [...] }`, con un
elemento por regla incumplida; los demás errores, `{ "error": "<mensaje>" }`.

## Validaciones

| Dato                    | Reglas                                                             | Respuesta |
| ----------------------- | ------------------------------------------------------------------ | --------- |
| `nombre` (cuerpo)       | Presente, de tipo texto, no vacío, de hasta 255 caracteres         | `400`     |
| `nombre` (cuerpo)       | No repetido según el criterio de comparación                       | `409`     |
| `completada` (cuerpo)   | Booleano; opcional al crear, obligatorio al modificar              | `400`     |
| `completada` (consulta) | Opcional; un único valor, `true` o `false`                         | `400`     |
| Otros parámetros de consulta en `GET /tareas` | No admitidos                                 | `400`     |
| `id` (ruta)             | Entero positivo                                                    | `400`     |

El límite de 255 caracteres coincide con el tamaño de la columna: sin esa regla,
un nombre más largo llegaría a la base y produciría un error interno en lugar de
un mensaje de validación.

## Códigos de estado

| Código | Cuándo se usa                                              |
| ------ | ---------------------------------------------------------- |
| `200`  | Consulta, modificación o eliminación exitosa               |
| `201`  | Creación exitosa                                           |
| `400`  | Entrada inválida en el cuerpo, la consulta o el `id`       |
| `404`  | La tarea o la ruta solicitada no existe                    |
| `409`  | El nombre ya pertenece a otra tarea                        |
| `500`  | Error interno al operar contra la base de datos            |

## Decisiones con alternativas válidas

**El estado se modifica con `PUT` y no con `PATCH`.** Marcar una tarea como
completada requiere enviar también su nombre, porque `PUT` reemplaza el recurso
completo. `PATCH` permitiría enviar solo el estado; no se implementó porque el
enunciado no lo requiere y un único método de modificación mantiene una sola
forma de validar el cuerpo.

**`PUT` sobre una tarea inexistente con un nombre ya usado responde `409` y no
`404`.** La unicidad se verifica antes de escribir, y la existencia se detecta
al escribir, mediante `affectedRows`. Verificar primero la existencia exigiría
una consulta adicional en cada modificación para ordenar los códigos de un caso
poco frecuente.

**La existencia se detecta con `affectedRows` y no con `changedRows`.** Este
último vale cero cuando la modificación no altera ningún valor, y haría
responder `404` sobre una tarea que sí existe.

**Los campos desconocidos del cuerpo se ignoran; los de la consulta se
rechazan.** Los handlers toman los datos con `matchedData`, que solo entrega los
campos validados, por lo que un campo de más en el cuerpo nunca llega a la base
y no cambia el resultado. Un parámetro de consulta de más, en cambio, puede ser
un filtro mal escrito, y aceptarlo cambiaría el significado de la respuesta sin
avisar.

**`DELETE` responde `200` con un mensaje de confirmación** en lugar de
`204 No Content`, para que el resultado sea explícito al revisarlo desde el
archivo `.http`.

**La respuesta de `POST` y `PUT` se construye con los datos validados** en lugar
de volver a leer la fila. Es seguro porque solo se llega a ese punto cuando la
escritura ocurrió, y evita una consulta adicional.

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

El servidor queda disponible en `http://localhost:3000`. Las peticiones de
`tareas.http` dependen del orden y suponen la tabla recién creada.
