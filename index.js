import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

// MongoDB configuration
if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is missing from your .env file.");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);

const database = client.db(process.env.AUTHDB_NAME || "hireloopDb");

const jobCollection = database.collection("jobs");
const companyCollection = database.collection("companies");

// --------------------------------------------------
// Root route
// --------------------------------------------------
app.get("/", (req, res) => {
  res.status(200).send("HireLoop API is running!");
});

// --------------------------------------------------
// JOB APIs
// --------------------------------------------------

// Get jobs
app.get("/api/jobs", async (req, res) => {
  try {
    const query = {};

    if (req.query.companyId) {
      query.companyId = req.query.companyId;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    const jobs = await jobCollection.find(query).toArray();

    return res.status(200).json(jobs);
  } catch (error) {
    console.error("Failed to fetch jobs:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch jobs.",
    });
  }
});

// Create a job
app.post("/api/jobs", async (req, res) => {
  try {
    const job = req.body;

    if (!job || Object.keys(job).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Job data is required.",
      });
    }

    const result = await jobCollection.insertOne({
      ...job,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const savedJob = await jobCollection.findOne({
      _id: result.insertedId,
    });

    return res.status(201).json({
      success: true,
      message: "Job created successfully.",
      job: savedJob,
    });
  } catch (error) {
    console.error("Failed to create job:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create job.",
    });
  }
});

// --------------------------------------------------
// COMPANY APIs
// --------------------------------------------------

// Get the company belonging to a recruiter
app.get("/api/my/companies", async (req, res) => {
  try {
    const { recruiterId } = req.query;

    if (!recruiterId) {
      return res.status(400).json({
        success: false,
        message: "recruiterId is required.",
      });
    }

    const company = await companyCollection.findOne({ recruiterId });

    return res.status(200).json({
      success: true,
      company: company || null,
    });
  } catch (error) {
    console.error("Failed to fetch company:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch company.",
    });
  }
});

// Register a company
app.post("/api/companies", async (req, res) => {
  try {
    const {
      recruiterId,
      name,
      industry,
      website,
      location,
      employeeCount,
      description,
      logoUrl,
    } = req.body;

    // Validate required fields
    if (
      !recruiterId ||
      typeof name !== "string" ||
      !name.trim() ||
      typeof location !== "string" ||
      !location.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Recruiter ID, company name, and location are required.",
      });
    }

    const existingCompany = await companyCollection.findOne({
      recruiterId,
    });

    const now = new Date();

    const companyData = {
      recruiterId,
      name: name.trim(),
      industry: industry || "",
      website: website || "",
      location: location.trim(),
      employeeCount: employeeCount || "",
      description: description || "",
      logoUrl: logoUrl || "",
      updatedAt: now,
    };

    let savedCompany;

    if (existingCompany) {
      // Update an existing company instead of creating a duplicate.
      // Preserve its existing approval status.
      await companyCollection.updateOne(
        { _id: existingCompany._id },
        { $set: companyData },
      );

      savedCompany = await companyCollection.findOne({
        _id: existingCompany._id,
      });
    } else {
      const newCompany = {
        ...companyData,
        status: "pending",
        createdAt: now,
      };

      const result = await companyCollection.insertOne(newCompany);

      savedCompany = await companyCollection.findOne({
        _id: result.insertedId,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Company registered successfully.",
      company: savedCompany,
    });
  } catch (error) {
    console.error("Failed to register company:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to register company.",
      error: error.message,
    });
  }
});

// Update an existing company
app.patch("/api/companies/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid company ID.",
      });
    }

    const {
      recruiterId,
      name,
      industry,
      website,
      location,
      employeeCount,
      description,
      logoUrl,
    } = req.body;

    if (!recruiterId) {
      return res.status(400).json({
        success: false,
        message: "recruiterId is required.",
      });
    }

    const companyData = {
      ...(name !== undefined && {
        name: typeof name === "string" ? name.trim() : name,
      }),
      ...(industry !== undefined && { industry }),
      ...(website !== undefined && { website }),
      ...(location !== undefined && {
        location: typeof location === "string" ? location.trim() : location,
      }),
      ...(employeeCount !== undefined && { employeeCount }),
      ...(description !== undefined && { description }),
      ...(logoUrl !== undefined && { logoUrl }),
      updatedAt: new Date(),
    };

    if (companyData.name !== undefined && !companyData.name) {
      return res.status(400).json({
        success: false,
        message: "Company name cannot be empty.",
      });
    }

    if (companyData.location !== undefined && !companyData.location) {
      return res.status(400).json({
        success: false,
        message: "Company location cannot be empty.",
      });
    }

    const filter = {
      _id: new ObjectId(id),
      recruiterId,
    };

    const result = await companyCollection.updateOne(filter, {
      $set: companyData,
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Company not found for this recruiter.",
      });
    }

    const savedCompany = await companyCollection.findOne(filter);

    return res.status(200).json({
      success: true,
      message: "Company updated successfully.",
      company: savedCompany,
    });
  } catch (error) {
    console.error("Failed to update company:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update company.",
      error: error.message,
    });
  }
});

async function startServer() {
  try {
    await client.connect();

    // Verify the connection
    await database.command({ ping: 1 });

    console.log("Successfully connected to MongoDB!");

    app.listen(port, () => {
      console.log(`HireLoop API listening on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);

    await client.close().catch(() => {});

    process.exit(1);
  }
}

startServer();
