import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../../../../core/utils/input_validators.dart';
import '../bloc/auth_bloc.dart';
import 'register_page.dart';
import 'reset_password_page.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  static const routeName = '/login';

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _formKey = GlobalKey<FormState>();

  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  final ValueNotifier<bool> _obscurePassword = ValueNotifier<bool>(true);
  final ValueNotifier<bool> _rememberMe = ValueNotifier<bool>(false);

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();

    _obscurePassword.dispose();
    _rememberMe.dispose();

    super.dispose();
  }

  void _onLoginPressed() {
    FocusScope.of(context).unfocus();

    if (!_formKey.currentState!.validate()) {
      return;
    }

    context.read<AuthBloc>().add(
          AuthLoginRequested(
            email: _emailController.text.trim(),
            password: _passwordController.text.trim(),
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => FocusScope.of(context).unfocus(),
        child: Stack(
          children: [
            // ===============================================================
            // BACKGROUND
            // ===============================================================
            const Positioned.fill(
              child: RepaintBoundary(
                child: UniLinkBackground(),
              ),
            ),

            // ===============================================================
            // CONTENT
            // ===============================================================
            SafeArea(
              child: BlocListener<AuthBloc, AuthState>(
                listener: (context, state) async {
                  if (state.status == AuthStatus.failure) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          state.errorMessage ?? 'Login failed',
                        ),
                      ),
                    );
                  }

                  if (state.status == AuthStatus.authenticated) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Login Success'),
                      ),
                    );
                  }
                },
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    return SingleChildScrollView(
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: const EdgeInsets.fromLTRB(
                        20,
                        28,
                        20,
                        24,
                      ),
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          minHeight: constraints.maxHeight - 52,
                          maxWidth: 620,
                        ),
                        child: Center(
                          child: Form(
                            key: _formKey,
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                // =================================================
                                // LOGO
                                // =================================================
                                const _StaticLogo(),

                                const SizedBox(height: 8),

                                // =================================================
                                // TITLE
                                // =================================================
                                const _UniLinkTitle(),

                                const SizedBox(height: 6),

                                // =================================================
                                // TAGLINE
                                // =================================================
                                const _Tagline(),

                                const SizedBox(height: 26),

                                // =================================================
                                // LOGIN CARD
                                // =================================================
                                const _LoginCard(),

                                const SizedBox(height: 18),

                                // =================================================
                                // FOOTER
                                // =================================================
                                const _FooterMessage(),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================================
// LOGIN CARD
// ============================================================================

class _LoginCard extends StatelessWidget {
  const _LoginCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: Theme.of(context)
                .colorScheme
                .primary
                .withValues(alpha: 0.08),
            blurRadius: 22,
            spreadRadius: 1,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface.withValues(
                alpha: Theme.of(context).brightness == Brightness.dark
                    ? 0.94
                    : 0.96,
              ),
          borderRadius: BorderRadius.circular(28),
          border: Border.all(
            color: Theme.of(context)
                .colorScheme
                .primary
                .withValues(alpha: 0.14),
            width: 1,
          ),
        ),
        child: const _LoginFormContent(),
      ),
    );
  }
}

// ============================================================================
// LOGIN FORM
// ============================================================================

class _LoginFormContent extends StatelessWidget {
  const _LoginFormContent();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ===============================================================
        // WELCOME TITLE
        // ===============================================================
        Text.rich(
          TextSpan(
            children: [
              TextSpan(
                text: 'Welcome ',
                style: TextStyle(
                  color: scheme.onSurface,
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                ),
              ),
              TextSpan(
                text: 'back',
                style: TextStyle(
                  color: scheme.primary,
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 7),

        Text(
          'Sign in to your UniLink account and continue building your network.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: scheme.onSurface.withValues(alpha: 0.60),
            height: 1.45,
          ),
        ),

        const SizedBox(height: 23),

        // ===============================================================
        // EMAIL
        // ===============================================================
        const _FieldLabel(
          label: 'Email',
        ),

        const SizedBox(height: 7),

        TextFormField(
          controller: context
              .findAncestorStateOfType<_LoginPageState>()!
              ._emailController,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          style: theme.textTheme.bodyLarge,
          decoration: _inputDecoration(
            context,
            hintText: 'Enter your email',
            icon: Icons.mail_outline_rounded,
          ),
          validator: InputValidators.validateEmail,
        ),

        const SizedBox(height: 15),

        // ===============================================================
        // PASSWORD
        // ===============================================================
        const _FieldLabel(
          label: 'Password',
        ),

        const SizedBox(height: 7),

        ValueListenableBuilder<bool>(
          valueListenable: context
              .findAncestorStateOfType<_LoginPageState>()!
              ._obscurePassword,
          builder: (context, obscure, _) {
            final pageState =
                context.findAncestorStateOfType<_LoginPageState>()!;

            return TextFormField(
              controller: pageState._passwordController,
              obscureText: obscure,
              textInputAction: TextInputAction.done,
              style: theme.textTheme.bodyLarge,
              decoration: _inputDecoration(
                context,
                hintText: 'Enter your password',
                icon: Icons.lock_outline_rounded,
                suffixIcon: IconButton(
                  tooltip: obscure ? 'Show password' : 'Hide password',
                  onPressed: () {
                    pageState._obscurePassword.value = !obscure;
                  },
                  icon: Icon(
                    obscure
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                    color: scheme.onSurface.withValues(alpha: 0.55),
                    size: 21,
                  ),
                ),
              ),
              validator: InputValidators.validatePassword,
              onFieldSubmitted: (_) {
                FocusScope.of(context).unfocus();
              },
            );
          },
        ),

        const SizedBox(height: 7),

        // ===============================================================
        // REMEMBER + FORGOT
        // ===============================================================
        Row(
          children: [
            ValueListenableBuilder<bool>(
              valueListenable: context
                  .findAncestorStateOfType<_LoginPageState>()!
                  ._rememberMe,
              builder: (context, remember, _) {
                final pageState =
                    context.findAncestorStateOfType<_LoginPageState>()!;

                return Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: 28,
                      height: 28,
                      child: Checkbox(
                        value: remember,
                        onChanged: (value) {
                          pageState._rememberMe.value = value ?? false;
                        },
                        side: BorderSide(
                          color: scheme.onSurface.withValues(alpha: 0.30),
                        ),
                        activeColor: scheme.primary,
                        checkColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(5),
                        ),
                      ),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      'Remember me',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: scheme.onSurface.withValues(alpha: 0.60),
                      ),
                    ),
                  ],
                );
              },
            ),

            const Spacer(),

            TextButton(
              onPressed: () {
                Navigator.of(context).pushNamed(
                  ResetPasswordPage.routeName,
                );
              },
              style: TextButton.styleFrom(
                padding: EdgeInsets.zero,
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(
                'Forgot Password?',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: scheme.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),

        const SizedBox(height: 19),

        // ===============================================================
        // LOGIN BUTTON
        // ===============================================================
        BlocSelector<AuthBloc, AuthState, bool>(
          selector: (state) => state.status == AuthStatus.loading,
          builder: (context, isLoading) {
            return _LoginButton(
              isLoading: isLoading,
              onPressed: () {
                context
                    .findAncestorStateOfType<_LoginPageState>()!
                    ._onLoginPressed();
              },
            );
          },
        ),

        const SizedBox(height: 20),

        // ===============================================================
        // SOCIAL LOGIN
        // ===============================================================
        const _SocialDivider(),

        const SizedBox(height: 16),

        Row(
          children: [
            Expanded(
              child: _SocialButton(
                icon: FontAwesomeIcons.google,
                label: 'Google',
                onPressed: () {
                  // Connect your Google authentication event here.
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _SocialButton(
                icon: FontAwesomeIcons.github,
                label: 'GitHub',
                onPressed: () {
                  // Connect your GitHub authentication event here.
                },
              ),
            ),
          ],
        ),

        const SizedBox(height: 18),

        // ===============================================================
        // REGISTER
        // ===============================================================
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              "Don't have an account?",
              style: theme.textTheme.bodySmall?.copyWith(
                color: scheme.onSurface.withValues(alpha: 0.52),
              ),
            ),
            const SizedBox(width: 5),
            GestureDetector(
              onTap: () {
                Navigator.of(context).pushReplacementNamed(
                  RegisterPage.routeName,
                );
              },
              child: Text(
                'Create account',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: scheme.primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ============================================================================
// INPUT DECORATION
// ============================================================================

InputDecoration _inputDecoration(
  BuildContext context, {
  required String hintText,
  required IconData icon,
  Widget? suffixIcon,
}) {
  final theme = Theme.of(context);
  final scheme = theme.colorScheme;

  final isDark = theme.brightness == Brightness.dark;

  final surfaceColor = scheme.surfaceContainerHighest;

  final inputFill = Color.alphaBlend(
    surfaceColor.withValues(
      alpha: isDark ? 0.60 : 0.82,
    ),
    theme.scaffoldBackgroundColor,
  );

  final borderColor = scheme.primary.withValues(
    alpha: isDark ? 0.32 : 0.20,
  );

  final mutedColor = scheme.onSurface.withValues(
    alpha: isDark ? 0.55 : 0.50,
  );

  return InputDecoration(
    hintText: hintText,
    hintStyle: theme.textTheme.bodyMedium?.copyWith(
      color: mutedColor,
    ),
    prefixIcon: Icon(
      icon,
      color: scheme.primary.withValues(alpha: 0.78),
      size: 21,
    ),
    suffixIcon: suffixIcon,
    filled: true,
    fillColor: inputFill,
    contentPadding: const EdgeInsets.symmetric(
      horizontal: 18,
      vertical: 16,
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(19),
      borderSide: BorderSide(
        color: borderColor,
        width: 1,
      ),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(19),
      borderSide: BorderSide(
        color: scheme.primary,
        width: 1.7,
      ),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(19),
      borderSide: BorderSide(
        color: scheme.error,
        width: 1,
      ),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(19),
      borderSide: BorderSide(
        color: scheme.error,
        width: 1.7,
      ),
    ),
    errorStyle: theme.textTheme.bodySmall?.copyWith(
      color: scheme.error,
    ),
  );
}

// ============================================================================
// LOGIN BUTTON
// ============================================================================

class _LoginButton extends StatelessWidget {
  final bool isLoading;
  final VoidCallback onPressed;

  const _LoginButton({
    required this.isLoading,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Container(
      height: 56,
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(17),
        gradient: LinearGradient(
          colors: [
            scheme.primary,
            Color.lerp(
                  scheme.primary,
                  scheme.secondary,
                  0.12,
                ) ??
                scheme.primary,
          ],
        ),
        boxShadow: [
          BoxShadow(
            color: scheme.primary.withValues(alpha: 0.28),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(17),
          onTap: isLoading ? null : onPressed,
          child: Center(
            child: isLoading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.2,
                      color: Colors.white,
                    ),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'Sign In',
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(width: 9),
                      const Icon(
                        Icons.arrow_forward_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

// ============================================================================
// SOCIAL DIVIDER
// ============================================================================

class _SocialDivider extends StatelessWidget {
  const _SocialDivider();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Row(
      children: [
        Expanded(
          child: Container(
            height: 1,
            color: scheme.onSurface.withValues(alpha: 0.12),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            'OR CONTINUE WITH',
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 10,
              letterSpacing: 1.5,
              fontWeight: FontWeight.w600,
              color: scheme.onSurface.withValues(alpha: 0.42),
            ),
          ),
        ),
        Expanded(
          child: Container(
            height: 1,
            color: scheme.onSurface.withValues(alpha: 0.12),
          ),
        ),
      ],
    );
  }
}

// ============================================================================
// SOCIAL BUTTON
// ============================================================================

class _SocialButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  const _SocialButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return SizedBox(
      height: 50,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: scheme.surface,
          foregroundColor: scheme.onSurface,
          side: BorderSide(
            color: scheme.outline.withValues(alpha: 0.45),
          ),
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(15),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            FaIcon(
              icon,
              size: 18,
              color: scheme.onSurface,
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================================
// FIELD LABEL
// ============================================================================

class _FieldLabel extends StatelessWidget {
  final String label;

  const _FieldLabel({
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Text(
      label,
      style: theme.textTheme.titleMedium?.copyWith(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: scheme.onSurface.withValues(alpha: 0.82),
      ),
    );
  }
}

// ============================================================================
// STATIC LOGO
// ============================================================================

class _StaticLogo extends StatelessWidget {
  const _StaticLogo();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return RepaintBoundary(
      child: Container(
        width: 110,
        height: 110,
        decoration: BoxDecoration(
          boxShadow: [
            BoxShadow(
              color: scheme.primary.withValues(alpha: 0.18),
              blurRadius: 16,
              spreadRadius: 2,
            ),
          ],
        ),
        child: Image.asset(
          'assets/images/logo.png',
          fit: BoxFit.contain,
          filterQuality: FilterQuality.low,
        ),
      ),
    );
  }
}

// ============================================================================
// TITLE
// ============================================================================

class _UniLinkTitle extends StatelessWidget {
  const _UniLinkTitle();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Text.rich(
      TextSpan(
        children: [
          TextSpan(
            text: 'Uni',
            style: TextStyle(
              color: scheme.onSurface,
              fontSize: 43,
              fontWeight: FontWeight.w800,
              height: 1,
            ),
          ),
          TextSpan(
            text: 'Link',
            style: TextStyle(
              color: scheme.primary,
              fontSize: 43,
              fontWeight: FontWeight.w800,
              height: 1,
            ),
          ),
        ],
      ),
      textAlign: TextAlign.center,
    );
  }
}

// ============================================================================
// TAGLINE
// ============================================================================

class _Tagline extends StatelessWidget {
  const _Tagline();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Text(
      'Connect students and recruiters',
      textAlign: TextAlign.center,
      style: theme.textTheme.bodyMedium?.copyWith(
        color: scheme.onSurface.withValues(alpha: 0.62),
      ),
    );
  }
}

// ============================================================================
// FOOTER
// ============================================================================

class _FooterMessage extends StatelessWidget {
  const _FooterMessage();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Align(
      alignment: Alignment.centerRight,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            'YOUR NEXT',
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 10,
              letterSpacing: 3,
              fontWeight: FontWeight.w600,
              color: scheme.primary.withValues(alpha: 0.55),
            ),
          ),
          Text(
            'OPPORTUNITY AWAITS',
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 10,
              letterSpacing: 3,
              fontWeight: FontWeight.w600,
              color: scheme.onSurface.withValues(alpha: 0.40),
            ),
          ),
          const SizedBox(height: 5),
          Container(
            width: 42,
            height: 2,
            decoration: BoxDecoration(
              color: scheme.primary,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ],
      ),
    );
  }
}