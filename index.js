require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const app = express();
const cors = require('cors');
const PORT = process.env.PORT || 3000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);




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


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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

        // ✅ all collections name

        const userCollection = client.db('rishta_db').collection('users');
        const biodataCollection = client.db('rishta_db').collection('biodatas');
        const contactRequestCollection = client.db('rishta_db').collection('contactRequests');
        const successStoryCollection = client.db('rishta_db').collection('successStories');
        const addFevoriteCollection = client.db('rishta_db').collection('fevoriets');
        const premiumMembersCollection = client.db('rishta_db').collection('premium_members');




        // await client.connect();

        // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>  payment section >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

        //✅  add payment section 

        app.post("/create-payment-intent", async (req, res) => {
            const { amount } = req.body; // amount in cents (500 = $5)

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount,
                    currency: "usd",
                    payment_method_types: ["card"],
                });

                res.send({
                    clientSecret: paymentIntent.client_secret,
                });
            } catch (err) {
                console.error("Stripe Error:", err);
                res.status(500).send({ error: err.message });
            }
        });

        // ✅ get contact request data 


        app.get("/all-contact-request", async (req, res) => {
            const result = await contactRequestCollection.find({}).toArray();
            res.send(result)
        })

        app.get("/all-contact-request/:id", async (req, res) => {
            const id = req.params.id;
            const result = await contactRequestCollection.find({ biodataId: id }).toArray();
            res.send(result);
        });


        //✅ Admin approve contact request

        app.patch("/approve-contact/:id", async (req, res) => {
            const id = req.params.id;
            const result = await contactRequestCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: "approved" } }
            );
            res.send(result);
        });

        // ✅  save payment data and contact request

        app.post("/contact-requests", async (req, res) => {
            try {
                const { biodataId, requestBioId, requestEmail, requestName, requestMobile, transactionId } = req.body;


                if (!biodataId || !requestEmail || !transactionId) {
                    return res.status(400).json({ message: "Required fields missing" });
                }


                const existing = await contactRequestCollection.findOne({ biodataId, requestEmail });
                if (existing) {
                    return res.status(409).json({ message: "You have already requested this contact info" });
                }


                const newRequest = {
                    biodataId,
                    requestBioId,
                    requestEmail,
                    requestName,
                    requestMobile,
                    transactionId,
                    status: "pending",
                    requestedAt: new Date(),
                };


                const result = await contactRequestCollection.insertOne(newRequest);

                return res.status(201).json({
                    message: "Contact request submitted successfully",
                    requestId: result.insertedId,
                });
            } catch (error) {
                console.error("Error in /contact-requests:", error);
                return res.status(500).json({ message: "Internal server error" });
            }
        });




        //   ✅ delete 

        app.delete("/all-contact-request/:id", async (req, res) => {
            const { id } = req.params;
            try {
                const result = await contactRequestCollection.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount > 0) {
                    return res.status(200).json({ success: true });
                } else {
                    return res.status(404).json({ message: "Request not found" });
                }
            } catch (error) {
                console.error("Error deleting request:", error);
                return res.status(500).json({ message: "Internal server error" });
            }
        });



        // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> get  route section >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>


        // ✅ Get user by email
        app.get("/authusers", async (req, res) => {

            const email = req.query.email;

            if (!email) {
                return res.status(400).send({ message: "Email is required" });
            }

            try {
                const user = await userCollection.findOne({ email: email });

                if (!user) {
                    return res.status(404).send({ message: "User not found" });
                }

              res.send(user);
            } catch (error) {
                res.status(500).send({ message: "Server error", error });
            }
        });




        app.get("/users", async (req, res) => {
            const { name, role, page = 1, limit = 10 } = req.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);

            const filter = {};
            if (name) {
                filter.name = { $regex: name, $options: "i" }; // case-insensitive search
            }
            if (role) {
                filter.role = role;
            }

            const [users, total] = await Promise.all([
                userCollection.find(filter).skip(skip).limit(parseInt(limit)).toArray(),
                userCollection.countDocuments(filter),
            ]);

            res.send({ users, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
        });


        // make admin section.................


        app.patch("/make-admin/:email", async (req, res) => {
            const email = req.params.email;
            const result = await userCollection.updateOne(
                { email },
                { $set: { role: "admin" } }
            );
            res.send(result);
        });


        // ✅ Get users who requested premium

        app.get("/requestedpremiumuser", async (req, res) => {
            try {
                const result = await userCollection
                    .find({ premiumRequest: true })
                    .toArray();

                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Server error", error });
            }
        });



        // Approve Premium Request my admin

        // ✅ Make user premium and clear the premium request flag
        app.patch("/make-premium/:email", async (req, res) => {
            const email = req.params.email;

            if (!email) {
                return res.status(400).send({ message: "Email is required" });
            }

            try {
                const result = await userCollection.updateOne(
                    { email },
                    {
                        $set: { isPremium: true },
                        $unset: { premiumRequest: "" }
                    }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).send({ message: "User not found or already premium" });
                }

                res.send({ message: "User is now premium", result });
            } catch (error) {
                res.status(500).send({ message: "Server error", error });
            }
        });





        // ✅ get all story 

        app.get("/success-story", async (req, res) => {
            try {
                const result = await successStoryCollection.find().sort({ _id: -1 }).toArray();
                res.send(result);
            } catch (err) {
                console.error("Error fetching success stories:", err);
                res.status(500).send({ error: "Server error" });
            }
        });


        // ✅ get all biodata

        app.get('/biodatas', async (req, res) => {
            const biodatas = await biodataCollection.find({}).toArray();
            res.send(biodatas);
        });

        // ✅ get biodata by id 

        app.get("/biodatabyid/:id", async (req, res) => {
            const id = Number(req.params.id);

            try {
                const result = await biodataCollection.findOne({ bioId: id });

                if (!result) {
                    return res.status(404).send({ message: "Biodata not found" });
                }

                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error retrieving biodata", error });
            }
        });


        // ✅ get biodata by email 

        app.get("/biodata", async (req, res) => {
            const email = req.query.email;

            const biodata = await biodataCollection.findOne({ email });
            if (!biodata) {
                return res.status(404).send({ success: false, message: "Biodata not found" });
            }

            res.send({ success: true, data: biodata });
        });



        app.get("/myfevorites", async (req, res) => {

            const email = req.query.email;

            const result = await addFevoriteCollection.find({ Authemail: email }).toArray();

            res.send(result)

        })



        // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> post section >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

        // ✅ success-story 


        app.post("/success-story", async (req, res) => {
            
            try {
                const storyData = req.body;

                const {
                    selfId,
                    partnerId,
                    title,
                    coupleImage,
                    marriageDate,
                    rating,
                    story,
                    createdAt
                } = storyData;

                
                if (
                    !selfId ||
                    !partnerId ||
                    !title ||
                    !coupleImage ||
                    !marriageDate ||
                    !rating ||
                    !story
                ) {
                    return res.status(400).send({ error: "All fields are required." });
                }

                // Optional: validate rating range (1–5)
                if (rating < 1 || rating > 5) {
                    return res.status(400).send({ error: "Rating must be between 1 and 5." });
                }

                const result = await successStoryCollection.insertOne({
                    selfId,
                    partnerId,
                    title,
                    coupleImage,
                    marriageDate,
                    rating,
                    story,
                    createdAt: createdAt || new Date().toISOString(),
                });

                res.send({ success: true, insertedId: result.insertedId });
            } catch (err) {
                console.error("Error saving success story:", err);
                res.status(500).send({ error: "Server error" });
            }
        });





        // ✅ add to  fevorites 

        app.post("/addfevorites", async (req, res) => {

            const { name, presentDivision, occupation, bioId, Authemail } = req.body;

            const existingId = await addFevoriteCollection.findOne({ bioId, Authemail });

            if (existingId) {
                return res.status(409).json({ message: 'User already exists in favourites' });
            }
            const result = await addFevoriteCollection.insertOne({ Authemail, name, presentDivision, occupation, bioId });
            res.send(result)
        })


        // ✅ add user
        app.post('/users', async (req, res) => {

            const data = req.body;

            try {
                const existingUser = await userCollection.findOne({ email: data.email });

                if (existingUser) {
                    return res.status(409).json({ message: 'User already exists' });
                }

                data.isPremium = false;
                data.premiumRequest = false;

                const result = await userCollection.insertOne(data);
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


            data.createdAt = new Date();

            const result = await biodataCollection.insertOne(data);
            res.send(result);

        })

        // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Update route section >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

        // ✅ UPDATE BIODATA
        app.patch("/update-biodata/:email", async (req, res) => {
            const email = req.params.email;
            const updatedData = req.body;

            const result = await biodataCollection.updateOne(
                { email },
                { $set: updatedData }
            );

            if (result.modifiedCount > 0) {
                return res.send({ success: true, message: "Biodata updated successfully." });
            } else {
                return res.status(400).send({ success: false, message: "No changes were made or biodata not found." });
            }
        });


        // ✅ Update bioId and premiumRequest for a user
        app.patch("/biodata/request-premium/:email", async (req, res) => {
            const email = req.params.email;
            const { bioId } = req.body;

            if (!bioId || !email) {
                return res.status(400).send({ message: "Email and bioId are required" });
            }

            try {
                const result = await userCollection.updateOne(
                    { email: email },
                    {
                        $set: {
                            premiumRequest: true,
                            bioId: bioId
                        }
                    }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).send({ message: "User not found or already requested" });
                }

                res.send({ message: "Premium request submitted", result });
            } catch (error) {
                res.status(500).send({ message: "Server error", error });
            }
        });




        app.post('/all-premium-members', async (req, res) => {
            try {
                const biodata = req.body;

                if (!biodata || !biodata.email) {
                    return res.status(400).json({ message: 'Biodata with email is required' });
                }

                // Check if user already exists
                const existing = await premiumMembersCollection.findOne({ email: biodata.email });
                if (existing) {
                    return res.status(409).json({ message: 'Member already exists' });
                }

                const result = await premiumMembersCollection.insertOne(biodata);
                res.status(201).json({ message: 'Premium member added', insertedId: result.insertedId });
            } catch (error) {
                console.error(error);
                res.status(500).json({ message: 'Server error' });
            }
        });

        // GET route to get all premium members
        app.get('/all-premium-members', async (req, res) => {
            try {
                const members = await premiumMembersCollection.find({}).toArray();
                res.json(members);
            } catch (error) {
                console.error(error);
                res.status(500).json({ message: 'Server error' });
            }
        });


        // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Delete section >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

        // DELETE /deletefevorite/:id

        app.delete("/deletefevorite/:id", async (req, res) => {
            const id = req.params.id;
            try {
                const result = await addFevoriteCollection.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount === 0) {
                    return res.status(404).send({ message: "Favourite not found" });
                }
                res.send({ message: "Deleted successfully" });
            } catch (error) {
                res.status(500).send({ message: "Internal server error" });
            }
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