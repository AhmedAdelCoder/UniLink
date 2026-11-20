import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

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
      debugPrint("Welcome email sent!");
    } else {
      debugPrint("Failed to send email: ${response.body}");
    }
  } catch (e) {
    debugPrint("Error sending email: $e");
  }
}