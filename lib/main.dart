import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';

import 'core/config/injection_container.dart';
import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/presentation/bloc/auth_bloc.dart';
import 'features/auth/presentation/pages/login_page.dart';
import 'features/auth/presentation/pages/register_page.dart';
import 'features/auth/presentation/pages/reset_password_page.dart';
import 'features/auth/presentation/pages/onboarding_page.dart';
import 'features/auth/presentation/splash_screen.dart';
import 'features/home/presentation/home_shell.dart';

// ✅ أضف ده
import 'features/chat/presentation/pages/chat_detail_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  await initDependencies();
  runApp(const UniLinkApp());
}

class UniLinkApp extends StatefulWidget {
  const UniLinkApp({super.key});

  @override
  State<UniLinkApp> createState() => _UniLinkAppState();
}

class _UniLinkAppState extends State<UniLinkApp> {
  ThemeMode _themeMode = ThemeMode.system;

  void _toggleTheme() {
    setState(() {
      _themeMode = _themeMode == ThemeMode.light
          ? ThemeMode.dark
          : _themeMode == ThemeMode.dark
              ? ThemeMode.system
              : ThemeMode.light;
    });
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider<AuthBloc>(
      create: (_) => sl<AuthBloc>(),
      child: BlocListener<AuthBloc, AuthState>(
        listenWhen: (previous, current) => previous.status != current.status,
        listener: (context, state) {
          final navigator = AppRouter.navigatorKey.currentState;
          if (navigator == null) return;

          if (state.status == AuthStatus.authenticated) {
            navigator.pushNamedAndRemoveUntil(
              HomeShell.routeName,
              (route) => false,
            );
          } else if (state.status == AuthStatus.unauthenticated) {
            navigator.pushNamedAndRemoveUntil(
              LoginPage.routeName,
              (route) => false,
            );
          }
        },
        child: MaterialApp(
          title: 'UniLink',
          debugShowCheckedModeBanner: false,
          navigatorKey: AppRouter.navigatorKey,
          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          themeMode: _themeMode,
          initialRoute: SplashScreen.routeName,
          routes: {
            SplashScreen.routeName: (context) => const SplashScreen(),
            OnboardingPage.routeName: (context) => const OnboardingPage(),
            LoginPage.routeName: (context) => const LoginPage(),
            RegisterPage.routeName: (context) => const RegisterPage(),
            ResetPasswordPage.routeName: (context) => const ResetPasswordPage(),
            HomeShell.routeName: (context) =>
                HomeShell(onToggleTheme: _toggleTheme),

            // ✅ أهم إضافة
            ChatDetailPage.routeName: (context) => const ChatDetailPage(),
          },
        ),
      ),
    );
  }
}