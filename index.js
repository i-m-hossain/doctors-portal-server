const express = require('express')
require('dotenv').config()
const { MongoClient } = require('mongodb');
const admin = require("firebase-admin");
const app = express()
const port = process.env.PORT || 5000
const cors = require('cors')

// middleware
app.use(cors())
app.use(express.json())
// doctor-portal-92230-firebase-adminsdk.json

var serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.krune.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

//this is a middleware which is used to verify the jwt token from the client side by admin server(firebase)
async function verifyToken(req,res, next){
    if (req.headers?.authorization?.startsWith('Bearer')){
        const token = req.headers.authorization.split(' ')[1]
        try{
            const decodedUser =await admin.auth().verifyIdToken(token)
            req.decodedEmail = decodedUser.email
        }catch{

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

        //post booking
        app.post('/appointments', async (req, res) => {
            const appointment = req.body
            const result = await appointmentsCollection.insertOne(appointment);
            res.json(result)
        })
        //getting appointments for the specific user and specific data by query strings
        app.get('/appointments', verifyToken, async (req, res) => {
            const email = req.query.email 
            const date = req.query.date
            const query = { email: email, date: date};
            const cursor = appointmentsCollection.find(query);
            const appointments = await cursor.toArray()
            res.json(appointments)
        })

        //find a user if he is admin 
        app.get('/users', async(req, res)=>{
            const email = req.query.email
            const query = {email: email}
            const user = await usersCollection.findOne(query)
            let isAdmin = false;
            if(user?.role === 'admin'){
                isAdmin = true 
            }
            res.json({ admin: isAdmin})
            
        })
        //saving users from register form
        app.post('/users', async(req, res)=>{
            const user = req.body;
            const result = await usersCollection.insertOne(user)
            res.json(result)
        }) 

        //saving google login users to database using put method as users can be both new and old thats why upsert needed
        app.put('/users', async(req,res) =>{
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
        app.put('/users/admin', verifyToken,  async(req,res)=>{
            const user = req.body; //this user is to be added as admin(got it from input field) by admin 
            const requester = req.decodedEmail //requester is the signed in user who is performing addAdmin operation. 
            if(requester){
                const query = { email: requester }
                const requesterAccount = await usersCollection.findOne(query)
                if(requesterAccount.role === 'admin'){ //only if the requester is admin he can add other user as admin
                    const filter = { email: user.email }
                    const updateDoc = {
                        $set: {
                            role: 'admin'
                        }
                    }
                    const result = await usersCollection.updateOne(filter, updateDoc)
                    res.json(result)
                }

            }else{
                res.status(403).json({ message: "you don't have access to make admin"})
            }
            
        })

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