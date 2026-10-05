# Ejercicio 3 — API de calificaciones

API desarrollada con ExpressJS para gestionar las calificaciones de alumnos en
las materias de una carrera, persistiendo la información en una base de datos
MySQL. Cada registro almacena el nombre del alumno, la materia cursada y tres
notas. Las materias se modelan en una tabla independiente, relacionada mediante
una clave foránea, y no puede existir más de un registro para la misma
combinación de alumno y materia.

## Decisiones de diseño

### 1. Modelo de datos: dos tablas

```sql
CREATE TABLE materias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_es_0900_ai_ci NOT NULL,
  UNIQUE KEY uk_materias_nombre (nombre)
);

CREATE TABLE calificaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alumno VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_es_0900_ai_ci NOT NULL,
  materia_id INT NOT NULL,
  nota1 DECIMAL(4, 2) NOT NULL,
  nota2 DECIMAL(4, 2) NOT NULL,
  nota3 DECIMAL(4, 2) NOT NULL,
  UNIQUE KEY uk_calificaciones_alumno_materia (alumno, materia_id),
  CONSTRAINT fk_calificaciones_materia FOREIGN KEY (materia_id)
    REFERENCES materias (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_calificaciones_nota1 CHECK (nota1 BETWEEN 0 AND 10),
  CONSTRAINT chk_calificaciones_nota2 CHECK (nota2 BETWEEN 0 AND 10),
  CONSTRAINT chk_calificaciones_nota3 CHECK (nota3 BETWEEN 0 AND 10)
);
```

El modelo sigue la descripción del enunciado: cada registro contiene el nombre
del alumno, la materia y tres notas, y las materias viven en una tabla propia.

**Las materias están en una tabla independiente** porque son un dato compartido:
muchos registros refieren a la misma materia. Si el nombre de la materia se
repitiera como texto en cada registro, corregirlo exigiría modificar todas las
filas, y un error de tipeo crearía una materia distinta sin que nadie lo note.
Con la clave foránea, el registro solo puede referir a una materia que existe.

**El alumno se guarda como texto dentro del registro**, tal como lo plantea el
enunciado. Del alumno solo se conoce su nombre, de modo que una tabla de alumnos
tendría un único dato. El costo de esta decisión se analiza en la sección de
alternativas.

### 2. Las tres notas son tres columnas

Las notas se almacenan en `nota1`, `nota2` y `nota3`, y no en una tabla de notas
relacionada.

El enunciado fija la cantidad en exactamente tres. Con tres columnas
obligatorias, el esquema garantiza por sí mismo que un registro no puede tener
dos notas ni cuatro. Una tabla de notas admitiría cualquier cantidad y obligaría
a sostener la regla únicamente desde el código.

En la API, en cambio, las notas se envían y se devuelven como un arreglo
(`"notas": [7, 8.5, 9]`), que es la forma natural de expresar una lista en JSON.
La traducción entre el arreglo y las tres columnas ocurre en un solo punto, al
leer y al escribir en la base.

### 3. Escala de notas

Las notas son números entre **0 y 10**, ambos incluidos, con **hasta dos
decimales**. Son válidas, por ejemplo, `0`, `6.5`, `8.75` y `10`.

Es la escala numérica habitual del sistema universitario argentino. Los
decimales se admiten porque las notas parciales suelen tenerlos, y se limitan a
dos porque es la precisión de la columna (`DECIMAL(4, 2)`): una nota como
`7.555` se rechaza en lugar de guardarse redondeada, para que el valor
almacenado sea siempre el que el cliente envió.

La escala se controla en dos niveles: en la validación, que responde con un
mensaje claro, y en la base, con una restricción `CHECK` por columna que impide
guardar una nota fuera de rango aunque el dato no pase por la API.

### 4. Unicidad de la combinación alumno–materia

Un alumno no puede tener más de un registro en la misma materia. La regla se
garantiza en dos niveles:

- **En la validación**, una regla de `express-validator` consulta si ya existe
  otro registro con ese alumno y esa materia y responde `409`.
- **En la base**, la clave única compuesta `(alumno, materia_id)` impide el
  duplicado aunque dos solicitudes simultáneas pasen la validación al mismo
  tiempo. Ese error también se traduce a `409`.

La regla se aplica al crear y al modificar. Al modificar, el registro se excluye
de su propia verificación: un duplicado es **otro** registro con la misma
combinación. Sin esa exclusión no se podrían corregir las notas de un registro
conservando su alumno y su materia.

La unicidad es de la combinación, no de cada dato: el mismo alumno puede tener
registros en varias materias, y una materia puede tener registros de muchos
alumnos.

### 5. Cuándo dos nombres son el mismo

Como el alumno se identifica por su nombre, la regla de unicidad depende de
cuándo dos nombres se consideran iguales. El mismo criterio vale para los
nombres de las materias:

| Regla                                            | Ejemplo de nombres iguales          |
| ------------------------------------------------ | ----------------------------------- |
| Se ignoran los espacios al inicio y al final     | `"Ana García"` y `"  Ana García "`  |
| Los espacios repetidos equivalen a uno solo      | `"Ana García"` y `"Ana    García"`  |
| No se distinguen mayúsculas de minúsculas        | `"Ana García"` y `"ANA GARCÍA"`     |
| No se distinguen vocales con tilde y sin tilde   | `"Ana García"` y `"Ana Garcia"`     |

La `ñ` es una letra distinta de la `n`: `"Peña"` y `"Pena"` son dos alumnos.

Los espacios se normalizan en el servidor antes de validar y de guardar. Las
mayúsculas, las tildes y la `ñ` los resuelve la colación de las columnas,
`utf8mb4_es_0900_ai_ci`, declarada de forma explícita para que el criterio no
dependa de la configuración del servidor de base de datos.

La validación y el índice único comparan con la colación de la misma columna,
por lo que ambos aplican exactamente el mismo criterio.

### 6. Nombre del alumno válido

El nombre del alumno debe ser un texto no vacío, de hasta 100 caracteres, que
comience con una letra y contenga únicamente letras, espacios, puntos,
apóstrofos y guiones. Se aceptan letras de cualquier alfabeto, con tildes y
`ñ`: son válidos `"María José"`, `"O'Connor"` y `"Núñez-Pérez"`.

Se rechazan los nombres con dígitos u otros símbolos (`"Marta D1az"`), que no
corresponden al nombre de una persona y suelen ser errores de carga.

### 7. La materia debe existir

Al crear o modificar un registro se verifica que `materiaId` corresponda a una
materia existente; si no, la respuesta es `400`.

La clave foránea ofrece la misma garantía en la base: aunque la materia se
eliminara entre la validación y la escritura, el registro no podría guardarse.

La misma clave foránea, con `ON DELETE RESTRICT`, impide eliminar una materia
que tiene calificaciones: la API responde `409` en lugar de borrar los
registros en cascada o dejarlos apuntando a una materia inexistente. Las
calificaciones son información académica y no deben desaparecer como efecto
secundario de otra operación.

### 8. Orden de las validaciones

Cada solicitud de escritura sobre calificaciones atraviesa cuatro etapas:

1. **Forma de la solicitud** (`400`): id, alumno, materia y notas con el tipo y
   el formato correctos.
2. **Existencia de la materia** (`400`).
3. **Unicidad de la combinación** (`409`).
4. **Escritura** en la base de datos.

Las etapas 2 y 3 consultan la base, y solo se ejecutan si la forma es válida: no
tiene sentido buscar una materia cuyo id no es un número. Todas las etapas de
validación usan `express-validator`; lo que cambia es el código de respuesta.

Dentro de la primera etapa se informan juntos los errores de todos los campos,
y un solo error por campo.

### 9. Respuestas con la materia incluida

Una calificación se representa con el nombre de su materia, no solo con su id:

```json
{
  "id": 1,
  "alumno": "Ana García",
  "materia": { "id": 1, "nombre": "Programación IV" },
  "notas": [7, 8.5, 9]
}
```

Las consultas hacen un `JOIN` con `materias`. Si la respuesta incluyera solo
`materiaId`, el cliente tendría que hacer otra solicitud por cada materia para
poder mostrar el registro.

En el cuerpo de las solicitudes, en cambio, la materia se indica con
`materiaId`: para referir a una materia alcanza con identificarla.

Después de crear o modificar, la respuesta se arma releyendo el registro de la
base, de modo que refleje lo que quedó almacenado, con el nombre de la materia
incluido.

### 10. Consultas por alumno y por materia

```
GET /calificaciones                              todos los registros
GET /calificaciones?alumno=Ana García            registros de un alumno
GET /calificaciones?materiaId=1                  registros de una materia
GET /calificaciones?alumno=Ana García&materiaId=1   ambos filtros
```

Como el alumno no es un recurso con ruta propia, la forma de consultar sus
calificaciones es filtrar la colección por su nombre. La comparación usa el
mismo criterio que la unicidad, por lo que `?alumno=ana garcia` encuentra a
`Ana García`.

Los filtros se validan: `materiaId` debe ser un entero positivo, `alumno` no
puede estar vacío, ninguno puede repetirse, y un parámetro desconocido responde
`400`. Si se ignorara, un filtro mal escrito (`?materia=1`) devolvería todos los
registros y el cliente creería haber filtrado.

### 11. Tipos estrictos

La API recibe JSON y exige los tipos que ese formato permite distinguir:
`alumno` y `nombre` deben ser textos, `materiaId` un número entero y cada nota
un número. Se rechazan `"materiaId": "1"` y `"notas": ["7", 7, 7]`.

Las columnas `DECIMAL` se leen de la base como texto, para no perder precisión;
la función `aCalificacion` las convierte a números al armar la respuesta.

### 12. Manejo centralizado de errores

Los handlers no incluyen `try`/`catch`. Express 5 reenvía los errores de las
funciones asíncronas a un middleware de errores definido una sola vez en
`index.js`, que traduce cada situación a una respuesta:

| Situación                                              | Respuesta |
| ------------------------------------------------------ | --------- |
| El cuerpo no es un JSON válido                         | `400`     |
| La base rechaza una materia inexistente (clave foránea) | `400`    |
| La base rechaza un duplicado (clave única)             | `409`     |
| La base rechaza eliminar una materia con calificaciones | `409`    |
| Cualquier otra falla                                   | `500`     |

El detalle de los errores internos se registra en el servidor y no se envía al
cliente. Las rutas inexistentes también responden en JSON.

### 13. Organización del código

```
Ejercicio 3/
├── src/
│   ├── db.js              Pool de conexiones a MySQL
│   ├── validators.js      Reglas de validación y respuestas de error
│   ├── materias.js        Rutas de /materias
│   └── calificaciones.js  Rutas de /calificaciones
├── index.js               Configuración del servidor y manejo de errores
├── database.sql           Esquema de la base de datos
├── der.md                 Diagrama entidad-relación
├── calificaciones.http    Pruebas de los endpoints
└── .env.example           Variables de entorno requeridas
```

Al haber dos recursos, cada uno tiene su propio archivo de rutas. La conexión
usa un pool de `mysql2/promise`, los datos de acceso se leen de un archivo
`.env` que no se versiona, y todas las consultas usan parámetros (`?`).

## Endpoints

### Materias

| Método   | Ruta            | Descripción                    | Éxito |
| -------- | --------------- | ------------------------------ | ----- |
| `POST`   | `/materias`     | Crea una materia               | `201` |
| `GET`    | `/materias`     | Lista las materias             | `200` |
| `GET`    | `/materias/:id` | Obtiene una materia por id     | `200` |
| `PUT`    | `/materias/:id` | Cambia el nombre de una materia | `200` |
| `DELETE` | `/materias/:id` | Elimina una materia sin calificaciones | `200` |

Cuerpo: `{ "nombre": "Programación IV" }`.

### Calificaciones

| Método   | Ruta                  | Descripción                              | Éxito |
| -------- | --------------------- | ---------------------------------------- | ----- |
| `POST`   | `/calificaciones`     | Registra las notas de un alumno en una materia | `201` |
| `GET`    | `/calificaciones`     | Lista los registros, con filtros opcionales | `200` |
| `GET`    | `/calificaciones/:id` | Obtiene un registro por id               | `200` |
| `PUT`    | `/calificaciones/:id` | Reemplaza alumno, materia y notas        | `200` |
| `DELETE` | `/calificaciones/:id` | Elimina un registro                      | `200` |

Cuerpo: `{ "alumno": "Ana García", "materiaId": 1, "notas": [7, 8.5, 9] }`.

Los errores de validación tienen la forma `{ "errores": [...] }`, con un
elemento por regla incumplida; los demás errores, `{ "error": "<mensaje>" }`.

## Validaciones

| Dato                        | Reglas                                                        | Respuesta |
| --------------------------- | ------------------------------------------------------------- | --------- |
| `nombre` de la materia      | Presente, texto, no vacío, hasta 100 caracteres               | `400`     |
| `nombre` de la materia      | No repetido                                                   | `409`     |
| `alumno`                    | Presente, texto, no vacío, hasta 100 caracteres, solo letras, espacios, puntos, apóstrofos y guiones | `400` |
| `materiaId`                 | Presente, número entero positivo                              | `400`     |
| `materiaId`                 | Corresponde a una materia existente                           | `400`     |
| `notas`                     | Presente, arreglo de exactamente tres elementos               | `400`     |
| `notas`                     | Cada una numérica, entre 0 y 10, con hasta dos decimales      | `400`     |
| `alumno` + `materiaId`      | Combinación no repetida, al crear y al modificar              | `409`     |
| `materiaId` (consulta)      | Opcional; un único entero positivo                            | `400`     |
| `alumno` (consulta)         | Opcional; un único valor no vacío                             | `400`     |
| Otros parámetros de consulta en `GET /calificaciones` | No admitidos                        | `400`     |
| `id` (ruta)                 | Entero positivo                                               | `400`     |

## Códigos de estado

| Código | Cuándo se usa                                                        |
| ------ | -------------------------------------------------------------------- |
| `200`  | Consulta, modificación o eliminación exitosa                         |
| `201`  | Creación exitosa                                                     |
| `400`  | Entrada inválida, o referencia a una materia que no existe           |
| `404`  | El recurso de la ruta (materia, calificación o la ruta misma) no existe |
| `409`  | Nombre de materia repetido, combinación alumno–materia repetida, o eliminación de una materia con calificaciones |
| `500`  | Error interno al operar contra la base de datos                      |

## Decisiones con alternativas válidas

**No hay una tabla de alumnos.** La alternativa es un modelo de tres tablas
(`alumnos`, `materias`, `calificaciones`), donde el registro referiría al alumno
por su id. Evitaría repetir el nombre en cada registro y permitiría corregirlo
en un solo lugar. No se adoptó porque el enunciado define el registro con el
nombre del alumno, pide modelar aparte únicamente las materias, y no existe otro
dato del alumno que almacenar. El costo asumido es que el alumno se identifica
por su nombre: dos personas con el mismo nombre no pueden distinguirse, y
corregir un nombre implica modificar cada uno de sus registros. Si el sistema
incorporara más datos del alumno, como un legajo, la tabla propia pasaría a ser
la opción correcta.

**Una materia inexistente en el cuerpo responde `400` y no `404`.** `404` se
reserva para el recurso identificado por la ruta. Cuando el dato inválido es una
referencia enviada en el cuerpo, la ruta existe y lo incorrecto es el contenido
de la solicitud. Otra opción habitual es `422`.

**`PUT` sobre un registro inexistente con datos en conflicto responde `400` o
`409` antes que `404`.** La existencia del registro se detecta al escribir,
mediante `affectedRows`, y las verificaciones de materia y de unicidad ocurren
antes. Verificar primero la existencia exigiría una consulta adicional en cada
modificación. Se usa `affectedRows` y no `changedRows`, que vale cero cuando la
modificación no altera ningún valor.

**`PUT` exige el registro completo** (alumno, materia y tres notas), porque
reemplaza el recurso. Modificar una sola nota correspondería a `PATCH`, que no
se implementó por no ser requerido.

**Eliminar una materia con calificaciones está prohibido** (`ON DELETE
RESTRICT`). La alternativa, `ON DELETE CASCADE`, borraría sus calificaciones
junto con la materia.

**`DELETE` responde `200` con un mensaje de confirmación** en lugar de
`204 No Content`, para que el resultado sea explícito al revisarlo desde el
archivo `.http`.

**Los campos desconocidos del cuerpo se ignoran; los de la consulta se
rechazan.** Los handlers toman los datos con `matchedData`, que solo entrega los
campos validados, por lo que un campo de más en el cuerpo nunca llega a la base.
Un parámetro de consulta de más puede ser un filtro mal escrito, y aceptarlo
cambiaría el significado de la respuesta sin avisar.

## Cómo ejecutar

Crear la base de datos y las tablas:

```bash
npm run db
```

Copiar `.env.example` a `.env` y completar las credenciales. Luego:

```bash
npm install
npm run dev
```

El servidor queda disponible en `http://localhost:3000`. Las peticiones de
`calificaciones.http` dependen del orden y suponen las tablas recién creadas.
