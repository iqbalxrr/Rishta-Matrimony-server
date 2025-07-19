require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const app = express();
const cors = require('cors');
const PORT = process.env.PORT || 3000;


app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true,
    })
);
app.use(express.json());

// ✅ Firebase Admin Setup
const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString(
        "utf-8"
    )
);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// ✅ Token Authorization Middleware

const verifyToken = async (req, res, next) => {

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Unauthorized access - No token found" });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error("Token verification failed:", error.message);
        return res.status(401).json({ message: "Unauthorized access - Invalid token" });
    }
}

// ✅ MongoDB Connection


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

        // ✅ all collections name

        const userCollection = client.db('rishta_db').collection('users');
        const biodataCollection = client.db('rishta_db').collection('biodatas');
        const contactRequestCollection = client.db('rishta_db').collection('contactRequests');
        const successStoryCollection = client.db('rishta_db').collection('successStories');
        const paymentCollection = client.db('rishta_db').collection('payments');


        // ✅ all routes

        // ✅ get all biodata

        app.get('/biodatas', verifyToken, async (req, res) => {
            const biodatas = await biodataCollection.find({}).toArray();
            res.send(biodatas);
        });
 

        // ✅get biodata by email 

        app.get("/biodata", async (req, res) => {
            const email = req.query.email;
           
            const biodata = await biodataCollection.findOne({ email });
            if (!biodata) {
              return res.status(404).send({ success: false, message: "Biodata not found" });
            }
          
            res.send({ success: true, data: biodata });
          });
          


        // ✅ add user
        app.post('/users', async (req, res) => {
            const { name, email, role } = req.body;

            try {
                const existingUser = await userCollection.findOne({ email });

                if (existingUser) {
                    return res.status(409).json({ message: 'User already exists' });
                }

                const result = await userCollection.insertOne({ name, email, role });
                res.status(201).json({ success: true, insertedId: result.insertedId });
            } catch (err) {
                res.status(500).json({ message: 'Failed to add user', error: err.message });
            }
        });



        // ✅ add biodata

        app.post("/add-biodata", async (req, res) => {
            const data = req.body;

            const existing = await biodataCollection.findOne({ email: data.email });

            if (existing) {
                return res.status(400).send({
                    success: false,
                    message: "You have already submitted your biodata.",
                });
            }

            const lastEntry = await biodataCollection
                .find({})
                .sort({ bioId: -1 })
                .limit(1)
                .toArray();

            let newId = 1;
            if (lastEntry.length > 0) {
                newId = lastEntry[0].bioId + 1;
            }
            data.bioId = newId;

            // ✅ Set default premium flags
            data.isPremium = false;
            data.premiumRequest = false;

            const result = await biodataCollection.insertOne(data);
            res.send(result);

        })

        // ✅request user for premium 
        app.patch("/biodata/request-premium/:id", async (req, res) => {
            const id = parseInt(req.params.id);

            const result = await biodataCollection.updateOne(
                { biodataId: id },
                { $set: { premiumRequest: true } }
            );

            res.send(result);
        });



        //✅ admin make premium 

        app.patch("/biodata/make-premium/:id", async (req, res) => {
            const id = parseInt(req.params.id);

            const result = await biodataCollection.updateOne(
                { biodataId: id },
                { $set: { isPremium: true, premiumRequest: false } }
            );

            res.send(result);
        });














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