import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { email, name } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const msg = {
    to: email,
    from: "unilink713@gmail.com", // لازم يكون Verified في SendGrid
    subject: "Welcome to UniLink 🚀",
    text: `Hi ${name || "there"}, welcome to UniLink!`,
    html: `<h2>Hi ${name || "there"} 👋</h2><p>Welcome to UniLink!</p>`,
  };

  try {
    await sgMail.send(msg);
    return res.status(200).json({ message: "Email sent successfully" });
  } catch (error) {
    console.error(error.response?.body || error.message);
    return res.status(500).json({
      message: "Failed to send email",
      error: error.message,
      details: error.response?.body,
    });
  }
}