// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({origin: ["https://rishtamatrimony.netlify.app" ] , credentials: true }));
app.use(express.json());

// Firebase Admin Initialization
const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// Firebase Token Verification Middleware
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
        return res.status(401).json({ message: "Unauthorized access - Invalid token" });
    }
};

// MongoDB Setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.dec8mtk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

// Route registration will go here (after connection)

// Root route
app.get('/', (req, res) => {
    res.send('Hello, Rishra !');
});

async function run() {
    try {
        // await client.connect();
        const db = client.db('rishta_db');

        const userCollection = db.collection('users');
        const biodataCollection = db.collection('biodatas');
        const contactRequestCollection = db.collection('contactRequests');
        const successStoryCollection = db.collection('successStories');
        const addFevoriteCollection = db.collection('fevoriets');
        const premiumMembersCollection = db.collection('premium_members');

        /**
         * -----------------------------------
         * Stripe Payment Intent
         * -----------------------------------
         */
        app.post("/create-payment-intent", async (req, res) => {
            const { amount } = req.body;
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount,
                    currency: "usd",
                    payment_method_types: ["card"],
                });
                res.send({ clientSecret: paymentIntent.client_secret });
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        /**
         * -----------------------------------
         * GET Routes
         * -----------------------------------
         */
        app.get("/success-story", async (req, res) => {
            try {
                const result = await successStoryCollection.find().sort({ _id: -1 }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Server error" });
            }
        });

        app.get("/success-story/:id", async (req, res) => {
            const { id } = req.params;
            try {
                const story = await successStoryCollection.findOne({ _id: new ObjectId(id) });
                if (!story) return res.status(404).json({ message: "Not found" });
                res.json(story);
            } catch (error) {
                res.status(500).json({ message: "Internal error" });
            }
        });

        app.get("/authusers", async (req, res) => {
            const email = req.query.email;
            if (!email) return res.status(400).send({ message: "Email required" });
            try {
                const user = await userCollection.findOne({ email });
                if (!user) return res.status(404).send({ message: "User not found" });
                res.send(user);
            } catch (error) {
                res.status(500).send({ message: "Server error", error });
            }
        });

        app.get("/users", async (req, res) => {
            const { name, role, page = 1, limit = 10 } = req.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const filter = {};
            if (name) filter.name = { $regex: name, $options: "i" };
            if (role) filter.role = role;
            const [users, total] = await Promise.all([
                userCollection.find(filter).skip(skip).limit(parseInt(limit)).toArray(),
                userCollection.countDocuments(filter),
            ]);
            res.send({ users, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
        });

        app.get("/requestedpremiumuser", async (req, res) => {
            try {
                const result = await userCollection.find({ premiumRequest: true }).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Server error", error });
            }
        });

        app.get('/biodatas', async (req, res) => {
            const result = await biodataCollection.find({}).toArray();
            res.send(result);
        });

        app.get("/biodatabyid/:id", async (req, res) => {
            const id = Number(req.params.id);
            try {
                const result = await biodataCollection.findOne({ bioId: id });
                if (!result) return res.status(404).send({ message: "Not found" });
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error retrieving data", error });
            }
        });

        app.get("/biodata", async (req, res) => {
            const email = req.query.email;
            const biodata = await biodataCollection.findOne({ email });
            if (!biodata) return res.status(404).send({ success: false, message: "Not found" });
            res.send({ success: true, data: biodata });
        });

        app.get("/myfevorites", async (req, res) => {
            const email = req.query.email;
            const result = await addFevoriteCollection.find({ Authemail: email }).toArray();
            res.send(result);
        });

        app.get("/all-contact-request", async (req, res) => {
            const result = await contactRequestCollection.find({}).toArray();
            res.send(result);
        });

        app.get("/all-contact-request/:id", async (req, res) => {
            const id = req.params.id;
            const result = await contactRequestCollection.find({ biodataId: id }).toArray();
            res.send(result);
        });

        app.get('/all-premium-members', async (req, res) => {
            try {
                const members = await premiumMembersCollection.find({}).toArray();
                res.json(members);
            } catch (error) {
                res.status(500).json({ message: 'Server error' });
            }
        });

        /**
         * -----------------------------------
         * POST Routes
         * -----------------------------------
         */
        app.post("/success-story", async (req, res) => {
            const data = req.body;
            if (!data.title || !data.selfId || !data.partnerId || !data.coupleImage || !data.story || !data.rating || !data.marriageDate) {
                return res.status(400).send({ error: "All fields are required." });
            }
            const result = await successStoryCollection.insertOne({ ...data, createdAt: data.createdAt || new Date() });
            res.send({ success: true, insertedId: result.insertedId });
        });

        app.post("/addfevorites", async (req, res) => {
            const { name, presentDivision, occupation, bioId, Authemail } = req.body;
            const exists = await addFevoriteCollection.findOne({ bioId, Authemail });
            if (exists) return res.status(409).json({ message: 'Already exists' });
            const result = await addFevoriteCollection.insertOne({ Authemail, name, presentDivision, occupation, bioId });
            res.send(result);
        });

        app.post("/users", async (req, res) => {
            const data = req.body;
            const existingUser = await userCollection.findOne({ email: data.email });
            if (existingUser) return res.status(409).json({ message: 'User already exists' });
            data.isPremium = false;
            data.premiumRequest = false;
            const result = await userCollection.insertOne(data);
            res.status(201).json({ success: true, insertedId: result.insertedId });
        });

        app.post("/add-biodata", async (req, res) => {
            const data = req.body;
            const existing = await biodataCollection.findOne({ email: data.email });
            if (existing) return res.status(400).send({ success: false, message: "Already submitted" });
            const lastEntry = await biodataCollection.find({}).sort({ bioId: -1 }).limit(1).toArray();
            data.bioId = lastEntry.length > 0 ? lastEntry[0].bioId + 1 : 1;
            data.createdAt = new Date();
            const result = await biodataCollection.insertOne(data);
            res.send(result);
        });

        app.post("/contact-requests", async (req, res) => {
            const { biodataId, requestEmail, transactionId } = req.body;
            if (!biodataId || !requestEmail || !transactionId) {
                return res.status(400).json({ message: "Required fields missing" });
            }
            const existing = await contactRequestCollection.findOne({ biodataId, requestEmail });
            if (existing) return res.status(409).json({ message: "Already requested" });
            const result = await contactRequestCollection.insertOne({ ...req.body, status: "pending", requestedAt: new Date() });
            res.status(201).json({ message: "Submitted", requestId: result.insertedId });
        });

        app.post('/all-premium-members', async (req, res) => {
            const data = req.body;
            if (!data || !data.email) return res.status(400).json({ message: 'Email is required' });
            const existing = await premiumMembersCollection.findOne({ email: data.email });
            if (existing) return res.status(409).json({ message: 'Already exists' });
            const result = await premiumMembersCollection.insertOne(data);
            res.status(201).json({ message: 'Added', insertedId: result.insertedId });
        });

        /**
         * -----------------------------------
         * PATCH / UPDATE Routes (Protected)
         * -----------------------------------
         */
        app.patch("/update-biodata/:email", verifyToken, async (req, res) => {
            const result = await biodataCollection.updateOne(
                { email: req.params.email },
                { $set: req.body }
            );
            if (result.modifiedCount === 0) return res.status(400).send({ success: false, message: "Nothing changed" });
            res.send({ success: true, message: "Updated" });
        });

        app.patch("/make-admin/:email", verifyToken, async (req, res) => {
            const result = await userCollection.updateOne(
                { email: req.params.email },
                { $set: { role: "admin" } }
            );
            res.send(result);
        });

        app.patch("/make-premium/:email", verifyToken, async (req, res) => {
            const result = await userCollection.updateOne(
                { email: req.params.email },
                { $set: { isPremium: true }, $unset: { premiumRequest: "" } }
            );
            if (result.modifiedCount === 0) return res.status(404).send({ message: "Not found or already premium" });
            res.send({ message: "User is now premium", result });
        });

        app.patch("/approve-contact/:id", verifyToken, async (req, res) => {
            const result = await contactRequestCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: { status: "approved" } }
            );
            res.send(result);
        });

        app.patch("/biodata/request-premium/:email", verifyToken, async (req, res) => {
            const { bioId } = req.body;
            if (!bioId) return res.status(400).send({ message: "bioId required" });
            const result = await userCollection.updateOne(
                { email: req.params.email },
                { $set: { premiumRequest: true, bioId } }
            );
            res.send({ message: "Requested", result });
        });


        app.patch("/update-user-name/:email", verifyToken, async (req, res) => {
            const { name } = req.body;
            if (!name) return res.status(400).json({ success: false, message: "Name is required" });
          
            try {
              const result = await userCollection.updateOne(
                { email: req.params.email },
                { $set: { name: name } }
              );
          
              if (result.modifiedCount === 0) {
                return res.status(400).json({ success: false, message: "No change detected update-user-name" });
              }
          
              res.json({ success: true, message: "Name updated in users collection" });
            } catch (error) {
              console.error("User name update error:", error);
              res.status(500).json({ success: false, message: "Internal server error" });
            }
          });

          
          app.patch("/update-contact-request-name/:email", verifyToken, async (req, res) => {
            const { name } = req.body;
            if (!name) return res.status(400).json({ success: false, message: "Name is required" });
          
            try {
              const result = await contactRequestCollection.updateMany(
                { requestEmail: req.params.email },
                { $set: { requestName : name } }
              );
          
              if (result.modifiedCount === 0) {
                return res.status(400).json({ success: false, message: "No change detected update-contact-request-name" });
              }
          
              res.json({ success: true, message: "Name updated in contactRequests collection" });
            } catch (error) {
              console.error("Contact request name update error:", error);
              res.status(500).json({ success: false, message: "Internal server error" });
            }
          });
          

        /**
         * -----------------------------------
         * DELETE Routes
         * -----------------------------------
         */
        app.delete("/deletefevorite/:id", async (req, res) => {
            const result = await addFevoriteCollection.deleteOne({ _id: new ObjectId(req.params.id) });
            if (result.deletedCount === 0) return res.status(404).send({ message: "Not found" });
            res.send({ message: "Deleted" });
        });

        app.delete("/all-contact-request/:id", verifyToken, async (req, res) => {
            const result = await contactRequestCollection.deleteOne({ _id: new ObjectId(req.params.id) });
            if (result.deletedCount === 0) return res.status(404).send({ message: "Not found" });
            res.send({ success: true });
        });

        // await client.db("admin").command({ ping: 1 });
        console.log("MongoDB connected successfully");
    } catch (err) {
        console.error(err);
    }
}
run();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
