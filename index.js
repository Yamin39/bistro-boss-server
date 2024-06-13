const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

// custom middlewares
const verifyToken = (req, res, next) => {
  console.log("inside verify token middleware", req.headers?.authorization);

  if (!req.headers?.authorization) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  const token = req.headers?.authorization?.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
    if (error) {
      return res.status(401).send({ message: "Unauthorized" });
    }

    req.decoded = decoded;

    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId, ClientSession } = require("mongodb");

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6fu63x8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db("bistroDB").collection("users");
    const menuCollection = client.db("bistroDB").collection("menu");
    const reviewCollection = client.db("bistroDB").collection("review");
    const cartCollection = client.db("bistroDB").collection("cart");
    const paymentCollection = client.db("bistroDB").collection("payments");

    // custom middleware to use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded?.email;
      const user = await userCollection.findOne({ email });

      const isAdmin = user?.role === "admin";

      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden" });
      }

      next();
    };

    // auth related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // get users
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      console.log(req.decoded);
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // save user info
    app.post("/users", async (req, res) => {
      const user = req.body;
      const isExist = await userCollection.findOne({ email: user.email });
      if (isExist) {
        res.send({ message: "User already exist", insertedId: null });
        return;
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // delete user
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = {
        _id: new ObjectId(id),
      };
      const result = await userCollection.deleteOne(filter);
      res.send(result);
    });

    // make admin
    app.patch("/users/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = {
        _id: new ObjectId(id),
      };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // check isAdmin
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      console.log(email);
      console.log(req.decoded.email);

      if (email !== req.decoded.email) {
        res.status(403).send({ message: "Forbidden" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);

      let admin = false;

      if (user?.role === "admin") {
        admin = true;
      }

      res.send({ admin });
    });

    // get menu
    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    // get specific menu
    app.get("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const filter = {
        _id: new ObjectId(id),
      };
      const result = await menuCollection.findOne(filter);
      res.send(result);
    });

    // post menu
    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const result = await menuCollection.insertOne(req.body);
      res.send(result);
    });

    // update menu item
    app.patch("/menu/:id", async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image,
        },
      };

      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // delete menu
    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = {
        _id: new ObjectId(id),
      };
      const result = await menuCollection.deleteOne(filter);
      res.send(result);
    });

    // get reviews
    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    // get carts
    app.get("/carts", async (req, res) => {
      const result = await cartCollection.find({ email: req.query.email }).toArray();
      res.send(result);
    });

    // post cart
    app.post("/carts", async (req, res) => {
      const result = await cartCollection.insertOne(req.body);
      res.send(result);
    });

    // delete cart
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const filter = {
        _id: new ObjectId(id),
      };
      const result = await cartCollection.deleteOne(filter);
      res.send(result);
    });

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount);

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // get admin states
    app.get("/admin-states", verifyToken, verifyAdmin, async (req, res) => {
      const userCount = await userCollection.estimatedDocumentCount();
      const menuItemCount = await menuCollection.estimatedDocumentCount();
      const orderCount = await paymentCollection.estimatedDocumentCount();

      // this is not the best way
      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce((total, payment) => total + payment.price, 0);

      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();

      const revenue = result.length ? result[0].totalRevenue : 0;

      res.send({
        userCount,
        menuItemCount,
        orderCount,
        revenue,
      });
    });

    // get payment history for specific user
    app.get("/payments/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        res.status(403).send({ message: "Forbidden" });
      }

      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();

      res.send(result);
    });

    // save payments
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      // delete each item from the cart carefully
      const query = {
        _id: {
          $in: payment.cartIds.map((id) => new ObjectId(id)),
        },
      };

      const deleteResult = await cartCollection.deleteMany(query);

      res.send({ paymentResult, deleteResult });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server running");
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
