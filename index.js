const express = require('express')
require('dotenv').config()
const { MongoClient } = require('mongodb');
const admin = require("firebase-admin");
const app = express()
const fileUpload = require("express-fileupload");
const port = process.env.PORT || 5000
const cors = require('cors')
const ObjectId = require('mongodb').ObjectId
const stripe = require("stripe")(process.env.STRIPE_SECRET);

// middleware
app.use(cors())
app.use(express.json())
app.use(fileUpload())


//jwt firebase
var serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.krune.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

//this is a middleware which is used to verify the jwt token from the client side by admin server(firebase)
async function verifyToken(req, res, next) {
    if (req.headers?.authorization?.startsWith('Bearer')) {
        const token = req.headers.authorization.split(' ')[1]
        try {
            const decodedUser = await admin.auth().verifyIdToken(token)
            req.decodedEmail = decodedUser.email
        } catch {

        }

    }
    next()
}
async function run() {
    try {
        await client.connect()
        const database = client.db('doctorsPortal')
        const appointmentsCollection = database.collection('appointments')
        const usersCollection = database.collection('users')
        const doctorsCollection = database.collection('doctors')
        const peopleCollection = database.collection('people')

        //post booking
        app.post('/appointments', async (req, res) => {
            const appointment = req.body
            const result = await appointmentsCollection.insertOne(appointment);
            res.json(result)
        })

        // get appointment
        app.get('/appointments/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: ObjectId(id) }
            const result = await appointmentsCollection.findOne(query)
            res.send(result)

        })
        //update appointment after payment
        app.put('/appointments/:id', async (req, res) => {
            const id = req.params.id
            const filter = { _id: ObjectId(id) }
            const payment = req.body;
            const updateDoc = {
                $set: {
                    payment: payment
                },
            };
            const result = await appointmentsCollection.updateOne(filter, updateDoc)
            res.send(result)

        })
        //getting appointments for the specific user and specific data by query strings
        app.get('/appointments', verifyToken, async (req, res) => {
            const email = req.query.email
            const date = req.query.date
            const query = { email: email, date: date };
            const cursor = appointmentsCollection.find(query);
            const appointments = await cursor.toArray()
            res.json(appointments)
        })

        //find a user if he is admin 
        app.get('/users', async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            let isAdmin = false;
            if (user?.role === 'admin') {
                isAdmin = true
            }
            res.json({ admin: isAdmin })

        })
        //saving users from register form
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user)
            res.json(result)
        })

        //saving google login users to database using put method as users can be both new and old thats why upsert needed
        app.put('/users', async (req, res) => {
            const user = req.body;
            const filter = { email: user.email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(result)
        })
        // making an admin by updating users (inserting role as admin)
        app.put('/users/admin', verifyToken, async (req, res) => {
            const user = req.body; //this user is to be added as admin(got it from input field) by admin 
            const requester = req.decodedEmail //requester is the signed in user who is performing addAdmin operation. 
            if (requester) {
                const query = { email: requester }
                const requesterAccount = await usersCollection.findOne(query)
                if (requesterAccount.role === 'admin') { //only if the requester is admin he can add other user as admin
                    const filter = { email: user.email }
                    const updateDoc = {
                        $set: {
                            role: 'admin'
                        }
                    }
                    const result = await usersCollection.updateOne(filter, updateDoc)
                    res.json(result)
                }

            } else {
                res.status(403).json({ message: "you don't have access to make admin" })
            }

        })
        // adding doctors
        app.post('/doctors', async (req, res) => {
            console.log(req.files);
            // console.log(req.body);
            const body = req.body;
            const imageData = req.files.image.data;
            const encodedImage = imageData.toString('base64');
            const image = Buffer.from(encodedImage, 'base64');
            const doctor = {
                ...body,
                image
            }
            const result = await doctorsCollection.insertOne(doctor)
            res.json(result)
        })
        //get doctors
        app.get('/doctors', async (req, res) => {
            const cursor = doctorsCollection.find({})
            const doctors = await cursor.toArray();
            res.json(doctors)
        })
        //create work people
        app.post('/people', async (req, res) => {
            const body = req.body;
            const files = req.files;
            // console.log(body);
            // console.log(files);

            const imageData = req.files.image.data
            const encodedImage = imageData.toString('base64');
            const image = Buffer.from(encodedImage, 'base64');
            const people = {
                ...body, image
            }
            const result = await peopleCollection.insertOne(people)
            res.json(result)

        })
        // stripe api
        app.post("/create-payment-intent", async (req, res) => {
            const paymentInfo = req.body;
            const amount = paymentInfo.price * 100;

            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                description: 'Software development services',
                payment_method_types: [
                    "card"
                ],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

    } finally {
        // await client.close()
    }

}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
})