CREATE DATABASE IF NOT EXISTS tp2_ejercicio3;

USE tp2_ejercicio3;

DROP TABLE IF EXISTS calificaciones;
DROP TABLE IF EXISTS materias;

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
    REFERENCES materias (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT chk_calificaciones_nota1 CHECK (nota1 BETWEEN 0 AND 10),
  CONSTRAINT chk_calificaciones_nota2 CHECK (nota2 BETWEEN 0 AND 10),
  CONSTRAINT chk_calificaciones_nota3 CHECK (nota3 BETWEEN 0 AND 10)
);
