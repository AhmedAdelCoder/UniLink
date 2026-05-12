import 'package:http/http.dart' as http;
import 'dart:convert';

Future<void> sendWelcomeEmail(String email, String name) async {
  try {
    final response = await http.post(
      Uri.parse(
        "https://unilink-two.vercel.app/api/sendemails",
      ),                                    
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({
        "email": email,
        "name": name,
      }),
    );

    if (response.statusCode == 200) {
      print("Welcome email sent!");
    } else {
      print("Failed to send email: ${response.body}");
    }
  } catch (e) {
    print("Error sending email: $e");
  }
}