const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb://localhost:27017'; 
const dbName = 'digyres';

let client;
let db;

async function connectMongo() {
  if (!client || !db) {
    client = new MongoClient(uri, { useUnifiedTopology: true });
    await client.connect();
    db = client.db(dbName);
  }
  return db;
}

async function addDocument(collectionName, data) {
  const db = await connectMongo();
  if (!db) throw new Error('No se pudo conectar a la base de datos');
  const result = await db.collection(collectionName).insertOne(data);
  return result.insertedId;
}

async function getDocsFromCollection(collectionName) {
  const db = await connectMongo();
  if (!db) throw new Error('No se pudo conectar a la base de datos');
  return db.collection(collectionName).find({}).sort({ uploadedAt: -1 }).toArray();
}

module.exports = { addDocument, getDocsFromCollection };
