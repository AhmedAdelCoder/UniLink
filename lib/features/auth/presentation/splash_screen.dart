import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/constants/onboarding_prefs.dart';
import 'bloc/auth_bloc.dart';
import 'pages/onboarding_page.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  static const routeName = '/';

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (!mounted) return;

    // التحقق من ان المستخدم اتم Onboarding
    final prefs = await SharedPreferences.getInstance();
    final onboardingDone = prefs.getBool(kOnboardingCompletedKey) ?? false;

    if (!mounted) return;

    if (!onboardingDone) {
      Navigator.of(context).pushReplacementNamed(OnboardingPage.routeName);
      return;
    }

    // التحقق من حالة تسجيل الدخول
    if (!mounted) return;
    context.read<AuthBloc>().add(const AuthCheckRequested());
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: CircularProgressIndicator(),
      ),
    );
  }
}