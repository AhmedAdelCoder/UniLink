import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/utils/input_validators.dart';
import '../../domain/entities/app_user.dart';
import '../bloc/auth_bloc.dart';

class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});

  static const routeName = '/register';

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _formKey = GlobalKey<FormState>();

  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  final _nameFocus = FocusNode();
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();
  final _confirmPasswordFocus = FocusNode();

  UserRole _role = UserRole.student;

  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();

    _nameFocus.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
    _confirmPasswordFocus.dispose();

    super.dispose();
  }

  void _onRegisterPressed() {
    FocusScope.of(context).unfocus();

    if (!_formKey.currentState!.validate()) {
      return;
    }

    context.read<AuthBloc>().add(
      AuthRegisterRequested(
        name: _nameController.text.trim(),
        email: _emailController.text.trim(),
        password: _passwordController.text.trim(),
        role: _role,
      ),
    );
  }

  String? _validateConfirmPassword(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Please confirm your password';
    }

    if (value != _passwordController.text) {
      return 'Passwords do not match';
    }

    return null;
  }

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
      surfaceColor.withValues(alpha: isDark ? 0.60 : 0.82),
      theme.scaffoldBackgroundColor,
    );

    final borderColor = scheme.primary.withValues(alpha: isDark ? 0.32 : 0.20);

    final mutedColor = scheme.onSurface.withValues(alpha: isDark ? 0.55 : 0.50);

    return InputDecoration(
      hintText: hintText,
      hintStyle: theme.textTheme.bodyMedium?.copyWith(color: mutedColor),
      prefixIcon: Icon(
        icon,
        color: scheme.primary.withValues(alpha: 0.78),
        size: 21,
      ),
      suffixIcon: suffixIcon,
      filled: true,
      fillColor: inputFill,
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(19),
        borderSide: BorderSide(color: borderColor, width: 1),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(19),
        borderSide: BorderSide(color: scheme.primary, width: 1.7),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(19),
        borderSide: BorderSide(color: scheme.error, width: 1),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(19),
        borderSide: BorderSide(color: scheme.error, width: 1.7),
      ),
      errorStyle: theme.textTheme.bodySmall?.copyWith(color: scheme.error),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      extendBodyBehindAppBar: true,
      backgroundColor: theme.scaffoldBackgroundColor,
      body: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => FocusScope.of(context).unfocus(),
        child: Stack(
          children: [
            const UniLinkBackground(),
            SafeArea(
              child: BlocConsumer<AuthBloc, AuthState>(
                listener: (context, state) async {
                  if (state.status == AuthStatus.failure) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(state.errorMessage ?? 'Register failed'),
                      ),
                    );
                  }
                },
                builder: (context, state) {
                  final isLoading = state.status == AuthStatus.loading;

                  return LayoutBuilder(
                    builder: (context, constraints) {
                      return SingleChildScrollView(
                        keyboardDismissBehavior:
                            ScrollViewKeyboardDismissBehavior.onDrag,
                        padding: const EdgeInsets.fromLTRB(20, 28, 20, 24),
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
                                  const DynamicLogo(),

                                  const SizedBox(height: 8),

                                  _UniLinkTitle(),

                                  const SizedBox(height: 6),

                                  _Tagline(),

                                  const SizedBox(height: 26),

                                  _GlassRegisterCard(
                                    child: _buildFormContent(
                                      context,
                                      isLoading,
                                    ),
                                  ),

                                  const SizedBox(height: 18),

                                  const _FooterMessage(),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFormContent(BuildContext context, bool isLoading) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _WelcomeTitle(),

        const SizedBox(height: 7),

        Text(
          'Create your UniLink account and start building your network.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: scheme.onSurface.withValues(alpha: 0.60),
            height: 1.45,
          ),
        ),

        const SizedBox(height: 23),

        _FieldLabel(label: 'Full name'),

        const SizedBox(height: 7),

        TextFormField(
          controller: _nameController,
          focusNode: _nameFocus,
          textInputAction: TextInputAction.next,
          style: theme.textTheme.bodyLarge,
          decoration: _inputDecoration(
            context,
            hintText: 'Enter your full name',
            icon: Icons.person_outline_rounded,
          ),
          validator: InputValidators.validateName,
          onFieldSubmitted: (_) {
            _emailFocus.requestFocus();
          },
        ),

        const SizedBox(height: 15),

        _FieldLabel(label: 'Email'),

        const SizedBox(height: 7),

        TextFormField(
          controller: _emailController,
          focusNode: _emailFocus,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          style: theme.textTheme.bodyLarge,
          decoration: _inputDecoration(
            context,
            hintText: 'Enter your email',
            icon: Icons.mail_outline_rounded,
          ),
          validator: InputValidators.validateEmail,
          onFieldSubmitted: (_) {
            _passwordFocus.requestFocus();
          },
        ),

        const SizedBox(height: 15),

        _FieldLabel(label: 'Password'),

        const SizedBox(height: 7),

        TextFormField(
          controller: _passwordController,
          focusNode: _passwordFocus,
          obscureText: _obscurePassword,
          textInputAction: TextInputAction.next,
          style: theme.textTheme.bodyLarge,
          decoration: _inputDecoration(
            context,
            hintText: 'Create a password',
            icon: Icons.lock_outline_rounded,
            suffixIcon: IconButton(
              tooltip: _obscurePassword ? 'Show password' : 'Hide password',
              onPressed: () {
                setState(() {
                  _obscurePassword = !_obscurePassword;
                });
              },
              icon: Icon(
                _obscurePassword
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
                color: scheme.onSurface.withValues(alpha: 0.55),
                size: 21,
              ),
            ),
          ),
          validator: InputValidators.validatePassword,
          onFieldSubmitted: (_) {
            _confirmPasswordFocus.requestFocus();
          },
        ),

        const SizedBox(height: 15),

        _FieldLabel(label: 'Confirm password'),

        const SizedBox(height: 7),

        TextFormField(
          controller: _confirmPasswordController,
          focusNode: _confirmPasswordFocus,
          obscureText: _obscureConfirmPassword,
          textInputAction: TextInputAction.done,
          style: theme.textTheme.bodyLarge,
          decoration: _inputDecoration(
            context,
            hintText: 'Confirm your password',
            icon: Icons.lock_outline_rounded,
            suffixIcon: IconButton(
              tooltip: _obscureConfirmPassword
                  ? 'Show password'
                  : 'Hide password',
              onPressed: () {
                setState(() {
                  _obscureConfirmPassword = !_obscureConfirmPassword;
                });
              },
              icon: Icon(
                _obscureConfirmPassword
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
                color: scheme.onSurface.withValues(alpha: 0.55),
                size: 21,
              ),
            ),
          ),
          validator: _validateConfirmPassword,
          onFieldSubmitted: (_) {
            FocusScope.of(context).unfocus();
          },
        ),

        const SizedBox(height: 19),

        Text(
          'Role',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),

        const SizedBox(height: 9),

        _RoleSelector(
          selectedRole: _role,
          onRoleChanged: (role) {
            setState(() {
              _role = role;
            });
          },
        ),

        const SizedBox(height: 16),

        const SizedBox(height: 20),

        _CreateAccountButton(
          isLoading: isLoading,
          onPressed: _onRegisterPressed,
        ),

        const SizedBox(height: 20),

        _LoginDivider(
          onLogin: () {
            Navigator.of(context).pushReplacementNamed('/login');
          },
        ),
      ],
    );
  }
}

// ============================================================================
// LOGO
// ============================================================================

class DynamicLogo extends StatefulWidget {
  const DynamicLogo({super.key});

  @override
  State<DynamicLogo> createState() => _DynamicLogoState();
}

class _DynamicLogoState extends State<DynamicLogo>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      duration: const Duration(seconds: 3),
      vsync: this,
    )..repeat(reverse: true);

    _animation = Tween<double>(
      begin: 0.95,
      end: 1.05,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
  }

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;

    return ScaleTransition(
      scale: _animation,
      child: Container(
        width: 110,
        height: 110,
        decoration: BoxDecoration(
          boxShadow: [
            BoxShadow(
              color: primary.withValues(alpha: 0.30),
              blurRadius: 20,
              spreadRadius: 5,
            ),
          ],
        ),
        child: Image.asset('assets/images/logo.png', fit: BoxFit.contain),
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
}

// ============================================================================
// TITLE
// ============================================================================

class _UniLinkTitle extends StatelessWidget {
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

class _Tagline extends StatelessWidget {
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
// GLASS CARD
// ============================================================================

class _GlassRegisterCard extends StatelessWidget {
  final Widget child;

  const _GlassRegisterCard({required this.child});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    final cardColor = scheme.surface.withValues(alpha: isDark ? 0.74 : 0.90);

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: scheme.primary.withValues(alpha: isDark ? 0.16 : 0.08),
            blurRadius: 35,
            spreadRadius: 2,
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: cardColor,
              borderRadius: BorderRadius.circular(28),
              border: Border.all(
                color: scheme.primary.withValues(alpha: isDark ? 0.20 : 0.14),
                width: 1,
              ),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

// ============================================================================
// WELCOME TITLE
// ============================================================================

class _WelcomeTitle extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Text.rich(
      TextSpan(
        children: [
          TextSpan(
            text: 'Create ',
            style: TextStyle(
              color: scheme.onSurface,
              fontSize: 28,
              fontWeight: FontWeight.w800,
            ),
          ),
          TextSpan(
            text: 'your account',
            style: TextStyle(
              color: scheme.primary,
              fontSize: 28,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================================
// FIELD LABEL
// ============================================================================

class _FieldLabel extends StatelessWidget {
  final String label;

  const _FieldLabel({required this.label});

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
// ROLE SELECTOR
// ============================================================================

class _RoleSelector extends StatelessWidget {
  final UserRole selectedRole;
  final ValueChanged<UserRole> onRoleChanged;

  const _RoleSelector({
    required this.selectedRole,
    required this.onRoleChanged,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Container(
      height: 60,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.20)),
      ),
      child: Row(
        children: [
          Expanded(
            child: _RoleOption(
              role: UserRole.student,
              selectedRole: selectedRole,
              icon: Icons.school_outlined,
              label: 'Student',
              onTap: () => onRoleChanged(UserRole.student),
            ),
          ),
          Expanded(
            child: _RoleOption(
              role: UserRole.recruiter,
              selectedRole: selectedRole,
              icon: Icons.business_center_outlined,
              label: 'Recruiter',
              onTap: () => onRoleChanged(UserRole.recruiter),
            ),
          ),
        ],
      ),
    );
  }
}

class _RoleOption extends StatelessWidget {
  final UserRole role;
  final UserRole selectedRole;
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _RoleOption({
    required this.role,
    required this.selectedRole,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    final selected = role == selectedRole;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: selected
              ? LinearGradient(
                  colors: [
                    scheme.primary,
                    Color.lerp(scheme.primary, scheme.secondary, 0.22) ??
                        scheme.primary,
                  ],
                )
              : null,
          border: selected
              ? null
              : Border.all(color: scheme.primary.withValues(alpha: 0.22)),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: scheme.primary.withValues(alpha: 0.22),
                    blurRadius: 12,
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (selected) ...[
              const Icon(
                Icons.check_circle_outline_rounded,
                color: Colors.white,
                size: 18,
              ),
              const SizedBox(width: 6),
            ] else ...[
              Icon(
                icon,
                color: scheme.onSurface.withValues(alpha: 0.55),
                size: 19,
              ),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: selected
                    ? Colors.white
                    : scheme.onSurface.withValues(alpha: 0.62),
                fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================================
// CREATE ACCOUNT BUTTON
// ============================================================================

class _CreateAccountButton extends StatelessWidget {
  final bool isLoading;
  final VoidCallback onPressed;

  const _CreateAccountButton({
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
            Color.lerp(scheme.primary, scheme.secondary, 0.12) ??
                scheme.primary,
          ],
        ),
        boxShadow: [
          BoxShadow(
            color: scheme.primary.withValues(alpha: 0.28),
            blurRadius: 20,
            offset: const Offset(0, 7),
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
                        'Create Account',
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
// LOGIN DIVIDER
// ============================================================================

class _LoginDivider extends StatelessWidget {
  final VoidCallback onLogin;

  const _LoginDivider({required this.onLogin});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    final lineColor = scheme.onSurface.withValues(alpha: 0.12);

    return Row(
      children: [
        Expanded(child: Container(height: 1, color: lineColor)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Text(
            'Already have an account?',
            style: theme.textTheme.bodySmall?.copyWith(
              color: scheme.onSurface.withValues(alpha: 0.52),
            ),
          ),
        ),
        GestureDetector(
          onTap: onLogin,
          child: Text(
            'Log in',
            style: theme.textTheme.bodySmall?.copyWith(
              color: scheme.primary,
              fontWeight: FontWeight.w700,
              decoration: TextDecoration.underline,
              decorationColor: scheme.primary,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(child: Container(height: 1, color: lineColor)),
      ],
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

// ============================================================================
// BACKGROUND
// ============================================================================

class UniLinkBackground extends StatelessWidget {
  final Widget? campusOverlay;
  final Widget? capOverlay;

  const UniLinkBackground({super.key, this.campusOverlay, this.capOverlay});

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        const _BaseBackground(),
        const _WaveLayer(),
        campusOverlay ?? const _CampusBuilding(),
        capOverlay ?? const _GraduationCap(),
      ],
    );
  }
}

class _BaseBackground extends StatelessWidget {
  const _BaseBackground();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    final isDark = theme.brightness == Brightness.dark;

    final topColor = isDark
        ? Color.lerp(theme.scaffoldBackgroundColor, Colors.black, 0.48)!
        : const Color(0xFFF5F7FB);

    final bottomColor = isDark
        ? theme.scaffoldBackgroundColor
        : Color.lerp(const Color(0xFFF5F7FB), scheme.primary, 0.025)!;

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [topColor, bottomColor],
        ),
      ),
    );
  }
}

class _WaveLayer extends StatelessWidget {
  const _WaveLayer();

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _WavePainter(
        Theme.of(context).colorScheme,
        Theme.of(context).brightness == Brightness.dark,
      ),
    );
  }
}

class _WavePainter extends CustomPainter {
  final ColorScheme scheme;
  final bool isDark;

  const _WavePainter(this.scheme, this.isDark);

  @override
  void paint(Canvas canvas, Size size) {
    final primary = scheme.primary;
    final secondary = scheme.secondary;

    final waveOpacity = isDark ? 0.16 : 0.055;

    final glowPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 28
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 20)
      ..shader = LinearGradient(
        colors: [
          primary.withValues(alpha: waveOpacity),
          secondary.withValues(alpha: waveOpacity * 0.55),
        ],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    final topLeft = Path()
      ..moveTo(-50, size.height * 0.16)
      ..cubicTo(
        size.width * 0.15,
        size.height * 0.02,
        size.width * 0.30,
        size.height * 0.16,
        size.width * 0.52,
        size.height * 0.06,
      )
      ..cubicTo(
        size.width * 0.70,
        -size.height * 0.02,
        size.width * 0.82,
        size.height * 0.04,
        size.width + 50,
        -20,
      );

    canvas.drawPath(topLeft, glowPaint);

    final topRight = Path()
      ..moveTo(size.width * 0.54, size.height * 0.10)
      ..cubicTo(
        size.width * 0.70,
        size.height * 0.18,
        size.width * 0.78,
        size.height * 0.28,
        size.width + 40,
        size.height * 0.20,
      );

    canvas.drawPath(topRight, glowPaint);

    final bottomWave = Path()
      ..moveTo(-60, size.height * 0.79)
      ..cubicTo(
        size.width * 0.18,
        size.height * 0.62,
        size.width * 0.36,
        size.height * 0.82,
        size.width * 0.58,
        size.height * 0.70,
      )
      ..cubicTo(
        size.width * 0.76,
        size.height * 0.60,
        size.width * 0.90,
        size.height * 0.68,
        size.width + 60,
        size.height * 0.55,
      );

    canvas.drawPath(bottomWave, glowPaint);

    final fillPaint = Paint()
      ..style = PaintingStyle.fill
      ..shader =
          LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: [
              primary.withValues(alpha: isDark ? 0.035 : 0.015),
              secondary.withValues(alpha: isDark ? 0.02 : 0.008),
              Colors.transparent,
            ],
          ).createShader(
            Rect.fromLTWH(
              0,
              size.height * 0.55,
              size.width,
              size.height * 0.35,
            ),
          );

    final bottomFill = Path()
      ..moveTo(-20, size.height)
      ..lineTo(-20, size.height * 0.80)
      ..cubicTo(
        size.width * 0.18,
        size.height * 0.65,
        size.width * 0.37,
        size.height * 0.83,
        size.width * 0.58,
        size.height * 0.71,
      )
      ..cubicTo(
        size.width * 0.77,
        size.height * 0.61,
        size.width * 0.91,
        size.height * 0.68,
        size.width + 20,
        size.height * 0.56,
      )
      ..lineTo(size.width + 20, size.height)
      ..close();

    canvas.drawPath(bottomFill, fillPaint);
  }

  @override
  bool shouldRepaint(covariant _WavePainter oldDelegate) {
    return oldDelegate.scheme != scheme || oldDelegate.isDark != isDark;
  }
}

// ============================================================================
// CAMPUS SILHOUETTE
// ============================================================================

class _CampusBuilding extends StatelessWidget {
  const _CampusBuilding();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: IgnorePointer(
        child: CustomPaint(
          size: const Size(220, 260),
          painter: _CampusPainter(
            Theme.of(context).colorScheme,
            Theme.of(context).brightness == Brightness.dark,
          ),
        ),
      ),
    );
  }
}

class _CampusPainter extends CustomPainter {
  final ColorScheme scheme;
  final bool isDark;

  const _CampusPainter(this.scheme, this.isDark);

  @override
  void paint(Canvas canvas, Size size) {
    final color = scheme.primary.withValues(alpha: isDark ? 0.055 : 0.025);

    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    canvas.drawRect(Rect.fromLTWH(20, 70, 135, 150), paint);

    canvas.drawRect(Rect.fromLTWH(48, 35, 80, 185), paint);

    final roof = Path()
      ..moveTo(30, 70)
      ..lineTo(88, 20)
      ..lineTo(145, 70)
      ..close();

    canvas.drawPath(roof, paint);

    final windowPaint = Paint()
      ..color = scheme.primary.withValues(alpha: isDark ? 0.035 : 0.018);

    for (int row = 0; row < 5; row++) {
      for (int column = 0; column < 3; column++) {
        canvas.drawRect(
          Rect.fromLTWH(35 + column * 38, 88 + row * 24, 13, 15),
          windowPaint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _CampusPainter oldDelegate) {
    return oldDelegate.scheme != scheme || oldDelegate.isDark != isDark;
  }
}

// ============================================================================
// GRADUATION CAP
// ============================================================================

class _GraduationCap extends StatelessWidget {
  const _GraduationCap();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topRight,
      child: IgnorePointer(
        child: CustomPaint(
          size: const Size(210, 170),
          painter: _GraduationCapPainter(
            Theme.of(context).colorScheme,
            Theme.of(context).brightness == Brightness.dark,
          ),
        ),
      ),
    );
  }
}

class _GraduationCapPainter extends CustomPainter {
  final ColorScheme scheme;
  final bool isDark;

  const _GraduationCapPainter(this.scheme, this.isDark);

  @override
  void paint(Canvas canvas, Size size) {
    final capColor = scheme.primary.withValues(alpha: isDark ? 0.075 : 0.025);

    final paint = Paint()
      ..color = capColor
      ..style = PaintingStyle.fill;

    final diamond = Path()
      ..moveTo(size.width * 0.55, 0)
      ..lineTo(size.width, size.height * 0.27)
      ..lineTo(size.width * 0.55, size.height * 0.53)
      ..lineTo(size.width * 0.10, size.height * 0.27)
      ..close();

    canvas.drawPath(diamond, paint);

    final base = RRect.fromRectAndRadius(
      Rect.fromLTWH(
        size.width * 0.30,
        size.height * 0.35,
        size.width * 0.50,
        size.height * 0.17,
      ),
      const Radius.circular(5),
    );

    canvas.drawRRect(base, paint);

    final tasselPaint = Paint()
      ..color = scheme.secondary.withValues(alpha: isDark ? 0.09 : 0.035)
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;

    canvas.drawLine(
      Offset(size.width * 0.55, size.height * 0.27),
      Offset(size.width * 0.82, size.height * 0.65),
      tasselPaint,
    );

    canvas.drawCircle(
      Offset(size.width * 0.82, size.height * 0.67),
      5,
      Paint()..color = scheme.secondary.withValues(alpha: isDark ? 0.10 : 0.04),
    );
  }

  @override
  bool shouldRepaint(covariant _GraduationCapPainter oldDelegate) {
    return oldDelegate.scheme != scheme || oldDelegate.isDark != isDark;
  }
}
