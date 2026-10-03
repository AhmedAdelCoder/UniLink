import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/utils/input_validators.dart';
import '../bloc/auth_bloc.dart';

class ResetPasswordPage extends StatefulWidget {
  const ResetPasswordPage({super.key});

  static const routeName = '/reset-password';

  @override
  State<ResetPasswordPage> createState() => _ResetPasswordPageState();
}

class _ResetPasswordPageState extends State<ResetPasswordPage> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _emailFocusNode = FocusNode();

  @override
  void dispose() {
    _emailController.dispose();
    _emailFocusNode.dispose();
    super.dispose();
  }

  void _onSubmit() {
    FocusScope.of(context).unfocus();

    if (!_formKey.currentState!.validate()) {
      return;
    }

    context.read<AuthBloc>().add(
      AuthResetPasswordRequested(_emailController.text.trim()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: SafeArea(
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () => FocusScope.of(context).unfocus(),
          child: BlocListener<AuthBloc, AuthState>(
            listenWhen: (previous, current) =>
                previous.status != current.status,
            listener: (context, state) {
              if (state.status == AuthStatus.failure &&
                  state.errorMessage != null) {
                ScaffoldMessenger.of(
                  context,
                ).showSnackBar(SnackBar(content: Text(state.errorMessage!)));
              }

              if (state.status == AuthStatus.passwordResetEmailSent) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Check your email for the password reset link.',
                    ),
                  ),
                );

                Navigator.of(context).pop();
              }
            },
            child: LayoutBuilder(
              builder: (context, constraints) {
                return SingleChildScrollView(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.fromLTRB(20, 28, 20, 24),
                  child: Center(
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
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const _ResetPasswordLogo(),

                              const SizedBox(height: 10),

                              Text(
                                'UniLink',
                                textAlign: TextAlign.center,
                                style: theme.textTheme.headlineSmall?.copyWith(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),

                              const SizedBox(height: 6),

                              Text(
                                'Secure your account',
                                textAlign: TextAlign.center,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: colorScheme.onSurfaceVariant,
                                ),
                              ),

                              const SizedBox(height: 28),

                              _ResetPasswordCard(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    Text(
                                      'Reset Password',
                                      textAlign: TextAlign.center,
                                      style: theme.textTheme.titleLarge
                                          ?.copyWith(
                                            fontWeight: FontWeight.w800,
                                          ),
                                    ),

                                    const SizedBox(height: 8),

                                    Text(
                                      'Enter your email address and we’ll send you a link to reset your password.',
                                      textAlign: TextAlign.center,
                                      style: theme.textTheme.bodyMedium
                                          ?.copyWith(
                                            color: colorScheme.onSurfaceVariant,
                                            height: 1.5,
                                          ),
                                    ),

                                    const SizedBox(height: 26),

                                    TextFormField(
                                      controller: _emailController,
                                      focusNode: _emailFocusNode,
                                      textInputAction: TextInputAction.done,
                                      keyboardType: TextInputType.emailAddress,
                                      autofillHints: const [
                                        AutofillHints.email,
                                      ],
                                      validator: InputValidators.validateEmail,
                                      onFieldSubmitted: (_) => _onSubmit(),
                                      decoration: const InputDecoration(
                                        labelText: 'Email',
                                        hintText: 'Enter your email',
                                        prefixIcon: Icon(Icons.email_outlined),
                                      ),
                                    ),

                                    const SizedBox(height: 22),

                                    BlocSelector<AuthBloc, AuthState, bool>(
                                      selector: (state) =>
                                          state.status == AuthStatus.loading,
                                      builder: (context, isLoading) {
                                        return SizedBox(
                                          height: 52,
                                          child: FilledButton(
                                            onPressed: isLoading
                                                ? null
                                                : _onSubmit,
                                            child: isLoading
                                                ? const SizedBox(
                                                    height: 21,
                                                    width: 21,
                                                    child:
                                                        CircularProgressIndicator(
                                                          strokeWidth: 2.2,
                                                        ),
                                                  )
                                                : const Text(
                                                    'Send Reset Link',
                                                    style: TextStyle(
                                                      fontSize: 16,
                                                      fontWeight:
                                                          FontWeight.w600,
                                                    ),
                                                  ),
                                          ),
                                        );
                                      },
                                    ),

                                    const SizedBox(height: 12),

                                    TextButton(
                                      onPressed: () {
                                        FocusScope.of(context).unfocus();
                                        Navigator.of(context).pop();
                                      },
                                      child: const Text('Back to Login'),
                                    ),
                                  ],
                                ),
                              ),

                              const SizedBox(height: 20),

                              Text(
                                'YOUR NEXT\nOPPORTUNITY AWAITS',
                                textAlign: TextAlign.center,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  letterSpacing: 1.4,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _ResetPasswordLogo extends StatelessWidget {
  const _ResetPasswordLogo();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: RepaintBoundary(
        child: Image.asset(
          'assets/images/logo.png',
          height: 110,
          width: 180,
          fit: BoxFit.contain,
          cacheWidth: 220,
          filterQuality: FilterQuality.low,
        ),
      ),
    );
  }
}

class _ResetPasswordCard extends StatelessWidget {
  final Widget child;

  const _ResetPasswordCard({required this.child});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Card(
      elevation: 2,
      margin: EdgeInsets.zero,
      color: colorScheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(28),
        side: BorderSide(
          color: colorScheme.primary.withValues(alpha: 0.12),
          width: 1,
        ),
      ),
      child: Padding(padding: const EdgeInsets.all(26), child: child),
    );
  }
}
