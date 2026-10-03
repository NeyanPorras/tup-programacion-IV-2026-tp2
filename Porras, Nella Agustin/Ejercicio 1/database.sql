CREATE DATABASE IF NOT EXISTS tp2_ejercicio1;

USE tp2_ejercicio1;

DROP TABLE IF EXISTS rectangulos;

CREATE TABLE rectangulos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lado_a DECIMAL(10, 2) NOT NULL,
  lado_b DECIMAL(10, 2) NOT NULL,
  perimetro DECIMAL(10, 2) NOT NULL,
  superficie DECIMAL(12, 4) NOT NULL
);

