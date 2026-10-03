import express from 'express'
import { pool } from './src/db.js'

const app = express()
const PORT = 3000

app.use(express.json())


app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`)
})

