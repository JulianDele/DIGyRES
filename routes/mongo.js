const { MongoClient, ObjectId } = require('mongodb');

// Configuración de conexión
const uri = 'mongodb://localhost:27017'; // Se conecta a MongoDB en localhost
const dbName = 'digyres';

let client;
let db;

// Función para conectar/reutilizar conexión
async function connectMongo() {
  if (!client || !db) {
    client = new MongoClient(uri, { useUnifiedTopology: true });
    await client.connect();
    db = client.db(dbName);
  }
  return db;
}

// Función para agregar documentos
async function addDocument(collectionName, data) {
  const db = await connectMongo();
  if (!db) throw new Error('No se pudo conectar a la base de datos');
  const result = await db.collection(collectionName).insertOne(data);
  return result.insertedId;
}

// Función para obtener documentos
async function getDocsFromCollection(collectionName) {
  const db = await connectMongo();
  if (!db) throw new Error('No se pudo conectar a la base de datos');
  return db.collection(collectionName).find({}).sort({ uploadedAt: -1 }).toArray();
}

module.exports = { addDocument, getDocsFromCollection };
