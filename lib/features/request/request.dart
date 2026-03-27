

// ignore: depend_on_referenced_packages
import 'package:http/http.dart' as http;
import 'dart:convert';

Future<void> sendWelcomeEmail(String email, String name) async {
  try 
  {
    await http.post
    (
      Uri.parse("http://192.168.1.4:3000/send-email"), // use this if testing on emulator
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({
        "email": email,
        "name": name,
      }),
    );
  } catch (e) {
    // ignore: avoid_print
    print("Error sending email: $e");
  }
}