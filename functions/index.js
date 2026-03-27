const express = require("express");
const sgMail = require("@sendgrid/mail");

const app = express();
app.use(express.json());

// ✅ Put your NEW SendGrid API key here
require("dotenv").config();
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.post("/send-email", async (req, res) => {
  const { email, name } = req.body;

  const msg = {
    to: email,
    from: "unilink713@gmail.com", // your verified email
    subject: "Welcome to UniLink!",
    text: `Hi ${name || "there"}, welcome to UniLink!`,
    html: `<strong>Hi ${name || "there"}, welcome to UniLink!</strong>`,
  };

  try {
    await sgMail.send(msg);
    res.status(200).send("Email sent");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error sending email");
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});