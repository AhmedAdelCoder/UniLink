import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY); // read key from .env

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { email, name } = req.body;

  if (!email) return res.status(400).send("Email is required");

  const msg = {
    to: email,
    from: "unilink713@gmail.com", // your verified SendGrid email
    subject: "Welcome to UniLink!",
    text: `Hi ${name || "there"}, welcome to UniLink!`,
    html: `<strong>Hi ${name || "there"}, welcome to UniLink!</strong>`,
  };

  try {
    await sgMail.send(msg);
    return res.status(200).send("Email sent");
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error:error.message,
      details:error.response?.body
    });
  }
}