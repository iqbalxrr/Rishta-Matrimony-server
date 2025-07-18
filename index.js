require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const app = express();
const cors = require('cors');
const PORT = process.env.PORT || 3000;


app.use(cors());
app.use(express.json());

// firabase admin  

const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString(
      "utf-8"
    )
  );
// console.log(serviceAccount);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.dec8mtk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        // await client.connect();

        // all collections name


        const userCollection = client.db('rishta_db').collection('users');
        const biodataCollection = client.db('rishta_db').collection('biodatas');
        const contactRequestCollection = client.db('rishta_db').collection('contactRequests');
        const successStoryCollection = client.db('rishta_db').collection('successStories');
        const paymentCollection = client.db('rishta_db').collection('payments');


        app.get('/', (req, res) => {
            res.send('Hello, World!');
        });

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 