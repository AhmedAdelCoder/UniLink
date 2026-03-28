// request.dart
// ignore: depend_on_referenced_packages
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
      // ignore: avoid_print
      print("Welcome email sent!");
    } else {
      // ignore: avoid_print
      print("Failed to send email: ${response.body}");
    }
  } catch (e) {
    // ignore: avoid_print
    print("Error sending email: $e");
  }
}